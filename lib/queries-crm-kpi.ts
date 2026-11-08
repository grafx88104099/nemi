import { createClient } from "@/lib/supabase/server";
import { getSettingValue } from "@/lib/queries-crm-core";
import type { Json } from "@/types/database";
import {
  QUALITY_CRITERIA,
  activeAgentIds,
  agentConversions,
  agentRetention,
  budgetForRange,
  budgetVariance,
  followupKpis,
  forecastAccuracy,
  funnelSteps,
  isQualityCriterion,
  monthRange,
  normalizeKpiTargets,
  normalizeQualitySettings,
  pct,
  perAgent,
  prevMonthStart,
  quarterRange,
  sufficientPipelineThreshold,
  sumFollowup,
  sumFunnel,
  ubTodayIso,
  weekRange,
  type AuditScore,
  type DateRange,
  type FollowupRow,
  type FunnelCounts,
  type FunnelStep,
  type KpiResult,
  type KpiTargets,
  type QualityCriterion,
  type QualityResult,
  type QualitySettings,
  type Retention,
  type Variance,
  auditScore,
} from "@/lib/crm/quality";

/**
 * Чанар, KPI, төсвийн уншилтууд (U6 — PRO-001 v2.1 §6.29, §8.1–§8.5).
 * Тоо бүр DB-ийн view/функцээс (security invoker → RLS: агент өөрийн,
 * ахлагч багийн, удирдлага оффисын). Гар оруулсан гүйцэтгэл харагдах зам үгүй.
 */

type Supa = Awaited<ReturnType<typeof createClient>>;

/** DB-ийн тооцоолол хараахан идэвхжээгүй (функц/хүснэгт алга) эсэх. */
function isMissingObject(message: string | undefined): boolean {
  if (!message) return false;
  return /does not exist|Could not find|schema cache/i.test(message);
}

const MANAGER_ROLES = ["sales_director", "ops_qc", "ceo", "sysadmin"] as const;

export function canSeeQuality(roles: readonly string[]): boolean {
  return roles.some((r) => (MANAGER_ROLES as readonly string[]).includes(r) || r === "team_lead");
}
export function canRunAudit(roles: readonly string[]): boolean {
  return roles.includes("ops_qc") || roles.includes("sysadmin");
}
export function canSeeKpi(roles: readonly string[]): boolean {
  return roles.some((r) =>
    ["sales_director", "ops_qc", "ceo", "sysadmin", "team_lead", "marketing", "finance"].includes(r)
  );
}
export function canSeeExecutive(roles: readonly string[]): boolean {
  return roles.some((r) => ["ceo", "sales_director", "finance", "ops_qc", "sysadmin"].includes(r));
}
export function canEditBudget(roles: readonly string[]): boolean {
  return roles.some((r) => ["ceo", "finance", "sales_director"].includes(r));
}

async function nameMap(supabase: Supa, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const map = new Map<string, string>();
  if (!uniq.length) return map;
  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", uniq);
  if (error) console.error("kpi nameMap:", error.message);
  for (const p of data ?? []) map.set(p.id, p.full_name ?? "Нэргүй");
  return map;
}

async function lookupMap(supabase: Supa, kind: string): Promise<Map<string, { code: string; label: string }>> {
  const { data, error } = await supabase.from("crm_lookups").select("id, code, label").eq("kind", kind);
  if (error) console.error("kpi lookupMap:", error.message);
  return new Map((data ?? []).map((l) => [l.id, { code: l.code, label: l.label }]));
}

async function branchMap(supabase: Supa): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("crm_branches").select("id, name");
  if (error) console.error("kpi branchMap:", error.message);
  return new Map((data ?? []).map((b) => [b.id, b.name]));
}

// ── Тохиргоо ──────────────────────────────────────────────

export type KpiSettings = { quality: QualitySettings; targets: KpiTargets };

export async function getKpiSettings(): Promise<KpiSettings> {
  const [q, t] = await Promise.all([getSettingValue("quality_audit"), getSettingValue("kpi_targets")]);
  return { quality: normalizeQualitySettings(q), targets: normalizeKpiTargets(t) };
}

// ── §6.29 Автомат шалгалт ─────────────────────────────────

export type QualityCheckRow = {
  criterion: QualityCriterion;
  entity: string;
  entity_id: string;
  agent_id: string | null;
  agent_name: string | null;
  branch_id: string | null;
  occurred_on: string | null;
  result: "pass" | "fail";
  reason: string | null;
  label: string | null;
};

export async function getQualityFailures(
  opts: { criterion?: string; agentId?: string; limit?: number } = {}
): Promise<{ rows: QualityCheckRow[]; unavailable: boolean }> {
  const supabase = await createClient();
  let q = supabase
    .from("crm_v_quality_checks")
    .select("criterion, entity, entity_id, agent_id, branch_id, occurred_on, result, reason, label")
    .eq("result", "fail");
  if (opts.criterion && isQualityCriterion(opts.criterion)) q = q.eq("criterion", opts.criterion);
  if (opts.agentId) q = q.eq("agent_id", opts.agentId);
  const { data, error } = await q.order("criterion").limit(opts.limit ?? 300);
  if (error) {
    console.error("getQualityFailures:", error.message);
    return { rows: [], unavailable: isMissingObject(error.message) };
  }
  const raw = (data ?? []) as Omit<QualityCheckRow, "agent_name">[];
  const names = await nameMap(supabase, raw.map((r) => r.agent_id));
  return {
    rows: raw
      .filter((r) => isQualityCriterion(r.criterion))
      .map((r) => ({ ...r, agent_name: r.agent_id ? (names.get(r.agent_id) ?? null) : null })),
    unavailable: false,
  };
}

export type CriterionSummary = { criterion: QualityCriterion; total: number; passed: number; pct: number | null };

export async function getQualitySummary(
  branchId?: string | null
): Promise<{ rows: CriterionSummary[]; total: number; passed: number; pct: number | null; unavailable: boolean }> {
  const supabase = await createClient();
  let q = supabase.from("crm_v_quality_summary").select("branch_id, criterion, total, passed");
  if (branchId) q = q.eq("branch_id", branchId);
  const { data, error } = await q;
  if (error) {
    console.error("getQualitySummary:", error.message);
    return { rows: [], total: 0, passed: 0, pct: null, unavailable: isMissingObject(error.message) };
  }
  const acc = new Map<string, { total: number; passed: number }>();
  for (const r of data ?? []) {
    const cur = acc.get(r.criterion) ?? { total: 0, passed: 0 };
    cur.total += Number(r.total);
    cur.passed += Number(r.passed);
    acc.set(r.criterion, cur);
  }
  const rows = QUALITY_CRITERIA.map((c) => {
    const v = acc.get(c) ?? { total: 0, passed: 0 };
    return { criterion: c, total: v.total, passed: v.passed, pct: pct(v.passed, v.total) };
  });
  const total = rows.reduce((s, r) => s + r.total, 0);
  const passed = rows.reduce((s, r) => s + r.passed, 0);
  return { rows, total, passed, pct: pct(passed, total), unavailable: false };
}

export type AgentQualityRow = {
  agent_id: string;
  agent_name: string;
  checked: number;
  passed: number;
  quality_pct: number | null;
  by_criterion: Partial<Record<QualityCriterion, { checked: number; passed: number }>>;
};

export async function getAgentDataQuality(): Promise<AgentQualityRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_v_agent_data_quality")
    .select("agent_id, checked, passed, quality_pct, by_criterion");
  if (error) {
    console.error("getAgentDataQuality:", error.message);
    return [];
  }
  const names = await nameMap(supabase, (data ?? []).map((r) => r.agent_id));
  return (data ?? [])
    .map((r) => ({
      agent_id: r.agent_id,
      agent_name: names.get(r.agent_id) ?? "Нэргүй",
      checked: Number(r.checked),
      passed: Number(r.passed),
      quality_pct: r.quality_pct == null ? null : Number(r.quality_pct),
      by_criterion: (r.by_criterion ?? {}) as AgentQualityRow["by_criterion"],
    }))
    .sort((a, b) => (a.quality_pct ?? 101) - (b.quality_pct ?? 101));
}

// ── Чанарын аудит ─────────────────────────────────────────

export type QualityAuditRow = {
  id: string;
  period_start: string;
  period_end: string;
  scope: string;
  scope_label: string | null;
  status: string;
  sample_per_criterion: number;
  score: number | null;
  checked_count: number | null;
  passed_count: number | null;
  auditor_name: string | null;
  created_at: string;
  completed_at: string | null;
};

const AUDIT_SELECT =
  "id, period_start, period_end, scope, branch_id, agent_id, status, sample_per_criterion, score, " +
  "checked_count, passed_count, summary, cancel_reason, population, auditor_id, created_at, completed_at";

type RawAudit = {
  id: string;
  period_start: string;
  period_end: string;
  scope: string;
  branch_id: string | null;
  agent_id: string | null;
  status: string;
  sample_per_criterion: number;
  score: number | null;
  checked_count: number | null;
  passed_count: number | null;
  summary: string | null;
  cancel_reason: string | null;
  population: Json;
  auditor_id: string;
  created_at: string;
  completed_at: string | null;
};

export async function getQualityAudits(limit = 50): Promise<{ rows: QualityAuditRow[]; unavailable: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_quality_audits")
    .select(AUDIT_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getQualityAudits:", error.message);
    return { rows: [], unavailable: isMissingObject(error.message) };
  }
  const raw = (data ?? []) as unknown as RawAudit[];
  const [names, branches] = await Promise.all([
    nameMap(supabase, raw.flatMap((a) => [a.auditor_id, a.agent_id])),
    branchMap(supabase),
  ]);
  return {
    rows: raw.map((a) => ({
      id: a.id,
      period_start: a.period_start,
      period_end: a.period_end,
      scope: a.scope,
      scope_label:
        a.scope === "branch" ? (branches.get(a.branch_id ?? "") ?? null) : a.scope === "agent" ? (names.get(a.agent_id ?? "") ?? null) : null,
      status: a.status,
      sample_per_criterion: a.sample_per_criterion,
      score: a.score == null ? null : Number(a.score),
      checked_count: a.checked_count,
      passed_count: a.passed_count,
      auditor_name: names.get(a.auditor_id) ?? null,
      created_at: a.created_at,
      completed_at: a.completed_at,
    })),
    unavailable: false,
  };
}

export type QualityAuditItem = {
  id: string;
  criterion: QualityCriterion;
  entity: string;
  entity_id: string;
  agent_id: string | null;
  agent_name: string | null;
  label: string | null;
  auto_result: "pass" | "fail";
  auto_reason: string | null;
  result: QualityResult | null;
  note: string | null;
  reviewed_name: string | null;
  reviewed_at: string | null;
  fix_task_id: string | null;
  fix_status: string | null;
  fix_deadline: string | null;
};

export type QualityAuditDetail = QualityAuditRow & {
  summary: string | null;
  cancel_reason: string | null;
  population: Partial<Record<QualityCriterion, { total: number; passed: number }>>;
  items: QualityAuditItem[];
  score_live: AuditScore;
};

export async function getQualityAudit(id: string): Promise<QualityAuditDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("crm_quality_audits").select(AUDIT_SELECT).eq("id", id).maybeSingle();
  if (error) {
    console.error("getQualityAudit:", error.message);
    return null;
  }
  if (!data) return null;
  const a = data as unknown as RawAudit;
  const { data: itemsRaw, error: iErr } = await supabase
    .from("crm_quality_audit_items")
    .select("id, criterion, entity, entity_id, agent_id, label, auto_result, auto_reason, result, note, reviewed_by, reviewed_at, fix_task_id")
    .eq("audit_id", id)
    .order("criterion")
    .order("created_at");
  if (iErr) console.error("getQualityAudit items:", iErr.message);
  type RawItem = {
    id: string;
    criterion: string;
    entity: string;
    entity_id: string;
    agent_id: string | null;
    label: string | null;
    auto_result: "pass" | "fail";
    auto_reason: string | null;
    result: QualityResult | null;
    note: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    fix_task_id: string | null;
  };
  const items = ((itemsRaw ?? []) as RawItem[]).filter((i) => isQualityCriterion(i.criterion));
  const taskIds = items.map((i) => i.fix_task_id).filter((x): x is string => Boolean(x));
  const taskMap = new Map<string, { status: string; deadline: string | null }>();
  if (taskIds.length) {
    const { data: tasks } = await supabase.from("tasks").select("id, status, deadline").in("id", taskIds);
    for (const t of tasks ?? []) taskMap.set(t.id, { status: t.status, deadline: t.deadline });
  }
  const [names, branches] = await Promise.all([
    nameMap(supabase, [a.auditor_id, a.agent_id, ...items.flatMap((i) => [i.agent_id, i.reviewed_by])]),
    branchMap(supabase),
  ]);
  const mapped: QualityAuditItem[] = items.map((i) => ({
    id: i.id,
    criterion: i.criterion as QualityCriterion,
    entity: i.entity,
    entity_id: i.entity_id,
    agent_id: i.agent_id,
    agent_name: i.agent_id ? (names.get(i.agent_id) ?? null) : null,
    label: i.label,
    auto_result: i.auto_result,
    auto_reason: i.auto_reason,
    result: i.result,
    note: i.note,
    reviewed_name: i.reviewed_by ? (names.get(i.reviewed_by) ?? null) : null,
    reviewed_at: i.reviewed_at,
    fix_task_id: i.fix_task_id,
    fix_status: i.fix_task_id ? (taskMap.get(i.fix_task_id)?.status ?? null) : null,
    fix_deadline: i.fix_task_id ? (taskMap.get(i.fix_task_id)?.deadline ?? null) : null,
  }));
  return {
    id: a.id,
    period_start: a.period_start,
    period_end: a.period_end,
    scope: a.scope,
    scope_label:
      a.scope === "branch" ? (branches.get(a.branch_id ?? "") ?? null) : a.scope === "agent" ? (names.get(a.agent_id ?? "") ?? null) : null,
    status: a.status,
    sample_per_criterion: a.sample_per_criterion,
    score: a.score == null ? null : Number(a.score),
    checked_count: a.checked_count,
    passed_count: a.passed_count,
    auditor_name: names.get(a.auditor_id) ?? null,
    created_at: a.created_at,
    completed_at: a.completed_at,
    summary: a.summary,
    cancel_reason: a.cancel_reason,
    population: (a.population ?? {}) as QualityAuditDetail["population"],
    items: mapped,
    score_live: auditScore(mapped),
  };
}

export type AuditScopeOptions = { branches: { id: string; name: string }[]; agents: { id: string; name: string }[] };

export async function getAuditScopeOptions(): Promise<AuditScopeOptions> {
  const supabase = await createClient();
  const [{ data: branches }, { data: staff }] = await Promise.all([
    supabase.from("crm_branches").select("id, name").eq("is_active", true).order("name"),
    supabase.from("crm_staff").select("profile_id, roles, is_active").eq("is_active", true),
  ]);
  const agentIds = (staff ?? []).filter((s) => (s.roles as string[]).includes("agent")).map((s) => s.profile_id);
  const names = await nameMap(supabase, agentIds);
  return {
    branches: (branches ?? []).map((b) => ({ id: b.id, name: b.name })),
    agents: agentIds.map((id) => ({ id, name: names.get(id) ?? "Нэргүй" })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** §6.29.12 хяналтад: хугацааны экспортын бүртгэл (зөвхөн удирдлагад RLS-ээр). */
export type ExportLogRow = { id: number; entity: string; actor_name: string | null; created_at: string; rows: number | null };

export async function getExportLog(range: DateRange): Promise<ExportLogRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_audit_log")
    .select("id, entity, actor_id, new_value, created_at")
    .eq("action", "export")
    .gte("created_at", `${range.from}T00:00:00+08:00`)
    .lte("created_at", `${range.to}T23:59:59+08:00`)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("getExportLog:", error.message);
    return [];
  }
  const names = await nameMap(supabase, (data ?? []).map((r) => r.actor_id));
  return (data ?? []).map((r) => {
    const v = (r.new_value ?? {}) as Record<string, unknown>;
    const rows = typeof v.rows === "number" ? v.rows : typeof v.count === "number" ? v.count : null;
    return { id: r.id, entity: r.entity, actor_name: r.actor_id ? (names.get(r.actor_id) ?? null) : null, created_at: r.created_at, rows };
  });
}

// ── §8.1 Эргэн холбогдох KPI ──────────────────────────────

export type AgentFollowup = { agent_id: string; agent_name: string; row: FollowupRow; kpis: KpiResult[] };

export async function getFollowupKpi(
  range: DateRange,
  targets: KpiTargets
): Promise<{ office: KpiResult[]; total: FollowupRow; agents: AgentFollowup[]; unavailable: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_kpi_followup", { p_from: range.from, p_to: range.to });
  if (error) {
    console.error("getFollowupKpi:", error.message);
    const total = sumFollowup([]);
    return { office: followupKpis(total, targets), total, agents: [], unavailable: isMissingObject(error.message) };
  }
  const rows = (data ?? []).map((r) => ({
    agent_id: r.agent_id,
    row: {
      active_leads: Number(r.active_leads),
      leads_with_next_step: Number(r.leads_with_next_step),
      steps_total: Number(r.steps_total),
      steps_overdue: Number(r.steps_overdue),
      showings_total: Number(r.showings_total),
      showings_feedback_ok: Number(r.showings_feedback_ok),
      offers_open: Number(r.offers_open),
      offers_followed: Number(r.offers_followed),
      hot_leads: Number(r.hot_leads),
      hot_leads_on_freq: Number(r.hot_leads_on_freq),
      material_total: Number(r.material_total),
      material_same_day: Number(r.material_same_day),
    } satisfies FollowupRow,
  }));
  const names = await nameMap(supabase, rows.map((r) => r.agent_id));
  const total = sumFollowup(rows.map((r) => r.row));
  return {
    office: followupKpis(total, targets),
    total,
    agents: rows
      .map((r) => ({
        agent_id: r.agent_id,
        agent_name: names.get(r.agent_id) ?? "Нэргүй",
        row: r.row,
        kpis: followupKpis(r.row, targets),
      }))
      .sort((a, b) => a.agent_name.localeCompare(b.agent_name)),
    unavailable: false,
  };
}

// ── §8.2 Шатлал, §8.3/§8.4(6) агентын хөрвөлт, §8.4(8) эх сурвалж ──

type FunnelDbRow = {
  owner_id: string | null;
  branch_id: string | null;
  source_id: string | null;
  campaign_code: string | null;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
  s6: number;
  s7: number;
  s8: number;
  s9: number;
  s10: number;
};

export type FunnelGroup = { key: string; label: string; counts: FunnelCounts; conversions: (number | null)[] };

function groupFunnel(rows: FunnelDbRow[], keyOf: (r: FunnelDbRow) => string, labelOf: (k: string) => string): FunnelGroup[] {
  const groups = new Map<string, FunnelDbRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const counts = sumFunnel(list);
      return { key, label: labelOf(key), counts, conversions: agentConversions(counts) };
    })
    .sort((a, b) => b.counts[0] - a.counts[0]);
}

export type FunnelReport = {
  steps: FunnelStep[];
  conversions: (number | null)[];
  byAgent: FunnelGroup[];
  bySource: FunnelGroup[];
  byCampaign: FunnelGroup[];
  byBranch: FunnelGroup[];
  unavailable: boolean;
};

export async function getFunnelReport(range: DateRange): Promise<FunnelReport> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_kpi_funnel", { p_from: range.from, p_to: range.to });
  if (error) {
    console.error("getFunnelReport:", error.message);
    const zero = sumFunnel([]);
    return {
      steps: funnelSteps(zero),
      conversions: agentConversions(zero),
      byAgent: [],
      bySource: [],
      byCampaign: [],
      byBranch: [],
      unavailable: isMissingObject(error.message),
    };
  }
  const rows = (data ?? []) as FunnelDbRow[];
  const [names, sources, branches] = await Promise.all([
    nameMap(supabase, rows.map((r) => r.owner_id)),
    lookupMap(supabase, "lead_source"),
    branchMap(supabase),
  ]);
  const counts = sumFunnel(rows);
  return {
    steps: funnelSteps(counts),
    conversions: agentConversions(counts),
    byAgent: groupFunnel(rows, (r) => r.owner_id ?? "", (k) => (k ? (names.get(k) ?? "Нэргүй") : "Эзэмшигчгүй")),
    bySource: groupFunnel(rows, (r) => r.source_id ?? "", (k) => (k ? (sources.get(k)?.label ?? "Тодорхойгүй") : "Тодорхойгүй")),
    byCampaign: groupFunnel(
      rows.filter((r) => r.campaign_code),
      (r) => r.campaign_code ?? "",
      (k) => k
    ),
    byBranch: groupFunnel(rows, (r) => r.branch_id ?? "", (k) => (k ? (branches.get(k) ?? "—") : "Салбаргүй")),
    unavailable: false,
  };
}

// ── §8.4(4)(5) Шат × дүн, хаагдах хүлээгдэж буй ───────────

export type PipelineStageRow = {
  pipeline_code: string;
  pipeline_name: string;
  stage_code: string;
  stage_name: string;
  sort_order: number;
  probability: number;
  open_count: number;
  amount_mnt: number;
  weighted_mnt: number;
  fee_mnt: number;
  weighted_fee_mnt: number;
  unconverted_count: number;
  close_week_count: number;
  close_week_weighted_fee: number;
  close_month_count: number;
  close_month_weighted_fee: number;
  overdue_close_count: number;
};

export type PipelineAgentRow = {
  agent_id: string;
  agent_name: string;
  open_count: number;
  weighted_mnt: number;
  weighted_fee_mnt: number;
  close_month_weighted_fee: number;
};

export type PipelineReport = {
  stages: PipelineStageRow[];
  agents: PipelineAgentRow[];
  totals: Omit<PipelineStageRow, "pipeline_code" | "pipeline_name" | "stage_code" | "stage_name" | "sort_order" | "probability">;
  unavailable: boolean;
};

export async function getPipelineReport(): Promise<PipelineReport> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_kpi_pipeline_stages");
  const emptyTotals = {
    open_count: 0,
    amount_mnt: 0,
    weighted_mnt: 0,
    fee_mnt: 0,
    weighted_fee_mnt: 0,
    unconverted_count: 0,
    close_week_count: 0,
    close_week_weighted_fee: 0,
    close_month_count: 0,
    close_month_weighted_fee: 0,
    overdue_close_count: 0,
  };
  if (error) {
    console.error("getPipelineReport:", error.message);
    return { stages: [], agents: [], totals: emptyTotals, unavailable: isMissingObject(error.message) };
  }
  const rows = (data ?? []).map((r) => ({
    ...r,
    sort_order: Number(r.sort_order),
    probability: Number(r.probability),
    open_count: Number(r.open_count),
    amount_mnt: Number(r.amount_mnt),
    weighted_mnt: Number(r.weighted_mnt),
    fee_mnt: Number(r.fee_mnt),
    weighted_fee_mnt: Number(r.weighted_fee_mnt),
    unconverted_count: Number(r.unconverted_count),
    close_week_count: Number(r.close_week_count),
    close_week_weighted_fee: Number(r.close_week_weighted_fee),
    close_month_count: Number(r.close_month_count),
    close_month_weighted_fee: Number(r.close_month_weighted_fee),
    overdue_close_count: Number(r.overdue_close_count),
  }));
  const stageMap = new Map<string, PipelineStageRow>();
  const agentMap = new Map<string, Omit<PipelineAgentRow, "agent_name">>();
  const totals = { ...emptyTotals };
  for (const r of rows) {
    const key = `${r.pipeline_code}|${r.stage_code}`;
    const cur =
      stageMap.get(key) ??
      ({
        pipeline_code: r.pipeline_code,
        pipeline_name: r.pipeline_name,
        stage_code: r.stage_code,
        stage_name: r.stage_name,
        sort_order: r.sort_order,
        probability: r.probability,
        ...emptyTotals,
      } as PipelineStageRow);
    for (const k of Object.keys(emptyTotals) as (keyof typeof emptyTotals)[]) {
      cur[k] += r[k];
      totals[k] += r[k];
    }
    stageMap.set(key, cur);
    if (r.owner_id) {
      const a = agentMap.get(r.owner_id) ?? {
        agent_id: r.owner_id,
        open_count: 0,
        weighted_mnt: 0,
        weighted_fee_mnt: 0,
        close_month_weighted_fee: 0,
      };
      a.open_count += r.open_count;
      a.weighted_mnt += r.weighted_mnt;
      a.weighted_fee_mnt += r.weighted_fee_mnt;
      a.close_month_weighted_fee += r.close_month_weighted_fee;
      agentMap.set(r.owner_id, a);
    }
  }
  const names = await nameMap(supabase, [...agentMap.keys()]);
  return {
    stages: [...stageMap.values()].sort((a, b) =>
      a.pipeline_code === b.pipeline_code ? a.sort_order - b.sort_order : a.pipeline_code.localeCompare(b.pipeline_code)
    ),
    agents: [...agentMap.values()]
      .map((a) => ({ ...a, agent_name: names.get(a.agent_id) ?? "Нэргүй" }))
      .sort((a, b) => b.weighted_fee_mnt - a.weighted_fee_mnt),
    totals,
    unavailable: false,
  };
}

export type ClosingSoonRow = {
  id: string;
  label: string;
  pipeline_code: string;
  stage_name: string;
  owner_name: string | null;
  expected_close_on: string;
  amount: number | null;
  currency: string | null;
  expected_fee_mnt: number | null;
  probability: number;
};

/** §8.4(5) Энэ сард хаагдахаар хүлээгдэж буй (хугацаа хэтэрсэн нь мөн). */
export async function getClosingSoon(today: string = ubTodayIso()): Promise<ClosingSoonRow[]> {
  const supabase = await createClient();
  const month = monthRange(today);
  const { data, error } = await supabase
    .from("crm_opportunities")
    .select(
      "id, amount, currency, expected_close_on, expected_fee_mnt, owner_id, " +
        "stage:crm_stages(name, probability, is_terminal), pipeline:crm_pipelines(code), " +
        "contact:crm_contacts(display_name, first_name, last_name, org_name)"
    )
    .eq("state", "open")
    .not("expected_close_on", "is", null)
    .lte("expected_close_on", month.to)
    .order("expected_close_on")
    .limit(100);
  if (error) {
    console.error("getClosingSoon:", error.message);
    return [];
  }
  type Raw = {
    id: string;
    amount: number | null;
    currency: string | null;
    expected_close_on: string;
    expected_fee_mnt: number | null;
    owner_id: string | null;
    stage: { name: string; probability: number; is_terminal: boolean } | null;
    pipeline: { code: string } | null;
    contact: { display_name: string | null; first_name: string | null; last_name: string | null; org_name: string | null } | null;
  };
  const raw = ((data ?? []) as unknown as Raw[]).filter((r) => !r.stage?.is_terminal && r.pipeline?.code !== "PL-6");
  const names = await nameMap(supabase, raw.map((r) => r.owner_id));
  return raw.map((r) => ({
    id: r.id,
    label:
      r.contact?.display_name ||
      [r.contact?.last_name, r.contact?.first_name].filter(Boolean).join(" ") ||
      r.contact?.org_name ||
      "Харилцагч",
    pipeline_code: r.pipeline?.code ?? "",
    stage_name: r.stage?.name ?? "",
    owner_name: r.owner_id ? (names.get(r.owner_id) ?? null) : null,
    expected_close_on: r.expected_close_on,
    amount: r.amount == null ? null : Number(r.amount),
    currency: r.currency,
    expected_fee_mnt: r.expected_fee_mnt == null ? null : Number(r.expected_fee_mnt),
    probability: Number(r.stage?.probability ?? 0),
  }));
}

// ── Хугацааны үзүүлэлт (орлого, хаалт, алдсан, гомдол) ────

export type PeriodMetricRow = {
  metric: "revenue" | "closed" | "lost" | "complaints";
  period_month: string;
  owner_id: string | null;
  branch_id: string | null;
  source_id: string | null;
  campaign_code: string | null;
  pipeline_code: string | null;
  dim_code: string | null;
  dim_label: string | null;
  cnt: number;
  value: number;
};

export async function getPeriodMetrics(range: DateRange): Promise<{ rows: PeriodMetricRow[]; unavailable: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_kpi_period_metrics", { p_from: range.from, p_to: range.to });
  if (error) {
    console.error("getPeriodMetrics:", error.message);
    return { rows: [], unavailable: isMissingObject(error.message) };
  }
  return {
    rows: (data ?? []).map((r) => ({
      ...r,
      metric: r.metric as PeriodMetricRow["metric"],
      period_month: String(r.period_month).slice(0, 10),
      cnt: Number(r.cnt),
      value: Number(r.value),
    })),
    unavailable: false,
  };
}

export function sumMetric(rows: PeriodMetricRow[], metric: PeriodMetricRow["metric"], field: "cnt" | "value" = "value"): number {
  return rows.filter((r) => r.metric === metric).reduce((s, r) => s + r[field], 0);
}

export type LostTrendRow = { reason: string; byMonth: Record<string, number>; total: number };

export function lostTrend(rows: PeriodMetricRow[]): { months: string[]; reasons: LostTrendRow[] } {
  const lost = rows.filter((r) => r.metric === "lost");
  const months = [...new Set(lost.map((r) => r.period_month))].sort();
  const map = new Map<string, LostTrendRow>();
  for (const r of lost) {
    const label = r.dim_label ?? "Бүртгэгдээгүй";
    const cur = map.get(label) ?? { reason: label, byMonth: {}, total: 0 };
    cur.byMonth[r.period_month] = (cur.byMonth[r.period_month] ?? 0) + r.cnt;
    cur.total += r.cnt;
    map.set(label, cur);
  }
  return { months, reasons: [...map.values()].sort((a, b) => b.total - a.total) };
}

// ── R1 Хариу өгөх хурд ────────────────────────────────────

export type ResponseRow = {
  key: string;
  label: string;
  contacted: number;
  avg_min: number | null;
  median_min: number | null;
  within_sla: number;
  sla_total: number;
  sla_pct: number | null;
};

export type ResponseReport = { total: ResponseRow; byAgent: ResponseRow[]; bySource: ResponseRow[]; byWeek: ResponseRow[] };

export async function getResponseReport(range: DateRange): Promise<ResponseReport> {
  const supabase = await createClient();
  const empty: ResponseRow = {
    key: "all",
    label: "Нийт",
    contacted: 0,
    avg_min: null,
    median_min: null,
    within_sla: 0,
    sla_total: 0,
    sla_pct: null,
  };
  const { data, error } = await supabase.rpc("crm_kpi_response_time", { p_from: range.from, p_to: range.to });
  if (error) {
    console.error("getResponseReport:", error.message);
    return { total: empty, byAgent: [], bySource: [], byWeek: [] };
  }
  const rows = (data ?? []).map((r) => ({
    ...r,
    week_start: String(r.week_start).slice(0, 10),
    contacted: Number(r.contacted),
    avg_min: r.avg_min == null ? null : Number(r.avg_min),
    within_sla: Number(r.within_sla),
    sla_total: Number(r.sla_total),
  }));
  const [names, sources] = await Promise.all([
    nameMap(supabase, rows.map((r) => r.owner_id)),
    lookupMap(supabase, "lead_source"),
  ]);
  // Дундаж = жинлэсэн (холбогдсон тоогоор); медиан нь бүлгийн дотор л тооцогдсон тул бүлэглэлд дунджийг харуулна.
  const group = (keyOf: (r: (typeof rows)[number]) => string, labelOf: (k: string) => string): ResponseRow[] => {
    const m = new Map<string, { contacted: number; minSum: number; within: number; total: number; medians: number[] }>();
    for (const r of rows) {
      const k = keyOf(r);
      const cur = m.get(k) ?? { contacted: 0, minSum: 0, within: 0, total: 0, medians: [] };
      cur.contacted += r.contacted;
      cur.minSum += (r.avg_min ?? 0) * r.contacted;
      cur.within += r.within_sla;
      cur.total += r.sla_total;
      if (r.median_min != null) cur.medians.push(Number(r.median_min));
      m.set(k, cur);
    }
    return [...m.entries()].map(([key, v]) => ({
      key,
      label: labelOf(key),
      contacted: v.contacted,
      avg_min: v.contacted > 0 ? Math.round((10 * v.minSum) / v.contacted) / 10 : null,
      median_min: v.medians.length === 1 ? v.medians[0] : null,
      within_sla: v.within,
      sla_total: v.total,
      sla_pct: pct(v.within, v.total),
    }));
  };
  const total = group(() => "all", () => "Нийт")[0] ?? empty;
  return {
    total,
    byAgent: group((r) => r.owner_id ?? "", (k) => (k ? (names.get(k) ?? "Нэргүй") : "Эзэмшигчгүй")).sort(
      (a, b) => (b.avg_min ?? 0) - (a.avg_min ?? 0)
    ),
    bySource: group((r) => r.source_id ?? "", (k) => (k ? (sources.get(k)?.label ?? "Тодорхойгүй") : "Тодорхойгүй")),
    byWeek: group((r) => r.week_start, (k) => k).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

// ── §8.4(10) Салбар хоорондын хэлцэл ──────────────────────

export type CrossBranchRow = {
  transaction_id: string;
  number: string;
  status: string;
  amount_mnt: number | null;
  closed_on: string | null;
  owner_name: string | null;
  branches: string[];
  agent_count: number;
  open_disputes: number;
};

export async function getCrossBranchDeals(): Promise<CrossBranchRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_v_cross_branch_deals")
    .select("transaction_id, number, status, amount_mnt, closed_on, owner_id, branch_ids, agent_count, open_disputes")
    .order("closed_on", { ascending: false, nullsFirst: true })
    .limit(100);
  if (error) {
    console.error("getCrossBranchDeals:", error.message);
    return [];
  }
  const [names, branches] = await Promise.all([nameMap(supabase, (data ?? []).map((r) => r.owner_id)), branchMap(supabase)]);
  return (data ?? []).map((r) => ({
    transaction_id: r.transaction_id,
    number: r.number,
    status: r.status,
    amount_mnt: r.amount_mnt == null ? null : Number(r.amount_mnt),
    closed_on: r.closed_on,
    owner_name: r.owner_id ? (names.get(r.owner_id) ?? null) : null,
    branches: (r.branch_ids ?? []).map((b: string) => branches.get(b) ?? "—"),
    agent_count: Number(r.agent_count),
    open_disputes: Number(r.open_disputes),
  }));
}

// ── Төсөв, төсөөлөл, удирдлагын дүгнэлт ───────────────────

export type BudgetRow = {
  id: string;
  month: string;
  branch_id: string | null;
  branch_name: string | null;
  metric: string;
  amount: number;
  note: string | null;
  updated_at: string;
};

export async function getBudgets(fromMonth: string, toMonth: string): Promise<{ rows: BudgetRow[]; unavailable: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_budgets")
    .select("id, month, branch_id, metric, amount, note, updated_at")
    .gte("month", fromMonth)
    .lte("month", toMonth)
    .order("month");
  if (error) {
    console.error("getBudgets:", error.message);
    return { rows: [], unavailable: isMissingObject(error.message) };
  }
  const branches = await branchMap(supabase);
  return {
    rows: (data ?? []).map((b) => ({
      ...b,
      amount: Number(b.amount),
      branch_name: b.branch_id ? (branches.get(b.branch_id) ?? null) : null,
    })),
    unavailable: false,
  };
}

export type ForecastSnapshotRow = {
  id: string;
  month: string;
  kind: string;
  taken_at: string;
  open_count: number;
  weighted_amount_mnt: number;
  weighted_fee_mnt: number;
  month_weighted_fee_mnt: number;
  unconverted_count: number;
  status: string;
  approved_name: string | null;
  approved_at: string | null;
  approval_note: string | null;
};

export async function getForecastSnapshots(limit = 12): Promise<ForecastSnapshotRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_forecast_snapshots")
    .select(
      "id, month, kind, taken_at, open_count, weighted_amount_mnt, weighted_fee_mnt, month_weighted_fee_mnt, " +
        "unconverted_count, status, approved_by, approved_at, approval_note"
    )
    .order("month", { ascending: false })
    .order("taken_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getForecastSnapshots:", error.message);
    return [];
  }
  type Raw = Omit<ForecastSnapshotRow, "approved_name"> & { approved_by: string | null };
  const raw = (data ?? []) as unknown as Raw[];
  const names = await nameMap(supabase, raw.map((r) => r.approved_by));
  return raw.map(({ approved_by, ...r }) => ({
    ...r,
    open_count: Number(r.open_count),
    weighted_amount_mnt: Number(r.weighted_amount_mnt),
    weighted_fee_mnt: Number(r.weighted_fee_mnt),
    month_weighted_fee_mnt: Number(r.month_weighted_fee_mnt),
    unconverted_count: Number(r.unconverted_count),
    approved_name: approved_by ? (names.get(approved_by) ?? null) : null,
  }));
}

export type MgmtReviewRow = {
  id: string;
  period_kind: string;
  period_start: string;
  findings: string;
  decisions: string | null;
  kpi_snapshot: Record<string, unknown>;
  reviewer_name: string | null;
  created_at: string;
};

export async function getMgmtReviews(limit = 20): Promise<MgmtReviewRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_mgmt_reviews")
    .select("id, period_kind, period_start, findings, decisions, kpi_snapshot, reviewed_by, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getMgmtReviews:", error.message);
    return [];
  }
  const names = await nameMap(supabase, (data ?? []).map((r) => r.reviewed_by));
  return (data ?? []).map((r) => ({
    id: r.id,
    period_kind: r.period_kind,
    period_start: r.period_start,
    findings: r.findings,
    decisions: r.decisions,
    kpi_snapshot: (r.kpi_snapshot ?? {}) as Record<string, unknown>,
    reviewer_name: names.get(r.reviewed_by) ?? null,
    created_at: r.created_at,
  }));
}

// ── Ажилтан (идэвхтэй агент, тогтвортой ажиллалт) ─────────

type KpiStaff = {
  profile_id: string;
  branch_id: string | null;
  roles: string[];
  is_active: boolean;
  offboarding: boolean;
  hired_on: string | null;
  left_on: string | null;
};

async function getKpiStaff(supabase: Supa): Promise<KpiStaff[]> {
  const { data, error } = await supabase
    .from("crm_staff")
    .select("profile_id, branch_id, roles, is_active, offboarding, hired_on, left_on");
  if (error) {
    // Миграцийн өмнө hired_on/left_on алга бол үндсэн багануудаар.
    const { data: base } = await supabase.from("crm_staff").select("profile_id, branch_id, roles, is_active, offboarding");
    return (base ?? []).map((s) => ({ ...s, roles: s.roles as string[], hired_on: null, left_on: null }));
  }
  return (data ?? []).map((s) => ({ ...s, roles: s.roles as string[] }));
}

/** Идэвхтэй сэжим эсвэл нээлттэй боломжтой агентууд (RLS-ийн хүрээнд). */
async function agentsWithWork(supabase: Supa): Promise<Set<string>> {
  const [{ data: leads }, { data: opps }] = await Promise.all([
    supabase.from("crm_leads").select("owner_id").in("status", ["new", "active"]).not("owner_id", "is", null).limit(1000),
    supabase.from("crm_opportunities").select("owner_id").eq("state", "open").not("owner_id", "is", null).limit(1000),
  ]);
  return new Set([...(leads ?? []), ...(opps ?? [])].map((r) => r.owner_id as string));
}

// ── Нэгтгэсэн самбарууд ───────────────────────────────────

export type KpiDashboard = {
  range: DateRange;
  targets: KpiTargets;
  followup: Awaited<ReturnType<typeof getFollowupKpi>>;
  funnel: FunnelReport;
  pipeline: PipelineReport;
  closingSoon: ClosingSoonRow[];
  lost: ReturnType<typeof lostTrend>;
  revenueBySource: { label: string; revenue: number; leads: number; won: number }[];
  campaigns: { code: string; leads: number; qualified: number; won: number; revenue: number; cost: number | null }[];
  branches: { label: string; revenue: number; closed: number; leads: number; conversion: number | null; agents: number }[];
  crossBranch: CrossBranchRow[];
  response: ResponseReport;
  quality: AgentQualityRow[];
  unavailable: boolean;
};

export async function getKpiDashboard(range: DateRange): Promise<KpiDashboard> {
  const supabase = await createClient();
  const { targets } = await getKpiSettings();
  const [followup, funnel, pipeline, closingSoon, metrics, crossBranch, response, quality, sources, branchNames, staff, campaignCosts] =
    await Promise.all([
      getFollowupKpi(range, targets),
      getFunnelReport(range),
      getPipelineReport(),
      getClosingSoon(),
      getPeriodMetrics(range),
      getCrossBranchDeals(),
      getResponseReport(range),
      getAgentDataQuality(),
      lookupMap(supabase, "lead_source"),
      branchMap(supabase),
      getKpiStaff(supabase),
      getSettingValue<Record<string, number>>("campaign_costs"),
    ]);

  // §8.4(8)/§8.5(6) эх сурвалжийн орлого + хөрвөлт.
  const revBySource = new Map<string, number>();
  for (const r of metrics.rows.filter((m) => m.metric === "revenue")) {
    revBySource.set(r.source_id ?? "", (revBySource.get(r.source_id ?? "") ?? 0) + r.value);
  }
  const revenueBySource = funnel.bySource.map((g) => ({
    label: g.label,
    revenue: Math.round(revBySource.get(g.key) ?? 0),
    leads: g.counts[0],
    won: g.counts[9],
  }));
  for (const [key, value] of revBySource) {
    if (!funnel.bySource.some((g) => g.key === key)) {
      revenueBySource.push({
        label: key ? (sources.get(key)?.label ?? "Тодорхойгүй") : "Тодорхойгүй",
        revenue: Math.round(value),
        leads: 0,
        won: 0,
      });
    }
  }
  revenueBySource.sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);

  // §5 Маркетинг: аяны үр ашиг.
  const revByCampaign = new Map<string, number>();
  for (const r of metrics.rows.filter((m) => m.metric === "revenue" && m.campaign_code)) {
    revByCampaign.set(r.campaign_code!, (revByCampaign.get(r.campaign_code!) ?? 0) + r.value);
  }
  const costs = campaignCosts && typeof campaignCosts === "object" ? campaignCosts : {};
  const campaigns = funnel.byCampaign.map((g) => ({
    code: g.key,
    leads: g.counts[0],
    qualified: g.counts[2],
    won: g.counts[9],
    revenue: Math.round(revByCampaign.get(g.key) ?? 0),
    cost: typeof costs[g.key] === "number" ? Number(costs[g.key]) : null,
  }));

  // §8.4(9) салбарын харьцуулалт.
  const branchAgg = new Map<string, { revenue: number; closed: number }>();
  for (const r of metrics.rows) {
    if (r.metric !== "revenue" && r.metric !== "closed") continue;
    const cur = branchAgg.get(r.branch_id ?? "") ?? { revenue: 0, closed: 0 };
    if (r.metric === "revenue") cur.revenue += r.value;
    else cur.closed += r.cnt;
    branchAgg.set(r.branch_id ?? "", cur);
  }
  const keys = new Set([...branchAgg.keys(), ...funnel.byBranch.map((b) => b.key)]);
  const branches = [...keys].map((k) => {
    const f = funnel.byBranch.find((b) => b.key === k);
    const agg = branchAgg.get(k) ?? { revenue: 0, closed: 0 };
    return {
      label: k ? (branchNames.get(k) ?? "—") : "Салбаргүй",
      revenue: Math.round(agg.revenue),
      closed: agg.closed,
      leads: f?.counts[0] ?? 0,
      conversion: f ? pct(f.counts[9], f.counts[0]) : null,
      agents: staff.filter((s) => s.is_active && s.roles.includes("agent") && (s.branch_id ?? "") === k).length,
    };
  });
  branches.sort((a, b) => b.revenue - a.revenue);

  return {
    range,
    targets,
    followup,
    funnel,
    pipeline,
    closingSoon,
    lost: lostTrend(metrics.rows),
    revenueBySource,
    campaigns,
    branches,
    crossBranch,
    response,
    quality,
    unavailable: followup.unavailable || funnel.unavailable || pipeline.unavailable || metrics.unavailable,
  };
}

export type ExecutiveDashboard = {
  month: DateRange;
  week: DateRange;
  quarter: DateRange;
  revenueMonth: number;
  revenueWeek: number;
  budgetMonth: number;
  budgetWeek: number;
  varianceMonth: Variance;
  varianceWeek: Variance;
  closedMonth: number;
  pipeline: PipelineReport;
  forecastMonth: ForecastSnapshotRow | null;
  forecastHistory: { month: string; forecast: number; actual: number; accuracy: number | null; status: string }[];
  activeAgents: number;
  revenuePerAgent: number | null;
  sufficient: { threshold: number | null; source: "config" | "budget" | "none"; count: number; agents: PipelineAgentRow[] };
  revenueBySource: { label: string; revenue: number }[];
  branches: { label: string; revenue: number; budget: number; variance: Variance; closed: number }[];
  compliancePct: number | null;
  complianceRows: CriterionSummary[];
  lost: ReturnType<typeof lostTrend>;
  complaints: { label: string; count: number; resolved: number }[];
  retention: Retention;
  quarterRevenue: number;
  quarterRevenuePerAgent: number | null;
  reviews: MgmtReviewRow[];
  snapshots: ForecastSnapshotRow[];
  unavailable: boolean;
};

export async function getExecutiveDashboard(today: string = ubTodayIso()): Promise<ExecutiveDashboard> {
  const supabase = await createClient();
  const { targets } = await getKpiSettings();
  const month = monthRange(today);
  const week = weekRange(today);
  const quarter = quarterRange(today);
  const historyFrom = prevMonthStart(prevMonthStart(prevMonthStart(month.from)));
  const metricsFrom = [historyFrom, quarter.from, week.from].sort()[0];
  const metricsTo = [month.to, quarter.to, week.to].sort().reverse()[0];

  const [metrics, budgets, pipeline, snapshots, staff, withWork, summary, reviews, sources, branchNames] = await Promise.all([
    getPeriodMetrics({ from: metricsFrom, to: metricsTo }),
    getBudgets(historyFrom, quarter.to.slice(0, 7) + "-01"),
    getPipelineReport(),
    getForecastSnapshots(24),
    getKpiStaff(supabase),
    agentsWithWork(supabase),
    getQualitySummary(),
    getMgmtReviews(10),
    lookupMap(supabase, "lead_source"),
    branchMap(supabase),
  ]);

  const inRange = (r: PeriodMetricRow, range: DateRange) => r.period_month >= range.from.slice(0, 7) + "-01" && r.period_month <= range.to;
  const revenueRows = metrics.rows.filter((r) => r.metric === "revenue");
  const revenueMonth = revenueRows.filter((r) => inRange(r, month)).reduce((s, r) => s + r.value, 0);

  // Долоо хоногийн орлого: сарын бүлэглэлээс хасаж болохгүй тул тусад нь уншина.
  const weekMetrics = await getPeriodMetrics(week);
  const revenueWeek = sumMetric(weekMetrics.rows, "revenue");

  const budgetMonth = budgetForRange(budgets.rows, month);
  const budgetWeek = budgetForRange(budgets.rows, week);

  const active = activeAgentIds(staff, withWork);
  const suff = sufficientPipelineThreshold(targets.sufficient_pipeline_mnt, budgetMonth, active.length);
  const sufficientAgents = pipeline.agents.filter((a) => active.includes(a.agent_id) && suff.value != null && a.weighted_fee_mnt >= suff.value);

  // Төсөөллийн нарийвчлал: өнгөрсөн сар бүрийн сарын эхний агшин зураг ↔ бодит орлого.
  const monthStarts = snapshots.filter((s) => s.kind === "month_start");
  const history = monthStarts
    .filter((s) => s.month < month.from && s.month >= historyFrom)
    .map((s) => {
      const actual = revenueRows.filter((r) => r.period_month === s.month).reduce((sum, r) => sum + r.value, 0);
      return {
        month: s.month,
        forecast: s.month_weighted_fee_mnt,
        actual: Math.round(actual),
        accuracy: forecastAccuracy(s.month_weighted_fee_mnt, actual),
        status: s.status,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));

  const srcAgg = new Map<string, number>();
  for (const r of revenueRows.filter((x) => inRange(x, month))) srcAgg.set(r.source_id ?? "", (srcAgg.get(r.source_id ?? "") ?? 0) + r.value);
  const revenueBySource = [...srcAgg.entries()]
    .map(([k, v]) => ({ label: k ? (sources.get(k)?.label ?? "Тодорхойгүй") : "Тодорхойгүй", revenue: Math.round(v) }))
    .sort((a, b) => b.revenue - a.revenue);

  const branchKeys = new Set<string>([
    ...metrics.rows.filter((r) => inRange(r, month)).map((r) => r.branch_id ?? ""),
    ...budgets.rows.filter((b) => b.branch_id).map((b) => b.branch_id as string),
  ]);
  const branches = [...branchKeys].map((k) => {
    const revenue = revenueRows.filter((r) => inRange(r, month) && (r.branch_id ?? "") === k).reduce((s, r) => s + r.value, 0);
    const closed = metrics.rows
      .filter((r) => r.metric === "closed" && inRange(r, month) && (r.branch_id ?? "") === k)
      .reduce((s, r) => s + r.cnt, 0);
    const budget = k ? budgetForRange(budgets.rows, month, k) : 0;
    return {
      label: k ? (branchNames.get(k) ?? "—") : "Салбаргүй",
      revenue: Math.round(revenue),
      budget,
      variance: budgetVariance(revenue, budget),
      closed,
    };
  });
  branches.sort((a, b) => b.revenue - a.revenue);

  const complaintsAgg = new Map<string, { count: number; resolved: number }>();
  for (const r of metrics.rows.filter((x) => x.metric === "complaints" && inRange(x, month))) {
    const label = r.dim_label ?? "Гомдол";
    const cur = complaintsAgg.get(label) ?? { count: 0, resolved: 0 };
    cur.count += r.cnt;
    cur.resolved += r.value;
    complaintsAgg.set(label, cur);
  }

  const quarterRevenue = revenueRows.filter((r) => inRange(r, quarter)).reduce((s, r) => s + r.value, 0);

  return {
    month,
    week,
    quarter,
    revenueMonth: Math.round(revenueMonth),
    revenueWeek: Math.round(revenueWeek),
    budgetMonth,
    budgetWeek,
    varianceMonth: budgetVariance(revenueMonth, budgetMonth),
    varianceWeek: budgetVariance(revenueWeek, budgetWeek),
    closedMonth: metrics.rows.filter((r) => r.metric === "closed" && inRange(r, month)).reduce((s, r) => s + r.cnt, 0),
    pipeline,
    forecastMonth: monthStarts.find((s) => s.month === month.from) ?? null,
    forecastHistory: history,
    activeAgents: active.length,
    revenuePerAgent: perAgent(revenueMonth, active.length),
    sufficient: { threshold: suff.value, source: suff.source, count: sufficientAgents.length, agents: sufficientAgents },
    revenueBySource,
    branches,
    compliancePct: summary.pct,
    complianceRows: summary.rows,
    lost: lostTrend(metrics.rows.filter((r) => r.period_month >= historyFrom)),
    complaints: [...complaintsAgg.entries()].map(([label, v]) => ({ label, ...v })),
    retention: agentRetention(staff, quarter),
    quarterRevenue: Math.round(quarterRevenue),
    quarterRevenuePerAgent: perAgent(quarterRevenue, active.length),
    reviews,
    snapshots,
    unavailable: metrics.unavailable || budgets.unavailable || pipeline.unavailable,
  };
}

