import { cache } from "react";

import { CRM2_MAX_PAGE_SIZE, CRM2_PAGE_SIZE } from "@/lib/crm2/labels";
import { phoneSearchDigits } from "@/lib/crm2/phone";
import { crm2Client, isRangeError, likeEscape, pageRange, type Crm2Supabase } from "@/lib/crm2/server";
import { loadHistory, type HistoryItem } from "@/lib/crm2/queries/history";
import { getStaffNameMap } from "@/lib/crm2/queries/lookups";
import type { Paged } from "@/lib/crm2/queries/properties";
import type {
  Crm2ContactDealItem,
  Crm2ContactPhoneRow,
  Crm2ContactRow,
  Crm2PhoneMatch,
  Crm2PropertyCategory,
  Crm2PropertyStatus,
  Crm2RecordStatus,
  Crm2RequestRow,
  Crm2RequirementRow,
  Crm2TaskRow,
} from "@/lib/crm2/types";

/**
 * Харилцагчийн уншилт (жагсаалт, S08 нэгдсэн карт). RLS: хариуцагч, хэлцэлтэй/
 * дуудлага хийсэн агент, тэдний ахлагч, менежер, эзэн бол хувийн талбар харагч.
 * Хайлт search_text-ээр (код, нэр, тэмдэглэл, жигдрүүлсэн дугаар ба сүүлийн 8 цифр).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CONTACT_LIST_SELECT =
  "id, code, full_name, note, status, responsible_agent_id, created_at, updated_at, " +
  "responsible:profiles!crm2_contacts_responsible_agent_id_fkey(full_name), " +
  "phones:crm2_contact_phones!crm2_contact_phones_contact_id_office_id_fkey(id, phone, phone_norm, label, is_primary)";

type PhoneLite = Pick<Crm2ContactPhoneRow, "id" | "phone" | "phone_norm" | "label" | "is_primary">;

export type ContactListItem = Pick<
  Crm2ContactRow,
  "id" | "code" | "full_name" | "note" | "status" | "responsible_agent_id" | "created_at" | "updated_at"
> & {
  responsibleName: string | null;
  phones: PhoneLite[];
  openDeals: number;
};

export type ContactListFilters = {
  /** Нэр, код, тэмдэглэл эсвэл дугаар (хэсэгчлэн). */
  q?: string | null;
  status?: Crm2RecordStatus | "all" | null;
  /** Энэ агентын хариуцсан. */
  responsibleId?: string | null;
  page?: number;
  pageSize?: number;
};

/** Хайлтын бичвэрийг search_text-ийн хэлбэрт: дугаар бол цифр, эс бөгөөс жижиг үсэг. */
export function contactSearchTerm(q: string | null | undefined): string | null {
  const t = (q ?? "").trim();
  if (!t) return null;
  return phoneSearchDigits(t) ?? t.toLowerCase();
}

type ContactListRow = Omit<ContactListItem, "responsibleName" | "openDeals"> & {
  responsible: { full_name: string | null } | null;
};

function sortPhones<T extends { is_primary: boolean }>(phones: T[] | null | undefined): T[] {
  return [...(phones ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
}

export async function listContacts(filters: ContactListFilters = {}): Promise<Paged<ContactListItem>> {
  const supabase = await crm2Client();
  const pageSize = Math.min(Math.max(1, filters.pageSize ?? CRM2_PAGE_SIZE), CRM2_MAX_PAGE_SIZE);
  const { page, from, to } = pageRange(filters.page, pageSize);

  let query = supabase.from("crm2_contacts").select(CONTACT_LIST_SELECT, { count: "exact" });
  const status = filters.status ?? "active";
  if (status !== "all") query = query.eq("status", status);
  if (filters.responsibleId && UUID_RE.test(filters.responsibleId)) {
    query = query.eq("responsible_agent_id", filters.responsibleId);
  }
  const term = contactSearchTerm(filters.q);
  if (term) query = query.ilike("search_text", `%${likeEscape(term)}%`);

  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (error) {
    // ?page= жагсаалтаас хэтэрсэн (416) — алдаа биш: 1-р хуудсаар нийт тоог авч «энэ хуудсанд алга» гэж харуулна.
    if (isRangeError(error) && page > 1) {
      const first = await listContacts({ ...filters, page: 1 });
      return { items: [], total: first.total, page, pageSize, pageCount: first.pageCount, error: first.error };
    }
    console.error("crm2 listContacts:", error.message);
    return { items: [], total: 0, page, pageSize, pageCount: 0, error: true };
  }
  const rows = (data ?? []) as unknown as ContactListRow[];
  const open = await openDealCounts(
    supabase,
    rows.map((r) => r.id)
  );
  const items = rows.map(({ responsible, ...r }) => ({
    ...r,
    phones: sortPhones(r.phones),
    responsibleName: responsible?.full_name ?? null,
    openDeals: open[r.id] ?? 0,
  }));
  const total = count ?? items.length;
  return { items, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
}

async function openDealCounts(supabase: Crm2Supabase, contactIds: string[]): Promise<Record<string, number>> {
  if (contactIds.length === 0) return {};
  const { data, error } = await supabase
    .from("crm2_deals")
    .select("contact_id")
    .in("contact_id", contactIds)
    .eq("is_open", true)
    .limit(2000);
  if (error) console.error("crm2 openDealCounts:", error.message);
  const out: Record<string, number> = {};
  for (const d of data ?? []) out[d.contact_id] = (out[d.contact_id] ?? 0) + 1;
  return out;
}

/** Сонгогчид (эзэн, шилжүүлэх г.м.) — харах эрхтэй харилцагчаас хайх. */
export async function searchContacts(q: string, limit = 10): Promise<ContactListItem[]> {
  const res = await listContacts({ q, status: "active", pageSize: Math.min(Math.max(1, limit), 50) });
  return res.items;
}

/** Бүтэн дугаараар шалгах (давхардал, S04). Нээх эрхгүй бол нэр далд. */
export async function findContactsByPhone(phone: string, propertyId?: string | null): Promise<Crm2PhoneMatch[]> {
  const supabase = await crm2Client();
  const { data, error } = await supabase.rpc("crm2_find_contacts_by_phone", {
    p_phone: phone,
    p_property: propertyId && UUID_RE.test(propertyId) ? propertyId : null,
  });
  if (error) {
    console.error("crm2_find_contacts_by_phone:", error.message);
    return [];
  }
  return data ?? [];
}

// ── Нэгдсэн карт (S08) ─────────────────────────────────────────────────────

const CONTACT_DETAIL_SELECT =
  "*, responsible:profiles!crm2_contacts_responsible_agent_id_fkey(id, full_name, avatar_url), " +
  "phones:crm2_contact_phones!crm2_contact_phones_contact_id_office_id_fkey(id, phone, phone_norm, label, is_primary, created_at)";

const REQUIREMENT_SELECT = "*";

const OWNED_SELECT =
  "property_id, property:crm2_properties!crm2_property_private_property_id_office_id_fkey(id, code, category, status, location_text, district)";

const CONTACT_TASK_SELECT =
  "id, kind, status, assignee_id, due_at, note, property_id, deal_id, contact_id, requirement_id, brokerage_id, " +
  "source_activity_id, done_at, created_by, created_at, updated_at, " +
  "assignee:profiles!crm2_tasks_assignee_id_fkey(full_name)";

const CONTACT_REQUEST_SELECT =
  "id, office_id, kind, target_id, property_id, payload, reason, status, requested_by, requested_at, decided_by, decided_at, decision_note";

export type ContactDetail = {
  contact: Crm2ContactRow & {
    responsible: { id: string; full_name: string | null; avatar_url: string | null } | null;
    phones: (PhoneLite & { created_at: string })[];
  };
  requirements: Crm2RequirementRow[];
  deals: Crm2ContactDealItem[];
  /** Энэ хүн эзэн болсон (харах эрхтэй) хөрөнгүүд. */
  ownedProperties: {
    id: string;
    code: string;
    category: Crm2PropertyCategory;
    status: Crm2PropertyStatus;
    location_text: string | null;
    district: string | null;
  }[];
  openTasks: (Pick<
    Crm2TaskRow,
    | "id"
    | "kind"
    | "status"
    | "assignee_id"
    | "due_at"
    | "note"
    | "property_id"
    | "deal_id"
    | "contact_id"
    | "requirement_id"
    | "brokerage_id"
    | "source_activity_id"
    | "done_at"
    | "created_by"
    | "created_at"
    | "updated_at"
  > & { assignee: { full_name: string | null } | null })[];
  history: HistoryItem[];
  /** Түүхийг ачаалж чадсангүй (хоосон түүх гэж харуулахгүй). */
  historyError: boolean;
  pendingTransfer: (Crm2RequestRow & { requestedByName: string | null; toAgentName: string | null }) | null;
  can: { edit: boolean; editRequirements: boolean };
};

/** Харилцагчийн нэгдсэн карт — олдохгүй/эрхгүй бол null. */
export const getContact = cache(async (id: string): Promise<ContactDetail | null> => {
  if (!UUID_RE.test(id)) return null;
  const supabase = await crm2Client();
  const { data: row, error } = await supabase.from("crm2_contacts").select(CONTACT_DETAIL_SELECT).eq("id", id).maybeSingle();
  if (error) {
    // DB/PostgREST алдааг «олдсонгүй» (жагсаалт руу redirect) гэж харуулахгүй — crm/error.tsx гарна.
    console.error("crm2 getContact:", error.message);
    throw new Error("crm2 getContact: load failed");
  }
  if (!row) return null;
  const contact = row as unknown as ContactDetail["contact"];
  contact.phones = sortPhones(contact.phones);

  const [requirements, deals, owned, tasks, history, request, canEdit, canEditReq, names] = await Promise.all([
    supabase
      .from("crm2_requirements")
      .select(REQUIREMENT_SELECT)
      .eq("contact_id", id)
      .order("status", { ascending: true })
      .order("updated_at", { ascending: false }),
    supabase.rpc("crm2_contact_deals", { p_contact: id }),
    supabase.from("crm2_property_private").select(OWNED_SELECT).eq("owner_contact_id", id).limit(100),
    supabase
      .from("crm2_tasks")
      .select(CONTACT_TASK_SELECT)
      .eq("contact_id", id)
      .eq("status", "open")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(100),
    loadHistory({ contactId: id, limit: 100 }),
    supabase
      .from("crm2_requests")
      .select(CONTACT_REQUEST_SELECT)
      .eq("kind", "contact_transfer")
      .eq("target_id", id)
      .eq("status", "pending")
      .maybeSingle(),
    supabase.rpc("crm2_can_edit_contact", { p_contact: id }),
    supabase.rpc("crm2_can_edit_requirements", { p_contact: id }),
    getStaffNameMap(),
  ]);
  for (const [label, r] of [
    ["requirements", requirements],
    ["contact_deals", deals],
    ["owned", owned],
    ["tasks", tasks],
    ["request", request],
    ["can_edit_contact", canEdit],
    ["can_edit_requirements", canEditReq],
  ] as const) {
    if (r.error) console.error(`crm2 getContact ${label}:`, r.error.message);
  }

  type OwnedRow = { property_id: string; property: ContactDetail["ownedProperties"][number] | null };
  const req = (request.data ?? null) as Crm2RequestRow | null;
  const toAgent = req && typeof req.payload === "object" && req.payload && !Array.isArray(req.payload)
    ? ((req.payload as Record<string, unknown>).to_agent as string | undefined)
    : undefined;

  return {
    contact,
    requirements: (requirements.data ?? []) as Crm2RequirementRow[],
    deals: deals.data ?? [],
    ownedProperties: ((owned.data ?? []) as unknown as OwnedRow[]).map((o) => o.property).filter((p): p is NonNullable<typeof p> => !!p),
    openTasks: (tasks.data ?? []) as unknown as ContactDetail["openTasks"],
    history: history.rows,
    historyError: history.error,
    pendingTransfer: req
      ? { ...req, requestedByName: names[req.requested_by] ?? null, toAgentName: toAgent ? (names[toAgent] ?? null) : null }
      : null,
    can: { edit: !!canEdit.data, editRequirements: !!canEditReq.data },
  };
});

/** Нэг шаардлагын өмнөх хувилбарууд (шинэ нь эхэнд). */
export async function listRequirementVersions(requirementId: string) {
  if (!UUID_RE.test(requirementId)) return [];
  const supabase = await crm2Client();
  const { data, error } = await supabase
    .from("crm2_requirement_versions")
    .select("id, requirement_id, contact_id, version, snapshot, replaced_by, replaced_at")
    .eq("requirement_id", requirementId)
    .order("version", { ascending: false });
  if (error) console.error("crm2 listRequirementVersions:", error.message);
  return data ?? [];
}
