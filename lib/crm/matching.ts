/**
 * Тохируулгын хөдөлгүүр (F-250–261, §4.4) — цэвэр функц, DB-гүй (unit тестийн бай).
 *
 * Оноо = 6 шалгуур × жин (спекийн 25/25/20/10/15/5 — DEFAULT; бодит утга
 * crm_settings key='match_weights'-ээс ирнэ, кодонд тогтмол утга ЭЦСИЙН ҮНЭН БИШ).
 * Deal breaker = таслах шүүлтүүр: оноонд орохгүй, зөрчсөн объект оноо өндөр ч
 * strong болохгүй, автомат санал болголтод орохгүй (F-252).
 */

export type MatchWeights = {
  location: number; // Байршил
  budget: number; // Төсөв
  type_size: number; // Төрөл, хэмжээ
  timeline: number; // Хугацаа, бэлэн байдал
  must_haves: number; // Заавал байх шаардлага
  nice_to_haves: number; // Бусад хүсэл
};

export const DEFAULT_MATCH_WEIGHTS: MatchWeights = {
  location: 25,
  budget: 25,
  type_size: 20,
  timeline: 10,
  must_haves: 15,
  nice_to_haves: 5,
};

export type MatchThresholds = {
  strong: number; // ≥ → хүчтэй (default 80)
  possible: number; // ≥ → боломжит (default 65)
  adjacent_pct: number; // зэргэлдээ бүсийн хэсэгчилсэн % (default 50)
  budget_overrun_pct: number; // зөвшөөрөгдөх төсвийн хэтрэлт % (default 10)
  size_tolerance_pct: number; // хэмжээний ойролцоо байдлын хүлцэл % (default 20)
  size_partial_pct: number; // хэмжээ ойролцоо үеийн хэсэгчилсэн % (default 50)
};

export const DEFAULT_MATCH_THRESHOLDS: MatchThresholds = {
  strong: 80,
  possible: 65,
  adjacent_pct: 50,
  budget_overrun_pct: 10,
  size_tolerance_pct: 20,
  size_partial_pct: 50,
};

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** crm_settings 'match_weights' утгыг хэвшүүлнэ — танигдахгүй бүтэцтэй бол default. */
export function normalizeMatchWeights(json: unknown): MatchWeights {
  const o = (json ?? {}) as Record<string, unknown>;
  return {
    location: num(o.location, DEFAULT_MATCH_WEIGHTS.location),
    budget: num(o.budget ?? o.price, DEFAULT_MATCH_WEIGHTS.budget),
    type_size: num(o.type_size ?? o.type, DEFAULT_MATCH_WEIGHTS.type_size),
    timeline: num(o.timeline, DEFAULT_MATCH_WEIGHTS.timeline),
    must_haves: num(o.must_haves ?? o.features, DEFAULT_MATCH_WEIGHTS.must_haves),
    nice_to_haves: num(o.nice_to_haves ?? o.extras, DEFAULT_MATCH_WEIGHTS.nice_to_haves),
  };
}

/** crm_settings 'match_thresholds' утгыг хэвшүүлнэ. */
export function normalizeMatchThresholds(json: unknown): MatchThresholds {
  const o = (json ?? {}) as Record<string, unknown>;
  return {
    strong: num(o.strong, DEFAULT_MATCH_THRESHOLDS.strong),
    possible: num(o.possible, DEFAULT_MATCH_THRESHOLDS.possible),
    adjacent_pct: num(o.adjacent_pct, DEFAULT_MATCH_THRESHOLDS.adjacent_pct),
    budget_overrun_pct: num(o.budget_overrun_pct, DEFAULT_MATCH_THRESHOLDS.budget_overrun_pct),
    size_tolerance_pct: num(o.size_tolerance_pct, DEFAULT_MATCH_THRESHOLDS.size_tolerance_pct),
    size_partial_pct: num(o.size_partial_pct, DEFAULT_MATCH_THRESHOLDS.size_partial_pct),
  };
}

// ── Оролтын хэлбэрүүд ─────────────────────────────────────

export type MatchProfileInput = {
  profileType: string; // buyer|tenant|investor|intl_buyer
  locations: string[]; // сонирхсон бүсийн түлхүүрүүд
  propertyTypes: string[]; // apartment|house|…
  budgetMax: number;
  budgetMin?: number | null;
  roomsMin?: number | null;
  areaMin?: number | null;
  timeline: string; // '0_30'|'1_3m'|'3_12m'|'12m_plus'
  mustHaves: string[];
  niceToHaves: string[];
  dealBreakers: string[];
};

export type MatchPropertyInput = {
  serviceKind: string; // sale|standard_rental|managed_rental
  propertyType: string;
  price?: number | null;
  rentPrice?: number | null;
  rooms?: number | null;
  areaM2?: number | null;
  status: string; // draft|active|reserved|…
  occupancy?: string | null; // vacant|occupied|make_ready|notice_given
  locationTokens: string[]; // district/khoroo/complex + match_tags.location
  featureTokens: string[]; // features + match_tags (type/price/goal/special)
};

export type MatchBreakdownItem = {
  key: keyof MatchWeights;
  label: string;
  weight: number;
  earned: number;
  detail: string;
};

export type MatchStrengthValue = "strong" | "possible" | "weak";

export type MatchScoreResult = {
  score: number;
  breakdown: MatchBreakdownItem[];
  dealBreakerHit: boolean;
  dealBreakerReasons: string[];
  strength: MatchStrengthValue;
};

// ── Токен харьцуулалт ─────────────────────────────────────

export function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Хоёр токен «тохирно» — аль нэг нь нөгөөгөө агуулна (богино утгыг хамгаална). */
function tokensOverlap(a: string, b: string): boolean {
  const x = normalizeToken(a);
  const y = normalizeToken(b);
  if (x.length < 2 || y.length < 2) return x === y && x.length > 0;
  return x.includes(y) || y.includes(x);
}

function anyOverlap(needles: string[], haystack: string[]): boolean {
  return needles.some((n) => haystack.some((h) => tokensOverlap(n, h)));
}

function matchedCount(needles: string[], haystack: string[]): number {
  return needles.filter((n) => haystack.some((h) => tokensOverlap(n, h))).length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Гол оноожуулалт ───────────────────────────────────────

export type ScoreMatchOptions = {
  weights?: MatchWeights;
  thresholds?: MatchThresholds;
  /** Зэргэлдээ бүсийн зураглал: локацийн түлхүүр → зэргэлдээ түлхүүрүүд (тохиргоо). */
  adjacentZones?: Record<string, string[]>;
};

/** Түрээсийн профайлд түрээсийн үнэ, бусад нь худалдах үнэ. */
export function relevantPrice(profile: MatchProfileInput, property: MatchPropertyInput): number | null {
  const rentalProfile = profile.profileType === "tenant";
  const rentalProperty = property.serviceKind === "standard_rental" || property.serviceKind === "managed_rental";
  if (rentalProfile || rentalProperty) return property.rentPrice ?? null;
  return property.price ?? null;
}

/**
 * Профайл × объект → оноо + шалгуур бүрийн задаргаа + таслах шүүлтүүр (F-251/252).
 * Бүх жин/босго параметрээр — детерминистик (ижил оролтод ижил гаралт).
 */
export function scoreMatch(
  profile: MatchProfileInput,
  property: MatchPropertyInput,
  options: ScoreMatchOptions = {}
): MatchScoreResult {
  const w = options.weights ?? DEFAULT_MATCH_WEIGHTS;
  const t = options.thresholds ?? DEFAULT_MATCH_THRESHOLDS;
  const adjacency = options.adjacentZones ?? {};
  const breakdown: MatchBreakdownItem[] = [];

  const allPropertyTokens = [...property.locationTokens, ...property.featureTokens, property.propertyType];

  // 1. Байршил (25): сонирхсон бүс = бүтэн; зэргэлдээ = тохируулгат %; бусад = 0.
  let locEarned = 0;
  let locDetail = "Сонирхсон бүсэд тохироогүй";
  if (anyOverlap(profile.locations, property.locationTokens)) {
    locEarned = w.location;
    locDetail = "Сонирхсон бүсэд байна";
  } else {
    const adjacentTokens = profile.locations.flatMap((l) => {
      const key = Object.keys(adjacency).find((k) => tokensOverlap(k, l));
      return key ? adjacency[key] : [];
    });
    if (adjacentTokens.length > 0 && anyOverlap(adjacentTokens, property.locationTokens)) {
      locEarned = (w.location * t.adjacent_pct) / 100;
      locDetail = `Зэргэлдээ бүсэд (${t.adjacent_pct}%)`;
    }
  }
  breakdown.push({ key: "location", label: "Байршил", weight: w.location, earned: round2(locEarned), detail: locDetail });

  // 2. Төсөв (25): дээд төсөвт багтсан = бүтэн; зөвшөөрөгдөх хэтрэлтэд = шатлан буурсан; хэтэрсэн = 0.
  const price = relevantPrice(profile, property);
  let budgetEarned = 0;
  let budgetDetail = "Үнэ бүртгэгдээгүй";
  if (price != null && price > 0 && profile.budgetMax > 0) {
    if (price <= profile.budgetMax) {
      budgetEarned = w.budget;
      budgetDetail = "Төсөвт багтсан";
    } else {
      const overrunPct = ((price - profile.budgetMax) / profile.budgetMax) * 100;
      if (t.budget_overrun_pct > 0 && overrunPct <= t.budget_overrun_pct) {
        budgetEarned = w.budget * (1 - overrunPct / t.budget_overrun_pct);
        budgetDetail = `Төсвөөс ${overrunPct.toFixed(1)}% хэтэрсэн (хүлцэлд)`;
      } else {
        budgetDetail = `Төсвөөс ${overrunPct.toFixed(1)}% хэтэрсэн`;
      }
    }
  }
  breakdown.push({ key: "budget", label: "Төсөв", weight: w.budget, earned: round2(budgetEarned), detail: budgetDetail });

  // 3. Төрөл, хэмжээ (20): төрөл зөрсөн = 0; төрөл + муж = бүтэн; хэмжээ ойролцоо = %.
  let tsEarned = 0;
  let tsDetail = "Үл хөдлөхийн төрөл зөрсөн";
  const typeOk = profile.propertyTypes.some((pt) => normalizeToken(pt) === normalizeToken(property.propertyType));
  if (typeOk) {
    const roomsOk = profile.roomsMin == null || (property.rooms != null && property.rooms >= profile.roomsMin);
    const areaOk = profile.areaMin == null || (property.areaM2 != null && property.areaM2 >= profile.areaMin);
    if (roomsOk && areaOk) {
      tsEarned = w.type_size;
      tsDetail = "Төрөл, хэмжээ тохирсон";
    } else {
      // Дутагдлын хамгийн муу харьцаа (%).
      const shortfalls: number[] = [];
      if (!roomsOk && profile.roomsMin) {
        shortfalls.push(((profile.roomsMin - (property.rooms ?? 0)) / profile.roomsMin) * 100);
      }
      if (!areaOk && profile.areaMin) {
        shortfalls.push(((profile.areaMin - (property.areaM2 ?? 0)) / profile.areaMin) * 100);
      }
      const worst = Math.max(...shortfalls);
      if (t.size_tolerance_pct > 0 && worst <= t.size_tolerance_pct) {
        tsEarned = (w.type_size * t.size_partial_pct) / 100;
        tsDetail = `Төрөл тохирсон, хэмжээ ойролцоо (−${worst.toFixed(0)}%)`;
      } else {
        tsDetail = "Төрөл тохирсон ч хэмжээ хүрэлцэхгүй";
      }
    }
  }
  breakdown.push({ key: "type_size", label: "Төрөл, хэмжээ", weight: w.type_size, earned: round2(tsEarned), detail: tsDetail });

  // 4. Хугацаа, бэлэн байдал (10).
  const ready =
    property.status === "active" &&
    (property.occupancy == null || property.occupancy === "vacant" || property.occupancy === "make_ready");
  const urgent = profile.timeline === "0_30" || profile.timeline === "1_3m";
  let tlEarned = 0;
  let tlDetail = "Объект бэлэн биш";
  if (ready) {
    tlEarned = w.timeline;
    tlDetail = "Бэлэн, хугацаанд тохирно";
  } else if (!urgent) {
    tlEarned = w.timeline * 0.5;
    tlDetail = "Бэлэн биш ч хугацаа уян (50%)";
  }
  breakdown.push({ key: "timeline", label: "Хугацаа, бэлэн байдал", weight: w.timeline, earned: round2(tlEarned), detail: tlDetail });

  // 5. Заавал байх шаардлага (15): хангагдсан тоонд пропорциональ.
  let mhEarned = w.must_haves;
  let mhDetail = "Заавал шаардлага бүртгэгдээгүй";
  if (profile.mustHaves.length > 0) {
    const hit = matchedCount(profile.mustHaves, allPropertyTokens);
    mhEarned = (w.must_haves * hit) / profile.mustHaves.length;
    mhDetail = `${hit}/${profile.mustHaves.length} шаардлага хангагдсан`;
  }
  breakdown.push({ key: "must_haves", label: "Заавал шаардлага", weight: w.must_haves, earned: round2(mhEarned), detail: mhDetail });

  // 6. Бусад хүсэл (5): пропорциональ.
  let nhEarned = w.nice_to_haves;
  let nhDetail = "Нэмэлт хүсэл бүртгэгдээгүй";
  if (profile.niceToHaves.length > 0) {
    const hit = matchedCount(profile.niceToHaves, allPropertyTokens);
    nhEarned = (w.nice_to_haves * hit) / profile.niceToHaves.length;
    nhDetail = `${hit}/${profile.niceToHaves.length} хүсэл хангагдсан`;
  }
  breakdown.push({ key: "nice_to_haves", label: "Бусад хүсэл", weight: w.nice_to_haves, earned: round2(nhEarned), detail: nhDetail });

  // Таслах шүүлтүүр (F-252): зөрчсөн объект оноо өндөр ч strong болохгүй.
  const dealBreakerReasons = profile.dealBreakers.filter((db) => allPropertyTokens.some((tok) => tokensOverlap(db, tok)));
  const dealBreakerHit = dealBreakerReasons.length > 0;

  const score = round2(breakdown.reduce((sum, b) => sum + b.earned, 0));
  const strength: MatchStrengthValue = dealBreakerHit
    ? "weak"
    : score >= t.strong
      ? "strong"
      : score >= t.possible
        ? "possible"
        : "weak";

  return { score, breakdown, dealBreakerHit, dealBreakerReasons, strength };
}

// ── Ангиллаар ялгасан хүргэлт (F-254 4.4.1) ───────────────

export type DeliveryTier = "agent_call" | "personal_message" | "campaign" | "none";

export const DELIVERY_TIER_LABEL: Record<DeliveryTier, string> = {
  agent_call: "Агент биечлэн холбогдоно",
  personal_message: "Хувь хүнд чиглэсэн санал",
  campaign: "Аян/мэдэгдэл",
  none: "Хүргэлтгүй",
};

/**
 * A + хүчтэй → агент биечлэн; B → хувийн зурвас; C → аян; бусад → хүргэлтгүй.
 * Deal breaker зөрчилтэйг дуудагч аль хэдийн хассан байх ёстой (F-252).
 */
export function deliveryTier(grade: string | null | undefined, strength: MatchStrengthValue): DeliveryTier {
  if (strength === "weak") return "none";
  if (grade === "a" && strength === "strong") return "agent_call";
  if (grade === "a" || grade === "b") return "personal_message";
  if (grade === "c") return "campaign";
  return "none";
}

// ── Объектын токенчлол (queries давхаргад хэрэглэнэ) ──────

export type MatchTags = {
  location?: string[] | string;
  type?: string[] | string;
  price?: string[] | string;
  goal?: string[] | string;
  special?: string[] | string;
};

function tagValues(v: string[] | string | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [v];
}

/** crm_properties мөрөөс байршлын токенууд (address + match_tags.location). */
export function propertyLocationTokens(
  address: { district?: string | null; khoroo?: string | null; complex?: string | null } | null,
  matchTags: MatchTags | null
): string[] {
  const out: string[] = [];
  if (address?.district) out.push(address.district);
  if (address?.khoroo) out.push(String(address.khoroo));
  if (address?.complex) out.push(address.complex);
  out.push(...tagValues(matchTags?.location ?? undefined));
  return out.filter((s) => s && s.trim().length > 0);
}

/** crm_properties мөрөөс онцлогийн токенууд (features + бусад match_tags бүлэг). */
export function propertyFeatureTokens(features: string[] | null, matchTags: MatchTags | null): string[] {
  const out = [...(features ?? [])];
  out.push(...tagValues(matchTags?.type ?? undefined));
  out.push(...tagValues(matchTags?.price ?? undefined));
  out.push(...tagValues(matchTags?.goal ?? undefined));
  out.push(...tagValues(matchTags?.special ?? undefined));
  return out.filter((s) => s && s.trim().length > 0);
}
