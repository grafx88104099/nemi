import type { SupabaseClient } from "@supabase/supabase-js";

import { LISTING_STATUS, type DealType, type ListingStatus } from "@/lib/constants";
import type { CrmLifecycle } from "@/lib/constants-crm";
import { fmtArea, fmtMNT, shortMNT } from "@/lib/format";
import type { Database } from "@/types/database";

/**
 * Сэжмийг nemi.mn-ийн зартай холбох дундын код. Сервер, клиент хоёуланд
 * импортолж болно (сервер client-ийг зөвхөн параметрээр авна).
 *
 * Зар зарагдах/устах үед listings-ийн RLS өөр оффисын агентаас мөрийг нууж,
 * эсвэл мөр бүрмөсөн устаж болно — тиймээс карт, жагсаалт идэвхтэй зарын
 * одоогийн мэдээллийг, бусад үед бүртгэсэн үеийн хуулбарыг (listing_snapshot) харуулна.
 */

export type LeadListingSnapshot = {
  title: string;
  price: number;
  deal_type: DealType;
  district: string | null;
  type: string | null;
  rooms: number;
  area: number | null;
  photo: string | null;
  captured_at: string;
};

/** Амьд зар эсвэл хуулбарын харуулах талбарууд. */
export type LeadListingInfo = Omit<LeadListingSnapshot, "captured_at">;

export const LEAD_LISTING_SELECT =
  "id, title, price, deal_type, district, type, rooms, area, photo, " +
  "agent:agents!listings_agent_id_fkey(office:offices!agents_office_id_fkey(name))";

/** crm_leads-ээс listings-ийг embed хийхэд авах багана. */
export const LEAD_LIVE_LISTING_FIELDS = "status, title, price, deal_type, district, type, rooms, area, photo";

export const LEAD_LISTING_SEARCH_LIMIT = 20;

export const LISTING_UNAVAILABLE_ERR = "Сонгосон зар олдсонгүй эсвэл идэвхгүй байна. Жагсаалтаас дахин сонгоно уу.";

export type LeadListingRow = Omit<LeadListingSnapshot, "captured_at"> & {
  id: string;
  agent?: { office: { name: string } | null } | null;
};

/** Зар сонгох жагсаалтын мөр (нийтэд ил талбарууд + оффисын нэр). */
export type LeadListingOption = Omit<LeadListingSnapshot, "captured_at"> & {
  id: string;
  office_name: string | null;
};

/** Зөвхөн зөвшөөрсөн талбаруудыг авна — оффисын нэр зэрэг нэмэлт багана хуулбарт орохгүй. */
export function toListingSnapshot(row: LeadListingRow, capturedAt: Date = new Date()): LeadListingSnapshot {
  return {
    title: row.title,
    price: row.price,
    deal_type: row.deal_type,
    district: row.district,
    type: row.type,
    rooms: row.rooms,
    area: row.area,
    photo: row.photo,
    captured_at: capturedAt.toISOString(),
  };
}

export function toListingOption(row: LeadListingRow): LeadListingOption {
  return {
    id: row.id,
    title: row.title,
    price: row.price,
    deal_type: row.deal_type,
    district: row.district,
    type: row.type,
    rooms: row.rooms,
    area: row.area,
    photo: row.photo,
    office_name: row.agent?.office?.name ?? null,
  };
}

/** jsonb баганын утгыг шалгаж төрөлжүүлнэ; бүрэн бус бол null. */
export function parseListingSnapshot(value: unknown): LeadListingSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== "string" || typeof v.price !== "number" || typeof v.captured_at !== "string") return null;
  const str = (x: unknown) => (typeof x === "string" && x !== "" ? x : null);
  const num = (x: unknown) => (typeof x === "number" ? x : null);
  return {
    title: v.title,
    price: v.price,
    deal_type: v.deal_type === "rent" ? "rent" : "sale",
    district: str(v.district),
    type: str(v.type),
    rooms: num(v.rooms) ?? 0,
    area: num(v.area),
    photo: str(v.photo),
    captured_at: v.captured_at,
  };
}

const LISTING_REF = /^listing:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** `listing:<uuid>` хэлбэрийн channel_ref-ээс зарын id; өөр бол null. */
export function parseListingRef(channelRef: string | null | undefined): string | null {
  const match = channelRef ? LISTING_REF.exec(channelRef.trim()) : null;
  return match ? match[1].toLowerCase() : null;
}

/**
 * Хайлтын үгсийг PostgREST-ийн .or() шүүлтэд аюулгүй болгоно. Зөвшөөрсөн
 * тэмдэгтээс бусдыг хасна: `,` `(` `)` `"` `\` нь шүүлтийн бүтцийг эвддэг,
 * `%` `_` `*` нь ilike-ийн орлуулагч.
 */
export function listingSearchTerms(query: string): string[] {
  return query
    .replace(/[^\p{L}\p{M}\p{N}\s.\-/№]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((term) => term.slice(0, 40));
}

/**
 * Зарыг өгсөн client-ээр уншина: хэрэглэгчийн client бол RLS, intake-ийн
 * service-role бол бүгд. Алдаа, олдоогүй үед null (шидэхгүй).
 */
export async function fetchListingForLead(
  client: SupabaseClient<Database>,
  listingId: string,
  opts: { activeOnly?: boolean } = {}
): Promise<LeadListingRow | null> {
  let query = client.from("listings").select(LEAD_LISTING_SELECT).eq("id", listingId);
  if (opts.activeOnly) query = query.eq("status", "active");
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("fetchListingForLead:", error.message);
    return null;
  }
  return (data ?? null) as unknown as LeadListingRow | null;
}

// ── Зараар бүлэглэх ───────────────────────────────────────

export function isOpenLeadStatus(status: CrmLifecycle): boolean {
  return status === "new" || status === "active";
}

export type LeadListingSourceRow = {
  id: string;
  status: CrmLifecycle;
  created_at: string;
  listing_id: string | null;
  listing_snapshot: unknown;
  /** Амьд зарын төлөв; устсан эсвэл RLS-ээр харагдахгүй бол null. */
  live_status: string | null;
  /** Амьд зарын одоогийн мэдээлэл; устсан эсвэл RLS-ээр харагдахгүй бол null. */
  live_listing: LeadListingInfo | null;
  contact_name: string;
  owner_name: string | null;
};

export type ListingLead = Pick<LeadListingSourceRow, "id" | "status" | "created_at" | "contact_name" | "owner_name">;

export type LeadListingGroup = {
  /** React key: listing_id, зар устсан бол хуулбараас гаргасан түлхүүр. */
  key: string;
  /** Зар устсан бол null. */
  listing_id: string | null;
  /** Идэвхтэй зарын одоогийн мэдээлэл; бусад үед хамгийн сүүлд бүртгэгдсэн сэжмийн хуулбар. */
  listing: LeadListingInfo | null;
  live_status: string | null;
  is_readable: boolean;
  is_active: boolean;
  lead_count: number;
  open_lead_count: number;
  latest_lead_at: string;
  /** Шинэ нь эхэндээ. */
  leads: ListingLead[];
};

function listingGroupKey(listingId: string | null, snapshot: LeadListingSnapshot | null): string | null {
  if (listingId) return listingId;
  if (!snapshot) return null;
  // Зар устахад listing_id null болдог тул нэг зарын сэжмүүдийг хуулбараар нь нэгтгэнэ.
  const { title, price, deal_type, district, type, rooms, area } = snapshot;
  return `deleted:${[title, price, deal_type, district, type, rooms, area].join("|")}`;
}

/** Сэжмүүдийг зараар бүлэглэнэ; зар тодорхойгүй сэжмийг алгасна. Сүүлд бүртгэгдсэн зар эхэндээ. */
export function groupLeadsByListing(rows: LeadListingSourceRow[]): LeadListingGroup[] {
  const newestFirst = [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const groups = new Map<string, LeadListingGroup>();
  for (const row of newestFirst) {
    const snapshot = parseListingSnapshot(row.listing_snapshot);
    const key = listingGroupKey(row.listing_id, snapshot);
    if (!key) continue;
    const listing = (row.live_status === "active" ? row.live_listing : null) ?? snapshot;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        listing_id: row.listing_id,
        listing,
        live_status: row.live_status,
        is_readable: row.live_status != null,
        is_active: row.live_status === "active",
        lead_count: 0,
        open_lead_count: 0,
        latest_lead_at: row.created_at,
        leads: [],
      };
      groups.set(key, group);
    }
    group.listing ??= listing;
    group.lead_count += 1;
    if (isOpenLeadStatus(row.status)) group.open_lead_count += 1;
    group.leads.push({
      id: row.id,
      status: row.status,
      created_at: row.created_at,
      contact_name: row.contact_name,
      owner_name: row.owner_name,
    });
  }
  return [...groups.values()];
}

// ── Харуулах туслахууд ────────────────────────────────────

/** «285 сая₮» эсвэл түрээсийн зарт бүтэн дүнгээр «1,450,000₮/сар» (сая руу бөөрөнхийлбөл түрээс буруу харагдана). */
export function listingPriceLabel(listing: Pick<LeadListingSnapshot, "price" | "deal_type">): string {
  return listing.deal_type === "rent" ? `${fmtMNT(listing.price)}/сар` : shortMNT(listing.price);
}

/** «Орон сууц · Хан-Уул · 3 өрөө · 85 м²» — утгагүй талбарыг алгасна. */
export function listingSpecLabel(listing: Pick<LeadListingSnapshot, "type" | "district" | "rooms" | "area">): string {
  return [
    listing.type,
    listing.district,
    listing.rooms > 0 ? `${listing.rooms} өрөө` : null,
    listing.area != null ? fmtArea(listing.area) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Амьд зар идэвхтэй биш үед харуулах шошго; идэвхтэй бол null. null төлөв нь
 * зар устсан эсвэл энэ хэрэглэгчид харагдахгүй болсон гэсэн үг (зарагдсан ч байж болно).
 */
export function listingInactiveLabel(liveStatus: string | null): string | null {
  if (liveStatus === "active") return null;
  const known = liveStatus ? LISTING_STATUS[liveStatus as ListingStatus]?.label : undefined;
  return known ?? "Идэвхгүй болсон";
}
