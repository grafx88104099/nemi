/**
 * Нийтийн зарын шүүлт — URL ↔ шүүлт ↔ PostgREST асуулга. ЦЭВЭР модуль.
 *
 * ЯАГААД нэг газар вэ: шүүлтийг өмнө нь жагсаалт, хадгалсан хайлтын
 * мэдэгдэл (cron) хоёр тусдаа давхардуулан бичсэн байсан ба зөрсөн —
 * мэдэгдэл Түрээс/Худалдахыг огт тоодоггүй, жагсаалтын маягт `deal`-ийг
 * алддаг байв. Одоо жагсаалт, газрын зураг, мэдэгдэл бүгд эндээс авна.
 *
 * Чөлөөт текст (q) нь гарчгаар биш listings.search_text-ээр (латин→кирилл
 * нугалсан, нийтийн талбараас триггерээр бүтсэн) хайгдана — газрын зургийн
 * listings_map_search(p_q_groups)-тэй ИЖИЛ хэв маяг (lib/search/query.ts).
 *
 * Онцлог (features), туг (newBuild/adv1/noDeposit/loan8/ownerOnly), олон дүүрэг —
 * SQL listing_facets()/listings_map_search() (20261123000800)-тэй ЯГ ижил семантик.
 */
import { DISTRICTS } from "@/lib/constants";
import { fmtPriceShort, ubParts } from "@/lib/format";
import { FEATURE_LABEL, normalizeFeatures, type FeatureKey } from "@/lib/listing-features";
import { likeAnyFilter, searchPatternGroups } from "@/lib/search/query";

export { escapeLike } from "@/lib/search/query";

export type ListingDeal = "sale" | "rent";
export type ListingSort = "new" | "price_asc" | "price_desc" | "ai";

export type ListingFilters = {
  q?: string;
  /** Каноник таслалтай жагсаалт («Хан-Уул,Баянгол»): DISTRICTS-ийн дарааллаар, танихгүй нь араас. */
  district?: string;
  type?: string;
  rooms?: number;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  deal?: ListingDeal;
  /** Сүүлийн N хоногт нийтэлсэн. */
  posted?: number;
  /** Онцлог (бүгд таарах, @>), толийн дарааллаар. */
  features?: FeatureKey[];
  /** Шинэ барилга: ашиглалтад орсон он >= УБ-ын он − 5. */
  newBuild?: boolean;
  /** Түрээс, урьдчилгаа <= 1 сар. */
  adv1?: boolean;
  /** Түрээс, барьцаа 0 сар. */
  noDeposit?: boolean;
  /** 8%-ийн ипотект тохирох (тооцоолол): худалдах орон сууц, үнэ <= LOAN8_MAX_PRICE. */
  loan8?: boolean;
  /** Эзэн өөрөө оруулсан (agent_id IS NULL). */
  ownerOnly?: boolean;
  sort?: ListingSort;
  page?: number;
  pageSize?: number;
};

/**
 * 8%-ийн ипотекийн дээд зээл 250 сая ₮, урьдчилгаа ≥ 30% → үнэ ≤ 250 / 0.7 ≈ 357 сая ₮.
 * SQL (20261123000800)-ийн 357000000-тэй ижил; lib/loans/banks.ts-тэй тестээр тулгана.
 * UI үргэлж «тооцоолол» гэж тэмдэглэнэ.
 */
export const LOAN8_MAX_PRICE = 357_000_000;

/** «Шинэ барилга»-ын доод он (УБ-ын цагаар) — SQL-ийн new_from-той ижил. */
export const newBuildFrom = (now: number = Date.now()) => ubParts(now).y - 5;

export const FLAG_KEYS = ["newBuild", "adv1", "noDeposit", "loan8", "ownerOnly"] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

/** URL-д хадгалагдах шүүлтийн түлхүүрүүд (page, sort-оос бусад). */
export const FILTER_KEYS = [
  "deal",
  "q",
  "district",
  "type",
  "rooms",
  "minPrice",
  "maxPrice",
  "minArea",
  "maxArea",
  "posted",
  "features",
  "newBuild",
  "adv1",
  "noDeposit",
  "loan8",
  "ownerOnly",
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export const SORT_OPTIONS: [ListingSort, string][] = [
  ["new", "Шинэлэг"],
  ["price_asc", "Үнэ: бага → их"],
  ["price_desc", "Үнэ: их → бага"],
  ["ai", "AI оноо"],
];

export const POSTED_OPTIONS: [string, string][] = [
  ["1", "Сүүлийн 24 цаг"],
  ["3", "Сүүлийн 3 хоног"],
  ["7", "Сүүлийн 7 хоног"],
  ["30", "Сүүлийн 30 хоног"],
];

export const DEAL_TABS: [ListingDeal | "", string][] = [
  ["", "Бүгд"],
  ["sale", "Худалдах"],
  ["rent", "Түрээс"],
];

export type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const text = (v: string | string[] | undefined) => {
  const t = first(v)?.trim();
  return t ? t.slice(0, 120) : undefined;
};
/** Эерэг тоо (таслалтай «250,000,000» ч болно); бусад нь орхигдоно. */
const positive = (v: string | string[] | undefined, int = false) => {
  const t = first(v)?.replace(/[\s,]/g, "");
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return int ? Math.floor(n) : n;
};
/** Давтагдсан ба таслалтай утгыг нэг жагсаалт болгоно (хоосныг хасна). */
const list = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : v == null ? [] : [v])
    .flatMap((x) => String(x).split(","))
    .map((x) => x.trim())
    .filter(Boolean);
const flag = (v: string | string[] | undefined) => {
  const t = first(v);
  return t === "1" || t === "true" ? true : undefined;
};

const MAX_DISTRICTS = 9;
const KNOWN_DISTRICTS: readonly string[] = DISTRICTS;

/** Каноник дүүрэг: давхардалгүй, ≤ 9, мэдэгдэх нь DISTRICTS-ийн дарааллаар эхэнд, танихгүй нь оролтын дарааллаар. */
function canonicalDistricts(v: string | string[] | undefined): string | undefined {
  const xs = [...new Set(list(v).map((x) => x.slice(0, 60)))].slice(0, MAX_DISTRICTS);
  if (!xs.length) return undefined;
  const known = KNOWN_DISTRICTS.filter((d) => xs.includes(d));
  const unknown = xs.filter((d) => !KNOWN_DISTRICTS.includes(d));
  return [...known, ...unknown].join(",");
}

/** Шүүлтийн дүүргүүд (хоосон бол []). */
export function districtList(f: Pick<ListingFilters, "district">): string[] {
  return list(f.district);
}

/**
 * deal-тэй зөрчилдөх тугийг хасна: Худалдаа → adv1/noDeposit (түрээсийн нөхцөл) үгүй,
 * Түрээс → loan8 үгүй. Эс бөгөөд applyListingFilters deal_type-д 'sale' БА 'rent'
 * хоёуланг тавьж хуудас үргэлж хоосон (мэдэгдэл хэзээ ч ирэхгүй) болно. FilterPanelForm
 * хэсгүүдийг ижил дүрмээр нуудаг.
 */
export function sanitizeDealFlags(f: ListingFilters): ListingFilters {
  if (f.deal === "sale" && (f.adv1 || f.noDeposit)) return { ...f, adv1: undefined, noDeposit: undefined };
  if (f.deal === "rent" && f.loan8) return { ...f, loan8: undefined };
  return f;
}

/** searchParams → шүүлт. Буруу утгыг чимээгүй орхино (хуудас унахгүй), deal-тэй зөрчилдөх тугийг хасна. */
export function parseListingFilters(sp: RawParams): ListingFilters {
  const deal = first(sp.deal);
  const sort = first(sp.sort);
  const features = normalizeFeatures(list(sp.features));
  return sanitizeDealFlags({
    q: text(sp.q),
    district: canonicalDistricts(sp.district),
    type: text(sp.type),
    rooms: positive(sp.rooms, true),
    minPrice: positive(sp.minPrice),
    maxPrice: positive(sp.maxPrice),
    minArea: positive(sp.minArea),
    maxArea: positive(sp.maxArea),
    deal: deal === "sale" || deal === "rent" ? deal : undefined,
    posted: positive(sp.posted, true),
    features: features.length ? features : undefined,
    newBuild: flag(sp.newBuild),
    adv1: flag(sp.adv1),
    noDeposit: flag(sp.noDeposit),
    loan8: flag(sp.loan8),
    ownerOnly: flag(sp.ownerOnly),
    sort: SORT_OPTIONS.some(([v]) => v === sort) ? (sort as ListingSort) : "new",
    page: positive(sp.page, true) ?? 1,
  });
}

/** Шүүлт → URL параметр. Хуудас ба анхдагч эрэмбийг оруулахгүй; онцлог таслалаар, туг «1». */
export function filtersToParams(f: ListingFilters, opts: { withSort?: boolean } = {}): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = f[k];
    if (v === undefined || v === "" || v === false) continue;
    if (Array.isArray(v)) {
      if (v.length) p.set(k, v.join(","));
    } else p.set(k, v === true ? "1" : String(v));
  }
  if (opts.withSort && f.sort && f.sort !== "new") p.set("sort", f.sort);
  return p;
}

/** base?{шүүлт}, хуудасгүй. */
export function filtersHref(base: string, f: ListingFilters, opts: { withSort?: boolean } = {}): string {
  const qs = filtersToParams(f, opts).toString();
  return qs ? `${base}?${qs}` : base;
}

/** key: FilterKey эсвэл «district:Хан-Уул», «features:parking». Сэлгэх холбоос тул бүгд rel=nofollow. */
export type FilterChip = { key: string; label: string; href: string; nofollow: true };

const fmtArea = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} м²`;

/** Тугийн шүүлтийн нэр. */
export function flagLabel(k: FlagKey, newFrom: number = newBuildFrom()): string {
  switch (k) {
    case "newBuild":
      return `Шинэ барилга (${newFrom}+)`;
    case "adv1":
      return "Урьдчилгаа 1 сар";
    case "noDeposit":
      return "Барьцаагүй";
    case "loan8":
      return "8%-ийн зээлд тохирох (тооцоолол)";
    case "ownerOnly":
      return "Эзэн өөрөө";
  }
}

const isFlag = (k: string): k is FlagKey => (FLAG_KEYS as readonly string[]).includes(k);

/**
 * Идэвхтэй шүүлт бүрийг «чип» болгоно — дарвал зөвхөн тэр шүүлт арилна.
 * Дүүрэг, онцлог бүр тусдаа чип (зөвхөн өөрийн утгаа хасна).
 * Түрээс/Худалдах нь табаар харагддаг тул чип болгохгүй.
 */
export function activeFilterChips(base: string, f: ListingFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  const push = (key: string, label: string, next: ListingFilters) =>
    chips.push({ key, label, href: filtersHref(base, { ...next, page: undefined }, { withSort: true }), nofollow: true });
  const label: Partial<Record<FilterKey, string>> = {
    q: f.q ? `«${f.q}»` : undefined,
    type: f.type,
    rooms: f.rooms ? `${f.rooms}+ өрөө` : undefined,
    minPrice: f.minPrice ? `${fmtPriceShort(f.minPrice)}-аас дээш` : undefined,
    maxPrice: f.maxPrice ? `${fmtPriceShort(f.maxPrice)} хүртэл` : undefined,
    minArea: f.minArea ? `${fmtArea(f.minArea)}-аас дээш` : undefined,
    maxArea: f.maxArea ? `${fmtArea(f.maxArea)} хүртэл` : undefined,
    posted: f.posted ? (POSTED_OPTIONS.find(([v]) => Number(v) === f.posted)?.[1] ?? `Сүүлийн ${f.posted} хоног`) : undefined,
  };
  for (const k of FILTER_KEYS) {
    if (k === "deal") continue;
    if (k === "district") {
      const ds = districtList(f);
      for (const d of ds) {
        const rest = ds.filter((x) => x !== d);
        push(`district:${d}`, d, { ...f, district: rest.length ? rest.join(",") : undefined });
      }
    } else if (k === "features") {
      const fs = f.features ?? [];
      for (const key of fs) {
        const rest = fs.filter((x) => x !== key);
        push(`features:${key}`, FEATURE_LABEL[key], { ...f, features: rest.length ? rest : undefined });
      }
    } else if (isFlag(k)) {
      if (f[k]) push(k, flagLabel(k), { ...f, [k]: undefined });
    } else {
      const l = label[k];
      if (l) push(k, l, { ...f, [k]: undefined });
    }
  }
  return chips;
}

/**
 * «Шүүлтүүр (N)»-ийн N: дүүрэг бүр, төрөл, өрөө, үнэ (муж = 1), талбай (муж = 1),
 * хугацаа, онцлог бүр, туг бүр. deal, q, sort тоологдохгүй.
 */
export function activeFilterCount(f: ListingFilters): number {
  let n = districtList(f).length;
  if (f.type) n++;
  if (f.rooms) n++;
  if (f.minPrice || f.maxPrice) n++;
  if (f.minArea || f.maxArea) n++;
  if (f.posted) n++;
  n += f.features?.length ?? 0;
  for (const k of FLAG_KEYS) if (f[k]) n++;
  return n;
}

// ── Түргэн шүүлтийн чип ─────────────────────────────────────────────────────
export const QUICK_CHIPS = [
  "furnished",
  "parking",
  "newBuild",
  "loan8",
  "adv1",
  "elevator",
  "noDeposit",
  "ownerOnly",
] as const;
export type QuickChipId = (typeof QUICK_CHIPS)[number];

export function quickChipActive(f: ListingFilters, id: QuickChipId): boolean {
  return isFlag(id) ? !!f[id] : (f.features ?? []).includes(id);
}

/** Чипийг сэлгэнэ: бусад шүүлт хэвээр, хуудас хасагдана. */
export function toggleQuickChip(f: ListingFilters, id: QuickChipId): ListingFilters {
  const on = quickChipActive(f, id);
  if (isFlag(id)) return { ...f, [id]: on ? undefined : true, page: undefined };
  const cur = f.features ?? [];
  const next = normalizeFeatures(on ? cur.filter((x) => x !== id) : [...cur, id]);
  return { ...f, features: next.length ? next : undefined, page: undefined };
}

/** Түргэн чипийн нэр (loan8-ийн «тооцоолол» дагаварыг QuickFilterChips тусад нь харуулна). */
export function quickChipLabel(id: QuickChipId, newFrom: number = newBuildFrom()): string {
  if (id === "loan8") return "8%-ийн зээлд тохирох";
  return isFlag(id) ? flagLabel(id, newFrom) : FEATURE_LABEL[id];
}

/** Шүүлтийг хүлээж авах асуулгын хамгийн бага хэлбэр (PostgREST builder). */
export interface FilterableQuery<T> {
  eq(column: string, value: unknown): T;
  gte(column: string, value: unknown): T;
  lte(column: string, value: unknown): T;
  like(column: string, pattern: string): T;
  or(filters: string): T;
  in(column: string, values: readonly unknown[]): T;
  contains(column: string, value: readonly string[]): T;
  is(column: string, value: null): T;
}

/**
 * Шүүлтийг асуулгад хэрэглэнэ (төлөв, эрэмбэ, хуудаслалтыг дуудагч өөрөө).
 * `posted`-ийг алгасах (мэдэгдэл өөрийн хугацаагаар шүүдэг) бол ignorePosted.
 */
export function applyListingFilters<T extends FilterableQuery<T>>(
  query: T,
  f: ListingFilters,
  opts: { now?: number; ignorePosted?: boolean } = {}
): T {
  // Хадгалсан хайлт зэрэг parse-аар ороогүй объектод ч зөрчилтэй туг хоосон үр дүн өгөхгүй.
  f = sanitizeDealFlags(f);
  let q = query;
  // Үг бүр (AND) тусдаа параметр болно — PostgREST давтагдсан or= ба баганын
  // шүүлтийг AND-аар нэгтгэдэг. Зөвхөн дүүргэгч үгтэй q текст шүүлт нэмэхгүй.
  if (f.q) {
    for (const g of searchPatternGroups(f.q)) {
      q = g.length === 1 ? q.like("search_text", g[0]) : q.or(likeAnyFilter("search_text", g));
    }
  }
  // deal_type-ийг утга тус бүрд нэг л удаа (adv1/noDeposit → rent, loan8 → sale).
  const deals = new Set<ListingDeal>();
  const deal = (d: ListingDeal) => {
    if (!deals.has(d)) q = q.eq("deal_type", d);
    deals.add(d);
  };
  if (f.deal) deal(f.deal);
  const districts = districtList(f);
  if (districts.length > 1) q = q.in("district", districts);
  else if (districts.length === 1) q = q.eq("district", districts[0]);
  if (f.type) q = q.eq("type", f.type);
  if (f.rooms) q = q.gte("rooms", f.rooms);
  if (f.minPrice) q = q.gte("price", f.minPrice);
  if (f.maxPrice) q = q.lte("price", f.maxPrice);
  if (f.minArea) q = q.gte("area", f.minArea);
  if (f.maxArea) q = q.lte("area", f.maxArea);
  if (f.posted && !opts.ignorePosted) {
    const cutoff = new Date((opts.now ?? Date.now()) - f.posted * 86_400_000).toISOString();
    q = q.gte("created_at", cutoff);
  }
  if (f.features?.length) q = q.contains("features", f.features);
  // null он хэзээ ч таарахгүй (SQL coalesce(year >= …, false)-тэй ижил).
  if (f.newBuild) q = q.gte("year", newBuildFrom(opts.now));
  if (f.adv1) {
    deal("rent");
    q = q.lte("rent_advance_months", 1);
  }
  if (f.noDeposit) {
    deal("rent");
    q = q.eq("rent_deposit_months", 0);
  }
  if (f.loan8) {
    deal("sale");
    if (f.type !== "Орон сууц") q = q.eq("type", "Орон сууц");
    q = q.lte("price", LOAN8_MAX_PRICE);
  }
  if (f.ownerOnly) q = q.is("agent_id", null);
  return q;
}
