import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";
import type { CrmPropertyStatus, MatchResponse, MatchStrength, ServiceKind } from "@/lib/constants-crm";
import {
  normalizeMatchThresholds,
  normalizeMatchWeights,
  propertyFeatureTokens,
  propertyLocationTokens,
  scoreMatch,
  type MatchProfileInput,
  type MatchPropertyInput,
  type MatchTags,
} from "@/lib/crm/matching";

/**
 * Тохируулгын уншилтууд + дахин тооцооллын цөм (U3, F-250–261).
 * recomputeMatchesCore нь admin client-ээр ажиллана (cron + action хоёул
 * хэрэглэнэ) — оффисын хүрээг .eq("office_id")-ээр ЗААВАЛ хатуу зааж өгнө.
 */

// ── Уншилтын мөрүүд ───────────────────────────────────────

export type MatchRow = {
  id: string;
  need_profile_id: string;
  property_id: string;
  direction: string;
  score: number;
  breakdown: Json;
  strength: MatchStrength;
  deal_breaker_hit: boolean;
  deal_breaker_reasons: string[];
  manual_override_reason: string | null;
  suggested_at: string | null;
  suggested_by_name: string | null;
  response: MatchResponse | null;
  response_reason: string | null;
  responded_at: string | null;
  computed_at: string;
  // Объектын тал
  property_number: string | null;
  property_name: string | null;
  property_status: CrmPropertyStatus | null;
  property_service_kind: ServiceKind | null;
  property_price: number | null;
  property_rent_price: number | null;
  // Профайлын тал
  contact_id: string | null;
  contact_name: string | null;
  profile_type: string | null;
};

const MATCH_SELECT =
  "id, need_profile_id, property_id, direction, score, breakdown, strength, deal_breaker_hit, " +
  "deal_breaker_reasons, manual_override_reason, suggested_at, response, response_reason, responded_at, computed_at, " +
  "suggester:profiles!crm_matches_suggested_by_fkey(full_name), " +
  "property:crm_properties!crm_matches_property_id_fkey(number, name, status, service_kind, price, rent_price), " +
  "profile:crm_need_profiles!crm_matches_need_profile_id_fkey(profile_type, contact_id, " +
  "contact:crm_contacts!crm_need_profiles_contact_id_fkey(display_name))";

type RawMatch = Omit<
  MatchRow,
  | "suggested_by_name"
  | "property_number"
  | "property_name"
  | "property_status"
  | "property_service_kind"
  | "property_price"
  | "property_rent_price"
  | "contact_id"
  | "contact_name"
  | "profile_type"
> & {
  suggester: { full_name: string | null } | null;
  property: {
    number: string;
    name: string;
    status: CrmPropertyStatus;
    service_kind: ServiceKind;
    price: number | null;
    rent_price: number | null;
  } | null;
  profile: {
    profile_type: string;
    contact_id: string;
    contact: { display_name: string } | null;
  } | null;
};

function toMatchRow(r: RawMatch): MatchRow {
  const { suggester, property, profile, ...rest } = r;
  return {
    ...rest,
    suggested_by_name: suggester?.full_name ?? null,
    property_number: property?.number ?? null,
    property_name: property?.name ?? null,
    property_status: property?.status ?? null,
    property_service_kind: property?.service_kind ?? null,
    property_price: property?.price ?? null,
    property_rent_price: property?.rent_price ?? null,
    contact_id: profile?.contact_id ?? null,
    contact_name: profile?.contact?.display_name ?? null,
    profile_type: profile?.profile_type ?? null,
  };
}

/** Нэг түлхүүрийн хамгийн сүүлийн мөрийг үлдээнэ (түүх suggested/responded мөрөөр хадгалагдана). */
function latestPerKey(rows: MatchRow[], key: (r: MatchRow) => string): MatchRow[] {
  const seen = new Map<string, MatchRow>();
  for (const r of rows) {
    const k = key(r);
    const prev = seen.get(k);
    // suggested/responded мөр давуу (түүхтэй нь); үгүй бол сүүлд тооцсон нь.
    if (!prev) {
      seen.set(k, r);
    } else if (!prev.suggested_at && (r.suggested_at || r.computed_at > prev.computed_at)) {
      seen.set(k, r);
    }
  }
  return [...seen.values()].sort((a, b) => b.score - a.score);
}

/** Профайлд тохирох объектууд — оноогоор эрэмбэлэгдсэн; таслагдсан нь тусдаа (F-258). */
export async function getMatchesForProfile(profileId: string): Promise<MatchRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_matches")
    .select(MATCH_SELECT)
    .eq("need_profile_id", profileId)
    .order("computed_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("getMatchesForProfile:", error.message);
    return [];
  }
  return latestPerKey(((data ?? []) as unknown as RawMatch[]).map(toMatchRow), (r) => r.property_id);
}

/** Объектод тохирох харилцагчид (урвуу F-254) — оноогоор. */
export async function getMatchesForProperty(propertyId: string): Promise<MatchRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_matches")
    .select(MATCH_SELECT)
    .eq("property_id", propertyId)
    .order("computed_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("getMatchesForProperty:", error.message);
    return [];
  }
  return latestPerKey(((data ?? []) as unknown as RawMatch[]).map(toMatchRow), (r) => r.need_profile_id);
}

/** Харилцагчийн тохируулгын түүх (F-162/256) — санал болгосон/хариу өгсөн мөрүүд. */
export async function getMatchHistory(contactId: string): Promise<MatchRow[]> {
  const supabase = await createClient();
  const { data: profiles, error: pErr } = await supabase
    .from("crm_need_profiles")
    .select("id")
    .eq("contact_id", contactId);
  if (pErr || !profiles?.length) return [];
  const { data, error } = await supabase
    .from("crm_matches")
    .select(MATCH_SELECT)
    .in("need_profile_id", profiles.map((p) => p.id))
    .not("suggested_at", "is", null)
    .order("suggested_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("getMatchHistory:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as RawMatch[]).map(toMatchRow);
}

/** Нэг мөр (үйлдлийн өмнөх шалгалтад). */
export async function getMatch(id: string): Promise<MatchRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("crm_matches").select(MATCH_SELECT).eq("id", id).maybeSingle();
  if (error) {
    console.error("getMatch:", error.message);
    return null;
  }
  return data ? toMatchRow(data as unknown as RawMatch) : null;
}

// ── Дахин тооцооллын цөм (F-253/254/255) ──────────────────

type Admin = SupabaseClient<Database>;

type ProfileRecord = {
  id: string;
  contact_id: string;
  profile_type: string;
  locations: Json;
  property_types: string[];
  budget_min: number | null;
  budget_max: number;
  rooms_min: number | null;
  area_min: number | null;
  timeline: string;
  must_haves: Json;
  nice_to_haves: Json;
  deal_breakers: Json;
  status: string;
};

type PropertyRecord = {
  id: string;
  service_kind: string;
  property_type: string;
  price: number | null;
  rent_price: number | null;
  area_m2: number | null;
  rooms: number | null;
  status: string;
  occupancy: string | null;
  address: Json;
  features: string[];
  match_tags: Json | null;
};

const PROFILE_COLS =
  "id, contact_id, profile_type, locations, property_types, budget_min, budget_max, rooms_min, area_min, " +
  "timeline, must_haves, nice_to_haves, deal_breakers, status";

const PROPERTY_COLS =
  "id, service_kind, property_type, price, rent_price, area_m2, rooms, status, occupancy, address, features, match_tags";

function strArr(v: Json): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function toProfileInput(p: ProfileRecord): MatchProfileInput {
  return {
    profileType: p.profile_type,
    locations: strArr(p.locations),
    propertyTypes: p.property_types ?? [],
    budgetMax: Number(p.budget_max),
    budgetMin: p.budget_min == null ? null : Number(p.budget_min),
    roomsMin: p.rooms_min,
    areaMin: p.area_min == null ? null : Number(p.area_min),
    timeline: p.timeline,
    mustHaves: strArr(p.must_haves),
    niceToHaves: strArr(p.nice_to_haves),
    dealBreakers: strArr(p.deal_breakers),
  };
}

function toPropertyInput(p: PropertyRecord): MatchPropertyInput {
  const address = (p.address ?? {}) as { district?: string; khoroo?: string; complex?: string };
  const tags = (p.match_tags ?? null) as MatchTags | null;
  return {
    serviceKind: p.service_kind,
    propertyType: p.property_type,
    price: p.price == null ? null : Number(p.price),
    rentPrice: p.rent_price == null ? null : Number(p.rent_price),
    rooms: p.rooms,
    areaM2: p.area_m2 == null ? null : Number(p.area_m2),
    status: p.status,
    occupancy: p.occupancy,
    locationTokens: propertyLocationTokens(address, tags),
    featureTokens: propertyFeatureTokens(p.features, tags),
  };
}

export type RecomputeTarget = { profileId: string } | { propertyId: string };

export type StrongMatchInfo = {
  matchId: string;
  profileId: string;
  contactId: string;
  propertyId: string;
  score: number;
  strength: string;
};

export type RecomputeSummary = {
  pairs: number;
  written: number;
  strongMatches: StrongMatchInfo[];
  weightsSettingId: string | null;
};

/**
 * Тохируулгыг дахин тооцно (F-255): идэвхтэй профайл × идэвхтэй объект.
 * Санал болгоогүй/хариугүй хуучин мөрүүдийг цэвэрлэж шинэчилнэ; санал
 * болгосон мөр = түүх, хэвээр үлдэнэ (F-256). admin client шаардана.
 */
export async function recomputeMatchesCore(
  admin: Admin,
  officeId: string,
  target: RecomputeTarget,
  direction: "profile_to_property" | "property_to_profile" = "profile_to_property"
): Promise<RecomputeSummary> {
  // Тохиргооны хүчинтэй хувилбарууд (weights_setting_id-д хадгална — F-250, D4).
  const nowIso = new Date().toISOString();
  const { data: settingRows } = await admin
    .from("crm_settings")
    .select("id, key, value")
    .eq("office_id", officeId)
    .in("key", ["match_weights", "match_thresholds", "adjacent_zones"])
    .lte("valid_from", nowIso)
    .is("valid_to", null)
    .order("valid_from", { ascending: false });
  const settingOf = (key: string) => (settingRows ?? []).find((s) => s.key === key);
  const weightsRow = settingOf("match_weights");
  const weights = normalizeMatchWeights(weightsRow?.value ?? null);
  const thresholds = normalizeMatchThresholds(settingOf("match_thresholds")?.value ?? null);
  const adjacentZones = (settingOf("adjacent_zones")?.value ?? {}) as Record<string, string[]>;

  // Профайл ба объектын багц.
  let profileQuery = admin
    .from("crm_need_profiles")
    .select(PROFILE_COLS)
    .eq("office_id", officeId)
    .eq("status", "active");
  let propertyQuery = admin
    .from("crm_properties")
    .select(PROPERTY_COLS)
    .eq("office_id", officeId)
    .eq("status", "active");

  if ("profileId" in target) {
    profileQuery = admin.from("crm_need_profiles").select(PROFILE_COLS).eq("office_id", officeId).eq("id", target.profileId);
  } else {
    propertyQuery = admin.from("crm_properties").select(PROPERTY_COLS).eq("office_id", officeId).eq("id", target.propertyId);
  }

  const [{ data: profiles, error: pErr }, { data: properties, error: prErr }] = await Promise.all([
    profileQuery.limit(500),
    propertyQuery.limit(500),
  ]);
  if (pErr) throw new Error(`recompute profiles: ${pErr.message}`);
  if (prErr) throw new Error(`recompute properties: ${prErr.message}`);

  const profileRecords = ((profiles ?? []) as unknown as ProfileRecord[]).filter((p) => p.status === "active");
  const propertyRecords = (properties ?? []) as unknown as PropertyRecord[];
  const strongMatches: StrongMatchInfo[] = [];
  let written = 0;

  const contactByProfile = new Map<string, string>();
  const allRows: Database["public"]["Tables"]["crm_matches"]["Insert"][] = [];
  for (const prof of profileRecords) {
    contactByProfile.set(prof.id, prof.contact_id);
    const profileInput = toProfileInput(prof);
    for (const prop of propertyRecords) {
      const res = scoreMatch(profileInput, toPropertyInput(prop), { weights, thresholds, adjacentZones });
      allRows.push({
        office_id: officeId,
        need_profile_id: prof.id,
        property_id: prop.id,
        direction,
        score: res.score,
        breakdown: res.breakdown as unknown as Json,
        strength: res.strength,
        deal_breaker_hit: res.dealBreakerHit,
        deal_breaker_reasons: res.dealBreakerReasons,
        weights_setting_id: weightsRow?.id ?? null,
      });
    }
  }

  if (allRows.length > 0) {
    // Хуучин, санал болгоогүй тооцооллын мөрүүдийг цэвэрлэнэ (санал болгосон/
    // хариу өгсөн мөр = түүх, хэвээр — F-256).
    let del = admin
      .from("crm_matches")
      .delete()
      .eq("office_id", officeId)
      .is("suggested_at", null)
      .is("response", null);
    if ("profileId" in target) {
      del = del.eq("need_profile_id", target.profileId);
    } else {
      del = del.eq("property_id", target.propertyId);
    }
    const { error: delErr } = await del;
    if (delErr) throw new Error(`recompute cleanup: ${delErr.message}`);

    // Багцаар insert (хэмжээ ≤ profiles×properties, нэг тал нь үргэлж 1).
    const chunkSize = 200;
    for (let i = 0; i < allRows.length; i += chunkSize) {
      const chunk = allRows.slice(i, i + chunkSize);
      const { data: inserted, error: insErr } = await admin
        .from("crm_matches")
        .insert(chunk)
        .select("id, need_profile_id, property_id, score, strength, deal_breaker_hit");
      if (insErr) throw new Error(`recompute insert: ${insErr.message}`);
      written += inserted?.length ?? 0;
      for (const m of inserted ?? []) {
        if (m.strength === "strong" && !m.deal_breaker_hit) {
          strongMatches.push({
            matchId: m.id,
            profileId: m.need_profile_id,
            contactId: contactByProfile.get(m.need_profile_id) ?? "",
            propertyId: m.property_id,
            score: Number(m.score),
            strength: m.strength,
          });
        }
      }
    }
  }

  return {
    pairs: profileRecords.length * propertyRecords.length,
    written,
    strongMatches,
    weightsSettingId: weightsRow?.id ?? null,
  };
}
