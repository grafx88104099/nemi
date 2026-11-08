/**
 * Сэжимийн 100 онооны загвар (PRO-001 v2.1 §6.6), оноо→ангилал (§6.5),
 * хэрэгцээний профайлын бүрэн байдал (§6.7), эргэн холбогдох давтамжийн
 * санал (§6.5) ба сэжим хуваарилалтын цэвэр логик (Д-01).
 * Бүгд цэвэр функц — DB-гүй, unit тестийн бай.
 *
 * Жин, коэффициент, босго кодонд хатуу бичигдэхгүй — crm_settings-ээс ирнэ
 * (lead_score_weights, lead_score_factors, lead_grade_thresholds,
 * recontact_ranges). Эндхийн DEFAULT-ууд зөвхөн fallback (seed/migration-тай ижил).
 */

import type { LeadGrade } from "@/lib/constants-crm";

// ── Оноо (§6.6) ───────────────────────────────────────────

/** crm_settings key='lead_score_weights' — §6.6: 20/25/20/15/10/10 = 100. */
export type ScoreWeights = {
  /** Хэрэгцээ тодорхой */
  need_clarity: number;
  /** Төсөв, санхүүжилт бодитой */
  budget_financing: number;
  /** Худалдан авах буюу түрээслэх хугацаа */
  timeline: number;
  /** Шийдвэр гаргагч оролцсон */
  decision_maker: number;
  /** Идэвх, хариу үйлдэл */
  engagement: number;
  /** Үл хөдлөхийн тохируулгад бэлэн байдал */
  match_readiness: number;
};

export const SCORE_CRITERIA = [
  "need_clarity",
  "budget_financing",
  "timeline",
  "decision_maker",
  "engagement",
  "match_readiness",
] as const satisfies readonly (keyof ScoreWeights)[];

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  need_clarity: 20,
  budget_financing: 25,
  timeline: 20,
  decision_maker: 15,
  engagement: 10,
  match_readiness: 10,
};

/**
 * Тохиргооноос ирсэн жинг баталгаажуулна: шинэ 6 түлхүүр бүгд тоо биш бол
 * (жишээ нь хуучин загварын хувилбар) анхдагчийг буцаана.
 */
export function normalizeScoreWeights(raw: unknown): ScoreWeights {
  if (!raw || typeof raw !== "object") return DEFAULT_SCORE_WEIGHTS;
  const r = raw as Record<string, unknown>;
  const ok = SCORE_CRITERIA.every((k) => typeof r[k] === "number" && Number.isFinite(r[k] as number) && (r[k] as number) >= 0);
  if (!ok) return DEFAULT_SCORE_WEIGHTS;
  return Object.fromEntries(SCORE_CRITERIA.map((k) => [k, r[k] as number])) as ScoreWeights;
}

/** Жингийн нийлбэр (тохиргооны маягтын шалгалтад — §6.6 НИЙТ 100). */
export function scoreWeightsTotal(w: ScoreWeights): number {
  return SCORE_CRITERIA.reduce((a, k) => a + w[k], 0);
}

/** crm_settings key='lead_grade_thresholds' — §6.6 жишиг босго 80/60/40. */
export type GradeThresholds = { a: number; b: number; c: number };
export const DEFAULT_GRADE_THRESHOLDS: GradeThresholds = { a: 80, b: 60, c: 40 };

/** crm_settings key='lead_score_factors' — шалгуур бүрийн 0..1 коэффициентийн дүрэм. */
export type ScoreFactors = {
  timeline: Record<string, number>;
  financing: Record<string, number>;
  budget: { max_and_target: number; max_only: number };
  budget_financing_split: { budget: number; financing: number };
  engagement: { full_activity_count: number; fresh_days: number; stale_days: number };
  decision_maker: { involved: number; known: number };
  /** §6.7 «3–5 шийдвэрлэх шаардлага» — доод тоо. */
  must_haves_min: number;
};

export const DEFAULT_SCORE_FACTORS: ScoreFactors = {
  timeline: { "0_30": 1, "1_3m": 0.75, "3_12m": 0.4, "12m_plus": 0.15 },
  financing: { cash: 1, mixed: 0.8, loan: 0.6, not_ready: 0.1 },
  budget: { max_and_target: 1, max_only: 0.6 },
  budget_financing_split: { budget: 0.5, financing: 0.5 },
  engagement: { full_activity_count: 8, fresh_days: 3, stale_days: 30 },
  decision_maker: { involved: 1, known: 0.5 },
  must_haves_min: 3,
};

/** Тохиргооны хэсэгчилсэн утгыг анхдагчтай нийлүүлнэ. */
export function normalizeScoreFactors(raw: unknown): ScoreFactors {
  if (!raw || typeof raw !== "object") return DEFAULT_SCORE_FACTORS;
  const r = raw as Partial<ScoreFactors>;
  const d = DEFAULT_SCORE_FACTORS;
  const pos = (v: unknown, fb: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fb);
  return {
    timeline: { ...d.timeline, ...(r.timeline ?? {}) },
    financing: { ...d.financing, ...(r.financing ?? {}) },
    budget: { ...d.budget, ...(r.budget ?? {}) },
    budget_financing_split: { ...d.budget_financing_split, ...(r.budget_financing_split ?? {}) },
    engagement: { ...d.engagement, ...(r.engagement ?? {}) },
    decision_maker: { ...d.decision_maker, ...(r.decision_maker ?? {}) },
    must_haves_min: pos(r.must_haves_min, d.must_haves_min),
  };
}

export type LeadScoreInput = {
  /** Хэрэгцээний профайл (байвал хэрэгцээ, шийдвэр гаргагч, тохируулгын бэлэн байдлыг эндээс). */
  profile?: NeedProfileSnapshot | null;
  /** Төсөв: дээд заавал, зорилтот нэмэлт (profile дамжуулбал түүнийхийг давуу үзнэ). */
  budgetMax?: number | null;
  budgetTarget?: number | null;
  /** Санхүүжилт: cash|loan|mixed|not_ready. */
  financing?: string | null;
  /** Хугацаа: 0_30|1_3m|3_12m|12m_plus. */
  timeline?: string | null;
  /** Шийдвэр гаргагч тодорхой эсэх / оролцсон эсэх (profile-гүй үед). */
  decisionMakerKnown?: boolean | null;
  decisionMakerInvolved?: boolean | null;
  /** Сүүлийн 30 хоногийн үйл ажиллагааны тоо. */
  activityCount30d?: number;
  /** Сүүлийн холболтоос хойшхи хоног (null = холболт огт байхгүй). */
  lastContactDays?: number | null;
  /** Профайлын бүрэн байдал % — profile дамжуулаагүй үед хэрэгцээ/тохируулгын fallback. */
  completenessPct?: number | null;
  /**
   * @deprecated §6.6-д эх сурвалжийн чанарын шалгуур байхгүй — оноонд орохгүй.
   * Хуучин дуудагчийн нийцлийн төлөө л үлдсэн.
   */
  sourceQuality?: number | null;
};

export type ScoreBreakdown = Record<keyof ScoreWeights, number>;

export type LeadScoreResult = {
  /** 0–100, 1 орны нарийвчлалтай. */
  score: number;
  /** Шалгуур бүрийн авсан оноо (жингээр үржсэн). */
  breakdown: ScoreBreakdown;
};

/**
 * @deprecated v2.1 загварт ашиглагдахгүй (§6.6-д эх сурвалжийн шалгуур алга).
 * lib/actions/crm-leads.ts-ийн импорт эвдрэхгүйн тулд л үлдсэн.
 */
export const SOURCE_QUALITY: Record<string, number> = { other: 0 };

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function filled(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return Number.isFinite(v) && v > 0;
  return true;
}

function count(v: unknown[] | null | undefined): number {
  return Array.isArray(v) ? v.length : 0;
}

/** Нэг шалгуурын 0..1 коэффициентүүд. */
export function scoreFactors(
  input: LeadScoreInput,
  factors: ScoreFactors = DEFAULT_SCORE_FACTORS
): Record<keyof ScoreWeights, number> {
  const p = input.profile ?? null;
  const budgetMax = p ? p.budgetMax : input.budgetMax;
  const budgetTarget = p ? p.budgetTarget : input.budgetTarget;
  const financing = p ? p.financing : input.financing;
  const timelineCode = p ? p.timeline : input.timeline;
  const mustMin = factors.must_haves_min;
  const fallbackPct = clamp01((input.completenessPct ?? 0) / 100);

  // Хэрэгцээ тодорхой: зорилго, төрөл, хэмжээ, шийдвэрлэх шаардлага, байршил.
  const need_clarity = p
    ? (Number(filled(p.goalId)) +
        Number(filled(p.propertyTypes)) +
        Number(filled(p.roomsMin) || filled(p.areaMin)) +
        Math.min(count(p.mustHaves), mustMin) / mustMin +
        Number(filled(p.locations))) /
      5
    : fallbackPct;

  // Төсөв, санхүүжилт бодитой.
  const budgetPart =
    budgetMax != null && budgetMax > 0
      ? budgetTarget != null && budgetTarget > 0
        ? factors.budget.max_and_target
        : factors.budget.max_only
      : 0;
  const financingPart = financing ? (factors.financing[financing] ?? 0) : 0;
  const split = factors.budget_financing_split;
  const budget_financing = clamp01(budgetPart * split.budget + financingPart * split.financing);

  const timeline = timelineCode ? clamp01(factors.timeline[timelineCode] ?? 0) : 0;

  // Шийдвэр гаргагч: оролцсон → бүрэн; зөвхөн тодорхой → хэсэгчилсэн.
  const dmInvolved = p ? p.decisionMakerInvolved === true : input.decisionMakerInvolved === true;
  const dmKnown = p ? filled(p.decisionMakerId) || filled(p.decisionMaker) : input.decisionMakerKnown === true;
  const decision_maker = dmInvolved
    ? factors.decision_maker.involved
    : dmKnown
      ? factors.decision_maker.known
      : 0;

  // Идэвх, хариу: бүртгэлийн тоо ба сүүлийн холболтын шинэлэг байдлын дундаж.
  const e = factors.engagement;
  const acts = clamp01((input.activityCount30d ?? 0) / e.full_activity_count);
  const span = Math.max(1, e.stale_days - e.fresh_days);
  const recency =
    input.lastContactDays == null ? 0 : clamp01(1 - Math.max(0, input.lastContactDays - e.fresh_days) / span);
  const engagement = (acts + recency) / 2;

  // Тохируулгад бэлэн: matching-д хэрэгтэй байршил, төрөл, дээд төсөв, хэмжээ.
  const match_readiness = p
    ? (Number(filled(p.locations)) +
        Number(filled(p.propertyTypes)) +
        Number(filled(p.budgetMax)) +
        Number(filled(p.roomsMin) || filled(p.areaMin))) /
      4
    : fallbackPct;

  return {
    need_clarity: clamp01(need_clarity),
    budget_financing,
    timeline,
    decision_maker: clamp01(decision_maker),
    engagement: clamp01(engagement),
    match_readiness: clamp01(match_readiness),
  };
}

/** §6.6: 100 онооны автомат тооцоо, задаргаатай. */
export function computeLeadScore(
  input: LeadScoreInput,
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
  factors: ScoreFactors = DEFAULT_SCORE_FACTORS
): LeadScoreResult {
  const w = normalizeScoreWeights(weights);
  const f = scoreFactors(input, factors);
  const breakdown = Object.fromEntries(SCORE_CRITERIA.map((k) => [k, round1(w[k] * f[k])])) as ScoreBreakdown;
  const score = round1(SCORE_CRITERIA.reduce((a, k) => a + breakdown[k], 0));
  return { score, breakdown };
}

/** §6.6 жишиг босго: оноо → ангиллын САНАЛ (80–100 A, 60–79 B, 40–59 C, <40 D). */
export function gradeFromScore(
  score: number,
  thresholds: GradeThresholds = DEFAULT_GRADE_THRESHOLDS
): LeadGrade {
  if (score >= thresholds.a) return "a";
  if (score >= thresholds.b) return "b";
  if (score >= thresholds.c) return "c";
  return "d";
}

// ── Эргэн холбогдох давтамж (§6.5) ────────────────────────

/** crm_settings key='recontact_ranges'. */
export type RecontactRange = {
  min_days: number;
  max_days: number;
  default_days: number;
  /** Хэлцлийн шатнаас хамаарсан давтамж (шатны код → хоног). */
  stage_days?: Record<string, number>;
  /** D ангилал — аяны хүрээнд холбогдоно. */
  via_campaign?: boolean;
};
export type RecontactRanges = Record<LeadGrade, RecontactRange>;

export const DEFAULT_RECONTACT_RANGES: RecontactRanges = {
  a: {
    min_days: 1,
    max_days: 3,
    default_days: 3,
    stage_days: { interested: 2, offer: 1, negotiation: 1, contract: 1, payment_closing: 1, closing: 1 },
  },
  b: { min_days: 7, max_days: 7, default_days: 7 },
  c: { min_days: 14, max_days: 28, default_days: 21 },
  d: { min_days: 30, max_days: 90, default_days: 60, via_campaign: true },
};

/**
 * Ангилал (ба боломжийн шат) → дараагийн холболтын санал болгох хоног.
 * Шатны тусгай утгыг ангиллын [min, max] мужид багтаана.
 */
export function recontactDays(
  grade: LeadGrade,
  stageCode?: string | null,
  ranges: RecontactRanges = DEFAULT_RECONTACT_RANGES
): number {
  const r = ranges[grade] ?? DEFAULT_RECONTACT_RANGES[grade];
  const byStage = stageCode ? r.stage_days?.[stageCode] : undefined;
  const days = byStage ?? r.default_days;
  return Math.max(r.min_days, Math.min(r.max_days, days));
}

// ── Профайлын бүрэн байдал (§6.7) ─────────────────────────

export type NeedProfileSnapshot = {
  goalId?: string | null;
  locations?: unknown[] | null;
  propertyTypes?: string[] | null;
  /** Доод төсөв — дамжуулаагүй (undefined) бол тооцоонд оролцохгүй. */
  budgetMin?: number | null;
  budgetMax?: number | null;
  budgetTarget?: number | null;
  financing?: string | null;
  roomsMin?: number | null;
  areaMin?: number | null;
  timeline?: string | null;
  moveInDate?: string | null;
  profileType?: string | null;
  mustHaves?: unknown[] | null;
  niceToHaves?: unknown[] | null;
  dealBreakers?: unknown[] | null;
  /** Шийдвэр гаргагчийн нэр/тайлбар (чөлөөт) эсвэл лавлахын id. */
  decisionMaker?: string | null;
  decisionMakerId?: string | null;
  decisionMakerInvolved?: boolean | null;
  /** Одоогийн саад (чөлөөт) эсвэл лавлахын id («Саад байхгүй» ч хариулт). */
  blocker?: string | null;
  blockerId?: string | null;
};

/**
 * Хэрэгцээний профайлын бүрэн байдал % — «Шалгуур хангасан» шатны босгонд
 * (need_profile_complete) ашиглагдана. Заавал шаардлага §6.7-оор
 * mustHavesMin-ээс цөөн бол хэсэгчилсэн оноо (бүрэн 100 хүрэхгүй).
 */
export function needProfileCompleteness(
  p: NeedProfileSnapshot,
  opts: { mustHavesMin?: number } = {}
): number {
  const mustMin = Math.max(1, opts.mustHavesMin ?? DEFAULT_SCORE_FACTORS.must_haves_min);
  // [хувь 0..1, жин]; null = энэ тооцоонд оролцохгүй.
  const parts: Array<[number, number] | null> = [
    [Number(filled(p.goalId)), 8],
    [Number(filled(p.locations)), 12],
    [Number(filled(p.propertyTypes)), 10],
    [Number(filled(p.budgetMax)), 10],
    [Number(filled(p.budgetTarget)), 4],
    p.budgetMin === undefined ? null : [Number(filled(p.budgetMin)), 4],
    [Number(filled(p.financing)), 10],
    [Number(filled(p.roomsMin) || filled(p.areaMin)), 6],
    [Number(filled(p.timeline)), 10],
    [Math.min(count(p.mustHaves), mustMin) / mustMin, 12],
    [Number(filled(p.dealBreakers)), 4],
    [Number(filled(p.decisionMaker) || filled(p.decisionMakerId)), 6],
    [Number(filled(p.blocker) || filled(p.blockerId)), 2],
    // Түрээслэгчид орох огноо заавал — бусдад автоматаар бүрэн.
    [p.profileType === "tenant" ? Number(filled(p.moveInDate)) : 1, 2],
  ];
  const used = parts.filter((x): x is [number, number] => x !== null);
  const total = used.reduce((a, [, w]) => a + w, 0);
  const got = used.reduce((a, [v, w]) => a + v * w, 0);
  return round1((got / total) * 100);
}

// ── Сэжим хуваарилалт (Д-01) ──────────────────────────────

export type AssignMode = "duty_shift" | "round_robin" | "rule_based" | "load_capped";

export type AssignRule = {
  when: { source?: string; branch_id?: string; grade?: string };
  /** Профайлын id-нууд (баг/дүрийг дуудагч урьдчилж candidates болгож задална). */
  assign_to: string[];
};

export type AssignLeadInput = {
  mode: AssignMode;
  /** Хуваарилагдах боломжтой идэвхтэй агентуудын profile id (тогтмол эрэмбээр). */
  candidates: string[];
  /** Одоо жижүүрт байгаа profile id-нууд (duty_shift горимд). */
  dutyNow?: string[];
  /** round-robin cursor — сүүлд оноогдсон profile id. */
  cursor?: string | null;
  /** profile id → нээлттэй (new|active) сэжимийн тоо. */
  loads?: Record<string, number>;
  /** Ачааллын дээд босго (load_capped горимд; тохиргооноос). */
  loadCap?: number;
  /** rule_based горимын нөхцөлүүд (эхний таарсан нь ялна). */
  rules?: AssignRule[];
  lead?: { sourceCode?: string | null; branchId?: string | null; grade?: string | null };
  /** Ажлын цаг мөн үү (хуанли+цагаар дуудагч тооцно). */
  isWorkHours: boolean;
  /** Ажлын бус цагийн бодлого — 'queue' бол дараалалд (F-126). */
  afterHours?: "queue" | "assign";
};

export type AssignLeadResult =
  | { ownerId: string; queued?: false }
  | { ownerId: null; queued: true }
  | { ownerId: null; queued: false };

function pickRoundRobin(candidates: string[], cursor: string | null | undefined): string | null {
  if (candidates.length === 0) return null;
  const idx = cursor ? candidates.indexOf(cursor) : -1;
  return candidates[(idx + 1) % candidates.length];
}

function pickLeastLoaded(candidates: string[], loads: Record<string, number>): string | null {
  if (candidates.length === 0) return null;
  let best: string | null = null;
  let bestLoad = Infinity;
  for (const c of candidates) {
    const l = loads[c] ?? 0;
    if (l < bestLoad) {
      best = c;
      bestLoad = l;
    }
  }
  return best;
}

/**
 * Д-01: шинэ сэжимийг хуваарилах цэвэр шийдвэр.
 * - Ажлын бус цагт (afterHours='queue') → дараалалд, дараагийн ажлын цагт cron хуваарилна.
 * - duty_shift: одоогийн жижүүрүүдээс хамгийн бага ачаалалтай; жижүүргүй бол round-robin fallback.
 * - round_robin: cursor-ын дараагийнх.
 * - rule_based: эхний таарсан дүрмийн кандидатуудаас бага ачаалалтай; таараагүй бол round-robin.
 * - load_capped: ачаалал < cap кандидатуудаас бага ачаалалтай; бүгд дүүрсэн бол дараалалд.
 */
export function assignLead(input: AssignLeadInput): AssignLeadResult {
  const { mode, candidates, isWorkHours } = input;
  const afterHours = input.afterHours ?? "queue";
  if (!isWorkHours && afterHours === "queue") return { ownerId: null, queued: true };
  if (candidates.length === 0) return { ownerId: null, queued: false };
  const loads = input.loads ?? {};

  switch (mode) {
    case "duty_shift": {
      const onDuty = (input.dutyNow ?? []).filter((p) => candidates.includes(p));
      const pick = onDuty.length > 0 ? pickLeastLoaded(onDuty, loads) : pickRoundRobin(candidates, input.cursor);
      return pick ? { ownerId: pick } : { ownerId: null, queued: false };
    }
    case "round_robin": {
      const pick = pickRoundRobin(candidates, input.cursor);
      return pick ? { ownerId: pick } : { ownerId: null, queued: false };
    }
    case "rule_based": {
      const lead = input.lead ?? {};
      const rule = (input.rules ?? []).find((r) => {
        const w = r.when ?? {};
        if (w.source && w.source !== lead.sourceCode) return false;
        if (w.branch_id && w.branch_id !== lead.branchId) return false;
        if (w.grade && w.grade !== lead.grade) return false;
        return true;
      });
      const pool = rule ? rule.assign_to.filter((p) => candidates.includes(p)) : [];
      const pick = pool.length > 0 ? pickLeastLoaded(pool, loads) : pickRoundRobin(candidates, input.cursor);
      return pick ? { ownerId: pick } : { ownerId: null, queued: false };
    }
    case "load_capped": {
      const cap = input.loadCap ?? Infinity;
      const free = candidates.filter((c) => (loads[c] ?? 0) < cap);
      if (free.length === 0) return { ownerId: null, queued: true }; // бүгд дүүрсэн → дараалал
      const pick = pickLeastLoaded(free, loads);
      return pick ? { ownerId: pick } : { ownerId: null, queued: false };
    }
    default:
      return { ownerId: null, queued: false };
  }
}
