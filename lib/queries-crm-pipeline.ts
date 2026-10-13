import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type {
  CrmActivityChannel,
  ActivityOutcome,
  OppState,
  GateCode,
  KycStatus,
  CrmRole,
} from "@/lib/constants-crm";

/**
 * Урсгал/боломж, үйл ажиллагааны уншилтууд (U4 — F-350–362, F-300–312).
 * RLS = эрхийн давхарга: агент өөрийн/багийн боломжийг, PL-6-г зөвхөн
 * эрхтэй дүр харна — эндээс дахин шүүхгүй.
 */

// ── Канбан (F-352) ────────────────────────────────────────

export type BoardOpp = {
  id: string;
  stage_id: string;
  state: OppState;
  amount: number | null;
  currency: string;
  expected_close_on: string | null;
  aml_hold: boolean;
  stage_entered_at: string;
  owner_id: string;
  owner_name: string | null;
  contact_id: string;
  contact_name: string;
  kyc_public_status: KycStatus;
  property_id: string | null;
  property_name: string | null;
  property_number: string | null;
};

export type BoardStage = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  probability: number;
  gate_code: GateCode | null;
  is_terminal: boolean;
  terminal_state: OppState | null;
  is_closing_direction: boolean;
};

export type BoardColumn = {
  stage: BoardStage;
  opps: BoardOpp[];
  totalAmount: number;
  weightedAmount: number;
};

export type PipelineBoard = {
  pipeline: { id: string; code: string; name: string; restricted: boolean };
  columns: BoardColumn[];
  transitions: { from_stage_id: string; to_stage_id: string; kind: string; requires_reason: boolean; allowed_roles: CrmRole[] }[];
};

const BOARD_OPP_SELECT =
  "id, stage_id, state, amount, currency, expected_close_on, aml_hold, stage_entered_at, owner_id, " +
  "contact_id, property_id, " +
  "owner:profiles!crm_opportunities_owner_id_fkey(full_name), " +
  "contact:crm_contacts!crm_opportunities_contact_id_fkey(display_name, kyc_public_status), " +
  "property:crm_properties!crm_opportunities_property_id_fkey(name, number)";

type RawBoardOpp = Omit<
  BoardOpp,
  "owner_name" | "contact_name" | "kyc_public_status" | "property_name" | "property_number"
> & {
  owner: { full_name: string | null } | null;
  contact: { display_name: string; kyc_public_status: KycStatus } | null;
  property: { name: string; number: string } | null;
};

function toBoardOpp(r: RawBoardOpp): BoardOpp {
  const { owner, contact, property, ...rest } = r;
  return {
    ...rest,
    owner_name: owner?.full_name ?? null,
    contact_name: contact?.display_name ?? "?",
    kyc_public_status: contact?.kyc_public_status ?? "pending",
    property_name: property?.name ?? null,
    property_number: property?.number ?? null,
  };
}

/**
 * Канбан самбар: багана = crm_stages, нээлттэй боломжууд + сүүлийн 30 хоногт
 * хаагдсан нь терминал баганад. Жинлэсэн төсөөлөл Σ(дүн × магадлал) (F-353).
 */
export async function getBoard(pipelineCode: string): Promise<PipelineBoard | null> {
  const supabase = await createClient();

  const { data: pl, error: plErr } = await supabase
    .from("crm_pipelines")
    .select(
      "id, code, name, restricted, " +
        "stages:crm_stages(id, code, name, sort_order, probability, gate_code, is_terminal, terminal_state, is_closing_direction)"
    )
    .eq("code", pipelineCode)
    .eq("is_active", true)
    .maybeSingle();
  if (plErr) {
    console.error("getBoard pipeline:", plErr.message);
    return null;
  }
  if (!pl) return null;

  type RawPl = {
    id: string;
    code: string;
    name: string;
    restricted: boolean;
    stages: BoardStage[];
  };
  const pipeline = pl as unknown as RawPl;
  const stages = [...pipeline.stages].sort((a, b) => a.sort_order - b.sort_order);

  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: opps, error: oppErr } = await supabase
    .from("crm_opportunities")
    .select(BOARD_OPP_SELECT)
    .eq("pipeline_id", pipeline.id)
    .or(`state.eq.open,stage_entered_at.gte.${cutoff}`)
    .order("stage_entered_at", { ascending: false })
    .limit(500);
  if (oppErr) console.error("getBoard opps:", oppErr.message);

  const rows = ((opps ?? []) as unknown as RawBoardOpp[]).map(toBoardOpp);

  const { data: trs } = await supabase
    .from("crm_stage_transitions")
    .select("from_stage_id, to_stage_id, kind, requires_reason, allowed_roles")
    .eq("pipeline_id", pipeline.id);

  const columns: BoardColumn[] = stages.map((stage) => {
    const inStage = rows.filter((o) => o.stage_id === stage.id);
    const totalAmount = inStage.reduce((s, o) => s + (o.amount ?? 0), 0);
    return {
      stage,
      opps: inStage,
      totalAmount,
      weightedAmount: Math.round((totalAmount * stage.probability) / 100),
    };
  });

  return {
    pipeline: { id: pipeline.id, code: pipeline.code, name: pipeline.name, restricted: pipeline.restricted },
    columns,
    transitions: ((trs ?? []) as unknown as PipelineBoard["transitions"]) ?? [],
  };
}

/** Харагдах урсгалуудын жагсаалт (RLS PL-6-г эрхгүйд нуана). */
export async function getVisiblePipelines(): Promise<{ id: string; code: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_pipelines")
    .select("id, code, name")
    .eq("is_active", true)
    .order("sort_order");
  if (error) console.error("getVisiblePipelines:", error.message);
  return (data ?? []) as { id: string; code: string; name: string }[];
}

// ── Боломжийн карт ────────────────────────────────────────

export type OfferRow = {
  id: string;
  direction: string;
  amount: number;
  terms: Json | null;
  valid_until: string | null;
  relayed_at: string | null;
  position: string | null;
  obstacle: string | null;
  next_step: string | null;
  created_by_name: string | null;
  created_at: string;
};

export type StageHistoryRow = {
  id: string;
  from_stage_name: string | null;
  to_stage_name: string;
  reason: string | null;
  moved_by_name: string | null;
  entered_at: string;
  left_at: string | null;
};

export type TransitionOption = {
  to_stage_id: string;
  to_stage_name: string;
  to_stage_code: string;
  kind: string;
  requires_reason: boolean;
  allowed_roles: CrmRole[];
  gate_code: GateCode | null;
  /** Зорилтот шатны гейтийн ДУТУУ шаардлагууд (хоосон = нээлттэй). */
  gate_missing: string[];
  is_terminal: boolean;
  terminal_state: OppState | null;
};

export type OpportunityDetail = {
  id: string;
  state: OppState;
  amount: number | null;
  currency: string;
  expected_close_on: string | null;
  aml_hold: boolean;
  stage_id: string;
  stage_entered_at: string;
  lost_reason_id: string | null;
  lost_note: string | null;
  owner_id: string;
  owner_name: string | null;
  need_profile_id: string | null;
  lead_id: string | null;
  created_at: string;
  pipeline: { id: string; code: string; name: string };
  stages: BoardStage[];
  contact: {
    id: string;
    display_name: string;
    number: string;
    kyc_public_status: KycStatus;
    phone: string | null;
  };
  property: { id: string; name: string; number: string; status: string } | null;
  lost_reason_label: string | null;
  offers: OfferRow[];
  history: StageHistoryRow[];
  transitions: TransitionOption[];
};

const OPP_DETAIL_SELECT =
  "id, state, amount, currency, expected_close_on, aml_hold, stage_id, stage_entered_at, " +
  "lost_reason_id, lost_note, owner_id, need_profile_id, lead_id, created_at, pipeline_id, " +
  "owner:profiles!crm_opportunities_owner_id_fkey(full_name), " +
  "lost_reason:crm_lookups!crm_opportunities_lost_reason_id_fkey(label), " +
  "pipeline:crm_pipelines!crm_opportunities_pipeline_id_fkey(id, code, name, " +
  "stages:crm_stages(id, code, name, sort_order, probability, gate_code, is_terminal, terminal_state, is_closing_direction)), " +
  "contact:crm_contacts!crm_opportunities_contact_id_fkey(id, display_name, number, kyc_public_status, " +
  "phones:crm_contact_phones(raw, is_primary)), " +
  "property:crm_properties!crm_opportunities_property_id_fkey(id, name, number, status)";

export async function getOpportunity(id: string): Promise<OpportunityDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_opportunities")
    .select(OPP_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getOpportunity:", error.message);
    return null;
  }
  if (!data) return null;

  type Raw = {
    id: string;
    state: OppState;
    amount: number | null;
    currency: string;
    expected_close_on: string | null;
    aml_hold: boolean;
    stage_id: string;
    stage_entered_at: string;
    lost_reason_id: string | null;
    lost_note: string | null;
    owner_id: string;
    need_profile_id: string | null;
    lead_id: string | null;
    created_at: string;
    pipeline_id: string;
    owner: { full_name: string | null } | null;
    lost_reason: { label: string } | null;
    pipeline: { id: string; code: string; name: string; stages: BoardStage[] } | null;
    contact: {
      id: string;
      display_name: string;
      number: string;
      kyc_public_status: KycStatus;
      phones: { raw: string; is_primary: boolean }[];
    } | null;
    property: { id: string; name: string; number: string; status: string } | null;
  };
  const raw = data as unknown as Raw;
  if (!raw.pipeline || !raw.contact) return null;
  const stages = [...raw.pipeline.stages].sort((a, b) => a.sort_order - b.sort_order);

  // Санал, түүх, шилжилтүүд зэрэгцээ.
  const [offersRes, historyRes, trsRes] = await Promise.all([
    supabase
      .from("crm_offers")
      .select(
        "id, direction, amount, terms, valid_until, relayed_at, position, obstacle, next_step, created_at, " +
          "author:profiles!crm_offers_created_by_fkey(full_name)"
      )
      .eq("opportunity_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_stage_history")
      .select(
        "id, reason, entered_at, left_at, " +
          "from_stage:crm_stages!crm_stage_history_from_stage_id_fkey(name), " +
          "to_stage:crm_stages!crm_stage_history_to_stage_id_fkey(name), " +
          "mover:profiles!crm_stage_history_moved_by_fkey(full_name)"
      )
      .eq("opportunity_id", id)
      .order("entered_at", { ascending: false }),
    supabase
      .from("crm_stage_transitions")
      .select("to_stage_id, kind, requires_reason, allowed_roles")
      .eq("from_stage_id", raw.stage_id),
  ]);

  type RawOffer = Omit<OfferRow, "created_by_name"> & { author: { full_name: string | null } | null };
  const offers = ((offersRes.data ?? []) as unknown as RawOffer[]).map(({ author, ...o }) => ({
    ...o,
    created_by_name: author?.full_name ?? null,
  }));

  type RawHist = {
    id: string;
    reason: string | null;
    entered_at: string;
    left_at: string | null;
    from_stage: { name: string } | null;
    to_stage: { name: string } | null;
    mover: { full_name: string | null } | null;
  };
  const history: StageHistoryRow[] = ((historyRes.data ?? []) as unknown as RawHist[]).map((h) => ({
    id: h.id,
    from_stage_name: h.from_stage?.name ?? null,
    to_stage_name: h.to_stage?.name ?? "?",
    reason: h.reason,
    moved_by_name: h.mover?.full_name ?? null,
    entered_at: h.entered_at,
    left_at: h.left_at,
  }));

  type RawTr = { to_stage_id: string; kind: string; requires_reason: boolean; allowed_roles: CrmRole[] };
  const rawTrs = (trsRes.data ?? []) as unknown as RawTr[];
  const stageById = new Map(stages.map((s) => [s.id, s]));

  // Зорилтот шат гейттэй бол дутуу жагсаалтыг DB-ийн эх үнэнээс (crm_check_gate).
  const transitions: TransitionOption[] = [];
  for (const tr of rawTrs) {
    const target = stageById.get(tr.to_stage_id);
    if (!target) continue;
    let gateMissing: string[] = [];
    if (target.gate_code && raw.state === "open") {
      const { data: missing, error: gateErr } = await supabase.rpc("crm_check_gate", {
        p_opportunity: id,
        p_gate: target.gate_code,
      });
      if (gateErr) {
        console.error("getOpportunity gate:", gateErr.message);
        gateMissing = ["Гейт шалгалт амжилтгүй"];
      } else {
        gateMissing = (missing ?? []) as string[];
      }
    }
    transitions.push({
      to_stage_id: tr.to_stage_id,
      to_stage_name: target.name,
      to_stage_code: target.code,
      kind: tr.kind,
      requires_reason: tr.requires_reason,
      allowed_roles: tr.allowed_roles,
      gate_code: target.gate_code,
      gate_missing: gateMissing,
      is_terminal: target.is_terminal,
      terminal_state: target.terminal_state,
    });
  }
  transitions.sort((a, b) => {
    const sa = stageById.get(a.to_stage_id)?.sort_order ?? 0;
    const sb = stageById.get(b.to_stage_id)?.sort_order ?? 0;
    return sa - sb;
  });

  const phones = raw.contact.phones ?? [];
  const primary = phones.find((p) => p.is_primary) ?? phones[0];

  return {
    id: raw.id,
    state: raw.state,
    amount: raw.amount,
    currency: raw.currency,
    expected_close_on: raw.expected_close_on,
    aml_hold: raw.aml_hold,
    stage_id: raw.stage_id,
    stage_entered_at: raw.stage_entered_at,
    lost_reason_id: raw.lost_reason_id,
    lost_note: raw.lost_note,
    owner_id: raw.owner_id,
    owner_name: raw.owner?.full_name ?? null,
    need_profile_id: raw.need_profile_id,
    lead_id: raw.lead_id,
    created_at: raw.created_at,
    pipeline: { id: raw.pipeline.id, code: raw.pipeline.code, name: raw.pipeline.name },
    stages,
    contact: {
      id: raw.contact.id,
      display_name: raw.contact.display_name,
      number: raw.contact.number,
      kyc_public_status: raw.contact.kyc_public_status,
      phone: primary?.raw ?? null,
    },
    property: raw.property,
    lost_reason_label: raw.lost_reason?.label ?? null,
    offers,
    history,
    transitions,
  };
}

/** Шатны түүх дангаар (F-357 — тайлангийн хэрэглээ). */
export async function getStageHistory(opportunityId: string): Promise<StageHistoryRow[]> {
  const detail = await getOpportunity(opportunityId);
  return detail?.history ?? [];
}

// ── Үйл ажиллагааны timeline (F-309: 3 талаас) ───────────

export type ActivityRow = {
  id: string;
  channel: CrmActivityChannel;
  purpose: string;
  summary: string;
  attitude: string | null;
  new_info: string | null;
  objection_label: string | null;
  outcome: ActivityOutcome;
  next_step: string | null;
  next_step_date: string | null;
  occurred_at: string;
  backdated: boolean;
  feedback_category: string | null;
  owner_id: string;
  owner_name: string | null;
  contact_id: string;
  opportunity_id: string | null;
  lead_id: string | null;
  property_id: string | null;
  created_at: string;
};

const ACTIVITY_SELECT =
  "id, channel, purpose, summary, attitude, new_info, outcome, next_step, next_step_date, " +
  "occurred_at, backdated, feedback_category, owner_id, contact_id, opportunity_id, lead_id, property_id, created_at, " +
  "objection:crm_lookups!crm_activities_objection_id_fkey(label), " +
  "owner:profiles!crm_activities_owner_id_fkey(full_name)";

export type ActivityFilter =
  | { contactId: string }
  | { opportunityId: string }
  | { leadId: string }
  | { propertyId: string };

export async function getActivityTimeline(filter: ActivityFilter, limit = 100): Promise<ActivityRow[]> {
  const supabase = await createClient();
  let query = supabase.from("crm_activities").select(ACTIVITY_SELECT);
  if ("contactId" in filter) query = query.eq("contact_id", filter.contactId);
  else if ("opportunityId" in filter) query = query.eq("opportunity_id", filter.opportunityId);
  else if ("leadId" in filter) query = query.eq("lead_id", filter.leadId);
  else query = query.eq("property_id", filter.propertyId);

  const { data, error } = await query.order("occurred_at", { ascending: false }).limit(limit);
  if (error) {
    console.error("getActivityTimeline:", error.message);
    return [];
  }
  type Raw = Omit<ActivityRow, "objection_label" | "owner_name"> & {
    objection: { label: string } | null;
    owner: { full_name: string | null } | null;
  };
  return ((data ?? []) as unknown as Raw[]).map(({ objection, owner, ...rest }) => ({
    ...rest,
    objection_label: objection?.label ?? null,
    owner_name: owner?.full_name ?? null,
  }));
}

// ── Жинлэсэн төсөөлөл (F-353) ─────────────────────────────

export type ForecastRow = {
  pipeline_code: string;
  pipeline_name: string;
  count: number;
  totalAmount: number;
  weightedAmount: number;
};

export async function getForecast(): Promise<ForecastRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_opportunities")
    .select(
      "amount, state, " +
        "stage:crm_stages!crm_opportunities_stage_id_fkey(probability), " +
        "pipeline:crm_pipelines!crm_opportunities_pipeline_id_fkey(code, name)"
    )
    .eq("state", "open")
    .limit(2000);
  if (error) {
    console.error("getForecast:", error.message);
    return [];
  }
  type Raw = {
    amount: number | null;
    stage: { probability: number } | null;
    pipeline: { code: string; name: string } | null;
  };
  const byCode = new Map<string, ForecastRow>();
  for (const r of (data ?? []) as unknown as Raw[]) {
    if (!r.pipeline) continue;
    const row = byCode.get(r.pipeline.code) ?? {
      pipeline_code: r.pipeline.code,
      pipeline_name: r.pipeline.name,
      count: 0,
      totalAmount: 0,
      weightedAmount: 0,
    };
    row.count += 1;
    row.totalAmount += r.amount ?? 0;
    row.weightedAmount += Math.round(((r.amount ?? 0) * (r.stage?.probability ?? 0)) / 100);
    byCode.set(r.pipeline.code, row);
  }
  return [...byCode.values()].sort((a, b) => a.pipeline_code.localeCompare(b.pipeline_code));
}

// ── Агентын өдрийн хүрээ (R-01-ийн БИЕ ДААСАН хувилбар — U9 AgentDayboard-оор
//    бүрэн дахин бичигдэнэ, санаатай handoff §10) ─────────

export type DayboardTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  deadline: string | null;
};

export type DayboardLead = {
  id: string;
  contact_name: string;
  next_step: string | null;
  next_step_date: string | null;
  grade: string | null;
};

export type DayboardShowing = {
  id: string;
  contact_name: string;
  occurred_at: string;
  opportunity_id: string | null;
};

export type AgentDayboard = {
  tasksToday: DayboardTask[];
  tasksOverdue: DayboardTask[];
  overdueSteps: DayboardLead[];
  newLeads: DayboardLead[];
  pendingFeedback: DayboardShowing[];
  openOppCount: number;
  weightedForecast: number;
};

export async function getAgentDayboard(): Promise<AgentDayboard | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);
  const endOfDay = `${today}T23:59:59`;
  const feedbackSince = new Date(Date.now() - 72 * 3600000).toISOString();

  const [tasksRes, leadsRes, showingsRes, oppsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, priority, deadline")
      .eq("responsible_id", user.id)
      .in("status", ["pending", "in_progress"])
      .lte("deadline", endOfDay)
      .order("deadline")
      .limit(50),
    supabase
      .from("crm_leads")
      .select(
        "id, status, grade, next_step, next_step_date, owner_id, " +
          "contact:crm_contacts!crm_leads_contact_id_fkey(display_name)"
      )
      .eq("owner_id", user.id)
      .in("status", ["new", "active"])
      .limit(200),
    supabase
      .from("crm_activities")
      .select(
        "id, occurred_at, opportunity_id, feedback_category, channel, owner_id, " +
          "contact:crm_contacts!crm_activities_contact_id_fkey(display_name)"
      )
      .eq("owner_id", user.id)
      .eq("channel", "showing")
      .is("feedback_category", null)
      .gte("occurred_at", feedbackSince)
      .lte("occurred_at", new Date().toISOString())
      .order("occurred_at", { ascending: false })
      .limit(20),
    supabase
      .from("crm_opportunities")
      .select("amount, stage:crm_stages!crm_opportunities_stage_id_fkey(probability)")
      .eq("owner_id", user.id)
      .eq("state", "open")
      .limit(500),
  ]);

  type RawTask = DayboardTask;
  const tasks = (tasksRes.data ?? []) as RawTask[];
  const nowIso = new Date().toISOString();
  const tasksOverdue = tasks.filter((t) => t.deadline && t.deadline < nowIso);
  const tasksToday = tasks.filter((t) => !tasksOverdue.includes(t));

  type RawLead = {
    id: string;
    status: string;
    grade: string | null;
    next_step: string | null;
    next_step_date: string | null;
    contact: { display_name: string } | null;
  };
  const leads = (leadsRes.data ?? []) as unknown as RawLead[];
  const toDayboardLead = (l: RawLead): DayboardLead => ({
    id: l.id,
    contact_name: l.contact?.display_name ?? "?",
    next_step: l.next_step,
    next_step_date: l.next_step_date,
    grade: l.grade,
  });
  const overdueSteps = leads
    .filter((l) => l.status === "active" && l.next_step_date && l.next_step_date < today)
    .map(toDayboardLead);
  const newLeads = leads.filter((l) => l.status === "new").map(toDayboardLead);

  type RawShowing = {
    id: string;
    occurred_at: string;
    opportunity_id: string | null;
    contact: { display_name: string } | null;
  };
  const pendingFeedback = ((showingsRes.data ?? []) as unknown as RawShowing[]).map((s) => ({
    id: s.id,
    contact_name: s.contact?.display_name ?? "?",
    occurred_at: s.occurred_at,
    opportunity_id: s.opportunity_id,
  }));

  type RawOpp = { amount: number | null; stage: { probability: number } | null };
  const opps = (oppsRes.data ?? []) as unknown as RawOpp[];
  const weightedForecast = opps.reduce(
    (s, o) => s + Math.round(((o.amount ?? 0) * (o.stage?.probability ?? 0)) / 100),
    0
  );

  return {
    tasksToday,
    tasksOverdue,
    overdueSteps,
    newLeads,
    pendingFeedback,
    openOppCount: opps.length,
    weightedForecast,
  };
}
