import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type {
  CrmPropertyRole,
  CrmPropertyStatus,
  OccupancyStatus,
  ServiceKind,
} from "@/lib/constants-crm";

/**
 * Объектын сангийн уншилтууд (U3, F-200–219). RLS = эрхийн давхарга:
 * дундын сан тул оффисын бүх staff харна (sysadmin-ээс бусад) — эндээс
 * дахин шүүхгүй, зөвхөн UI шүүлтүүд.
 */

export type PropertyAddress = {
  district?: string;
  khoroo?: string;
  complex?: string;
  building?: string;
  unit?: string;
};

export type PropertyRoleRow = {
  id: string;
  role: CrmPropertyRole;
  agent_profile_id: string;
  agent_name: string | null;
  assigned_at: string;
};

export type PropertyRow = {
  id: string;
  number: string;
  name: string;
  address: PropertyAddress;
  branch_id: string | null;
  service_kind: ServiceKind;
  property_type: string;
  zone_id: string | null;
  price: number | null;
  rent_price: number | null;
  area_m2: number | null;
  rooms: number | null;
  status: CrmPropertyStatus;
  occupancy: OccupancyStatus | null;
  owner_contact_id: string;
  owner_name: string | null;
  listing_id: string | null;
  created_at: string;
  roles: PropertyRoleRow[];
};

const PROPERTY_SELECT =
  "id, number, name, address, branch_id, service_kind, property_type, zone_id, price, rent_price, " +
  "area_m2, rooms, status, occupancy, owner_contact_id, listing_id, created_at, " +
  "owner:crm_contacts!crm_properties_owner_contact_id_fkey(display_name), " +
  "roles:crm_property_roles(id, role, agent_profile_id, assigned_at, " +
  "agent:profiles!crm_property_roles_agent_profile_id_fkey(full_name))";

type RawRole = Omit<PropertyRoleRow, "agent_name"> & { agent: { full_name: string | null } | null };
type RawProperty = Omit<PropertyRow, "owner_name" | "roles"> & {
  owner: { display_name: string } | null;
  roles: RawRole[];
};

function toPropertyRow(r: RawProperty): PropertyRow {
  const { owner, roles, ...rest } = r;
  return {
    ...rest,
    owner_name: owner?.display_name ?? null,
    roles: (roles ?? []).map(({ agent, ...rr }) => ({ ...rr, agent_name: agent?.full_name ?? null })),
  };
}

export type PropertyFilters = {
  status?: CrmPropertyStatus;
  serviceKind?: ServiceKind;
  propertyType?: string;
  branchId?: string;
  zoneId?: string;
  occupancy?: OccupancyStatus;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  agentId?: string;
  q?: string;
};

/** Жагсаалтын шүүлт (F-219): статус, төрөл, бүс, үнийн муж, талбай, агент, ашиглалт. */
export async function getProperties(filters: PropertyFilters = {}): Promise<PropertyRow[]> {
  const supabase = await createClient();
  let query = supabase.from("crm_properties").select(PROPERTY_SELECT);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.serviceKind) query = query.eq("service_kind", filters.serviceKind);
  if (filters.propertyType) query = query.eq("property_type", filters.propertyType);
  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.zoneId) query = query.eq("zone_id", filters.zoneId);
  if (filters.occupancy) query = query.eq("occupancy", filters.occupancy);
  if (filters.areaMin != null) query = query.gte("area_m2", filters.areaMin);

  const { data, error } = await query.order("created_at", { ascending: false }).limit(400);
  if (error) {
    console.error("getProperties:", error.message);
    return [];
  }
  let rows = ((data ?? []) as unknown as RawProperty[]).map(toPropertyRow);

  // Үнийн муж — service_kind-ээс хамаарч аль үнэ хамаатайг JS-д шүүнэ.
  if (filters.priceMin != null || filters.priceMax != null) {
    rows = rows.filter((r) => {
      const p = r.service_kind === "sale" ? r.price : (r.rent_price ?? r.price);
      if (p == null) return false;
      if (filters.priceMin != null && p < filters.priceMin) return false;
      if (filters.priceMax != null && p > filters.priceMax) return false;
      return true;
    });
  }
  if (filters.agentId) {
    rows = rows.filter((r) => r.roles.some((role) => role.agent_profile_id === filters.agentId));
  }
  if (filters.q) {
    const q = filters.q.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.number.toLowerCase().includes(q) ||
        (r.address.district ?? "").toLowerCase().includes(q) ||
        (r.address.complex ?? "").toLowerCase().includes(q) ||
        (r.owner_name ?? "").toLowerCase().includes(q)
    );
  }
  return rows;
}

// ── Дэлгэрэнгүй ───────────────────────────────────────────

export type ListingAgreementRow = {
  id: string;
  number: string;
  signed_on: string;
  expires_on: string;
  special_terms: string | null;
};

export type PriceHistoryRow = {
  id: string;
  field: string;
  old_value: number | null;
  new_value: number | null;
  reason: string | null;
  changed_by_name: string | null;
  created_at: string;
};

export type MeterRow = {
  id: string;
  meter_type: string;
  serial: string | null;
  last_reading: number | null;
  last_read_on: string | null;
};

export type VacancyRow = { id: string; started_on: string; ended_on: string | null };

export type PropertyDetail = {
  id: string;
  number: string;
  name: string;
  address: PropertyAddress;
  branch_id: string | null;
  branch_override_reason: string | null;
  service_kind: ServiceKind;
  property_type: string;
  zone_id: string | null;
  price: number | null;
  rent_price: number | null;
  area_m2: number | null;
  rooms: number | null;
  status: CrmPropertyStatus;
  occupancy: OccupancyStatus | null;
  vacancy_started_on: string | null;
  owner_contact_id: string;
  owner_name: string | null;
  owner_number: string | null;
  payment_day: number | null;
  features: string[];
  match_tags: Json | null;
  key_location: string | null;
  key_holder_id: string | null;
  key_holder_name: string | null;
  listing_id: string | null;
  created_by: string;
  created_at: string;
  roles: PropertyRoleRow[];
  agreements: ListingAgreementRow[];
  priceHistory: PriceHistoryRow[];
  meters: MeterRow[];
  vacancies: VacancyRow[];
};

const PROPERTY_DETAIL_SELECT =
  "id, number, name, address, branch_id, branch_override_reason, service_kind, property_type, zone_id, " +
  "price, rent_price, area_m2, rooms, status, occupancy, vacancy_started_on, owner_contact_id, " +
  "payment_day, features, match_tags, key_location, key_holder_id, listing_id, created_by, created_at, " +
  "owner:crm_contacts!crm_properties_owner_contact_id_fkey(display_name, number), " +
  "key_holder:profiles!crm_properties_key_holder_id_fkey(full_name), " +
  "roles:crm_property_roles(id, role, agent_profile_id, assigned_at, " +
  "agent:profiles!crm_property_roles_agent_profile_id_fkey(full_name)), " +
  "agreements:crm_listing_agreements(id, number, signed_on, expires_on, special_terms), " +
  "vacancies:crm_vacancy_periods(id, started_on, ended_on), " +
  "meters:crm_meters(id, meter_type, serial, readings:crm_meter_readings(reading, read_on))";

export async function getProperty(id: string): Promise<PropertyDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_properties")
    .select(PROPERTY_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getProperty:", error.message);
    return null;
  }
  if (!data) return null;

  type RawMeter = {
    id: string;
    meter_type: string;
    serial: string | null;
    readings: { reading: number; read_on: string }[];
  };
  type Raw = Omit<
    PropertyDetail,
    "owner_name" | "owner_number" | "key_holder_name" | "roles" | "priceHistory" | "meters"
  > & {
    owner: { display_name: string; number: string } | null;
    key_holder: { full_name: string | null } | null;
    roles: RawRole[];
    meters: RawMeter[];
  };
  const raw = data as unknown as Raw;

  const { data: history } = await supabase
    .from("crm_property_price_history")
    .select("id, field, old_value, new_value, reason, created_at, changer:profiles!crm_property_price_history_changed_by_fkey(full_name)")
    .eq("property_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  type RawHist = Omit<PriceHistoryRow, "changed_by_name"> & { changer: { full_name: string | null } | null };
  const priceHistory = ((history ?? []) as unknown as RawHist[]).map(({ changer, ...h }) => ({
    ...h,
    changed_by_name: changer?.full_name ?? null,
  }));

  const { owner, key_holder, roles, meters, ...rest } = raw;
  return {
    ...rest,
    owner_name: owner?.display_name ?? null,
    owner_number: owner?.number ?? null,
    key_holder_name: key_holder?.full_name ?? null,
    roles: (roles ?? []).map(({ agent, ...rr }) => ({ ...rr, agent_name: agent?.full_name ?? null })),
    priceHistory,
    meters: (meters ?? []).map((m) => {
      const sorted = [...(m.readings ?? [])].sort((a, b) => (a.read_on < b.read_on ? 1 : -1));
      return {
        id: m.id,
        meter_type: m.meter_type,
        serial: m.serial,
        last_reading: sorted[0]?.reading ?? null,
        last_read_on: sorted[0]?.read_on ?? null,
      };
    }),
  };
}

export async function getPriceHistory(propertyId: string): Promise<PriceHistoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_property_price_history")
    .select("id, field, old_value, new_value, reason, created_at, changer:profiles!crm_property_price_history_changed_by_fkey(full_name)")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getPriceHistory:", error.message);
    return [];
  }
  type RawHist = Omit<PriceHistoryRow, "changed_by_name"> & { changer: { full_name: string | null } | null };
  return ((data ?? []) as unknown as RawHist[]).map(({ changer, ...h }) => ({
    ...h,
    changed_by_name: changer?.full_name ?? null,
  }));
}

// ── Бүсийн лавлах (F-207) ─────────────────────────────────

/**
 * Хаягаас бүс/салбарын автомат санал: district(+khoroo/complex)-ээр
 * хамгийн нарийвчилсан идэвхтэй мөрийг сонгоно.
 */
export async function getZoneFor(
  address: { district?: string | null; khoroo?: string | null; complex?: string | null }
): Promise<{ zoneId: string; branchId: string } | null> {
  if (!address.district) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_zone_directory")
    .select("id, district, khoroo, complex, branch_id")
    .eq("is_active", true)
    .ilike("district", address.district.trim());
  if (error) {
    console.error("getZoneFor:", error.message);
    return null;
  }
  const rows = data ?? [];
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  // Нарийвчлалын эрэмбэ: complex > khoroo > district-only.
  const byComplex = rows.find((z) => z.complex && norm(z.complex) === norm(address.complex));
  const byKhoroo = rows.find((z) => !z.complex && z.khoroo && norm(z.khoroo) === norm(address.khoroo));
  const byDistrict = rows.find((z) => !z.complex && !z.khoroo);
  const hit = byComplex ?? byKhoroo ?? byDistrict ?? null;
  return hit ? { zoneId: hit.id, branchId: hit.branch_id } : null;
}

// ── Идэвхжүүлэлтийн checklist (F-203) ─────────────────────

/** Дутуу шаардлагын монгол жагсаалт — хоосон бол идэвхжүүлж болно. */
export async function getActivationMissing(propertyId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_property_activation_check", {
    p_property: propertyId,
  });
  if (error) {
    console.error("getActivationMissing:", error.message);
    return ["Шалгалт хийхэд алдаа гарлаа"];
  }
  return (data ?? []) as string[];
}

// ── Сонголтууд ────────────────────────────────────────────

export type PropertyOption = { id: string; number: string; name: string; status: CrmPropertyStatus };

export async function getPropertyOptions(): Promise<PropertyOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_properties")
    .select("id, number, name, status")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) console.error("getPropertyOptions:", error.message);
  return (data ?? []) as PropertyOption[];
}
