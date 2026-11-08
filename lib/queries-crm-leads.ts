import { createClient } from "@/lib/supabase/server";
import { getSettingValue } from "@/lib/queries-crm-core";
import { toIsoDate } from "@/lib/crm/calendar";
import { conditionParam } from "@/lib/crm/rules";
import { DEFAULT_RECONTACT_RANGES, DEFAULT_GRADE_THRESHOLDS, gradeFromScore, type GradeThresholds, type RecontactRanges } from "@/lib/crm/scoring";
import type { Json } from "@/types/database";
import type { ActivityRow } from "@/lib/queries-crm-pipeline";
import type { CrmLifecycle, LeadGrade, ContactType, KycStatus } from "@/lib/constants-crm";

/**
 * Сэжимийн уншилтууд. RLS = эрхийн давхарга: агент өөрийн, ахлагч багийн,
 * удирдлага компанийн сэжимийг л харна — эндээс дахин шүүхгүй.
 */

export type LeadRow = {
  id: string;
  status: CrmLifecycle;
  grade: LeadGrade | null;
  score: number | null;
  owner_id: string | null;
  owner_name: string | null;
  branch_id: string | null;
  source_id: string | null;
  source_label: string | null;
  next_step: string | null;
  next_step_date: string | null;
  last_contact_at: string | null;
  first_contact_at: string | null;
  first_contact_due_at: string | null;
  received_at: string | null;
  unprotected: boolean;
  created_at: string;
  contact_id: string;
  contact_name: string;
  contact_number: string;
  contact_phone: string | null;
  kyc_public_status: KycStatus;
  /** Холбоотой нээлттэй боломжийн шат (байхгүй бол null). */
  stage_name: string | null;
};

const LEAD_SELECT =
  "id, status, grade, score, owner_id, branch_id, source_id, next_step, next_step_date, " +
  "last_contact_at, first_contact_at, first_contact_due_at, received_at, unprotected, created_at, contact_id, " +
  "owner:profiles!crm_leads_owner_id_fkey(full_name), " +
  "source:crm_lookups!crm_leads_source_id_fkey(label), " +
  "contact:crm_contacts!crm_leads_contact_id_fkey(display_name, number, kyc_public_status, " +
  "phones:crm_contact_phones(raw, is_primary)), " +
  "opps:crm_opportunities!crm_opportunities_lead_id_fkey(state, stage:crm_stages!crm_opportunities_stage_id_fkey(name))";

type RawLead = Omit<
  LeadRow,
  "owner_name" | "source_label" | "contact_name" | "contact_number" | "contact_phone" | "kyc_public_status" | "stage_name"
> & {
  owner: { full_name: string | null } | null;
  source: { label: string } | null;
  contact: {
    display_name: string;
    number: string;
    kyc_public_status: KycStatus;
    phones: { raw: string; is_primary: boolean }[];
  } | null;
  opps: { state: string; stage: { name: string } | null }[] | null;
};

function toLeadRow(r: RawLead): LeadRow {
  const { owner, source, contact, opps, ...rest } = r;
  const phones = contact?.phones ?? [];
  const primary = phones.find((p) => p.is_primary) ?? phones[0];
  const open = (opps ?? []).find((o) => o.state === "open") ?? (opps ?? [])[0];
  return {
    ...rest,
    owner_name: owner?.full_name ?? null,
    source_label: source?.label ?? null,
    contact_name: contact?.display_name ?? "?",
    contact_number: contact?.number ?? "",
    contact_phone: primary?.raw ?? null,
    kyc_public_status: contact?.kyc_public_status ?? "pending",
    stage_name: open?.stage?.name ?? null,
  };
}

export type LeadFilters = {
  status?: CrmLifecycle;
  grade?: LeadGrade;
  ownerId?: string;
  branchId?: string;
  sourceId?: string;
  contactType?: ContactType;
  unprotected?: boolean;
  /** Дараагийн үйлдэл хэтэрсэн нээлттэй сэжим. */
  overdue?: boolean;
  /** N цагт утга бүхий холболт болоогүй (§6.4). */
  noContactHours?: number;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
};

export async function getLeads(filters: LeadFilters = {}): Promise<LeadRow[]> {
  const supabase = await createClient();
  let query = supabase.from("crm_leads").select(LEAD_SELECT);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.grade) query = query.eq("grade", filters.grade);
  if (filters.ownerId) query = query.eq("owner_id", filters.ownerId);
  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.sourceId) query = query.eq("source_id", filters.sourceId);
  if (filters.unprotected) query = query.eq("unprotected", true);
  if (filters.overdue) {
    query = query.in("status", ["new", "active"]).lt("next_step_date", toIsoDate(new Date()));
  }
  if (filters.noContactHours) {
    const cutoff = new Date(Date.now() - filters.noContactHours * 3600000).toISOString();
    query = query.in("status", ["new", "active"]).is("first_contact_at", null).lt("created_at", cutoff);
  }
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("created_at", filters.dateTo + "T23:59:59");

  const { data, error } = await query.order("created_at", { ascending: false }).limit(300);
  if (error) {
    console.error("getLeads:", error.message);
    return [];
  }
  let rows = ((data ?? []) as unknown as RawLead[]).map(toLeadRow);
  if (filters.q) {
    const q = filters.q.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.contact_name.toLowerCase().includes(q) ||
        r.contact_number.toLowerCase().includes(q) ||
        (r.contact_phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "\u0000")
    );
  }
  return rows;
}

// ── Дэлгэрэнгүй ───────────────────────────────────────────

export type OwnershipRow = {
  id: string;
  old_owner_id: string | null;
  new_owner_id: string | null;
  old_owner_name: string | null;
  new_owner_name: string | null;
  reason_code: string;
  note: string | null;
  created_at: string;
};

export type LeadDetail = {
  id: string;
  status: CrmLifecycle;
  grade: LeadGrade | null;
  grade_override_reason: string | null;
  score: number | null;
  score_breakdown: Json | null;
  owner_id: string | null;
  owner_name: string | null;
  branch_id: string | null;
  source_id: string | null;
  source_label: string | null;
  source_detail: string | null;
  campaign_code: string | null;
  channel_ref: string | null;
  next_step: string | null;
  next_step_task_id: string | null;
  next_step_date: string | null;
  last_contact_at: string | null;
  first_contact_at: string | null;
  first_contact_due_at: string | null;
  received_at: string | null;
  unprotected: boolean;
  inactivity_days: number;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  contact: {
    id: string;
    display_name: string;
    number: string;
    kind: string;
    contact_types: ContactType[];
    kyc_public_status: KycStatus;
    consent: string;
    phones: { id: string; raw: string; is_primary: boolean }[];
    emails: { id: string; email: string; is_primary: boolean }[];
  };
  /** Холбоотой боломжууд (шат, төлөвтэй). */
  opportunities: { id: string; state: string; stage_name: string | null; stage_code: string | null; pipeline_code: string | null }[];
  ownershipHistory: OwnershipRow[];
};

const LEAD_DETAIL_SELECT =
  "id, status, grade, grade_override_reason, score, score_breakdown, owner_id, branch_id, " +
  "source_id, source_detail, campaign_code, channel_ref, next_step, next_step_task_id, next_step_date, " +
  "last_contact_at, first_contact_at, first_contact_due_at, received_at, unprotected, inactivity_days, created_by, created_at, " +
  "owner:profiles!crm_leads_owner_id_fkey(full_name), " +
  "creator:profiles!crm_leads_created_by_fkey(full_name), " +
  "source:crm_lookups!crm_leads_source_id_fkey(label), " +
  "contact:crm_contacts!crm_leads_contact_id_fkey(id, display_name, number, kind, contact_types, " +
  "kyc_public_status, consent, " +
  "phones:crm_contact_phones(id, raw, is_primary), emails:crm_contact_emails(id, email, is_primary)), " +
  "opps:crm_opportunities!crm_opportunities_lead_id_fkey(id, state, " +
  "stage:crm_stages!crm_opportunities_stage_id_fkey(name, code), " +
  "pipeline:crm_pipelines!crm_opportunities_pipeline_id_fkey(code))";

export async function getLead(id: string): Promise<LeadDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("crm_leads").select(LEAD_DETAIL_SELECT).eq("id", id).maybeSingle();
  if (error) {
    console.error("getLead:", error.message);
    return null;
  }
  if (!data) return null;

  type Raw = Omit<LeadDetail, "owner_name" | "source_label" | "ownershipHistory" | "created_by_name" | "opportunities"> & {
    owner: { full_name: string | null } | null;
    creator: { full_name: string | null } | null;
    source: { label: string } | null;
    opps:
      | { id: string; state: string; stage: { name: string; code: string } | null; pipeline: { code: string } | null }[]
      | null;
  };
  const raw = data as unknown as Raw;

  const { data: history } = await supabase
    .from("crm_ownership_history")
    .select(
      "id, old_owner_id, new_owner_id, reason_code, note, created_at, " +
        "old_owner:profiles!crm_ownership_history_old_owner_id_fkey(full_name), " +
        "new_owner:profiles!crm_ownership_history_new_owner_id_fkey(full_name)"
    )
    .eq("entity", "lead")
    .eq("entity_id", id)
    .order("created_at", { ascending: false });

  type RawHist = Omit<OwnershipRow, "old_owner_name" | "new_owner_name"> & {
    old_owner: { full_name: string | null } | null;
    new_owner: { full_name: string | null } | null;
  };
  const ownershipHistory = ((history ?? []) as unknown as RawHist[]).map(({ old_owner, new_owner, ...h }) => ({
    ...h,
    old_owner_name: old_owner?.full_name ?? null,
    new_owner_name: new_owner?.full_name ?? null,
  }));

  const { owner, creator, source, opps, ...rest } = raw;
  return {
    ...rest,
    owner_name: owner?.full_name ?? null,
    created_by_name: creator?.full_name ?? null,
    source_label: source?.label ?? null,
    opportunities: (opps ?? []).map((o) => ({
      id: o.id,
      state: o.state,
      stage_name: o.stage?.name ?? null,
      stage_code: o.stage?.code ?? null,
      pipeline_code: o.pipeline?.code ?? null,
    })),
    ownershipHistory,
  };
}

// ── Үйл ажиллагааны түүх (§6.11 бүх талбартай) ────────────

export type ActivityTimelineRow = ActivityRow & {
  reached?: boolean | null;
  next_step_code?: string | null;
  next_step_at?: string | null;
  meeting_party?: string | null;
  showing_interest?: string | null;
  quick_log?: boolean;
  properties?: { id: string; number: string; name: string | null }[];
};

const TIMELINE_SELECT =
  "id, channel, purpose, summary, attitude, new_info, outcome, next_step, next_step_date, next_step_code, next_step_at, " +
  "occurred_at, backdated, feedback_category, reached, meeting_party, showing_interest, quick_log, " +
  "owner_id, contact_id, opportunity_id, lead_id, property_id, created_at, " +
  "objection:crm_lookups!crm_activities_objection_id_fkey(label), " +
  "owner:profiles!crm_activities_owner_id_fkey(full_name), " +
  "props:crm_activity_properties(property:crm_properties(id, number, name))";

const TIMELINE_LEGACY_SELECT =
  "id, channel, purpose, summary, attitude, new_info, outcome, next_step, next_step_date, " +
  "occurred_at, backdated, feedback_category, reached, owner_id, contact_id, opportunity_id, lead_id, property_id, created_at, " +
  "objection:crm_lookups!crm_activities_objection_id_fkey(label), " +
  "owner:profiles!crm_activities_owner_id_fkey(full_name)";

export async function getActivities(
  filter: { contactId: string } | { leadId: string } | { opportunityId: string } | { propertyId: string },
  limit = 100
): Promise<ActivityTimelineRow[]> {
  const supabase = await createClient();
  let query = supabase.from("crm_activities").select(TIMELINE_SELECT);
  if ("contactId" in filter) query = query.eq("contact_id", filter.contactId);
  else if ("leadId" in filter) query = query.eq("lead_id", filter.leadId);
  else if ("opportunityId" in filter) query = query.eq("opportunity_id", filter.opportunityId);
  else query = query.eq("property_id", filter.propertyId);
  let { data, error } = await query.order("occurred_at", { ascending: false }).limit(limit);
  // 20261107001400 тавигдахаас өмнөх орчинд хуучин багануудаар уншина.
  if (error?.code === "42703" || error?.code === "PGRST200") {
    let legacy = supabase.from("crm_activities").select(TIMELINE_LEGACY_SELECT);
    if ("contactId" in filter) legacy = legacy.eq("contact_id", filter.contactId);
    else if ("leadId" in filter) legacy = legacy.eq("lead_id", filter.leadId);
    else if ("opportunityId" in filter) legacy = legacy.eq("opportunity_id", filter.opportunityId);
    else legacy = legacy.eq("property_id", filter.propertyId);
    ({ data, error } = await legacy.order("occurred_at", { ascending: false }).limit(limit));
  }
  if (error) {
    console.error("getActivities:", error.message);
    return [];
  }
  type Raw = Omit<ActivityTimelineRow, "objection_label" | "owner_name" | "properties"> & {
    objection: { label: string } | null;
    owner: { full_name: string | null } | null;
    props: { property: { id: string; number: string; name: string | null } | null }[] | null;
  };
  return ((data ?? []) as unknown as Raw[]).map(({ objection, owner, props, ...rest }) => ({
    ...rest,
    objection_label: objection?.label ?? null,
    owner_name: owner?.full_name ?? null,
    properties: (props ?? []).map((p) => p.property).filter((p): p is NonNullable<typeof p> => !!p),
  }));
}

// ── Картын тохиргоо (босго, давтамж) ──────────────────────

export type LeadCardSettings = {
  thresholds: GradeThresholds;
  recontactRanges: RecontactRanges;
  /** Д-03 хоёр дахь оролдлогын цонх (цаг). */
  retryHours: number;
  /** Д-04 утга бүхий холболтгүй бол ахлагчид (цаг). */
  noContactHours: number;
  /** §6.7 заавал байх шаардлагын доод тоо (lead_score_factors). */
  mustHavesMin: number;
};

export async function getLeadCardSettings(): Promise<LeadCardSettings> {
  const supabase = await createClient();
  const [thresholds, ranges, factors, rules] = await Promise.all([
    getSettingValue<GradeThresholds>("lead_grade_thresholds"),
    getSettingValue<RecontactRanges>("recontact_ranges"),
    getSettingValue<{ must_haves_min?: number }>("lead_score_factors"),
    supabase.from("crm_automation_rules").select("code, condition").in("code", ["D-03", "D-04"]),
  ]);
  const byCode = new Map((rules.data ?? []).map((r) => [r.code, r.condition]));
  return {
    thresholds: thresholds ?? DEFAULT_GRADE_THRESHOLDS,
    recontactRanges: { ...DEFAULT_RECONTACT_RANGES, ...(ranges ?? {}) },
    retryHours: conditionParam<number>(byCode.get("D-03"), "hours", 24),
    noContactHours: conditionParam<number>(byCode.get("D-04"), "hours", 48),
    mustHavesMin:
      typeof factors?.must_haves_min === "number" && factors.must_haves_min > 0 ? factors.must_haves_min : 3,
  };
}

export function suggestedGradeOf(score: number | null, thresholds: GradeThresholds): LeadGrade | null {
  return score == null ? null : gradeFromScore(Number(score), thresholds);
}

// ── Агентын тойм (агентын нүүр) ───────────────────────────

export type MyLeadSummary = {
  newCount: number;
  activeCount: number;
  overdueCount: number;
  noContactCount: number;
  recent: { id: string; name: string; status: CrmLifecycle; grade: LeadGrade | null; next_step: string | null; next_step_date: string | null }[];
};

export async function getMyLeadSummary(profileId: string): Promise<MyLeadSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_leads")
    .select(
      "id, status, grade, next_step, next_step_date, first_contact_at, created_at, " +
        "contact:crm_contacts!crm_leads_contact_id_fkey(display_name)"
    )
    .eq("owner_id", profileId)
    .in("status", ["new", "active"])
    .order("next_step_date", { ascending: true, nullsFirst: true })
    .limit(200);
  if (error) {
    console.error("getMyLeadSummary:", error.message);
    return { newCount: 0, activeCount: 0, overdueCount: 0, noContactCount: 0, recent: [] };
  }
  type Raw = {
    id: string;
    status: CrmLifecycle;
    grade: LeadGrade | null;
    next_step: string | null;
    next_step_date: string | null;
    first_contact_at: string | null;
    created_at: string;
    contact: { display_name: string } | null;
  };
  const rows = (data ?? []) as unknown as Raw[];
  const today = toIsoDate(new Date());
  return {
    newCount: rows.filter((r) => r.status === "new").length,
    activeCount: rows.filter((r) => r.status === "active").length,
    overdueCount: rows.filter((r) => !!r.next_step_date && r.next_step_date < today).length,
    noContactCount: rows.filter((r) => !r.first_contact_at).length,
    recent: rows.slice(0, 6).map((r) => ({
      id: r.id,
      name: r.contact?.display_name ?? "?",
      status: r.status,
      grade: r.grade,
      next_step: r.next_step,
      next_step_date: r.next_step_date,
    })),
  };
}

// ── Алтан дүрмийн зөрчил (самбарт) ────────────────────────

export type GoldenRuleViolation = {
  id: string;
  contact_name: string;
  owner_name: string | null;
  missing: string[];
  next_step_date: string | null;
};

/**
 * Нээлттэй (шинэ, идэвхтэй) сэжимүүдээс бүрдэл дутуу эсвэл дараагийн үйлдэл
 * хэтэрсэн мөрүүд — самбарын зөрчлийн блок.
 */
export async function getGoldenRuleViolations(): Promise<GoldenRuleViolation[]> {
  const [active, fresh] = await Promise.all([getLeads({ status: "active" }), getLeads({ status: "new" })]);
  const today = toIsoDate(new Date());
  const out: GoldenRuleViolation[] = [];
  for (const r of [...active, ...fresh]) {
    const missing: string[] = [];
    if (!r.owner_id) missing.push("Эзэмшигч");
    if (r.status === "active") {
      if (!r.grade) missing.push("Ангилал");
      if (!r.last_contact_at) missing.push("Сүүлийн холболт");
    }
    if (!r.next_step) missing.push("Дараагийн үйлдэл");
    if (!r.next_step_date) missing.push("Дараагийн үйлдлийн огноо");
    else if (r.next_step_date < today) missing.push("Дараагийн үйлдэл хэтэрсэн");
    if (missing.length > 0) {
      out.push({ id: r.id, contact_name: r.contact_name, owner_name: r.owner_name, missing, next_step_date: r.next_step_date });
    }
  }
  return out;
}

// ── Сонголтууд ────────────────────────────────────────────

export type AgentOption = { profileId: string; name: string; branchId: string | null };

/** Шүүлт, багц шилжүүлэлтийн сонголт — идэвхтэй, гарах урсгалгүй agent дүртэй ажилтнууд. */
export async function getAgentOptions(): Promise<AgentOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_staff")
    .select("profile_id, branch_id, roles, offboarding, profile:profiles!crm_staff_profile_id_fkey(full_name)")
    .eq("is_active", true)
    .eq("offboarding", false)
    .contains("roles", ["agent"]);
  if (error) console.error("getAgentOptions:", error.message);
  type Raw = { profile_id: string; branch_id: string | null; profile: { full_name: string | null } | null };
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    profileId: r.profile_id,
    name: r.profile?.full_name ?? "?",
    branchId: r.branch_id,
  }));
}

/** Сэжмийг зөвхөн таних мэдээлэлгүй гарчиг (хуучин холбоос redirect-д). */
export async function findMigratedLeadId(legacyLeadId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("leads").select("migrated_crm_lead_id").eq("id", legacyLeadId).maybeSingle();
  return (data?.migrated_crm_lead_id as string | null | undefined) ?? null;
}
