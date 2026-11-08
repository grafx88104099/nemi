import { createClient } from "@/lib/supabase/server";
import { getCrmStaffContext, getSettingValue } from "@/lib/queries-crm-core";
import { getNameMap } from "@/lib/queries-crm-reports";
import {
  CARD_TARGET_CODES,
  MEETING_KEY_CODES,
  MEETING_PIPELINE_CODES,
  WEEKLY_METRICS,
  WEEKLY_METRIC_BY_CODE,
  isWeeklyMetricCode,
  type WeeklyMetricCode,
  type AnomalyKind,
  type DecisionKind,
  type MoveKind,
  type PlanItemKind,
  type WeeklyStatus,
} from "@/lib/constants-crm-weekly";
import {
  classifyMove,
  computeWeeklyScore,
  detectAnomalies,
  gapRow,
  normalizeScoreWeights,
  normalizeWeeklyCycle,
  pickScoreWeights,
  resolveTargets,
  stageAdvances,
  summarizeMoves,
  type MetricKey,
  type MoveSummary,
  type ScoreWeights,
  type WeeklyCycleSettings,
  type WeeklyScore,
  type WeeklyValues,
} from "@/lib/crm/weekly-score";
import { addWeeks, ubDateTime, weekEnd, weekPhase, type WeekPhase } from "@/lib/crm/week";

/**
 * Долоо хоногийн мөчлөгийн уншилтууд (U7 — PRO-001 v2.1 §6.19–§6.25, §6.30).
 * Гүйцэтгэл ЗӨВХӨН crm_agent_week_metrics / crm_weekly_actuals-аас (систем
 * тооцно); RLS ба DB функцийн хүрээ: агент өөрийн, багийн ахлагч багийн,
 * удирдлага оффисын. Хүснэгт/функц байхгүй (миграци тавигдаагүй) үед
 * `unavailable` туг буцааж, дэлгэц ойлгомжтой мэдэгдэл харуулна.
 */

const MISSING_RE = /does not exist|Could not find|schema cache/i;

function isMissing(message: string | undefined): boolean {
  return !!message && MISSING_RE.test(message);
}

// ── Тохиргоо ──────────────────────────────────────────────

export type WeeklySettingsBundle = { cycle: WeeklyCycleSettings; weights: ScoreWeights };

export async function getWeeklySettings(): Promise<WeeklySettingsBundle> {
  const [cycle, legacy, weights] = await Promise.all([
    getSettingValue("weekly_cycle"),
    getSettingValue("weekly_targets"),
    getSettingValue("agent_score_weights"),
  ]);
  return { cycle: normalizeWeeklyCycle(cycle, legacy), weights: normalizeScoreWeights(weights) };
}

// ── Хүрээний агентууд ─────────────────────────────────────

export type WeekAgent = {
  profile_id: string;
  full_name: string;
  team_id: string | null;
  team_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
  roles: string[];
  hired_on: string | null;
  offboarding: boolean;
};

export type WeekFilters = { teamId?: string | null; branchId?: string | null; agentId?: string | null };

/** Дуудагчид харагдах борлуулагч агентууд (DB-ийн хүрээгээр). */
export async function getScopeAgents(filters: WeekFilters = {}): Promise<{ rows: WeekAgent[]; unavailable: boolean }> {
  const supabase = await createClient();
  const { data: scope, error } = await supabase.rpc("crm_weekly_scope_agents", {
    p_office: null,
    p_agent: filters.agentId ?? null,
  });
  if (error) {
    if (!isMissing(error.message)) console.error("getScopeAgents:", error.message);
    return { rows: [], unavailable: isMissing(error.message) };
  }
  const ids = [...new Set(((scope ?? []) as { agent_id: string }[]).map((r) => r.agent_id))];
  if (!ids.length) return { rows: [], unavailable: false };
  const [staffRes, teamsRes, branchesRes, names] = await Promise.all([
    supabase.from("crm_staff").select("profile_id, team_id, branch_id, roles, hired_on, offboarding").in("profile_id", ids),
    supabase.from("crm_teams").select("id, name"),
    supabase.from("crm_branches").select("id, name"),
    getNameMap(ids),
  ]);
  if (staffRes.error) console.error("getScopeAgents staff:", staffRes.error.message);
  const teams = new Map((teamsRes.data ?? []).map((t) => [t.id, t.name as string]));
  const branches = new Map((branchesRes.data ?? []).map((b) => [b.id, b.name as string]));
  type Raw = { profile_id: string; team_id: string | null; branch_id: string | null; roles: string[]; hired_on: string | null; offboarding: boolean };
  const rows = ((staffRes.data ?? []) as unknown as Raw[])
    .map((s) => ({
      profile_id: s.profile_id,
      full_name: names.get(s.profile_id) ?? "Нэргүй",
      team_id: s.team_id,
      team_name: s.team_id ? (teams.get(s.team_id) ?? null) : null,
      branch_id: s.branch_id,
      branch_name: s.branch_id ? (branches.get(s.branch_id) ?? null) : null,
      roles: s.roles ?? [],
      hired_on: s.hired_on ?? null,
      offboarding: !!s.offboarding,
    }))
    .filter((a) => (!filters.teamId || a.team_id === filters.teamId) && (!filters.branchId || a.branch_id === filters.branchId))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  return { rows, unavailable: false };
}

export async function getTeamsAndBranches(): Promise<{ teams: { id: string; name: string }[]; branches: { id: string; name: string }[] }> {
  const supabase = await createClient();
  const [t, b] = await Promise.all([
    supabase.from("crm_teams").select("id, name").order("name"),
    supabase.from("crm_branches").select("id, name").eq("is_active", true).order("name"),
  ]);
  return {
    teams: (t.data ?? []).map((x) => ({ id: x.id, name: x.name })),
    branches: (b.data ?? []).map((x) => ({ id: x.id, name: x.name })),
  };
}

// ── Гүйцэтгэл ─────────────────────────────────────────────

export type WeekActuals = {
  byAgent: Map<string, WeeklyValues>;
  moves: Map<string, MoveSummary>;
  /** Эцсийн агшин зургаас уншсан агентууд. */
  frozen: Set<string>;
  /** Нээлттэй сэжим/боломжтой эсвэл долоо хоногт бүртгэлтэй агент (§6.25 хүрээ). */
  active: Set<string>;
  unavailable: boolean;
};

function valuesFromJson(raw: unknown): WeeklyValues {
  const out: WeeklyValues = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isWeeklyMetricCode(k) && k !== "stage_advances") continue;
    const n = v == null ? null : Number(v);
    out[k as MetricKey] = n != null && Number.isFinite(n) ? n : null;
  }
  return out;
}

function movesFromJson(raw: unknown): MoveSummary {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (k: string) => (Number.isFinite(Number(o[k])) ? Number(o[k]) : 0);
  return { advanced: n("advanced"), backward: n("backward"), won: n("won"), lost: n("lost"), none: n("none") };
}

/**
 * Долоо хоногийн гүйцэтгэл. Түгжигдсэн долоо хоногт эцсийн агшин зургийг
 * (систем тооцсон) давуу эрхтэй уншина; бусад үед бодит цагийн тооцоо.
 */
export async function getWeekActuals(week: string, agentId?: string | null, phase?: WeekPhase): Promise<WeekActuals> {
  const supabase = await createClient();
  const args = { p_week: week, p_office: null, p_agent: agentId ?? null };
  const [mRes, mvRes, frozenRes] = await Promise.all([
    supabase.rpc("crm_agent_week_metrics", args),
    supabase.rpc("crm_agent_week_moves", args),
    phase?.finalLocked
      ? (() => {
          let q = supabase.from("crm_weekly_actuals").select("agent_id, metrics, moves").eq("week_start", week).eq("kind", "final");
          if (agentId) q = q.eq("agent_id", agentId);
          return q;
        })()
      : Promise.resolve({ data: [] as { agent_id: string; metrics: unknown; moves: unknown }[], error: null }),
  ]);
  const unavailable = isMissing(mRes.error?.message) || isMissing(mvRes.error?.message);
  if (mRes.error && !unavailable) console.error("getWeekActuals metrics:", mRes.error.message);
  if (mvRes.error && !unavailable) console.error("getWeekActuals moves:", mvRes.error.message);

  const byAgent = new Map<string, WeeklyValues>();
  const active = new Set<string>();
  for (const r of (mRes.data ?? []) as { agent_id: string; metric_code: string; actual: number | string | null }[]) {
    if (r.metric_code === "open_work") {
      if (Number(r.actual ?? 0) > 0) active.add(r.agent_id);
      continue;
    }
    if (!isWeeklyMetricCode(r.metric_code)) continue;
    const cur = byAgent.get(r.agent_id) ?? {};
    const n = r.actual == null ? null : Number(r.actual);
    cur[r.metric_code] = n != null && Number.isFinite(n) ? n : null;
    byAgent.set(r.agent_id, cur);
  }
  const kinds = new Map<string, MoveKind[]>();
  for (const r of (mvRes.data ?? []) as {
    agent_id: string;
    from_sort: number | null;
    to_sort: number | null;
    to_terminal: string | null;
  }[]) {
    const k = classifyMove({
      fromSort: r.from_sort,
      toSort: r.to_sort,
      toTerminal: r.to_terminal === "won" || r.to_terminal === "lost" ? r.to_terminal : null,
    });
    kinds.set(r.agent_id, [...(kinds.get(r.agent_id) ?? []), k]);
  }
  const moves = new Map<string, MoveSummary>();
  for (const [agent, list] of kinds) moves.set(agent, summarizeMoves(list));

  const frozen = new Set<string>();
  for (const f of (frozenRes.data ?? []) as { agent_id: string; metrics: unknown; moves: unknown }[]) {
    byAgent.set(f.agent_id, valuesFromJson(f.metrics));
    moves.set(f.agent_id, movesFromJson(f.moves));
    frozen.add(f.agent_id);
    const ow = (f.metrics as Record<string, unknown> | null)?.open_work;
    if (ow != null && Number(ow) > 0) active.add(f.agent_id);
  }
  for (const [agent, values] of byAgent) {
    values.stage_advances = stageAdvances(moves.get(agent) ?? summarizeMoves([]));
  }
  for (const [agent, values] of byAgent) {
    const m = moves.get(agent);
    const touched =
      (values.outbound_contacts ?? 0) + (values.meaningful_conversations ?? 0) + (values.closed_deals ?? 0) > 0 ||
      (m != null && m.advanced + m.backward + m.won + m.lost > 0);
    if (touched) active.add(agent);
  }
  return { byAgent, moves, frozen, active, unavailable };
}

// ── Карт ──────────────────────────────────────────────────

export type PlanItem = {
  id: string;
  kind: PlanItemKind;
  position: number;
  opportunity_id: string | null;
  opportunity_label: string | null;
  obstacle_id: string | null;
  obstacle_label: string | null;
  text: string | null;
};

export type PlanTargetRow = { target: number | null; review_note: string | null; next_action: string | null };

export type ReviewRow = {
  id: string;
  status: WeeklyStatus;
  achieved_note: string | null;
  missed_note: string | null;
  conversion_note: string | null;
  movement_note: string | null;
  overdue_reason: string | null;
  recovery_action: string | null;
  lost_note: string | null;
  revenue_note: string | null;
  lessons: string | null;
  coaching_need: string | null;
  coaching_at: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  return_note: string | null;
};

export type CommitmentLogRow = { source: "plan" | "meeting"; new_text: string | null; changed_by_name: string | null; changed_at: string };

export type DecisionRow = {
  id: string;
  meeting_id: string;
  kind: DecisionKind;
  text: string;
  owner_id: string | null;
  owner_name: string | null;
  due_on: string | null;
  status: "open" | "done";
  created_at: string;
};

export type PlanDetail = {
  id: string;
  office_id: string;
  agent_id: string;
  agent_name: string;
  week_start: string;
  status: WeeklyStatus;
  last_week_summary: string | null;
  support_needed: string | null;
  commitment: string | null;
  submitted_at: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  return_note: string | null;
  targets: Partial<Record<MetricKey, PlanTargetRow>>;
  items: PlanItem[];
  review: ReviewRow | null;
  commitments: CommitmentLogRow[];
  decisions: DecisionRow[];
};

const PLAN_COLS =
  "id, office_id, agent_id, week_start, status, last_week_summary, support_needed, commitment, " +
  "submitted_at, approved_by, approved_at, return_note";

const REVIEW_COLS =
  "id, plan_id, status, achieved_note, missed_note, conversion_note, movement_note, overdue_reason, " +
  "recovery_action, lost_note, revenue_note, lessons, coaching_need, coaching_at, submitted_at, approved_by, " +
  "approved_at, return_note";

async function opportunityLabels(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return out;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_opportunities")
    .select(
      "id, contact:crm_contacts!crm_opportunities_contact_id_fkey(display_name), " +
        "stage:crm_stages!crm_opportunities_stage_id_fkey(name)"
    )
    .in("id", uniq);
  if (error) console.error("opportunityLabels:", error.message);
  type Raw = { id: string; contact: { display_name: string } | null; stage: { name: string } | null };
  for (const o of (data ?? []) as unknown as Raw[]) {
    out.set(o.id, [o.contact?.display_name ?? "Боломж", o.stage?.name].filter(Boolean).join(" · "));
  }
  return out;
}

async function loadPlan(filter: { id?: string; agentId?: string; week?: string }): Promise<PlanDetail | null | "unavailable"> {
  const supabase = await createClient();
  let q = supabase.from("crm_weekly_plans").select(PLAN_COLS).limit(1);
  if (filter.id) q = q.eq("id", filter.id);
  if (filter.agentId) q = q.eq("agent_id", filter.agentId);
  if (filter.week) q = q.eq("week_start", filter.week);
  const { data, error } = await q.maybeSingle();
  if (error) {
    if (isMissing(error.message)) return "unavailable";
    console.error("loadPlan:", error.message);
    return null;
  }
  if (!data) return null;
  type Raw = {
    id: string;
    office_id: string;
    agent_id: string;
    week_start: string;
    status: WeeklyStatus;
    last_week_summary: string | null;
    support_needed: string | null;
    commitment: string | null;
    submitted_at: string | null;
    approved_by: string | null;
    approved_at: string | null;
    return_note: string | null;
  };
  const plan = data as unknown as Raw;
  const [targetsRes, itemsRes, reviewRes, logRes, decisionsRes] = await Promise.all([
    supabase.from("crm_weekly_plan_targets").select("metric_code, target, review_note, next_action").eq("plan_id", plan.id),
    supabase
      .from("crm_weekly_plan_items")
      .select("id, kind, position, opportunity_id, obstacle_id, text, obstacle:crm_lookups!crm_weekly_plan_items_obstacle_id_fkey(label)")
      .eq("plan_id", plan.id)
      .order("kind")
      .order("position"),
    supabase.from("crm_weekly_reviews").select(REVIEW_COLS).eq("plan_id", plan.id).maybeSingle(),
    supabase
      .from("crm_weekly_commitment_log")
      .select("source, new_text, changed_by, changed_at")
      .eq("plan_id", plan.id)
      .order("changed_at", { ascending: false })
      .limit(20),
    supabase
      .from("crm_meeting_decisions")
      .select("id, meeting_id, kind, text, owner_id, due_on, status, created_at")
      .eq("plan_id", plan.id)
      .order("created_at", { ascending: false }),
  ]);
  for (const r of [targetsRes, itemsRes, reviewRes, logRes, decisionsRes]) {
    if (r.error) console.error("loadPlan part:", r.error.message);
  }

  const targets: Partial<Record<MetricKey, PlanTargetRow>> = {};
  for (const t of (targetsRes.data ?? []) as { metric_code: string; target: number | string | null; review_note: string | null; next_action: string | null }[]) {
    if (!isWeeklyMetricCode(t.metric_code) && t.metric_code !== "stage_advances") continue;
    targets[t.metric_code as MetricKey] = {
      target: t.target == null ? null : Number(t.target),
      review_note: t.review_note,
      next_action: t.next_action,
    };
  }
  type ItemRaw = {
    id: string;
    kind: PlanItemKind;
    position: number;
    opportunity_id: string | null;
    obstacle_id: string | null;
    text: string | null;
    obstacle: { label: string } | null;
  };
  const itemsRaw = (itemsRes.data ?? []) as unknown as ItemRaw[];
  const review = (reviewRes.data ?? null) as unknown as (Omit<ReviewRow, "approved_by_name"> & { plan_id: string }) | null;
  const logs = (logRes.data ?? []) as { source: "plan" | "meeting"; new_text: string | null; changed_by: string | null; changed_at: string }[];
  const decisions = (decisionsRes.data ?? []) as Omit<DecisionRow, "owner_name">[];

  const [oppLabels, names] = await Promise.all([
    opportunityLabels(itemsRaw.map((i) => i.opportunity_id ?? "")),
    getNameMap([
      plan.agent_id,
      plan.approved_by ?? "",
      review?.approved_by ?? "",
      ...logs.map((l) => l.changed_by ?? ""),
      ...decisions.map((d) => d.owner_id ?? ""),
    ]),
  ]);

  return {
    id: plan.id,
    office_id: plan.office_id,
    agent_id: plan.agent_id,
    agent_name: names.get(plan.agent_id) ?? "Агент",
    week_start: plan.week_start,
    status: plan.status,
    last_week_summary: plan.last_week_summary,
    support_needed: plan.support_needed,
    commitment: plan.commitment,
    submitted_at: plan.submitted_at,
    approved_by_name: plan.approved_by ? (names.get(plan.approved_by) ?? null) : null,
    approved_at: plan.approved_at,
    return_note: plan.return_note,
    targets,
    items: itemsRaw.map((i) => ({
      id: i.id,
      kind: i.kind,
      position: i.position,
      opportunity_id: i.opportunity_id,
      opportunity_label: i.opportunity_id ? (oppLabels.get(i.opportunity_id) ?? null) : null,
      obstacle_id: i.obstacle_id,
      obstacle_label: i.obstacle?.label ?? null,
      text: i.text,
    })),
    review: review
      ? {
          ...review,
          approved_by_name: review.approved_by ? (names.get(review.approved_by) ?? null) : null,
        }
      : null,
    commitments: logs.map((l) => ({
      source: l.source,
      new_text: l.new_text,
      changed_by_name: l.changed_by ? (names.get(l.changed_by) ?? null) : null,
      changed_at: l.changed_at,
    })),
    decisions: decisions.map((d) => ({ ...d, owner_name: d.owner_id ? (names.get(d.owner_id) ?? null) : null })),
  };
}

export async function getPlanById(id: string): Promise<{ plan: PlanDetail | null; unavailable: boolean }> {
  const r = await loadPlan({ id });
  return r === "unavailable" ? { plan: null, unavailable: true } : { plan: r, unavailable: false };
}

export async function getPlanForAgentWeek(agentId: string, week: string): Promise<{ plan: PlanDetail | null; unavailable: boolean }> {
  const r = await loadPlan({ agentId, week });
  return r === "unavailable" ? { plan: null, unavailable: true } : { plan: r, unavailable: false };
}

export function targetValues(plan: PlanDetail | null): WeeklyValues {
  const out: WeeklyValues = {};
  if (!plan) return out;
  for (const [k, v] of Object.entries(plan.targets) as [MetricKey, PlanTargetRow][]) out[k] = v.target;
  return out;
}

// ── Сонголтууд ────────────────────────────────────────────

export type OppOption = { id: string; label: string; stage: string | null; amount: number | null; next_step_date: string | null };

export async function getOpenOpportunityOptions(agentId: string): Promise<OppOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_opportunities")
    .select(
      "id, amount, next_step_date, contact:crm_contacts!crm_opportunities_contact_id_fkey(display_name), " +
        "stage:crm_stages!crm_opportunities_stage_id_fkey(name, probability), " +
        "pipeline:crm_pipelines!crm_opportunities_pipeline_id_fkey(code)"
    )
    .eq("owner_id", agentId)
    .eq("state", "open")
    .limit(200);
  if (error) {
    console.error("getOpenOpportunityOptions:", error.message);
    return [];
  }
  type Raw = {
    id: string;
    amount: number | null;
    next_step_date: string | null;
    contact: { display_name: string } | null;
    stage: { name: string; probability: number | null } | null;
    pipeline: { code: string } | null;
  };
  return ((data ?? []) as unknown as Raw[])
    .filter((o) => o.pipeline?.code !== "PL-6")
    .sort((a, b) => Number(b.stage?.probability ?? 0) - Number(a.stage?.probability ?? 0))
    .map((o) => ({
      id: o.id,
      label: o.contact?.display_name ?? "Боломж",
      stage: o.stage?.name ?? null,
      amount: o.amount == null ? null : Number(o.amount),
      next_step_date: o.next_step_date,
    }));
}

export async function getObstacleOptions(): Promise<{ id: string; label: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_lookups")
    .select("id, label, sort_order")
    .eq("kind", "sales_obstacle")
    .eq("is_active", true)
    .order("sort_order");
  if (error) console.error("getObstacleOptions:", error.message);
  return (data ?? []).map((l) => ({ id: l.id, label: l.label }));
}

// ── Хугацаа хэтэрсэн алхам (§6.24 «Эргэн холбогдолт») ──────

export type OverdueStepRow = {
  entity: "lead" | "opportunity";
  entity_id: string;
  label: string;
  due_on: string;
  resolved_at: string | null;
  resolution: string | null;
  href: string;
};

export async function getOverdueSteps(week: string, agentId: string, basePath: string, today: string): Promise<OverdueStepRow[]> {
  const supabase = await createClient();
  const end = weekEnd(week) < today ? weekEnd(week) : today;
  const { data, error } = await supabase
    .from("crm_next_step_log")
    .select("entity, entity_id, due_on, resolved_at, resolution")
    .eq("owner_id", agentId)
    .lt("due_on", end)
    .or(`resolved_at.is.null,resolved_at.gte.${ubDateTime(week, "00:00").toISOString()}`)
    .order("due_on")
    .limit(100);
  if (error) {
    if (!isMissing(error.message)) console.error("getOverdueSteps:", error.message);
    return [];
  }
  type Raw = { entity: "lead" | "opportunity"; entity_id: string; due_on: string; resolved_at: string | null; resolution: string | null };
  const rows = ((data ?? []) as Raw[]).filter((r) => {
    if (!r.resolved_at) return true;
    const resolvedUb = new Date(new Date(r.resolved_at).getTime() + 8 * 3600_000).toISOString().slice(0, 10);
    return resolvedUb > r.due_on;
  });
  const leadIds = rows.filter((r) => r.entity === "lead").map((r) => r.entity_id);
  const oppIds = rows.filter((r) => r.entity === "opportunity").map((r) => r.entity_id);
  const [leadsRes, oppLabels] = await Promise.all([
    leadIds.length
      ? supabase.from("crm_leads").select("id, contact:crm_contacts!crm_leads_contact_id_fkey(display_name)").in("id", leadIds)
      : Promise.resolve({ data: [] as unknown[] }),
    opportunityLabels(oppIds),
  ]);
  const leadLabels = new Map(
    ((leadsRes.data ?? []) as unknown as { id: string; contact: { display_name: string } | null }[]).map((l) => [
      l.id,
      l.contact?.display_name ?? "Сэжим",
    ])
  );
  return rows.map((r) => ({
    ...r,
    label: r.entity === "lead" ? (leadLabels.get(r.entity_id) ?? "Сэжим") : (oppLabels.get(r.entity_id) ?? "Боломж"),
    href: r.entity === "lead" ? `${basePath}/leads/${r.entity_id}` : `${basePath}/${basePath.startsWith("/office") ? "deals" : "pipeline"}/${r.entity_id}`,
  }));
}

// ── Алдсан шалтгаан (§6.24) ───────────────────────────────

export type LostReasonCount = { label: string; cnt: number };

export async function getLostReasonsForRange(from: string, to: string, agentIds?: string[]): Promise<LostReasonCount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_kpi_period_metrics", { p_from: from, p_to: to });
  if (error) {
    if (!isMissing(error.message)) console.error("getLostReasonsForRange:", error.message);
    return [];
  }
  const allow = agentIds ? new Set(agentIds) : null;
  const by = new Map<string, number>();
  for (const r of (data ?? []) as { metric: string; owner_id: string | null; dim_label: string | null; cnt: number }[]) {
    if (r.metric !== "lost") continue;
    if (allow && (!r.owner_id || !allow.has(r.owner_id))) continue;
    const label = r.dim_label ?? "Бүртгэгдээгүй";
    by.set(label, (by.get(label) ?? 0) + Number(r.cnt));
  }
  return [...by.entries()].map(([label, cnt]) => ({ label, cnt })).sort((a, b) => b.cnt - a.cnt);
}

// ── Хадгалсан оноо ────────────────────────────────────────

export type StoredScore = { agent_id: string; kind: "preliminary" | "final"; total: number; components: unknown; computed_at: string };

export async function getStoredScores(weeks: string[], agentId?: string | null): Promise<Map<string, StoredScore>> {
  const out = new Map<string, StoredScore>();
  if (!weeks.length) return out;
  const supabase = await createClient();
  let q = supabase.from("crm_weekly_scores").select("agent_id, week_start, kind, total, components, computed_at").in("week_start", weeks);
  if (agentId) q = q.eq("agent_id", agentId);
  const { data, error } = await q;
  if (error) {
    if (!isMissing(error.message)) console.error("getStoredScores:", error.message);
    return out;
  }
  for (const r of (data ?? []) as (StoredScore & { week_start: string })[]) {
    const key = `${r.week_start}:${r.agent_id}`;
    const cur = out.get(key);
    if (!cur || (cur.kind === "preliminary" && r.kind === "final")) out.set(key, { ...r, total: Number(r.total) });
  }
  return out;
}

// ── Долоо хоногийн самбар (баг, оффис, хурал) ──────────────

export type BoardPlanLite = { id: string; status: WeeklyStatus; review_status: WeeklyStatus | null; commitment: string | null };

export type WeekBoardRow = {
  agent: WeekAgent;
  plan: BoardPlanLite | null;
  targets: WeeklyValues;
  actuals: WeeklyValues;
  moves: MoveSummary;
  score: WeeklyScore;
  scoreKind: "live" | "preliminary" | "final";
  storedTotal: number | null;
  /** §6.25: зөвхөн идэвхтэй (нээлттэй ажилтай) агентыг үнэлнэ. */
  scored: boolean;
  anomalies: AnomalyKind[];
  prev: { actuals: WeeklyValues; targets: WeeklyValues; score: number | null } | null;
};

export type WeekBoard = {
  week: string;
  phase: WeekPhase;
  settings: WeeklySettingsBundle;
  rows: WeekBoardRow[];
  unavailable: boolean;
};

async function plansForWeek(week: string, agentIds: string[]): Promise<Map<string, BoardPlanLite & { targets: WeeklyValues }>> {
  const out = new Map<string, BoardPlanLite & { targets: WeeklyValues }>();
  if (!agentIds.length) return out;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_weekly_plans")
    .select("id, agent_id, status, commitment")
    .eq("week_start", week)
    .in("agent_id", agentIds);
  if (error) {
    if (!isMissing(error.message)) console.error("plansForWeek:", error.message);
    return out;
  }
  const plans = (data ?? []) as { id: string; agent_id: string; status: WeeklyStatus; commitment: string | null }[];
  if (!plans.length) return out;
  const ids = plans.map((p) => p.id);
  const [tRes, rRes] = await Promise.all([
    supabase.from("crm_weekly_plan_targets").select("plan_id, metric_code, target").in("plan_id", ids),
    supabase.from("crm_weekly_reviews").select("plan_id, status").in("plan_id", ids),
  ]);
  const targets = new Map<string, WeeklyValues>();
  for (const t of (tRes.data ?? []) as { plan_id: string; metric_code: string; target: number | string | null }[]) {
    if (!isWeeklyMetricCode(t.metric_code) && t.metric_code !== "stage_advances") continue;
    const cur = targets.get(t.plan_id) ?? {};
    cur[t.metric_code as MetricKey] = t.target == null ? null : Number(t.target);
    targets.set(t.plan_id, cur);
  }
  const reviews = new Map(((rRes.data ?? []) as { plan_id: string; status: WeeklyStatus }[]).map((r) => [r.plan_id, r.status]));
  for (const p of plans) {
    out.set(p.agent_id, {
      id: p.id,
      status: p.status,
      review_status: reviews.get(p.id) ?? null,
      commitment: p.commitment,
      targets: targets.get(p.id) ?? {},
    });
  }
  return out;
}

/**
 * Агент бүрийн долоо хоногийн мөр: карт, зорилт, гүйцэтгэл, хөдөлгөөн, оноо,
 * «Анхаарах» дохио, өмнөх долоо хоног. Багийн ахлагчийн баг, оффисын мөчлөг,
 * хурлын горим, тайлан бүгд үүнийг ашиглана.
 */
export async function getWeekBoard(week: string, filters: WeekFilters = {}, opts: { withPrev?: boolean; now?: Date } = {}): Promise<WeekBoard> {
  const now = opts.now ?? new Date();
  const settings = await getWeeklySettings();
  const phase = weekPhase(week, now, settings.cycle.schedule);
  const prevWeek = addWeeks(week, -1);
  const prevPhase = weekPhase(prevWeek, now, settings.cycle.schedule);

  const scope = await getScopeAgents(filters);
  if (scope.unavailable) return { week, phase, settings, rows: [], unavailable: true };
  const agentIds = scope.rows.map((a) => a.profile_id);
  const one = filters.agentId ?? null;

  const [actuals, plans, stored, prevActuals, prevPlans] = await Promise.all([
    getWeekActuals(week, one, phase),
    plansForWeek(week, agentIds),
    getStoredScores(opts.withPrev ? [week, prevWeek] : [week], one),
    opts.withPrev ? getWeekActuals(prevWeek, one, prevPhase) : Promise.resolve(null),
    opts.withPrev ? plansForWeek(prevWeek, agentIds) : Promise.resolve(null),
  ]);

  const rows: WeekBoardRow[] = scope.rows.map((agent) => {
    const id = agent.profile_id;
    const plan = plans.get(id) ?? null;
    const a = actuals.byAgent.get(id) ?? {};
    const targets = resolveTargets(plan?.targets, plan?.status, settings.cycle.defaultTargets);
    const { weights } = pickScoreWeights(settings.weights, settings.cycle, agent.hired_on, week);
    const score = computeWeeklyScore({ actuals: a, targets, weights, naPolicy: settings.cycle.naPolicy });
    const st = stored.get(`${week}:${id}`);
    let prev: WeekBoardRow["prev"] = null;
    if (prevActuals && prevPlans) {
      const pp = prevPlans.get(id) ?? null;
      const pa = prevActuals.byAgent.get(id) ?? {};
      const pt = resolveTargets(pp?.targets, pp?.status, settings.cycle.defaultTargets);
      const ps = stored.get(`${prevWeek}:${id}`);
      const pw = pickScoreWeights(settings.weights, settings.cycle, agent.hired_on, prevWeek).weights;
      prev = {
        actuals: pa,
        targets: pt,
        score: ps ? ps.total : computeWeeklyScore({ actuals: pa, targets: pt, weights: pw, naPolicy: settings.cycle.naPolicy }).total,
      };
    }
    const anomalies = detectAnomalies({
      planStatus: plan?.status ?? null,
      lastWeekScore: prev?.score ?? null,
      lastWeekActuals: prev?.actuals ?? null,
      lastWeekTargets: prev?.targets ?? null,
      currentOverdue: a.overdue_followups ?? null,
      settings: settings.cycle,
    });
    return {
      agent,
      plan: plan ? { id: plan.id, status: plan.status, review_status: plan.review_status, commitment: plan.commitment } : null,
      targets,
      actuals: a,
      moves: actuals.moves.get(id) ?? summarizeMoves([]),
      score,
      scoreKind: st ? st.kind : "live",
      storedTotal: st ? st.total : null,
      scored: actuals.active.has(id) || !!st,
      anomalies,
      prev,
    };
  });
  return { week, phase, settings, rows, unavailable: actuals.unavailable };
}

/** Самбарын мөрүүдийн нийлбэр (багийн нэгдсэн тоо, §9.5 эхний хэсэг). */
export function sumBoard(rows: WeekBoardRow[], key: "actuals" | "targets"): WeeklyValues {
  const out: WeeklyValues = {};
  for (const m of WEEKLY_METRICS) {
    if (m.unit === "pct") {
      const vals = rows.map((r) => r[key][m.code]).filter((x): x is number => x != null);
      out[m.code] = vals.length ? Math.round((vals.reduce((s, x) => s + x, 0) / vals.length) * 10) / 10 : null;
      continue;
    }
    const vals = rows.map((r) => r[key][m.code]).filter((x): x is number => x != null);
    out[m.code] = vals.length ? vals.reduce((s, x) => s + x, 0) : null;
  }
  return out;
}

// ── Миний карт (агентын хуудас) ───────────────────────────

export type MyWeekCard = {
  week: string;
  phase: WeekPhase;
  settings: WeeklySettingsBundle;
  plan: PlanDetail | null;
  actuals: WeeklyValues;
  moves: MoveSummary;
  targets: WeeklyValues;
  score: WeeklyScore;
  scoreKind: "live" | "preliminary" | "final";
  prevPlanId: string | null;
  canCreate: boolean;
  unavailable: boolean;
};

export async function getAgentWeekCard(agentId: string, week: string, now: Date = new Date()): Promise<MyWeekCard> {
  const settings = await getWeeklySettings();
  const phase = weekPhase(week, now, settings.cycle.schedule);
  const [planRes, actuals, stored, prev, staff] = await Promise.all([
    getPlanForAgentWeek(agentId, week),
    getWeekActuals(week, agentId, phase),
    getStoredScores([week], agentId),
    getPlanForAgentWeek(agentId, addWeeks(week, -1)),
    (async () => {
      const supabase = await createClient();
      const { data } = await supabase.from("crm_staff").select("hired_on").eq("profile_id", agentId).maybeSingle();
      return (data ?? null) as { hired_on: string | null } | null;
    })(),
  ]);
  const plan = planRes.plan;
  const a = actuals.byAgent.get(agentId) ?? {};
  const targets = resolveTargets(targetValues(plan), plan?.status, settings.cycle.defaultTargets);
  const { weights } = pickScoreWeights(settings.weights, settings.cycle, staff?.hired_on ?? null, week);
  const score = computeWeeklyScore({ actuals: a, targets, weights, naPolicy: settings.cycle.naPolicy });
  const st = stored.get(`${week}:${agentId}`);
  return {
    week,
    phase,
    settings,
    plan,
    actuals: a,
    moves: actuals.moves.get(agentId) ?? summarizeMoves([]),
    targets,
    score,
    scoreKind: st ? st.kind : "live",
    prevPlanId: prev.plan?.id ?? null,
    canCreate: !phase.finalLocked,
    unavailable: planRes.unavailable || actuals.unavailable,
  };
}

// ── Хурал ─────────────────────────────────────────────────

export type MeetingRow = {
  id: string;
  kind: "monday" | "friday";
  week_start: string;
  team_id: string | null;
  status: "in_progress" | "done";
  started_at: string;
  ended_at: string | null;
  facilitator_id: string;
  sections: { key: string; seconds: number }[];
  decisions: (DecisionRow & { agent_id: string | null; plan_id: string | null })[];
};

export async function getMeeting(kind: "monday" | "friday", week: string, teamId: string | null): Promise<MeetingRow | null> {
  const supabase = await createClient();
  let q = supabase
    .from("crm_sales_meetings")
    .select("id, kind, week_start, team_id, status, started_at, ended_at, facilitator_id, sections")
    .eq("kind", kind)
    .eq("week_start", week)
    .order("started_at", { ascending: false })
    .limit(1);
  q = teamId ? q.eq("team_id", teamId) : q.is("team_id", null);
  const { data, error } = await q.maybeSingle();
  if (error) {
    if (!isMissing(error.message)) console.error("getMeeting:", error.message);
    return null;
  }
  if (!data) return null;
  const m = data as unknown as Omit<MeetingRow, "decisions">;
  const { data: dec, error: dErr } = await supabase
    .from("crm_meeting_decisions")
    .select("id, meeting_id, plan_id, agent_id, kind, text, owner_id, due_on, status, created_at")
    .eq("meeting_id", m.id)
    .order("created_at");
  if (dErr) console.error("getMeeting decisions:", dErr.message);
  const decisions = (dec ?? []) as (Omit<DecisionRow, "owner_name"> & { agent_id: string | null; plan_id: string | null })[];
  const names = await getNameMap(decisions.map((d) => d.owner_id ?? ""));
  return {
    ...m,
    sections: Array.isArray(m.sections) ? m.sections : [],
    decisions: decisions.map((d) => ({ ...d, owner_name: d.owner_id ? (names.get(d.owner_id) ?? null) : null })),
  };
}

// ── Хандалт ───────────────────────────────────────────────

export async function canApproveAgent(agentId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_weekly_can_approve", { p_agent: agentId });
  if (error) {
    if (!isMissing(error.message)) console.error("canApproveAgent:", error.message);
    return false;
  }
  return data === true;
}

/** Мөчлөгийн удирдлагын дэлгэц (баг, оффисын тойм) нээх дүр. */
export function canLeadWeekly(roles: readonly string[]): boolean {
  return roles.some((r) => ["team_lead", "sales_director", "ops_qc", "ceo", "sysadmin"].includes(r));
}

/** Хурлыг удирдах (эхлүүлэх, шийдвэр тэмдэглэх) дүр. */
export function canFacilitate(roles: readonly string[]): boolean {
  return roles.some((r) => ["team_lead", "sales_director", "ceo", "sysadmin"].includes(r));
}

export async function myTeamId(): Promise<string | null> {
  const ctx = await getCrmStaffContext();
  return ctx?.teamId ?? null;
}

// ── Хурлын агентууд (§6.20 танилцуулгын өгөгдөл) ──────────

export type MeetingAgendaData = {
  board: WeekBoard;
  agents: MeetingAgentData[];
  teamNumbers: MeetingNumberData[];
  ownerOptions: { id: string; name: string }[];
};

export type MeetingNumberData = { label: string; actual?: string; target?: string; met?: boolean | null };

export type MeetingAgentData = {
  agentId: string;
  name: string;
  planId: string | null;
  planStatus: string | null;
  planHref: string | null;
  anomalies: AnomalyKind[];
  lastWeek: MeetingNumberData[];
  pipeline: MeetingNumberData[];
  targets: MeetingNumberData[];
  topDeals: string[];
  priorities: string[];
  obstacles: string[];
  commitment: string | null;
};

export async function getMeetingAgenda(
  week: string,
  filters: WeekFilters,
  detailBase: string,
  fmt: (code: MetricKey, v: number | null | undefined) => string
): Promise<MeetingAgendaData> {
  const board = await getWeekBoard(week, filters, { withPrev: true });
  const details = await Promise.all(board.rows.map((r) => (r.plan ? getPlanById(r.plan.id) : Promise.resolve(null))));
  const num = (code: WeeklyMetricCode, actual: number | null | undefined, target?: number | null): MeetingNumberData => {
    const m = WEEKLY_METRIC_BY_CODE[code];
    const g = target === undefined ? null : gapRow(actual, target, m.better);
    return {
      label: m.label,
      actual: fmt(code, actual),
      target: target === undefined ? undefined : fmt(code, target),
      met: g ? g.met : null,
    };
  };
  const agents: MeetingAgentData[] = board.rows.map((r, i) => {
    const plan = details[i]?.plan ?? null;
    return {
      agentId: r.agent.profile_id,
      name: r.agent.full_name,
      planId: r.plan?.id ?? null,
      planStatus: r.plan?.status ?? null,
      planHref: r.plan ? `${detailBase}/${r.plan.id}` : null,
      anomalies: r.anomalies,
      lastWeek: MEETING_KEY_CODES.map((c) => num(c, r.prev?.actuals[c] ?? null, r.prev?.targets[c] ?? null)),
      pipeline: MEETING_PIPELINE_CODES.map((c) => num(c, r.actuals[c] ?? null)),
      targets: CARD_TARGET_CODES.map((c) => ({ label: WEEKLY_METRIC_BY_CODE[c].cardLabel ?? WEEKLY_METRIC_BY_CODE[c].label, actual: fmt(c, r.targets[c] ?? null) })),
      topDeals: (plan?.items ?? [])
        .filter((x) => x.kind === "top_deal")
        .map((x) => [x.opportunity_label, x.text].filter(Boolean).join(" — ")),
      priorities: (plan?.items ?? []).filter((x) => x.kind === "priority").map((x) => x.text ?? "").filter(Boolean),
      obstacles: (plan?.items ?? [])
        .filter((x) => x.kind === "obstacle")
        .map((x) => [x.obstacle_label, x.text].filter(Boolean).join(": ")),
      commitment: plan?.commitment ?? null,
    };
  });
  const prevActual = sumBoard(
    board.rows.map((r) => ({ ...r, actuals: r.prev?.actuals ?? {} })),
    "actuals"
  );
  const prevTarget = sumBoard(
    board.rows.map((r) => ({ ...r, targets: r.prev?.targets ?? {} })),
    "targets"
  );
  const curTarget = sumBoard(board.rows, "targets");
  const teamNumbers: MeetingNumberData[] = [
    ...MEETING_KEY_CODES.map((c) => ({ ...num(c, prevActual[c], prevTarget[c]), label: `Өнгөрсөн долоо хоног: ${WEEKLY_METRIC_BY_CODE[c].label}` })),
    ...CARD_TARGET_CODES.map((c) => ({ label: `Энэ долоо хоногийн зорилт: ${WEEKLY_METRIC_BY_CODE[c].label}`, actual: fmt(c, curTarget[c]) })),
  ];
  const ownerOptions = board.rows.map((r) => ({ id: r.agent.profile_id, name: r.agent.full_name }));
  const ctx = await getCrmStaffContext();
  if (ctx && !ownerOptions.some((o) => o.id === ctx.profileId)) {
    const names = await getNameMap([ctx.profileId]);
    ownerOptions.unshift({ id: ctx.profileId, name: names.get(ctx.profileId) ?? "Би" });
  }
  return { board, agents, teamNumbers, ownerOptions };
}
