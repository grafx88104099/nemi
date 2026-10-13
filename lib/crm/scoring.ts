/**
 * Сэжимийн 100 онооны загвар (F-112), оноо→ангилал (F-113), профайлын бүрэн
 * байдал (F-159) ба сэжим хуваарилалтын цэвэр логик (F-126, Д-01 — DESIGN §2.2а;
 * assign.ts тусдаа файл эзэмшлийн хуваарьт ороогүй тул энд).
 * Бүгд цэвэр функц — DB-гүй, unit тестийн бай.
 *
 * Жин/босго кодонд хатуу бичигдэхгүй — crm_settings-ээс ирнэ (зөвхөн урагш
 * үйлчилнэ); эндхийн DEFAULT-ууд зөвхөн fallback (seed-тэй ижил).
 */

import type { LeadGrade } from "@/lib/constants-crm";

// ── Оноо (F-112) ──────────────────────────────────────────

/** crm_settings key='lead_score_weights' — seed: 25/20/15/20/10/10 = 100. */
export type ScoreWeights = {
  budget_fit: number;
  timeline: number;
  financing: number;
  engagement: number;
  source_quality: number;
  profile_complete: number;
};

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  budget_fit: 25,
  timeline: 20,
  financing: 15,
  engagement: 20,
  source_quality: 10,
  profile_complete: 10,
};

/** crm_settings key='lead_grade_thresholds' — 80/60/40 (ToR 4.1.2). */
export type GradeThresholds = { a: number; b: number; c: number };
export const DEFAULT_GRADE_THRESHOLDS: GradeThresholds = { a: 80, b: 60, c: 40 };

export type LeadScoreInput = {
  /** Хэрэгцээний профайлын төсөв: дээд заавал, зорилтот/доод сонголттой. */
  budgetMax?: number | null;
  budgetTarget?: number | null;
  /** Санхүүжилт: cash|loan|mixed|not_ready. */
  financing?: string | null;
  /** Хугацаа: 0_30|1_3m|3_12m|12m_plus. */
  timeline?: string | null;
  /** Сүүлийн 30 хоногийн үйл ажиллагааны тоо (идэвх, F-112 «идэвх/хариу»). */
  activityCount30d?: number;
  /** Сүүлийн холболтоос хойшхи хоног (null = холболт огт байхгүй). */
  lastContactDays?: number | null;
  /** Эх сурвалжийн чанар 0..1 (лавлахын кодоос SOURCE_QUALITY-аар буулгана). */
  sourceQuality?: number | null;
  /** Профайлын бүрэн байдал % (F-159; байхгүй бол 0). */
  completenessPct?: number | null;
};

export type ScoreBreakdown = Record<keyof ScoreWeights, number>;

export type LeadScoreResult = {
  /** 0–100, 1 орны нарийвчлалтай. */
  score: number;
  /** Шалгуур бүрийн авсан оноо (жингээр үржсэн) — F-112 задаргаа. */
  breakdown: ScoreBreakdown;
};

const TIMELINE_FACTOR: Record<string, number> = {
  "0_30": 1,
  "1_3m": 0.75,
  "3_12m": 0.4,
  "12m_plus": 0.15,
};

const FINANCING_FACTOR: Record<string, number> = {
  cash: 1,
  mixed: 0.8,
  loan: 0.6,
  not_ready: 0.1,
};

/** Эх сурвалжийн кодыг чанарын коэффициентэд буулгах анхдагц толь. */
export const SOURCE_QUALITY: Record<string, number> = {
  referral: 1,
  repeat: 1,
  listing_inquiry: 0.8,
  walk_in: 0.7,
  website: 0.6,
  facebook: 0.5,
  instagram: 0.5,
  google: 0.5,
  cold_call: 0.3,
  other: 0.4,
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** Нэг шалгуурын 0..1 коэффициентүүд. */
export function scoreFactors(input: LeadScoreInput): Record<keyof ScoreWeights, number> {
  // Төсөв: дээд + зорилтот хоёул → 1; зөвхөн дээд → 0.6; байхгүй → 0.
  const budget_fit =
    input.budgetMax != null && input.budgetMax > 0
      ? input.budgetTarget != null && input.budgetTarget > 0
        ? 1
        : 0.6
      : 0;

  const timeline = input.timeline ? (TIMELINE_FACTOR[input.timeline] ?? 0) : 0;
  const financing = input.financing ? (FINANCING_FACTOR[input.financing] ?? 0) : 0;

  // Идэвх: 30 хоногийн бүртгэлийн тоо (8+ → бүрэн) ба сүүлийн холболтын шинэлэг
  // байдал (0–3 хоног → бүрэн, 30+ → 0) — дундаж.
  const acts = clamp01((input.activityCount30d ?? 0) / 8);
  const recency =
    input.lastContactDays == null
      ? 0
      : clamp01(1 - Math.max(0, input.lastContactDays - 3) / 27);
  const engagement = (acts + recency) / 2;

  const source_quality = clamp01(input.sourceQuality ?? 0);
  const profile_complete = clamp01((input.completenessPct ?? 0) / 100);

  return { budget_fit, timeline, financing, engagement, source_quality, profile_complete };
}

/** F-112: 100 онооны автомат тооцоо, задаргаатай. */
export function computeLeadScore(
  input: LeadScoreInput,
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS
): LeadScoreResult {
  const f = scoreFactors(input);
  const breakdown: ScoreBreakdown = {
    budget_fit: round1(weights.budget_fit * f.budget_fit),
    timeline: round1(weights.timeline * f.timeline),
    financing: round1(weights.financing * f.financing),
    engagement: round1(weights.engagement * f.engagement),
    source_quality: round1(weights.source_quality * f.source_quality),
    profile_complete: round1(weights.profile_complete * f.profile_complete),
  };
  const score = round1(Object.values(breakdown).reduce((a, b) => a + b, 0));
  return { score, breakdown };
}

/** F-113: оноо → ангиллын САНАЛ (80–100 A, 60–79 B, 40–59 C, <40 D). */
export function gradeFromScore(
  score: number,
  thresholds: GradeThresholds = DEFAULT_GRADE_THRESHOLDS
): LeadGrade {
  if (score >= thresholds.a) return "a";
  if (score >= thresholds.b) return "b";
  if (score >= thresholds.c) return "c";
  return "d";
}

// ── Профайлын бүрэн байдал (F-159) ────────────────────────

export type NeedProfileSnapshot = {
  goalId?: string | null;
  locations?: unknown[] | null;
  propertyTypes?: string[] | null;
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
  decisionMaker?: string | null;
  blocker?: string | null;
};

/**
 * Хэрэгцээний профайлын бүрэн байдал % — Qualified шатны босгонд ашиглагдана
 * (gate need_profile_complete). Заавал талбарууд илүү жинтэй.
 */
export function needProfileCompleteness(p: NeedProfileSnapshot): number {
  const filled = (v: unknown): boolean => {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "string") return v.trim() !== "";
    if (typeof v === "number") return Number.isFinite(v) && v > 0;
    return true;
  };
  // [утга, жин]
  const parts: Array<[boolean, number]> = [
    [filled(p.goalId), 8],
    [filled(p.locations), 12],
    [filled(p.propertyTypes), 10],
    [filled(p.budgetMax), 14],
    [filled(p.budgetTarget), 4],
    [filled(p.financing), 10],
    [filled(p.roomsMin) || filled(p.areaMin), 6],
    [filled(p.timeline), 10],
    [filled(p.mustHaves), 12],
    [filled(p.dealBreakers), 4],
    [filled(p.decisionMaker), 6],
    [filled(p.blocker), 2],
    // Түрээслэгчид орох огноо заавал (F-152) — бусдад автоматаар бүрэн.
    [p.profileType === "tenant" ? filled(p.moveInDate) : true, 2],
  ];
  const total = parts.reduce((a, [, w]) => a + w, 0);
  const got = parts.reduce((a, [ok, w]) => a + (ok ? w : 0), 0);
  return round1((got / total) * 100);
}

// ── Сэжим хуваарилалт (F-126, Д-01 — DESIGN §2.2а) ────────

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
