import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import type {
  DisputeStatus,
  DisputeDecision,
  DisputeKind,
  EvidenceItem,
  OffboardingBlockers,
} from "@/lib/validation/crm-ownership";
import { isOnLeave } from "@/lib/validation/crm-ownership";
import { toIsoDate } from "@/lib/crm/calendar";

/**
 * Эзэмшил, маргаан, сан, экспорт, хувийн мэдээллийн хүсэлтийн уншилтууд
 * (U4). RLS = эрхийн давхарга; RLS-ээр харагдахгүй сан, маргааны баримтыг
 * definer RPC-ээр масктай авна.
 */

type Named = { full_name: string | null } | null;
const nameOf = (p: Named): string | null => p?.full_name ?? null;

// ── Сэжмийн эзэмшил ──────────────────────────────────────

export type OwnershipHistoryRow = {
  id: string;
  created_at: string;
  reason_code: string;
  note: string | null;
  old_owner_name: string | null;
  new_owner_name: string | null;
  decided_by_name: string | null;
};

export type LeadOwnership = {
  lead: {
    id: string;
    contact_id: string;
    status: string;
    grade: string | null;
    owner_id: string | null;
    owner_name: string | null;
    created_by: string;
    created_by_name: string | null;
    created_at: string;
    owner_assigned_at: string | null;
    accept_due_at: string | null;
    accepted_at: string | null;
    recycled_at: string | null;
    recycle_reason: string | null;
    last_contact_at: string | null;
    unprotected: boolean;
  };
  history: OwnershipHistoryRow[];
  disputes: DisputeListRow[];
};

const LEAD_OWNERSHIP_SELECT =
  "id, contact_id, status, grade, owner_id, created_by, created_at, owner_assigned_at, accept_due_at, accepted_at, " +
  "recycled_at, recycle_reason, last_contact_at, unprotected, " +
  "owner:profiles!crm_leads_owner_id_fkey(full_name), creator:profiles!crm_leads_created_by_fkey(full_name)";

export async function getLeadOwnership(leadId: string): Promise<LeadOwnership | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("crm_leads").select(LEAD_OWNERSHIP_SELECT).eq("id", leadId).maybeSingle();
  if (error) console.error("getLeadOwnership:", error.message);
  if (!data) return null;
  type Raw = Omit<LeadOwnership["lead"], "owner_name" | "created_by_name"> & { owner: Named; creator: Named };
  const raw = data as unknown as Raw;
  const { owner, creator, ...rest } = raw;

  const [{ data: hist, error: hErr }, disputes] = await Promise.all([
    supabase
      .from("crm_ownership_history")
      .select(
        "id, created_at, reason_code, note, " +
          "old_owner:profiles!crm_ownership_history_old_owner_id_fkey(full_name), " +
          "new_owner:profiles!crm_ownership_history_new_owner_id_fkey(full_name), " +
          "decider:profiles!crm_ownership_history_decided_by_fkey(full_name)"
      )
      .eq("entity", "lead")
      .eq("entity_id", leadId)
      .order("created_at", { ascending: false })
      .limit(50),
    getDisputes({ leadId }),
  ]);
  if (hErr) console.error("getLeadOwnership history:", hErr.message);
  type RawH = {
    id: string;
    created_at: string;
    reason_code: string;
    note: string | null;
    old_owner: Named;
    new_owner: Named;
    decider: Named;
  };
  return {
    lead: { ...rest, owner_name: nameOf(owner), created_by_name: nameOf(creator) },
    history: ((hist ?? []) as unknown as RawH[]).map((h) => ({
      id: h.id,
      created_at: h.created_at,
      reason_code: h.reason_code,
      note: h.note,
      old_owner_name: nameOf(h.old_owner),
      new_owner_name: nameOf(h.new_owner),
      decided_by_name: nameOf(h.decider),
    })),
    disputes,
  };
}

// ── Хүлээн авах шаардлагатай сэжим (R2) ──────────────────

export type AcceptPendingRow = {
  id: string;
  contact_name: string | null;
  grade: string | null;
  accept_due_at: string;
  created_at: string;
};

export async function getMyAcceptPending(profileId: string): Promise<AcceptPendingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_leads")
    .select("id, grade, accept_due_at, created_at, contact:crm_contacts!crm_leads_contact_id_fkey(display_name)")
    .eq("owner_id", profileId)
    .is("accepted_at", null)
    .not("accept_due_at", "is", null)
    .eq("status", "new")
    .order("accept_due_at");
  if (error) console.error("getMyAcceptPending:", error.message);
  type Raw = Omit<AcceptPendingRow, "contact_name"> & { contact: { display_name: string } | null };
  return ((data ?? []) as unknown as Raw[]).map(({ contact, ...r }) => ({ ...r, contact_name: contact?.display_name ?? null }));
}

// ── Эргэлтийн сан ────────────────────────────────────────

export type PoolLeadRow = {
  lead_id: string;
  grade: string | null;
  recycled_at: string | null;
  recycle_reason: string | null;
  source_label: string | null;
  branch_name: string | null;
  masked_name: string;
  contact_types: string[];
  last_contact_at: string | null;
  created_at: string;
  pending_claims: number;
  my_claim_id: string | null;
};

export async function getPoolLeads(): Promise<PoolLeadRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_pool_leads");
  if (error) {
    console.error("getPoolLeads:", error.message);
    return [];
  }
  return (data ?? []) as unknown as PoolLeadRow[];
}

export type PoolClaimRow = {
  id: string;
  lead_id: string;
  requester_id: string;
  requester_name: string | null;
  note: string;
  status: string;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

export async function getPoolClaims(filter: { status?: string; mine?: string } = {}): Promise<PoolClaimRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("crm_pool_claims")
    .select(
      "id, lead_id, requester_id, note, status, decided_at, decision_note, created_at, " +
        "requester:profiles!crm_pool_claims_requester_id_fkey(full_name), " +
        "decider:profiles!crm_pool_claims_decided_by_fkey(full_name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.mine) q = q.eq("requester_id", filter.mine);
  const { data, error } = await q;
  if (error) console.error("getPoolClaims:", error.message);
  type Raw = Omit<PoolClaimRow, "requester_name" | "decided_by_name"> & { requester: Named; decider: Named };
  return ((data ?? []) as unknown as Raw[]).map(({ requester, decider, ...r }) => ({
    ...r,
    requester_name: nameOf(requester),
    decided_by_name: nameOf(decider),
  }));
}

// ── Маргаан ──────────────────────────────────────────────

export type DisputeListRow = {
  id: string;
  lead_id: string;
  contact_id: string;
  contact_name: string | null;
  kind: DisputeKind;
  status: DisputeStatus;
  claimant_id: string;
  claimant_name: string | null;
  respondent_id: string | null;
  respondent_name: string | null;
  decision: DisputeDecision | null;
  created_at: string;
  decided_at: string | null;
};

const DISPUTE_LIST_SELECT =
  "id, lead_id, contact_id, kind, status, claimant_id, respondent_id, decision, created_at, decided_at, " +
  "contact:crm_contacts!crm_lead_disputes_contact_id_fkey(display_name), " +
  "claimant:profiles!crm_lead_disputes_claimant_id_fkey(full_name), " +
  "respondent:profiles!crm_lead_disputes_respondent_id_fkey(full_name)";

type RawDisputeList = Omit<DisputeListRow, "contact_name" | "claimant_name" | "respondent_name"> & {
  contact: { display_name: string } | null;
  claimant: Named;
  respondent: Named;
};

function mapDispute({ contact, claimant, respondent, ...r }: RawDisputeList): DisputeListRow {
  return {
    ...r,
    contact_name: contact?.display_name ?? null,
    claimant_name: nameOf(claimant),
    respondent_name: nameOf(respondent),
  };
}

export async function getDisputes(
  filter: { leadId?: string; statuses?: DisputeStatus[]; involving?: string } = {}
): Promise<DisputeListRow[]> {
  const supabase = await createClient();
  let q = supabase.from("crm_lead_disputes").select(DISPUTE_LIST_SELECT).order("created_at", { ascending: false }).limit(100);
  if (filter.leadId) q = q.eq("lead_id", filter.leadId);
  if (filter.statuses?.length) q = q.in("status", filter.statuses);
  if (filter.involving) q = q.or(`claimant_id.eq.${filter.involving},respondent_id.eq.${filter.involving}`);
  const { data, error } = await q;
  if (error) console.error("getDisputes:", error.message);
  return ((data ?? []) as unknown as RawDisputeList[]).map(mapDispute);
}

export type DisputeFacts = {
  contact_created_at: string | null;
  contact_created_by_respondent: boolean | null;
  contact_created_by_claimant: boolean | null;
  lead_created_at: string | null;
  lead_created_by_respondent: boolean | null;
  lead_status: string | null;
  first_contact_at: string | null;
  last_contact_at: string | null;
  next_step_date: string | null;
  unprotected: boolean | null;
  respondent_activities: number;
  respondent_last_activity_at: string | null;
  claimant_activities: number;
  owner_changes: number;
  merged_from_claimant: boolean;
};

export type DisputeDetail = DisputeListRow & {
  claim: string;
  claimant_evidence: (EvidenceItem & { added_at?: string })[];
  respondent_note: string | null;
  respondent_evidence: (EvidenceItem & { added_at?: string })[];
  responded_at: string | null;
  review_note: string | null;
  review_recommendation: DisputeDecision | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  escalation_reason: string | null;
  escalated_at: string | null;
  decision_rationale: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  appeal_text: string | null;
  appealed_at: string | null;
  appeal_decision: "upheld" | "overturned" | null;
  appeal_rationale: string | null;
  appeal_decided_by_name: string | null;
  appeal_decided_at: string | null;
  facts: DisputeFacts | null;
  /** Дуудагчийн ашиг сонирхлын зөрчил (null = зөрчилгүй). */
  my_conflict: string | null;
};

export async function getDispute(id: string, profileId: string): Promise<DisputeDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_lead_disputes")
    .select(
      DISPUTE_LIST_SELECT +
        ", claim, claimant_evidence, respondent_note, respondent_evidence, responded_at, review_note, " +
        "review_recommendation, reviewed_at, escalation_reason, escalated_at, decision_rationale, decided_by, " +
        "appeal_text, appealed_at, appeal_decision, appeal_rationale, appeal_decided_at, " +
        "reviewer:profiles!crm_lead_disputes_reviewed_by_fkey(full_name), " +
        "decider:profiles!crm_lead_disputes_decided_by_fkey(full_name), " +
        "appeal_decider:profiles!crm_lead_disputes_appeal_decided_by_fkey(full_name)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("getDispute:", error.message);
  if (!data) return null;
  type Raw = RawDisputeList &
    Omit<
      DisputeDetail,
      keyof DisputeListRow | "reviewed_by_name" | "decided_by_name" | "appeal_decided_by_name" | "facts" | "my_conflict"
    > & { reviewer: Named; decider: Named; appeal_decider: Named };
  const raw = data as unknown as Raw;
  const { reviewer, decider, appeal_decider, contact, claimant, respondent, ...rest } = raw;

  const [factsRes, conflictRes] = await Promise.all([
    supabase.rpc("crm_lead_dispute_facts", { p_dispute: id }),
    supabase.rpc("crm_lead_dispute_conflict", { p_dispute: id, p_profile: profileId }),
  ]);
  if (factsRes.error) console.error("getDispute facts:", factsRes.error.message);

  const list = mapDispute({ ...(rest as unknown as RawDisputeList), contact, claimant, respondent });
  return {
    ...rest,
    ...list,
    claimant_evidence: Array.isArray(rest.claimant_evidence) ? rest.claimant_evidence : [],
    respondent_evidence: Array.isArray(rest.respondent_evidence) ? rest.respondent_evidence : [],
    reviewed_by_name: nameOf(reviewer),
    decided_by_name: nameOf(decider),
    appeal_decided_by_name: nameOf(appeal_decider),
    facts: (factsRes.data ?? null) as unknown as DisputeFacts | null,
    my_conflict: conflictRes.error ? "party" : ((conflictRes.data as string | null) ?? null),
  };
}

/** Дуудагч маргааны аль нэг талын багийн ахлагч мөн эсэх. */
export async function isTeamLeadOfDisputeParty(
  teamId: string | null,
  claimantId: string,
  respondentId: string | null
): Promise<boolean> {
  if (!teamId) return false;
  const supabase = await createClient();
  const ids = [claimantId, respondentId].filter((x): x is string => !!x);
  const { data } = await supabase.from("crm_staff").select("profile_id").eq("team_id", teamId).in("profile_id", ids);
  return (data ?? []).length > 0;
}

// ── Ашиг сонирхлын мэдүүлэг ──────────────────────────────

export type CoiRow = {
  id: string;
  profile_id: string;
  profile_name: string | null;
  contact_id: string | null;
  contact_name: string | null;
  related_profile_id: string | null;
  related_name: string | null;
  relation: string;
  note: string | null;
  declared_at: string;
  revoked_at: string | null;
};

export async function getCoiDeclarations(filter: { profileId?: string } = {}): Promise<CoiRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("crm_coi_declarations")
    .select(
      "id, profile_id, contact_id, related_profile_id, relation, note, declared_at, revoked_at, " +
        "profile:profiles!crm_coi_declarations_profile_id_fkey(full_name), " +
        "related:profiles!crm_coi_declarations_related_profile_id_fkey(full_name), " +
        "contact:crm_contacts!crm_coi_declarations_contact_id_fkey(display_name)"
    )
    .order("declared_at", { ascending: false })
    .limit(100);
  if (filter.profileId) q = q.eq("profile_id", filter.profileId);
  const { data, error } = await q;
  if (error) console.error("getCoiDeclarations:", error.message);
  type Raw = Omit<CoiRow, "profile_name" | "related_name" | "contact_name"> & {
    profile: Named;
    related: Named;
    contact: { display_name: string } | null;
  };
  return ((data ?? []) as unknown as Raw[]).map(({ profile, related, contact, ...r }) => ({
    ...r,
    profile_name: nameOf(profile),
    related_name: nameOf(related),
    contact_name: contact?.display_name ?? null,
  }));
}

// ── Экспорт, хувийн мэдээллийн хүсэлт ─────────────────────

export type ExportRequestRow = {
  id: string;
  requested_by: string;
  requester_name: string | null;
  scope: string;
  filters: Json;
  reason: string;
  row_estimate: number | null;
  status: string;
  max_rows: number | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  expires_at: string | null;
  completed_at: string | null;
  row_count: number | null;
  created_at: string;
};

export async function getExportRequests(filter: { status?: string; mine?: string } = {}): Promise<ExportRequestRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("crm_export_requests")
    .select(
      "id, requested_by, scope, filters, reason, row_estimate, status, max_rows, decided_at, decision_note, " +
        "expires_at, completed_at, row_count, created_at, " +
        "requester:profiles!crm_export_requests_requested_by_fkey(full_name), " +
        "decider:profiles!crm_export_requests_decided_by_fkey(full_name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.mine) q = q.eq("requested_by", filter.mine);
  const { data, error } = await q;
  if (error) console.error("getExportRequests:", error.message);
  type Raw = Omit<ExportRequestRow, "requester_name" | "decided_by_name"> & { requester: Named; decider: Named };
  return ((data ?? []) as unknown as Raw[]).map(({ requester, decider, ...r }) => ({
    ...r,
    requester_name: nameOf(requester),
    decided_by_name: nameOf(decider),
  }));
}

export type DataRequestRow = {
  id: string;
  contact_id: string;
  contact_name: string | null;
  contact_number: string | null;
  kind: string;
  channel: string | null;
  note: string | null;
  status: string;
  received_at: string;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  completed_at: string | null;
  created_by_name: string | null;
};

export async function getDataRequests(filter: { status?: string } = {}): Promise<DataRequestRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("crm_data_requests")
    .select(
      "id, contact_id, kind, channel, note, status, received_at, decided_at, decision_note, completed_at, " +
        "contact:crm_contacts!crm_data_requests_contact_id_fkey(display_name, number), " +
        "decider:profiles!crm_data_requests_decided_by_fkey(full_name), " +
        "creator:profiles!crm_data_requests_created_by_fkey(full_name)"
    )
    .order("received_at", { ascending: false })
    .limit(100);
  if (filter.status) q = q.eq("status", filter.status);
  const { data, error } = await q;
  if (error) console.error("getDataRequests:", error.message);
  type Raw = Omit<DataRequestRow, "contact_name" | "contact_number" | "decided_by_name" | "created_by_name"> & {
    contact: { display_name: string; number: string } | null;
    decider: Named;
    creator: Named;
  };
  return ((data ?? []) as unknown as Raw[]).map(({ contact, decider, creator, ...r }) => ({
    ...r,
    contact_name: contact?.display_name ?? null,
    contact_number: contact?.number ?? null,
    decided_by_name: nameOf(decider),
    created_by_name: nameOf(creator),
  }));
}

// ── Гарах ажилтны нэгдсэн шалгалт (CRM-ээс гадуурх замд) ──

/**
 * Service role-оор (auth.uid() = null) definer шалгалт дуудна. Алдаа гарвал
 * аюулгүй тал руу — «саадтай» гэж үзнэ.
 */
export async function getOffboardingBlockers(profileId: string): Promise<OffboardingBlockers | { error: string }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("crm_offboarding_blockers", { p_profile: profileId });
    if (error) {
      console.error("getOffboardingBlockers:", error.message);
      return { error: "CRM-ийн хүлээлцэх төлөвийг шалгаж чадсангүй. Дахин оролдоно уу." };
    }
    return (data ?? { has_staff: false }) as unknown as OffboardingBlockers;
  } catch (e) {
    console.error("getOffboardingBlockers:", e instanceof Error ? e.message : e);
    return { error: "CRM-ийн хүлээлцэх төлөвийг шалгаж чадсангүй. Дахин оролдоно уу." };
  }
}


// ── Шилжүүлэн авах / мэдүүлэхэд сонгох ажилтан ───────────

export type OwnerCandidate = { profileId: string; name: string; onLeave: boolean; teamId: string | null };

/**
 * Оффисын идэвхтэй, гарах урсгалд ороогүй ажилтан (агент, ахлагч). Нэрийн
 * жагсаалт дотоод мэдээлэл тул оффисоор шүүж admin-аар уншина (агентад
 * crm_staff-ийн RLS бусдын мөрийг харуулдаггүй).
 */
export async function getOwnerCandidates(officeId: string): Promise<OwnerCandidate[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_staff")
    .select("profile_id, team_id, roles, on_leave_from, on_leave_to, profile:profiles!crm_staff_profile_id_fkey(full_name)")
    .eq("office_id", officeId)
    .eq("is_active", true)
    .eq("offboarding", false);
  if (error) console.error("getOwnerCandidates:", error.message);
  const today = toIsoDate(new Date());
  type Raw = {
    profile_id: string;
    team_id: string | null;
    roles: string[];
    on_leave_from: string | null;
    on_leave_to: string | null;
    profile: { full_name: string | null } | null;
  };
  return ((data ?? []) as unknown as Raw[])
    .filter((r) => r.roles.includes("agent") || r.roles.includes("team_lead"))
    .map((r) => ({
      profileId: r.profile_id,
      name: r.profile?.full_name ?? "Нэргүй ажилтан",
      teamId: r.team_id,
      onLeave: isOnLeave(r.on_leave_from, r.on_leave_to, today),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "mn"));
}
