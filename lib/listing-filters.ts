/**
 * Нийтийн зарын шүүлт — URL ↔ шүүлт ↔ PostgREST асуулга. ЦЭВЭР модуль.
 *
 * ЯАГААД нэг газар вэ: шүүлтийг өмнө нь жагсаалт, хадгалсан хайлтын
 * мэдэгдэл (cron) хоёр тусдаа давхардуулан бичсэн байсан ба зөрсөн —
 * мэдэгдэл Түрээс/Худалдахыг огт тоодоггүй, жагсаалтын маягт `deal`-ийг
 * алддаг байв. Одоо жагсаалт, газрын зураг, мэдэгдэл бүгд эндээс авна.
 */
import { shortMNT } from "@/lib/format";

export type ListingDeal = "sale" | "rent";
export type ListingSort = "new" | "price_asc" | "price_desc" | "ai";

export type ListingFilters = {
  q?: string;
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
  sort?: ListingSort;
  page?: number;
  pageSize?: number;
};

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

type RawParams = Record<string, string | string[] | undefined>;

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

/** searchParams → шүүлт. Буруу утгыг чимээгүй орхино (хуудас унахгүй). */
export function parseListingFilters(sp: RawParams): ListingFilters {
  const deal = first(sp.deal);
  const sort = first(sp.sort);
  return {
    q: text(sp.q),
    district: text(sp.district),
    type: text(sp.type),
    rooms: positive(sp.rooms, true),
    minPrice: positive(sp.minPrice),
    maxPrice: positive(sp.maxPrice),
    minArea: positive(sp.minArea),
    maxArea: positive(sp.maxArea),
    deal: deal === "sale" || deal === "rent" ? deal : undefined,
    posted: positive(sp.posted, true),
    sort: SORT_OPTIONS.some(([v]) => v === sort) ? (sort as ListingSort) : "new",
    page: positive(sp.page, true) ?? 1,
  };
}

/** Шүүлт → URL параметр. Хуудас ба анхдагч эрэмбийг оруулахгүй. */
export function filtersToParams(f: ListingFilters, opts: { withSort?: boolean } = {}): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = f[k];
    if (v !== undefined && v !== "") p.set(k, String(v));
  }
  if (opts.withSort && f.sort && f.sort !== "new") p.set("sort", f.sort);
  return p;
}

/** base?{шүүлт}, хуудасгүй. */
export function filtersHref(base: string, f: ListingFilters, opts: { withSort?: boolean } = {}): string {
  const qs = filtersToParams(f, opts).toString();
  return qs ? `${base}?${qs}` : base;
}

export type FilterChip = { key: FilterKey; label: string; href: string };

const fmtArea = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} м²`;

/**
 * Идэвхтэй шүүлт бүрийг «чип» болгоно — дарвал зөвхөн тэр шүүлт арилна.
 * Түрээс/Худалдах нь табаар харагддаг тул чип болгохгүй.
 */
export function activeFilterChips(base: string, f: ListingFilters): FilterChip[] {
  const label: Partial<Record<FilterKey, string>> = {
    q: f.q ? `«${f.q}»` : undefined,
    district: f.district,
    type: f.type,
    rooms: f.rooms ? `${f.rooms}+ өрөө` : undefined,
    minPrice: f.minPrice ? `${shortMNT(f.minPrice)}-аас дээш` : undefined,
    maxPrice: f.maxPrice ? `${shortMNT(f.maxPrice)} хүртэл` : undefined,
    minArea: f.minArea ? `${fmtArea(f.minArea)}-аас дээш` : undefined,
    maxArea: f.maxArea ? `${fmtArea(f.maxArea)} хүртэл` : undefined,
    posted: f.posted ? (POSTED_OPTIONS.find(([v]) => Number(v) === f.posted)?.[1] ?? `Сүүлийн ${f.posted} хоног`) : undefined,
  };
  const chips: FilterChip[] = [];
  for (const k of FILTER_KEYS) {
    const l = label[k];
    if (k === "deal" || !l) continue;
    chips.push({ key: k, label: l, href: filtersHref(base, { ...f, [k]: undefined }, { withSort: true }) });
  }
  return chips;
}

/** ILIKE-ийн % _ \ тэмдгийг үсэг болгоно («50%» гэж хайхад бүгдийг олохгүй). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Шүүлтийг хүлээж авах асуулгын хамгийн бага хэлбэр (PostgREST builder). */
export interface FilterableQuery<T> {
  eq(column: string, value: unknown): T;
  gte(column: string, value: unknown): T;
  lte(column: string, value: unknown): T;
  ilike(column: string, pattern: string): T;
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
  let q = query;
  if (f.q) q = q.ilike("title", `%${escapeLike(f.q)}%`);
  if (f.deal) q = q.eq("deal_type", f.deal);
  if (f.district) q = q.eq("district", f.district);
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
  return q;
}
