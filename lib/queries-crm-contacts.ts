import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type {
  ContactKind,
  ContactType,
  ConsentStatus,
  CrmLifecycle,
  KycStatus,
} from "@/lib/constants-crm";
import { normalizePhone, normalizeEmail } from "@/lib/crm/normalize";

/**
 * Харилцагчийн уншилтууд (U2). RLS = эрхийн давхарга — эндээс дахин шүүхгүй;
 * crm_can_view_contact() policy эрхийн хүрээг тогтооно (F-119 «үр дүн эрхийн
 * хүрээнд» үүгээр хангагдана).
 */

export type PhoneRow = { id: string; raw: string; normalized: string; is_primary: boolean };
export type EmailRow = { id: string; email: string; is_primary: boolean };
export type TagRow = { lookup_id: string; label: string };

export type ContactRow = {
  id: string;
  number: string;
  kind: ContactKind;
  display_name: string;
  contact_types: ContactType[];
  lifecycle: CrmLifecycle;
  consent: ConsentStatus;
  kyc_public_status: KycStatus;
  branch_id: string | null;
  source_id: string | null;
  source_label: string | null;
  merged_into_id: string | null;
  created_at: string;
  phones: PhoneRow[];
  emails: EmailRow[];
  tags: TagRow[];
  lead_count: number;
};

const CONTACT_SELECT =
  "id, number, kind, display_name, contact_types, lifecycle, consent, kyc_public_status, " +
  "branch_id, source_id, merged_into_id, created_at, " +
  "source:crm_lookups!crm_contacts_source_id_fkey(label), " +
  "phones:crm_contact_phones(id, raw, normalized, is_primary), " +
  "emails:crm_contact_emails(id, email, is_primary), " +
  "tag_rows:crm_contact_tags(lookup_id, lookup:crm_lookups(label)), " +
  "leads:crm_leads(count)";

type RawContact = Omit<ContactRow, "source_label" | "tags" | "lead_count"> & {
  source: { label: string } | null;
  tag_rows: { lookup_id: string; lookup: { label: string } | null }[];
  leads: { count: number }[];
};

function toContactRow(r: RawContact): ContactRow {
  const { source, tag_rows, leads, ...rest } = r;
  return {
    ...rest,
    source_label: source?.label ?? null,
    tags: (tag_rows ?? []).map((t) => ({ lookup_id: t.lookup_id, label: t.lookup?.label ?? "?" })),
    lead_count: leads?.[0]?.count ?? 0,
  };
}

export type ContactFilters = {
  lifecycle?: CrmLifecycle;
  kind?: ContactKind;
  contactType?: ContactType;
  branchId?: string;
  sourceId?: string;
  tagId?: string;
  consent?: ConsentStatus;
  q?: string;
  /** Нэгтгэгдсэн (архив) бүртгэлийг үзүүлэх үү — анхдагчаар нуудаг. */
  includeMerged?: boolean;
};

export async function getContacts(filters: ContactFilters = {}): Promise<ContactRow[]> {
  const supabase = await createClient();
  let query = supabase.from("crm_contacts").select(CONTACT_SELECT);

  if (filters.lifecycle) query = query.eq("lifecycle", filters.lifecycle);
  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.contactType) query = query.contains("contact_types", [filters.contactType]);
  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.sourceId) query = query.eq("source_id", filters.sourceId);
  if (!filters.includeMerged) query = query.is("merged_into_id", null);
  if (filters.q) {
    const q = filters.q.trim();
    const phone = normalizePhone(q);
    if (phone !== "") {
      // Утсаар: normalized тохирох contact_id-нуудыг эхэлж олно.
      const { data: phoneHits } = await supabase
        .from("crm_contact_phones")
        .select("contact_id")
        .like("normalized", `%${phone.replace(/^976/, "")}%`)
        .limit(50);
      const ids = [...new Set((phoneHits ?? []).map((p) => p.contact_id))];
      query = ids.length
        ? query.or(`display_name.ilike.%${q}%,number.ilike.%${q}%,id.in.(${ids.join(",")})`)
        : query.or(`display_name.ilike.%${q}%,number.ilike.%${q}%`);
    } else {
      query = query.or(`display_name.ilike.%${q}%,number.ilike.%${q}%`);
    }
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(300);
  if (error) {
    console.error("getContacts:", error.message);
    return [];
  }
  let rows = ((data ?? []) as unknown as RawContact[]).map(toContactRow);
  // Шошгоор шүүлт (F-118) — эмбед дээр client талд.
  if (filters.tagId) rows = rows.filter((r) => r.tags.some((t) => t.lookup_id === filters.tagId));
  if (filters.consent) rows = rows.filter((r) => r.consent === filters.consent);
  return rows;
}

// ── 360° карт ─────────────────────────────────────────────

export type ContactLeadRow = {
  id: string;
  status: CrmLifecycle;
  grade: string | null;
  score: number | null;
  owner_id: string | null;
  owner_name: string | null;
  next_step: string | null;
  next_step_date: string | null;
  last_contact_at: string | null;
  created_at: string;
};

export type NeedProfileRow = {
  id: string;
  contact_id: string;
  profile_type: string;
  goal_id: string | null;
  locations: Json;
  property_types: string[];
  budget_min: number | null;
  budget_target: number | null;
  budget_max: number;
  financing: string;
  rooms_min: number | null;
  area_min: number | null;
  conditions: string[] | null;
  timeline: string;
  move_in_date: string | null;
  must_haves: Json;
  nice_to_haves: Json;
  deal_breakers: Json;
  decision_maker: string | null;
  blocker: string | null;
  status: string;
  paused_until: string | null;
  completeness_pct: number | null;
  created_at: string;
};

export type OwnerProfileRow = {
  id: string;
  contact_id: string;
  property_id: string | null;
  goal: string;
  asking_price: number;
  terms: string | null;
  urgency: string | null;
  urgency_note: string | null;
  decision_authority: string;
  listing_state: string;
  status: string;
  paused_until: string | null;
  created_at: string;
};

export type ContactDetail = {
  id: string;
  number: string;
  kind: ContactKind;
  last_name: string | null;
  first_name: string | null;
  org_name: string | null;
  display_name: string;
  contact_types: ContactType[];
  lifecycle: CrmLifecycle;
  consent: ConsentStatus;
  consent_at: string | null;
  consent_channel: string | null;
  kyc_public_status: KycStatus;
  is_repeat: boolean;
  branch_id: string | null;
  source_id: string | null;
  source_label: string | null;
  source_detail: string | null;
  merged_into_id: string | null;
  created_by: string;
  created_at: string;
  phones: PhoneRow[];
  emails: EmailRow[];
  tags: TagRow[];
};

export type Contact360 = {
  contact: ContactDetail;
  leads: ContactLeadRow[];
  needProfiles: NeedProfileRow[];
  ownerProfiles: OwnerProfileRow[];
  mergeHistory: { merged_id: string; created_at: string }[];
};

const CONTACT_DETAIL_SELECT =
  "id, number, kind, last_name, first_name, org_name, display_name, contact_types, lifecycle, " +
  "consent, consent_at, consent_channel, kyc_public_status, is_repeat, branch_id, source_id, " +
  "source_detail, merged_into_id, created_by, created_at, " +
  "source:crm_lookups!crm_contacts_source_id_fkey(label), " +
  "phones:crm_contact_phones(id, raw, normalized, is_primary), " +
  "emails:crm_contact_emails(id, email, is_primary), " +
  "tag_rows:crm_contact_tags(lookup_id, lookup:crm_lookups(label))";

/** 360° карт (P-01/4.1): профайлууд, сэжим, merge түүх — RLS хүрээнд. */
export async function getContact360(id: string): Promise<Contact360 | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_contacts")
    .select(CONTACT_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getContact360:", error.message);
    return null;
  }
  if (!data) return null;

  type RawDetail = Omit<ContactDetail, "source_label" | "tags"> & {
    source: { label: string } | null;
    tag_rows: { lookup_id: string; lookup: { label: string } | null }[];
  };
  const raw = data as unknown as RawDetail;
  const { source, tag_rows, ...rest } = raw;
  const contact: ContactDetail = {
    ...rest,
    source_label: source?.label ?? null,
    tags: (tag_rows ?? []).map((t) => ({ lookup_id: t.lookup_id, label: t.lookup?.label ?? "?" })),
  };

  const [leadsRes, needRes, ownerRes, mergeRes] = await Promise.all([
    supabase
      .from("crm_leads")
      .select(
        "id, status, grade, score, owner_id, next_step, next_step_date, last_contact_at, created_at, " +
          "owner:profiles!crm_leads_owner_id_fkey(full_name)"
      )
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_need_profiles")
      .select("*")
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_owner_profiles")
      .select("*")
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_contact_merges")
      .select("merged_id, created_at")
      .eq("primary_id", id)
      .order("created_at", { ascending: false }),
  ]);

  type RawLead = Omit<ContactLeadRow, "owner_name"> & { owner: { full_name: string | null } | null };
  const leads = ((leadsRes.data ?? []) as unknown as RawLead[]).map(({ owner, ...l }) => ({
    ...l,
    owner_name: owner?.full_name ?? null,
  }));

  return {
    contact,
    leads,
    // need/owner profiles хүснэгт 000400-д үүсдэг — миграци хараахан
    // хэрэглэгдээгүй орчинд error буцаана, хоосон массив аюулгүй fallback.
    needProfiles: (needRes.data ?? []) as unknown as NeedProfileRow[],
    ownerProfiles: (ownerRes.data ?? []) as unknown as OwnerProfileRow[],
    mergeHistory: mergeRes.data ?? [],
  };
}

// ── Merge хос (F-108) ─────────────────────────────────────

export async function getContactPair(
  aId: string,
  bId: string
): Promise<{ a: ContactDetail; b: ContactDetail } | null> {
  const [a, b] = await Promise.all([getContact360(aId), getContact360(bId)]);
  if (!a || !b) return null;
  return { a: a.contact, b: b.contact };
}

// ── Глобал хайлт (F-119) ──────────────────────────────────

export type SearchHit = {
  kind: "contact" | "lead";
  id: string;
  title: string;
  subtitle: string;
};

export async function globalSearch(q: string): Promise<SearchHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const contacts = await getContacts({ q: term });
  return contacts.slice(0, 20).map((c) => ({
    kind: "contact" as const,
    id: c.id,
    title: c.display_name,
    subtitle: `${c.number}${c.phones[0] ? " · " + c.phones[0].raw : ""}`,
  }));
}

// ── Давхардлын илрүүлэл (F-107) ───────────────────────────

export type DuplicateHit = {
  contact_id: string;
  display_name: string;
  number: string;
  branch_id: string | null;
  created_at: string;
  match_kind: "phone" | "email" | "name";
  owner_name: string | null;
};

/**
 * Бодит цагийн давхардлын шалгалт: (а) normalized утасны яг тохирол,
 * (б) и-мэйлийн яг тохирол, (в) нэрийн ойролцоо тохирол (ilike — DB талд
 * trgm индекс дэмжинэ). Магадлалтай давхардлыг эзэмшигч, салбар, бүртгэсэн
 * огнооны хамт буцаана (анхааруулгад).
 */
export async function findDuplicates(input: {
  phone?: string;
  email?: string;
  name?: string;
  excludeContactId?: string;
}): Promise<DuplicateHit[]> {
  const supabase = await createClient();
  const hits = new Map<string, DuplicateHit>();

  const push = (
    rows: { id: string; display_name: string; number: string; branch_id: string | null; created_at: string }[],
    kind: DuplicateHit["match_kind"]
  ) => {
    for (const r of rows) {
      if (input.excludeContactId && r.id === input.excludeContactId) continue;
      if (!hits.has(r.id)) {
        hits.set(r.id, {
          contact_id: r.id,
          display_name: r.display_name,
          number: r.number,
          branch_id: r.branch_id,
          created_at: r.created_at,
          match_kind: kind,
          owner_name: null,
        });
      }
    }
  };

  const norm = input.phone ? normalizePhone(input.phone) : "";
  if (norm !== "") {
    const { data } = await supabase
      .from("crm_contact_phones")
      .select("contact:crm_contacts(id, display_name, number, branch_id, created_at)")
      .eq("normalized", norm)
      .limit(10);
    type Raw = { contact: { id: string; display_name: string; number: string; branch_id: string | null; created_at: string } | null };
    push(
      ((data ?? []) as unknown as Raw[]).map((r) => r.contact).filter((c): c is NonNullable<Raw["contact"]> => !!c),
      "phone"
    );
  }

  const email = input.email ? normalizeEmail(input.email) : "";
  if (email !== "") {
    const { data } = await supabase
      .from("crm_contact_emails")
      .select("contact:crm_contacts(id, display_name, number, branch_id, created_at)")
      .eq("email", email)
      .limit(10);
    type Raw = { contact: { id: string; display_name: string; number: string; branch_id: string | null; created_at: string } | null };
    push(
      ((data ?? []) as unknown as Raw[]).map((r) => r.contact).filter((c): c is NonNullable<Raw["contact"]> => !!c),
      "email"
    );
  }

  if (input.name && input.name.trim().length >= 3) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id, display_name, number, branch_id, created_at")
      .ilike("display_name", `%${input.name.trim()}%`)
      .is("merged_into_id", null)
      .limit(10);
    push(data ?? [], "name");
  }

  const result = [...hits.values()];
  // Эзэмшигчийг сүүлийн сэжимээс (RLS хүрээнд харагдах бол).
  if (result.length > 0) {
    const { data: leads } = await supabase
      .from("crm_leads")
      .select("contact_id, created_at, owner:profiles!crm_leads_owner_id_fkey(full_name)")
      .in("contact_id", result.map((h) => h.contact_id))
      .order("created_at", { ascending: false });
    type RawLead = { contact_id: string; owner: { full_name: string | null } | null };
    for (const l of (leads ?? []) as unknown as RawLead[]) {
      const hit = result.find((h) => h.contact_id === l.contact_id);
      if (hit && !hit.owner_name) hit.owner_name = l.owner?.full_name ?? null;
    }
  }
  return result;
}

// ── Хадгалсан харагдац (F-121) ────────────────────────────

export type SavedViewRow = { id: string; page: string; name: string; params: Json };

export async function getSavedViews(page: string): Promise<SavedViewRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_saved_views")
    .select("id, page, name, params")
    .eq("page", page)
    .order("created_at");
  if (error) console.error("getSavedViews:", error.message);
  return (data ?? []) as SavedViewRow[];
}
