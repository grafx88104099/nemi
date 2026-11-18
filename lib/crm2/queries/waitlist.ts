import { crm2Client } from "@/lib/crm2/server";
import { toRequirementData, type RequirementData } from "@/lib/crm2/contacts-requirements";
import type { Crm2PricePeriod, Crm2PropertyCategory } from "@/lib/crm2/types";

/**
 * Хүлээлгийн үйлчлүүлэгч (T10): ИДЭВХТЭЙ шаардлагатай боловч нээлттэй
 * хэлцэлгүй харилцагчид ба тэдэнд тохирох Staff хөрөнгүүд.
 *
 * Хоёулаа definer RPC (20261118000200_crm2_waitlist.sql) — харилцагч, хөрөнгийн
 * харагдацыг DB өөрөө шүүж, эрэмбийг хийсэн байна: UI дахин эрэмбэлэх,
 * шүүх шаардлагагүй. Уншиж чадаагүй бол хоосон буцаана (логт бичнэ).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Жагсаалт ───────────────────────────────────────────────────────────────

export type Crm2WaitlistRow = {
  requirementId: string;
  contactId: string;
  contactCode: string;
  contactName: string;
  /** Харилцагчийг хариуцсан агент (хариуцагчгүй бол null). */
  responsibleAgentId: string | null;
  agentName: string | null;
  requirement: RequirementData;
  /** Шаардлага бүртгэгдсэн цаг = хэдийнээс хүлээж байна. */
  waitingSince: string;
  /** Харилцагч дээрх сүүлийн үйлдэл (хүчингүй болгосныг тооцохгүй). */
  lastActivityAt: string | null;
  /** Хамгийн дараа нь хийх нээлттэй ажил (сануулга) — байхгүй бол null. */
  nextTask: { id: string; dueAt: string | null; note: string | null } | null;
  /** Яг тохирох ба ойрхон хөрөнгийн тоо (харагдах хөрөнгөөр). */
  exactCount: number;
  nearCount: number;
};

export type Crm2WaitlistFilters = {
  /** Зөвхөн миний хариуцсан харилцагчид. */
  onlyMine?: boolean;
  /** null/undefined: бүгд, true: тохирохтой нь, false: тохирохгүй нь. */
  withMatches?: boolean | null;
  limit?: number;
};

/** Хүлээж буй үйлчлүүлэгчид: тохирох хөрөнгө олонтой нь эхэнд, дараа нь эртнээс хүлээсэн нь. */
export async function getWaitlist(filters: Crm2WaitlistFilters = {}): Promise<Crm2WaitlistRow[]> {
  const supabase = await crm2Client();
  const { data, error } = await supabase.rpc("crm2_waitlist", {
    p_only_mine: filters.onlyMine ?? false,
    p_with_matches: filters.withMatches ?? null,
    p_limit: Math.min(Math.max(1, filters.limit ?? 200), 500),
  });
  if (error) {
    console.error("crm2_waitlist:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    requirementId: row.requirement_id,
    contactId: row.contact_id,
    contactCode: row.contact_code,
    contactName: row.contact_name,
    responsibleAgentId: row.responsible_agent_id,
    agentName: row.agent_name,
    requirement: toRequirementData(row.requirement),
    waitingSince: row.waiting_since,
    lastActivityAt: row.last_activity_at,
    nextTask: row.next_task_id ? { id: row.next_task_id, dueAt: row.next_task_due, note: row.next_task_note } : null,
    exactCount: row.exact_count,
    nearCount: row.near_count,
  }));
}

// ── Нэг шаардлагын тохирох хөрөнгүүд ───────────────────────────────────────

export type Crm2MatchRow = {
  propertyId: string;
  code: string;
  /** exact — бүх нөхцөл яг таарсан; near — төсөв/талбай 10% дотор, өрөө ±1. */
  fit: "exact" | "near";
  category: Crm2PropertyCategory;
  propertyType: string | null;
  district: string | null;
  locationText: string | null;
  rooms: number | null;
  areaM2: number | null;
  floor: number | null;
  buildingFloors: number | null;
  priceTotal: number | null;
  currency: string;
  pricePeriod: Crm2PricePeriod;
  availableFrom: string | null;
  listingAgentId: string | null;
  listingAgentName: string | null;
};

/** Шаардлагад тохирох идэвхтэй хөрөнгүүд: яг таарсан нь эхэнд, дараа нь хямдаас. */
export async function getRequirementMatches(requirementId: string, limit = 20): Promise<Crm2MatchRow[]> {
  if (!UUID_RE.test(requirementId)) return [];
  const supabase = await crm2Client();
  const { data, error } = await supabase.rpc("crm2_requirement_match_list", {
    p_requirement: requirementId,
    p_limit: Math.min(Math.max(1, limit), 100),
  });
  if (error) {
    console.error("crm2_requirement_match_list:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    propertyId: row.property_id,
    code: row.code,
    fit: row.fit === "exact" ? "exact" : "near",
    category: row.category,
    propertyType: row.property_type,
    district: row.district,
    locationText: row.location_text,
    rooms: row.rooms,
    areaM2: row.area_m2,
    floor: row.floor,
    buildingFloors: row.building_floors,
    priceTotal: row.price_total,
    currency: row.currency,
    pricePeriod: row.price_period,
    availableFrom: row.available_from,
    listingAgentId: row.listing_agent_id,
    listingAgentName: row.listing_agent_name,
  }));
}
