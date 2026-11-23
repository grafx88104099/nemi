/**
 * Facet тоо — шүүлт → listing_facets / listings_map_search RPC аргумент, JSON → төрөлтэй тоо.
 * ЦЭВЭР, клиентэд аюулгүй (FilterPanel хөтөч дээр шууд дуудна).
 *
 * SQL: supabase/migrations/20261123000800_listing_features_facets.sql.
 *   deal / district / type / rooms → өөрийн бүлгийн шүүлтийг хасч тоолно;
 *   features / flags (AND бүлэг) → одоогийн шүүлт ∩ утга (сонгосон = total).
 */
import { FEATURE_KEYS, type FeatureKey } from "@/lib/listing-features";
import {
  districtList,
  quickChipActive,
  sanitizeDealFlags,
  type FlagKey,
  type ListingFilters,
  type QuickChipId,
  type RawParams,
} from "@/lib/listing-filters";
import { searchPatternGroups } from "@/lib/search/query";

export type FilterRpcArgs = {
  p_deal: string | null;
  p_districts: string[] | null;
  p_type: string | null;
  p_rooms: number | null;
  p_min_price: number | null;
  p_max_price: number | null;
  p_min_area: number | null;
  p_max_area: number | null;
  p_q_groups: string[][] | null;
  p_posted: number | null;
  p_features: FeatureKey[] | null;
  p_new_build: boolean;
  p_adv1: boolean;
  p_no_deposit: boolean;
  p_loan8: boolean;
  p_owner_only: boolean;
};

/** Шүүлт → RPC аргумент (жагсаалттай ижил утга). Дуудахдаа үргэлж compactRpcArgs-аар шахна. */
export function filterRpcArgs(input: ListingFilters): FilterRpcArgs {
  const f = sanitizeDealFlags(input);
  const districts = districtList(f);
  return {
    p_deal: f.deal ?? null,
    p_districts: districts.length ? districts : null,
    p_type: f.type ?? null,
    p_rooms: f.rooms ?? null,
    p_min_price: f.minPrice ?? null,
    p_max_price: f.maxPrice ?? null,
    p_min_area: f.minArea ?? null,
    p_max_area: f.maxArea ?? null,
    p_q_groups: f.q ? searchPatternGroups(f.q) : null,
    p_posted: f.posted ?? null,
    p_features: f.features?.length ? f.features : null,
    p_new_build: !!f.newBuild,
    p_adv1: !!f.adv1,
    p_no_deposit: !!f.noDeposit,
    p_loan8: !!f.loan8,
    p_owner_only: !!f.ownerOnly,
  };
}

/** Маягтын FormData → RawParams (давтагдсан түлхүүрийг getAll-оор; файл орхино). */
/**
 * facets-ийн асуулгын түлхүүр (эрэмбэ/хуудасгүй): хоёр сонголт ижил тоо өгөх эсэхийг
 * харьцуулна — FilterSheet хуучин facets-ээр амьд сонголтын тэг-идэвхгүйг шийдэхгүй.
 */
export function facetQueryKey(f: ListingFilters): string {
  return JSON.stringify(compactRpcArgs(filterRpcArgs(f)));
}

export function formDataParams(fd: FormData): RawParams {
  const out: RawParams = {};
  for (const k of new Set(fd.keys())) {
    out[k] = fd.getAll(k).filter((v): v is string => typeof v === "string");
  }
  return out;
}

type Compact<T> = { [K in keyof T]?: Exclude<T[K], null | undefined | false> };

/**
 * null / undefined / false утгатай түлхүүрийг хасна (0 ба хоосон биш массив үлдэнэ).
 * Шинэ шүүлт сонгоогүй клиентийн дуудлага хуучин RPC гарын үсэгт ч таарна
 * (PostgREST нэрлэсэн аргумент) — deploy-ийн үеийн хамгаалалт.
 */
export function compactRpcArgs<T extends Record<string, unknown>>(args: T): Compact<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (v === null || v === undefined || v === false) continue;
    out[k] = v;
  }
  return out as Compact<T>;
}

export type FacetFlags = Record<FlagKey, number>;

export type ListingFacets = {
  total: number;
  /** «Шинэ барилга»-ын доод он (SQL new_from). */
  newFrom: number;
  deal: Record<string, number>;
  district: Record<string, number>;
  type: Record<string, number>;
  rooms: Record<"1" | "2" | "3" | "4", number>;
  features: Record<FeatureKey, number>;
  flags: FacetFlags;
};

const FLAG_NAMES: readonly FlagKey[] = ["newBuild", "adv1", "noDeposit", "loan8", "ownerOnly"];

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown): number => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const counts = (x: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (isObj(x)) for (const [k, v] of Object.entries(x)) out[k] = num(v);
  return out;
};
function fixed<K extends string>(x: unknown, keys: readonly K[]): Record<K, number> {
  const src = isObj(x) ? x : {};
  return Object.fromEntries(keys.map((k) => [k, num(src[k])])) as Record<K, number>;
}

/** RPC JSON → ListingFacets. Объект биш бол null; дутуу/буруу утга → 0. */
export function parseFacets(json: unknown): ListingFacets | null {
  if (!isObj(json)) return null;
  return {
    total: num(json.total),
    newFrom: num(json.new_from),
    deal: counts(json.deal),
    district: counts(json.district),
    type: counts(json.type),
    rooms: fixed(json.rooms, ["1", "2", "3", "4"] as const),
    features: fixed(json.features, FEATURE_KEYS),
    flags: fixed(json.flags, FLAG_NAMES),
  };
}

const isFlagId = (id: QuickChipId): id is FlagKey => (FLAG_NAMES as readonly string[]).includes(id);

/** Түргэн чипийн тоо. */
export function facetCount(facets: ListingFacets, id: QuickChipId): number {
  return isFlagId(id) ? facets.flags[id] : facets.features[id];
}

/**
 * Түргэн чип харагдах эсэх: adv1/noDeposit худалдаанд, loan8 түрээсэнд нуугдана;
 * тоо 0 бол (сонгоогүй үед) нуугдана; facets байхгүй (RPC алдаа) бол тоогүй харагдана.
 */
export function quickChipVisible(f: ListingFilters, facets: ListingFacets | null, id: QuickChipId): boolean {
  const active = quickChipActive(f, id);
  if (!active) {
    if ((id === "adv1" || id === "noDeposit") && f.deal === "sale") return false;
    if (id === "loan8" && f.deal === "rent") return false;
  }
  if (facets == null) return true;
  return active || facetCount(facets, id) > 0;
}
