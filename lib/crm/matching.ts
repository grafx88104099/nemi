/**
 * Үл хөдлөхийн тохируулгын хөдөлгүүр (PRO-001 v2.1 §6.9, §6.10) — цэвэр
 * функц, DB-гүй (unit тестийн бай).
 *
 * Оноо = 6 шалгуур × жин (§6.9: 25/25/20/10/15/5 — DEFAULT; бодит утга
 * crm_settings key='match_weights'-ээс ирнэ, кодонд тогтмол утга ЭЦСИЙН ҮНЭН БИШ).
 *  • Худалдан авах профайлд зөвхөн худалдах, түрээслэгчид зөвхөн түрээсийн
 *    үл хөдлөх тохирно (isServiceCompatible) — хольж тохируулахгүй.
 *  • Төсөв: дээд төсөвт багтсан, эсвэл харилцагч зөвшөөрсөн хэтрэлтийн дээд
 *    дүнд багтсан бол бүтэн оноо; зөвшөөрөлгүй хэтрэлт 0.
 *  • Хэлцэл таслах нөхцөл: оноонд орохгүй, зөрчсөн үл хөдлөх оноо өндөр ч
 *    хүчтэй тохироо болохгүй, автомат санал болголтод орохгүй.
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
  /**
   * @deprecated §6.9: хэтрэлтийг зөвхөн харилцагч зөвшөөрсөн үед (профайлын
   * budget_overrun_approved/max) тооцно — энэ хүлцэл оноонд ашиглагдахгүй.
   */
  budget_overrun_pct: number;
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
  /** §6.9: дээд төсвөөс хэтрэхийг харилцагч зөвшөөрсөн эсэх, зөвшөөрсөн дээд дүн. */
  budgetOverrunApproved?: boolean | null;
  budgetOverrunMax?: number | null;
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
  /** Худалдаа/түрээсийн төрөл профайлтай таарсан эсэх (false бол тохироо биш). */
  compatible: boolean;
};

// ── Худалдаа / түрээсийн нийцэл (§6.9 Төсөв, Төрөл) ───────

const RENTAL_SERVICE_KINDS = ["standard_rental", "managed_rental"];

export function isRentalService(serviceKind: string): boolean {
  return RENTAL_SERVICE_KINDS.includes(serviceKind);
}

/**
 * Профайлын төрөл × үйлчилгээний төрөл: түрээслэгч ↔ түрээс, худалдан
 * авагч / хөрөнгө оруулагч / гадаадын худалдан авагч ↔ худалдах.
 */
export function isServiceCompatible(profileType: string, serviceKind: string): boolean {
  return profileType === "tenant" ? isRentalService(serviceKind) : serviceKind === "sale";
}

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

/**
 * Профайлд хамаарах үнэ: түрээслэгчид түрээсийн үнэ, бусдад худалдах үнэ.
 * Нийцэхгүй хослолд (худалдан авагч × түрээс) null — оноо өгөхгүй.
 */
export function relevantPrice(profile: MatchProfileInput, property: MatchPropertyInput): number | null {
  if (!isServiceCompatible(profile.profileType, property.serviceKind)) return null;
  if (profile.profileType === "tenant") return property.rentPrice ?? null;
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

  if (!isServiceCompatible(profile.profileType, property.serviceKind)) {
    const detail =
      profile.profileType === "tenant"
        ? "Түрээслэгчид худалдах үл хөдлөх тохирохгүй"
        : "Худалдан авагчид түрээсийн үл хөдлөх тохирохгүй";
    const items: [keyof MatchWeights, string][] = [
      ["location", "Байршил"],
      ["budget", "Төсөв"],
      ["type_size", "Төрөл, хэмжээ"],
      ["timeline", "Хугацаа, бэлэн байдал"],
      ["must_haves", "Заавал шаардлага"],
      ["nice_to_haves", "Бусад хүсэл"],
    ];
    return {
      score: 0,
      breakdown: items.map(([key, label]) => ({ key, label, weight: w[key], earned: 0, detail })),
      dealBreakerHit: false,
      dealBreakerReasons: [],
      strength: "weak",
      compatible: false,
    };
  }

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

  // 2. Төсөв (25): дээд төсөвт багтсан, эсвэл харилцагч зөвшөөрсөн хэтрэлтийн
  //    дээд дүнд багтсан = бүтэн; зөвшөөрөлгүй хэтрэлт = 0 (§6.9).
  const price = relevantPrice(profile, property);
  let budgetEarned = 0;
  let budgetDetail = "Үнэ бүртгэгдээгүй";
  if (price != null && price > 0 && profile.budgetMax > 0) {
    const overrunPct = ((price - profile.budgetMax) / profile.budgetMax) * 100;
    const approvedMax =
      profile.budgetOverrunApproved && profile.budgetOverrunMax != null ? Number(profile.budgetOverrunMax) : null;
    if (price <= profile.budgetMax) {
      budgetEarned = w.budget;
      budgetDetail = "Төсөвт багтсан";
    } else if (approvedMax != null && price <= approvedMax) {
      budgetEarned = w.budget;
      budgetDetail = `Төсвөөс ${overrunPct.toFixed(1)}% хэтэрсэн — харилцагч зөвшөөрсөн хэмжээнд`;
    } else {
      budgetDetail =
        approvedMax != null
          ? `Харилцагчийн зөвшөөрсөн дээд дүнгээс хэтэрсэн (${overrunPct.toFixed(1)}%)`
          : `Төсвөөс ${overrunPct.toFixed(1)}% хэтэрсэн — харилцагч зөвшөөрөөгүй`;
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

  // Хэлцэл таслах нөхцөл: зөрчсөн үл хөдлөх оноо өндөр ч хүчтэй тохироо болохгүй.
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

  return { score, breakdown, dealBreakerHit, dealBreakerReasons, strength, compatible: true };
}

// ── Ангиллаар ялгасан хүргэлт (§6.10.4–6) ─────────────────

export type DeliveryTier = "agent_call" | "personal_message" | "campaign" | "none";

export const DELIVERY_TIER_LABEL: Record<DeliveryTier, string> = {
  agent_call: "Агент биечлэн утсаар, чатаар санал болгоно",
  personal_message: "Хувь хүнд чиглэсэн зурвас илгээнэ",
  campaign: "Аян, мэдэгдлийн хэлбэрээр",
  none: "Агентын тайлбартайгаар л санал болгоно",
};

/** Жагсаалтын бүлгийн гарчиг (§6.10.4–6). */
export const DELIVERY_TIER_GROUP: Record<DeliveryTier, string> = {
  agent_call: "Халуун, хүчтэй тохироо — эхэлж биечлэн",
  personal_message: "Дулаан — хувийн зурвас",
  campaign: "Ургуулах — аян, мэдэгдэл",
  none: "Бусад",
};

export const DELIVERY_TIER_ORDER: DeliveryTier[] = ["agent_call", "personal_message", "campaign", "none"];

/**
 * A + хүчтэй → агент биечлэн; A/B → хувийн зурвас; C → аян; бусад → хүргэлтгүй.
 * Хэлцэл таслах нөхцөл зөрчсөнийг дуудагч аль хэдийн хассан байх ёстой.
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
  size?: string[] | string;
  condition?: string[] | string;
  goal?: string[] | string;
  special?: string[] | string;
};

/** §6.10.2: листингийн шошгын бүлгүүд — бүс, үнэ, төрөл, хэмжээ, нөхцөл байдал, гол онцлог. */
export const PROPERTY_TAG_GROUPS = ["location", "price", "type", "size", "condition", "goal", "special"] as const;
export type PropertyTagGroup = (typeof PROPERTY_TAG_GROUPS)[number];
export const PROPERTY_TAG_GROUP_LABEL: Record<PropertyTagGroup, string> = {
  location: "Бүс",
  price: "Үнэ",
  type: "Төрөл",
  size: "Хэмжээ",
  condition: "Нөхцөл байдал",
  goal: "Зорилго",
  special: "Гол онцлог",
};

/** match_tags jsonb → бүлэг бүрийн цэвэр жагсаалт (давхардалгүй, хоосон утгагүй). */
export function normalizePropertyTags(raw: unknown): Record<PropertyTagGroup, string[]> {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out = {} as Record<PropertyTagGroup, string[]>;
  for (const g of PROPERTY_TAG_GROUPS) {
    const v = o[g];
    const arr = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
    out[g] = [
      ...new Set(
        arr
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean)
      ),
    ];
  }
  return out;
}

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
  out.push(...tagValues(matchTags?.size ?? undefined));
  out.push(...tagValues(matchTags?.condition ?? undefined));
  out.push(...tagValues(matchTags?.goal ?? undefined));
  out.push(...tagValues(matchTags?.special ?? undefined));
  return out.filter((s) => s && s.trim().length > 0);
}

// ── Хувь хүнд чиглэсэн зурвас (§6.10.5) ───────────────────

export type MatchMessageInput = {
  contactName: string | null;
  propertyName: string;
  serviceKind: string;
  propertyType?: string | null;
  price?: number | null;
  rentPrice?: number | null;
  rooms?: number | null;
  areaM2?: number | null;
  district?: string | null;
  /** Үл хөдлөхийн нийтийн зарын холбоос (нийтлэгдсэн бол). */
  url?: string | null;
  agentName?: string | null;
};

function fmtMoney(n: number): string {
  return `${Math.round(n).toLocaleString("en-US").replace(/,/g, " ")}₮`;
}

/**
 * Зурвасын загвар — агент засаад Messenger, SMS, цахим шуудангаар өөрөө
 * илгээнэ (автомат илгээлт биш). Хувийн мэдээлэл зөвхөн харилцагчийн нэр.
 */
export function buildMatchMessage(m: MatchMessageInput): string {
  const greeting = m.contactName ? `Сайн байна уу, ${m.contactName.split(" ")[0]}!` : "Сайн байна уу!";
  const rental = isRentalService(m.serviceKind);
  const facts: string[] = [];
  if (m.district) facts.push(m.district);
  if (m.rooms) facts.push(`${m.rooms} өрөө`);
  if (m.areaM2) facts.push(`${m.areaM2} м²`);
  const price = rental ? m.rentPrice : m.price;
  if (price != null && price > 0) facts.push(rental ? `сарын ${fmtMoney(price)}` : fmtMoney(price));
  const lines = [
    greeting,
    `Таны хайж буй шаардлагад тохирох ${rental ? "түрээсийн" : "худалдах"} үл хөдлөх гарлаа: ${m.propertyName}${
      facts.length ? ` (${facts.join(", ")})` : ""
    }.`,
  ];
  if (m.url) lines.push(`Дэлгэрэнгүй: ${m.url}`);
  lines.push("Үзэх боломжтой цагаа хэлбэл үзлэг товлоё.");
  if (m.agentName) lines.push(`— ${m.agentName}`);
  return lines.join("\n");
}
