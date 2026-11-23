/**
 * Платформын бодит статистик (нүүр хуудасны proof strip, дүүргийн хавтан,
 * «Ухаалаг хэрэгслүүд», footer). ЦЭВЭР — next/* импортгүй, vitest mock хэрэггүй.
 * Кэштэй уншигч нь lib/platform-stats.ts.
 */

/** Нийслэлийн хотын 6 дүүрэг (нүүрний хавтан, footer «Дүүргээр»). */
export const CITY_DISTRICTS = ["Хан-Уул", "Сүхбаатар", "Баянгол", "Баянзүрх", "Чингэлтэй", "Сонгинохайрхан"] as const;
/** Алслагдсан 3 дүүрэг (энгийн холбоос; DISTRICTS-д одоогоор ороогүй). */
export const OUTER_DISTRICTS = ["Налайх", "Багануур", "Багахангай"] as const;
export const ALL_DISTRICTS = [...CITY_DISTRICTS, ...OUTER_DISTRICTS] as const;

/** Медиан тооцох доод хэмжээ: түүнээс цөөн зартай дүүрэгт м² үнэ харуулахгүй. */
export const MEDIAN_MIN_N = 5;
/** м² үнийн медиан зөвхөн энэ төрлийн худалдааны зарт (бусад төрөл холивол төөрөгдүүлнэ). */
export const MEDIAN_TYPE = "Орон сууц";

const DAY_MS = 86_400_000;

export type StatsListingRow = {
  district: string | null;
  deal_type: string | null;
  type: string | null;
  price: number | null;
  area: number | string | null;
  created_at: string | null;
};

export type DistrictStat = {
  district: string;
  /** Идэвхтэй бүх зар. */
  count: number;
  /** Медианд орсон орон сууцны худалдааны зар (area > 0). */
  aptSaleCount: number;
  /** Орон сууцны худалдааны зарын м² үнийн медиан (₮/м², зарын үнэ); n < 5 бол null. */
  medianPpm: number | null;
};

export type PlatformStats = {
  districtsWithListings: number;
  verifiedAgents: number;
  partnerOffices: number;
  new7d: number;
  activeListings: number;
  /** 9 дүүрэг CITY + OUTER дарааллаар (заргүй бол count 0). */
  districts: DistrictStat[];
};

/** Тоон массивын медиан (хоосон бол null). Тэгш тоотой бол дундын хоёрын дундаж. */
export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function computePlatformStats(
  rows: readonly StatsListingRow[],
  verifiedAgents: number,
  partnerOffices: number,
  now: number | Date = Date.now()
): PlatformStats {
  const t = now instanceof Date ? now.getTime() : now;
  const since = t - 7 * DAY_MS;
  const counts = new Map<string, number>();
  const ppm = new Map<string, number[]>();
  let new7d = 0;

  for (const r of rows) {
    if (r.created_at) {
      const c = Date.parse(r.created_at);
      if (Number.isFinite(c) && c >= since && c <= t) new7d++;
    }
    const d = r.district?.trim();
    if (!d) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
    const area = Number(r.area);
    const price = Number(r.price);
    if (
      r.deal_type === "sale" &&
      r.type === MEDIAN_TYPE &&
      Number.isFinite(area) &&
      area > 0 &&
      Number.isFinite(price) &&
      price > 0
    ) {
      const list = ppm.get(d) ?? [];
      list.push(price / area);
      ppm.set(d, list);
    }
  }

  const districts: DistrictStat[] = ALL_DISTRICTS.map((district) => {
    const list = ppm.get(district) ?? [];
    return {
      district,
      count: counts.get(district) ?? 0,
      aptSaleCount: list.length,
      medianPpm: list.length >= MEDIAN_MIN_N ? median(list) : null,
    };
  });

  return {
    districtsWithListings: districts.filter((d) => d.count > 0).length,
    verifiedAgents: Math.max(0, verifiedAgents | 0),
    partnerOffices: Math.max(0, partnerOffices | 0),
    new7d,
    activeListings: rows.length,
    districts,
  };
}

/** Дүүргийн хавтангийн дараалал: тоо буурахаар, тэнцвэл CITY_DISTRICTS дараалал. */
export function sortCityTiles(stats: PlatformStats | null): DistrictStat[] {
  const by = new Map((stats?.districts ?? []).map((d) => [d.district, d]));
  return CITY_DISTRICTS.map(
    (district, i) => ({ s: by.get(district) ?? { district, count: 0, aptSaleCount: 0, medianPpm: null }, i })
  )
    .sort((a, b) => b.s.count - a.s.count || a.i - b.i)
    .map((x) => x.s);
}

/** Нийтийн тоо харуулах босго — үүнээс доош бол ЗОРИУДААР нуух (жижиг тоо итгэл бууруулна). */
export const STAT_MIN = { listings: 500, agents: 10, offices: 3 } as const;

/**
 * /about-ийн бодит тоонууд (footer, ProofStrip-тэй ижил босго). Хуурамч/тогтмол
 * тоо ХЭРЭГЛЭХГҮЙ — stats null эсвэл бүгд босгоос доош бол хоосон массив.
 */
export function aboutStatItems(stats: PlatformStats | null): { n: number; label: string }[] {
  if (!stats) return [];
  const items: { n: number; label: string }[] = [];
  if (stats.activeListings >= STAT_MIN.listings) items.push({ n: stats.activeListings, label: "Идэвхтэй зар" });
  if (stats.districtsWithListings > 0) items.push({ n: stats.districtsWithListings, label: "Дүүрэгт зар" });
  if (stats.verifiedAgents >= STAT_MIN.agents) items.push({ n: stats.verifiedAgents, label: "Баталгаажсан агент" });
  if (stats.partnerOffices >= STAT_MIN.offices) items.push({ n: stats.partnerOffices, label: "Хамтрагч оффис" });
  return items;
}
