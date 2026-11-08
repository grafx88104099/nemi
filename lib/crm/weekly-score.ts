/**
 * Агентын долоо хоногийн үнэлгээ ба мөчлөгийн цэвэр логик (U7 — PRO-001 v2.1
 * §6.19, §6.20, §6.24, §6.25, §9.1, §9.6). DB-гүй, unit тестийн бай.
 *
 * Зарчим:
 *  • Гүйцэтгэл ЗӨВХӨН CRM-ийн бүртгэлээс (crm_agent_week_metrics) — гараар
 *    засах замгүй; энд зөвхөн зорилттой харьцуулж оноо бодно.
 *  • Жин 'agent_score_weights', зорилтын нөөц ба бусад босго 'weekly_cycle'
 *    тохиргооноос. DEFAULT_* нь тохиргоо уншигдаагүй үеийн нөөц.
 *  • Алдсан хэлцэл оноо өгөхгүй: шат ахилтад амжилтгүй хаалт орохгүй, хаалт
 *    зөвхөн амжилттай хэлцлээр.
 *  • Хамааралгүй бүрэлдэхүүн (жишээ нь хугацаатай алхам огт байхгүй) оноо
 *    өгөхгүй; нийт оноог хамаарах жингийн нийлбэрт харьцуулж 100-д шилжүүлнэ
 *    (тохиргоо na_policy = 'rescale'), эсвэл 0 гэж тооцно ('zero').
 */

import {
  SCORE_COMPONENTS,
  SCORE_COMPONENT_METRICS,
  WEEKLY_METRIC_BY_CODE,
  WEEKLY_METRICS,
  isWeeklyMetricCode,
  type AnomalyKind,
  type MoveKind,
  type ScoreComponent,
  type WeeklyMetricCode,
} from "@/lib/constants-crm-weekly";
import { normalizeWeeklySchedule, type WeeklySchedule } from "@/lib/crm/week";

export type MetricKey = WeeklyMetricCode | "stage_advances";
export type WeeklyValues = Partial<Record<MetricKey, number | null>>;

// ── Тохиргоо ──────────────────────────────────────────────

export type ScoreWeights = Record<ScoreComponent, number>;

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  activity: 20,
  pipeline: 20,
  progress: 20,
  closing: 20,
  followup: 10,
  quality: 10,
};

export type AgendaSection = { key: string; minutes: number };

export type WeeklyCycleSettings = {
  schedule: WeeklySchedule;
  /** Зорилтын нөөц: агент картдаа заагаагүй бол. */
  defaultTargets: WeeklyValues;
  naPolicy: "rescale" | "zero";
  newAgent: { days: number; weights: ScoreWeights | null };
  coaching: { overdueMin: number; consecutiveWeeks: number; scoreBelow: number; taskDueDays: number };
  anomaly: { scoreBelow: number; overdueMin: number; gapPct: number };
  agenda: AgendaSection[];
  agentSlotMin: number;
  agentSlotMax: number;
  /** Багийн ахлагчгүй үед батлах дүр. */
  approverFallbackRoles: string[];
};

export const DEFAULT_WEEKLY_CYCLE: WeeklyCycleSettings = {
  schedule: normalizeWeeklySchedule(null),
  defaultTargets: {
    outbound_contacts: 25,
    meaningful_conversations: 10,
    qualified_leads: 3,
    showings: 3,
    offers: 1,
    stage_advances: 5,
    closed_deals: 1,
  },
  naPolicy: "rescale",
  newAgent: { days: 90, weights: null },
  coaching: { overdueMin: 5, consecutiveWeeks: 2, scoreBelow: 50, taskDueDays: 3 },
  anomaly: { scoreBelow: 50, overdueMin: 5, gapPct: 50 },
  agenda: [
    { key: "dashboard", minutes: 10 },
    { key: "agents", minutes: 25 },
    { key: "pipeline", minutes: 15 },
    { key: "coaching", minutes: 10 },
  ],
  agentSlotMin: 3,
  agentSlotMax: 5,
  approverFallbackRoles: ["sales_director"],
};

function n(v: unknown): number | null {
  const x = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(x) ? x : null;
}

function clampNum(v: unknown, fallback: number, min: number, max: number): number {
  const x = n(v);
  return x == null ? fallback : Math.min(max, Math.max(min, x));
}

export function normalizeScoreWeights(raw: unknown, fallback: ScoreWeights = DEFAULT_SCORE_WEIGHTS): ScoreWeights {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...fallback };
  let any = false;
  for (const k of SCORE_COMPONENTS) {
    const x = n(o[k]);
    if (x != null && x >= 0) {
      out[k] = x;
      any = true;
    }
  }
  const sum = SCORE_COMPONENTS.reduce((s, k) => s + out[k], 0);
  return any && sum > 0 ? out : { ...fallback };
}

function normalizeTargets(raw: unknown, fallback: WeeklyValues): WeeklyValues {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const out: WeeklyValues = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(isWeeklyMetricCode(k) || k === "stage_advances")) continue;
    const x = n(v);
    out[k] = x != null && x >= 0 ? x : null;
  }
  return out;
}

/**
 * 'weekly_cycle' тохиргоог хэвийн болгоно. Хуучин 'weekly_targets'
 * ({material, qualified, progress, closings}) өгвөл зорилтын нөөцөд буулгана.
 */
export function normalizeWeeklyCycle(raw: unknown, legacyTargets?: unknown): WeeklyCycleSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_WEEKLY_CYCLE;

  let defaults: WeeklyValues = { ...d.defaultTargets };
  if (legacyTargets && typeof legacyTargets === "object") {
    const l = legacyTargets as Record<string, unknown>;
    const m = n(l.material);
    const q = n(l.qualified);
    const p = n(l.progress);
    const c = n(l.closings);
    if (m != null) defaults.meaningful_conversations = m;
    if (q != null) defaults.qualified_leads = q;
    if (p != null) defaults.stage_advances = p;
    if (c != null) defaults.closed_deals = c;
  }
  if (o.default_targets && typeof o.default_targets === "object") {
    defaults = { ...defaults, ...normalizeTargets(o.default_targets, {}) };
  }

  const na = o.na_policy === "zero" ? "zero" : "rescale";
  const newAgentRaw = (o.new_agent && typeof o.new_agent === "object" ? o.new_agent : {}) as Record<string, unknown>;
  const newAgentEnabled = newAgentRaw.enabled === true;
  const coachingRaw = (o.coaching && typeof o.coaching === "object" ? o.coaching : {}) as Record<string, unknown>;
  const anomalyRaw = (o.anomaly && typeof o.anomaly === "object" ? o.anomaly : {}) as Record<string, unknown>;

  const agenda: AgendaSection[] = Array.isArray(o.agenda)
    ? (o.agenda as unknown[])
        .map((x) => {
          const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
          const key = typeof r.key === "string" ? r.key : "";
          const minutes = clampNum(r.minutes, 0, 0, 120);
          return { key, minutes };
        })
        .filter((s) => s.key && s.minutes > 0)
    : [];

  const roles = Array.isArray(o.approver_fallback_roles)
    ? (o.approver_fallback_roles as unknown[]).filter((r): r is string => typeof r === "string")
    : d.approverFallbackRoles;

  const slotMin = clampNum(o.agent_slot_min, d.agentSlotMin, 1, 30);
  const slotMax = Math.max(slotMin, clampNum(o.agent_slot_max, d.agentSlotMax, 1, 30));

  return {
    schedule: normalizeWeeklySchedule(o),
    defaultTargets: defaults,
    naPolicy: na,
    newAgent: {
      days: clampNum(newAgentRaw.days, d.newAgent.days, 0, 365),
      weights: newAgentEnabled && newAgentRaw.weights ? normalizeScoreWeights(newAgentRaw.weights) : null,
    },
    coaching: {
      overdueMin: clampNum(coachingRaw.overdue_followups_min, d.coaching.overdueMin, 1, 1000),
      consecutiveWeeks: Math.round(clampNum(coachingRaw.consecutive_weeks, d.coaching.consecutiveWeeks, 1, 12)),
      scoreBelow: clampNum(coachingRaw.score_below, d.coaching.scoreBelow, 0, 100),
      taskDueDays: Math.round(clampNum(coachingRaw.task_due_days, d.coaching.taskDueDays, 0, 30)),
    },
    anomaly: {
      scoreBelow: clampNum(anomalyRaw.score_below, d.anomaly.scoreBelow, 0, 100),
      overdueMin: clampNum(anomalyRaw.overdue_min, d.anomaly.overdueMin, 1, 1000),
      gapPct: clampNum(anomalyRaw.gap_pct, d.anomaly.gapPct, 1, 100),
    },
    agenda: agenda.length ? agenda : d.agenda,
    agentSlotMin: slotMin,
    agentSlotMax: slotMax,
    approverFallbackRoles: roles.length ? roles : d.approverFallbackRoles,
  };
}

/** Шинэ агентын эхний N хоногийн жингийн профайл (§6.25 доод тэмдэглэл). */
export function pickScoreWeights(
  base: ScoreWeights,
  settings: Pick<WeeklyCycleSettings, "newAgent">,
  hiredOn: string | null | undefined,
  weekStart: string
): { weights: ScoreWeights; profile: "standard" | "new_agent" } {
  const w = settings.newAgent.weights;
  if (!w || !hiredOn || !/^\d{4}-\d{2}-\d{2}/.test(hiredOn)) return { weights: base, profile: "standard" };
  const days = Math.round(
    (new Date(`${weekStart}T00:00:00Z`).getTime() - new Date(`${hiredOn.slice(0, 10)}T00:00:00Z`).getTime()) / 86_400_000
  );
  return days >= 0 && days < settings.newAgent.days ? { weights: w, profile: "new_agent" } : { weights: base, profile: "standard" };
}

// ── Зорилт ба зөрүү ───────────────────────────────────────

/**
 * Үнэлгээнд хэрэглэх зорилт: илгээсэн/батлагдсан картын зорилт, эс бөгөөс
 * тохиргооны нөөц. Ноорог картын зорилтыг (батлуулаагүй) оноонд ашиглахгүй.
 */
export function resolveTargets(
  planTargets: WeeklyValues | null | undefined,
  planStatus: string | null | undefined,
  defaults: WeeklyValues
): WeeklyValues {
  const out: WeeklyValues = { ...defaults };
  if (planTargets && (planStatus === "submitted" || planStatus === "approved")) {
    for (const [k, v] of Object.entries(planTargets) as [MetricKey, number | null | undefined][]) {
      if (v != null && Number.isFinite(v) && v >= 0) out[k] = v;
    }
  }
  return out;
}

export type GapRow = { actual: number | null; target: number | null; gap: number | null; pct: number | null; met: boolean | null };

/** §9.1 «Зөрүү»: гүйцэтгэл − зорилт; бага байх тусмаа сайн үзүүлэлтэд эсрэгээр. */
export function gapRow(actual: number | null | undefined, target: number | null | undefined, better: "higher" | "lower" = "higher"): GapRow {
  const a = actual == null || !Number.isFinite(actual) ? null : actual;
  const t = target == null || !Number.isFinite(target) ? null : target;
  if (a == null || t == null) return { actual: a, target: t, gap: null, pct: null, met: null };
  const gap = Math.round((a - t) * 100) / 100;
  const pct = t > 0 ? Math.round((a / t) * 100) : null;
  const met = better === "lower" ? a <= t : a >= t;
  return { actual: a, target: t, gap, pct, met };
}

// ── Оноо ──────────────────────────────────────────────────

export type ScorePart = { code: MetricKey; actual: number | null; target: number | null; ratio: number | null };

export type ScoreComponentResult = {
  key: ScoreComponent;
  weight: number;
  /** null = хамааралгүй (оноо өгөхгүй). */
  points: number | null;
  ratio: number | null;
  parts: ScorePart[];
};

export type WeeklyScore = {
  components: ScoreComponentResult[];
  /** 100 оноот нийт. */
  total: number;
  /** Хамаарах жингийн нийлбэр. */
  applicableWeight: number;
  rescaled: boolean;
};

const round1 = (x: number) => Math.round(x * 10) / 10;

function targetRatio(actual: number | null | undefined, target: number | null | undefined): number | null {
  if (target == null || !Number.isFinite(target) || target <= 0) return null;
  const a = actual == null || !Number.isFinite(actual) ? 0 : Math.max(0, actual);
  return Math.min(1, a / target);
}

/**
 * §6.25 100 оноо. activity/pipeline/progress/closing = зорилттой үзүүлэлт бүрийн
 * min(гүйцэтгэл/зорилт, 1)-ийн дундаж × жин; followup = хугацаандаа хийсэн хувь;
 * quality = CRM-ийн бүрэн байдлын хувь.
 */
export function computeWeeklyScore(input: {
  actuals: WeeklyValues;
  targets: WeeklyValues;
  weights: ScoreWeights;
  naPolicy?: "rescale" | "zero";
}): WeeklyScore {
  const { actuals, targets, weights } = input;
  const components: ScoreComponentResult[] = SCORE_COMPONENTS.map((key) => {
    const weight = Math.max(0, weights[key] ?? 0);
    const codes = SCORE_COMPONENT_METRICS[key];
    if (key === "followup" || key === "quality") {
      const code = codes[0];
      const pct = actuals[code];
      const ratio = pct == null || !Number.isFinite(pct) ? null : Math.min(1, Math.max(0, pct / 100));
      return {
        key,
        weight,
        points: ratio == null || weight === 0 ? null : round1(ratio * weight),
        ratio,
        parts: [{ code, actual: pct ?? null, target: null, ratio }],
      };
    }
    const parts: ScorePart[] = codes.map((code) => ({
      code,
      actual: actuals[code] ?? 0,
      target: targets[code] ?? null,
      ratio: targetRatio(actuals[code], targets[code]),
    }));
    const scored = parts.filter((p) => p.ratio != null);
    const ratio = scored.length ? scored.reduce((s, p) => s + (p.ratio as number), 0) / scored.length : null;
    return { key, weight, points: ratio == null || weight === 0 ? null : round1(ratio * weight), ratio, parts };
  });

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const applicableWeight = components.filter((c) => c.points != null).reduce((s, c) => s + c.weight, 0);
  const points = components.reduce((s, c) => s + (c.points ?? 0), 0);
  const rescale = (input.naPolicy ?? "rescale") === "rescale" && applicableWeight > 0 && applicableWeight < totalWeight;
  const scale = totalWeight > 0 ? 100 / totalWeight : 0;
  const total = rescale ? (points / applicableWeight) * 100 : points * scale;
  return { components, total: round1(Math.min(100, total)), applicableWeight, rescaled: rescale };
}

// ── Урсгалын хөдөлгөөн (§6.24) ────────────────────────────

/**
 * Нэг боломжийн долоо хоногийн цэвэр хөдөлгөөн: долоо хоногийн эхний шатнаас
 * сүүлийн шат руу. Амжилтгүй хаалт ахилт БИШ (sort_order өндөр байсан ч).
 */
export function classifyMove(input: {
  fromSort: number | null;
  toSort: number | null;
  toTerminal: "won" | "lost" | null;
}): MoveKind {
  if (input.toTerminal === "lost") return "lost";
  if (input.toTerminal === "won") return "won";
  if (input.fromSort == null || input.toSort == null) return input.toSort != null ? "advanced" : "none";
  if (input.toSort > input.fromSort) return "advanced";
  if (input.toSort < input.fromSort) return "backward";
  return "none";
}

export type MoveSummary = Record<MoveKind, number>;

export function summarizeMoves(kinds: MoveKind[]): MoveSummary {
  const s: MoveSummary = { advanced: 0, backward: 0, won: 0, lost: 0, none: 0 };
  for (const k of kinds) s[k] += 1;
  return s;
}

/** Үнэлгээний «шатны ахилт»: ахисан + амжилттай хаагдсан (алдсан, ухарсан орохгүй). */
export function stageAdvances(s: MoveSummary): number {
  return s.advanced + s.won;
}

// ── Хөрвөлт (§6.24 Шатлал) ────────────────────────────────

export const WEEK_CONVERSION_STEPS: { from: WeeklyMetricCode; to: WeeklyMetricCode; label: string }[] = [
  { from: "outbound_contacts", to: "qualified_leads", label: "Холболт → Шалгуур хангасан" },
  { from: "qualified_leads", to: "showings", label: "Шалгуур хангасан → Үзлэг" },
  { from: "showings", to: "offers", label: "Үзлэг → Үнийн санал" },
  { from: "offers", to: "closed_deals", label: "Үнийн санал → Хаалт" },
];

export function weekConversions(a: WeeklyValues): { label: string; pct: number | null }[] {
  return WEEK_CONVERSION_STEPS.map((s) => {
    const from = a[s.from] ?? 0;
    const to = a[s.to] ?? 0;
    return { label: s.label, pct: from > 0 ? Math.round((to / from) * 100) : null };
  });
}

/** Багийн дундаж (хамааралгүйг тоолохгүй). */
export function averageOf(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? round1(v.reduce((s, x) => s + x, 0) / v.length) : null;
}

// ── Даваагийн картын эхлэл (§6.30: Баасны өгөгдөл → Даваа) ──

/** Өнгөрсөн долоо хоногийн үр дүнгийн хураангуйн ноорог (агент засна). */
export function buildLastWeekSummary(actuals: WeeklyValues, targets: WeeklyValues, score: number | null): string {
  const parts: string[] = [];
  for (const m of WEEKLY_METRICS) {
    if (!m.inPlan && !m.inReview) continue;
    if (m.unit !== "count") continue;
    const a = actuals[m.code];
    const t = targets[m.code];
    if (a == null) continue;
    if (t != null && t > 0) parts.push(`${m.label} ${a}/${t}`);
    else if (a > 0) parts.push(`${m.label} ${a}`);
  }
  const head = score != null ? `Үнэлгээ ${score}/100. ` : "";
  return parts.length ? `${head}${parts.join(", ")}.` : head.trim();
}

export type PrefillItem = { kind: "top_deal" | "priority"; position: number; opportunity_id: string | null; text: string };

/**
 * Өмнөх долоо хоногийн «Шилжих 3 боломж»-оос шинэ картын шилдэг хэлцэл ба
 * тэргүүлэх ажлыг бэлтгэнэ (давхардлыг хасна, дээд тал нь 3).
 */
export function prefillItemsFromCarry(
  carry: { opportunity_id: string | null; text: string | null }[],
  max = 3
): PrefillItem[] {
  const seen = new Set<string>();
  const items: PrefillItem[] = [];
  let deal = 0;
  let prio = 0;
  for (const c of carry) {
    const key = c.opportunity_id ?? (c.text ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const text = (c.text ?? "").trim();
    if (c.opportunity_id && deal < max) {
      deal += 1;
      items.push({ kind: "top_deal", position: deal, opportunity_id: c.opportunity_id, text });
    }
    if (prio < max && (text || c.opportunity_id)) {
      prio += 1;
      items.push({ kind: "priority", position: prio, opportunity_id: c.opportunity_id, text: text || "Шилжсэн боломжийг урагшлуулах" });
    }
  }
  return items;
}

// ── Хурлын «Анхаарах» дохио (§6.30) ───────────────────────

export function detectAnomalies(input: {
  planStatus: string | null;
  lastWeekScore: number | null;
  lastWeekActuals: WeeklyValues | null;
  lastWeekTargets: WeeklyValues | null;
  currentOverdue: number | null;
  settings: Pick<WeeklyCycleSettings, "anomaly">;
}): AnomalyKind[] {
  const out: AnomalyKind[] = [];
  const s = input.settings.anomaly;
  if (!input.planStatus) out.push("no_plan");
  else if (input.planStatus !== "approved") out.push("plan_not_approved");
  if (input.lastWeekScore != null && input.lastWeekScore < s.scoreBelow) out.push("low_score");
  if (input.currentOverdue != null && input.currentOverdue >= s.overdueMin) out.push("overdue");
  const a = input.lastWeekActuals;
  const t = input.lastWeekTargets;
  if (a) {
    if ((a.meaningful_conversations ?? 0) === 0) out.push("no_activity");
    if (t) {
      const lagging = WEEKLY_METRICS.filter((m) => m.better === "higher" && m.unit === "count").some((m) => {
        const tv = t[m.code];
        if (tv == null || tv <= 0) return false;
        return ((a[m.code] ?? 0) / tv) * 100 < 100 - s.gapPct;
      });
      if (lagging) out.push("target_gap");
    }
  }
  return out;
}

/**
 * Дадлагажуулалтын автомат даалгавар (§9.6): сүүлийн N долоо хоног дараалан
 * хугацаа хэтэрсэн эргэн холбогдолт босгоос их эсвэл оноо босгоос доогуур.
 * history — шинээс хуучин руу эрэмбэлсэн эцсийн дүн.
 */
export function coachingDue(
  history: { overdue: number | null; score: number | null }[],
  c: WeeklyCycleSettings["coaching"]
): { due: boolean; reason: "overdue" | "score" | null } {
  const recent = history.slice(0, c.consecutiveWeeks);
  if (recent.length < c.consecutiveWeeks) return { due: false, reason: null };
  if (recent.every((h) => h.overdue != null && h.overdue >= c.overdueMin)) return { due: true, reason: "overdue" };
  if (recent.every((h) => h.score != null && h.score < c.scoreBelow)) return { due: true, reason: "score" };
  return { due: false, reason: null };
}

// ── Шалгалт (картыг илгээх) ───────────────────────────────

export type PlanSubmitInput = {
  targets: WeeklyValues;
  topDeals: number;
  openOpportunities: number;
  priorities: number;
  commitment: string | null;
  summary: string | null;
};

/** §6.21 карт: илгээхийн өмнөх заавал талбар. Алдааны монгол текст эсвэл null. */
export function planSubmitError(p: PlanSubmitInput, requiredTargets: MetricKey[]): string | null {
  const missing = requiredTargets.filter((c) => p.targets[c] == null);
  if (missing.length) {
    const labels = missing.map((c) => (c === "stage_advances" ? "шатны ахилт" : WEEKLY_METRIC_BY_CODE[c].label));
    return `Зорилтоо бөглөнө үү: ${labels.join(", ")}.`;
  }
  if (!p.summary || p.summary.trim().length < 5) return "Өнгөрсөн долоо хоногийн үр дүнгийн хураангуйг бичнэ үү.";
  const needDeals = Math.min(3, Math.max(0, p.openOpportunities));
  if (p.topDeals < needDeals) return `Хаах боломжтой шилдэг ${needDeals} хэлцлээ сонгоно уу.`;
  if (p.priorities < 1) return "Тэргүүлэх ажлаа (3 хүртэл) бичнэ үү.";
  if (!p.commitment || p.commitment.trim().length < 5) return "Долоо хоногийн хэмжигдэхүйц амлалтаа бичнэ үү.";
  return null;
}

export type ReviewSubmitInput = {
  missedNote: string | null;
  lessons: string | null;
  overdueCount: number;
  overdueReason: string | null;
  recoveryAction: string | null;
  carry: number;
  unmetWithoutNote: number;
};

/** §6.24 / §9.1: биелээгүй үзүүлэлтэд тайлбар, хэтрэлтэд шалтгаан, шилжих ажил. */
export function reviewSubmitError(r: ReviewSubmitInput): string | null {
  if (r.unmetWithoutNote > 0) return "Биелээгүй үзүүлэлт бүрд тайлбар, дараагийн үйлдлээ бичнэ үү.";
  if (r.overdueCount > 0 && (!r.overdueReason?.trim() || !r.recoveryAction?.trim()))
    return "Хугацаа хэтэрсэн эргэн холбогдолтын шалтгаан ба нөхөн сэргээх арга хэмжээг бичнэ үү.";
  if (!r.lessons || r.lessons.trim().length < 5) return "Сургамжаа бичнэ үү.";
  if (r.carry < 1) return "Дараагийн долоо хоногт шилжих тэргүүлэх боломжоо (3 хүртэл) сонгоно уу.";
  return null;
}

/** Үзүүлэлтийн утгыг дэлгэцэнд: тоо, ₮, хувь. */
export function formatMetricValue(code: MetricKey, v: number | null | undefined, fmtMnt: (x: number) => string): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (code === "stage_advances") return String(Math.round(v));
  const unit = WEEKLY_METRIC_BY_CODE[code].unit;
  if (unit === "mnt") return fmtMnt(v);
  if (unit === "pct") return `${Math.round(v)}%`;
  return String(Math.round(v * 10) / 10);
}
