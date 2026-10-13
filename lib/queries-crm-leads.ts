import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { CrmLifecycle, LeadGrade, ContactType, KycStatus } from "@/lib/constants-crm";

/**
 * Сэжимийн уншилтууд (U2). RLS = эрхийн давхарга: агент өөрийн, team_lead
 * багийн, менежер компанийн сэжимийг л харна — эндээс дахин шүүхгүй.
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
  first_contact_due_at: string | null;
  unprotected: boolean;
  created_at: string;
  contact_id: string;
  contact_name: string;
  contact_number: string;
  contact_phone: string | null;
  kyc_public_status: KycStatus;
};

const LEAD_SELECT =
  "id, status, grade, score, owner_id, branch_id, source_id, next_step, next_step_date, " +
  "last_contact_at, first_contact_due_at, unprotected, created_at, contact_id, " +
  "owner:profiles!crm_leads_owner_id_fkey(full_name), " +
  "source:crm_lookups!crm_leads_source_id_fkey(label), " +
  "contact:crm_contacts!crm_leads_contact_id_fkey(display_name, number, kyc_public_status, " +
  "phones:crm_contact_phones(raw, is_primary))";

type RawLead = Omit<
  LeadRow,
  "owner_name" | "source_label" | "contact_name" | "contact_number" | "contact_phone" | "kyc_public_status"
> & {
  owner: { full_name: string | null } | null;
  source: { label: string } | null;
  contact: {
    display_name: string;
    number: string;
    kyc_public_status: KycStatus;
    phones: { raw: string; is_primary: boolean }[];
  } | null;
};

function toLeadRow(r: RawLead): LeadRow {
  const { owner, source, contact, ...rest } = r;
  const phones = contact?.phones ?? [];
  const primary = phones.find((p) => p.is_primary) ?? phones[0];
  return {
    ...rest,
    owner_name: owner?.full_name ?? null,
    source_label: source?.label ?? null,
    contact_name: contact?.display_name ?? "?",
    contact_number: contact?.number ?? "",
    contact_phone: primary?.raw ?? null,
    kyc_public_status: contact?.kyc_public_status ?? "pending",
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
        (r.contact_phone ?? "").includes(q)
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
  campaign_code: string | null;
  channel_ref: string | null;
  next_step: string | null;
  next_step_task_id: string | null;
  next_step_date: string | null;
  last_contact_at: string | null;
  first_contact_due_at: string | null;
  unprotected: boolean;
  inactivity_days: number;
  created_by: string;
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
  ownershipHistory: OwnershipRow[];
};

const LEAD_DETAIL_SELECT =
  "id, status, grade, grade_override_reason, score, score_breakdown, owner_id, branch_id, " +
  "source_id, campaign_code, channel_ref, next_step, next_step_task_id, next_step_date, " +
  "last_contact_at, first_contact_due_at, unprotected, inactivity_days, created_by, created_at, " +
  "owner:profiles!crm_leads_owner_id_fkey(full_name), " +
  "source:crm_lookups!crm_leads_source_id_fkey(label), " +
  "contact:crm_contacts!crm_leads_contact_id_fkey(id, display_name, number, kind, contact_types, " +
  "kyc_public_status, consent, " +
  "phones:crm_contact_phones(id, raw, is_primary), emails:crm_contact_emails(id, email, is_primary))";

export async function getLead(id: string): Promise<LeadDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_leads")
    .select(LEAD_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getLead:", error.message);
    return null;
  }
  if (!data) return null;

  type Raw = Omit<LeadDetail, "owner_name" | "source_label" | "ownershipHistory"> & {
    owner: { full_name: string | null } | null;
    source: { label: string } | null;
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
  const ownershipHistory = ((history ?? []) as unknown as RawHist[]).map(
    ({ old_owner, new_owner, ...h }) => ({
      ...h,
      old_owner_name: old_owner?.full_name ?? null,
      new_owner_name: new_owner?.full_name ?? null,
    })
  );

  const { owner, source, ...rest } = raw;
  return {
    ...rest,
    owner_name: owner?.full_name ?? null,
    source_label: source?.label ?? null,
    ownershipHistory,
  };
}

// ── Алтан дүрмийн зөрчил (F-125, самбарт) ────────────────

export type GoldenRuleViolation = {
  id: string;
  contact_name: string;
  owner_name: string | null;
  missing: string[];
  next_step_date: string | null;
};

/**
 * Идэвхтэй сэжимүүдээс 5 бүрдэл дутуу (DB CHECK хамгаалдаг ч хуучин/гар
 * өгөгдөлд) ба дараагийн алхам нь ХЭТЭРСЭН мөрүүд — самбарын зөрчлийн блок.
 */
export async function getGoldenRuleViolations(): Promise<GoldenRuleViolation[]> {
  const rows = await getLeads({ status: "active" });
  const today = new Date().toISOString().slice(0, 10);
  const out: GoldenRuleViolation[] = [];
  for (const r of rows) {
    const missing: string[] = [];
    if (!r.owner_id) missing.push("Эзэмшигч");
    if (!r.grade) missing.push("Ангилал");
    if (!r.last_contact_at) missing.push("Сүүлийн холболт");
    if (!r.next_step) missing.push("Дараагийн алхам");
    if (!r.next_step_date) missing.push("Алхмын огноо");
    else if (r.next_step_date < today) missing.push("Алхам хэтэрсэн");
    if (missing.length > 0) {
      out.push({
        id: r.id,
        contact_name: r.contact_name,
        owner_name: r.owner_name,
        missing,
        next_step_date: r.next_step_date,
      });
    }
  }
  return out;
}

// ── Сонголтууд ────────────────────────────────────────────

export type AgentOption = { profileId: string; name: string; branchId: string | null };

/** Хуваарилалт/шилжүүлэлтийн сонголт — идэвхтэй agent дүртэй ажилтнууд. */
export async function getAgentOptions(): Promise<AgentOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_staff")
    .select("profile_id, branch_id, roles, profile:profiles(full_name)")
    .eq("is_active", true)
    .contains("roles", ["agent"]);
  if (error) console.error("getAgentOptions:", error.message);
  type Raw = { profile_id: string; branch_id: string | null; profile: { full_name: string | null } | null };
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    profileId: r.profile_id,
    name: r.profile?.full_name ?? "?",
    branchId: r.branch_id,
  }));
}
