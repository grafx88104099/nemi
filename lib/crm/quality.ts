/**
 * CRM-ийн чанар, KPI, төсвийн цэвэр логик (U6 — PRO-001 v2.1 §6.25.5-6,
 * §6.29, §6.31, §8.1–§8.5, §9.1). DB-гүй, unit тестийн бай.
 *
 * Зарчим: босго, жишиг, түүврийн хэмжээ бүгд crm_settings-ээс ирнэ
 * ('quality_audit', 'kpi_targets', 'kpi_scope'); энд байгаа DEFAULT_* нь
 * тохиргоо уншигдаагүй үеийн нөөц утга (миграцийн анхны утгатай ижил).
 * Дэлгэцэнд дотоод код гаргахгүй — шошго бүр монгол.
 */

// ── Огноо (Улаанбаатар, UTC+8) ────────────────────────────

const UB_OFFSET_MS = 8 * 3600_000;
const DAY_MS = 86_400_000;

/** Улаанбаатарын өнөөдрийн огноо (YYYY-MM-DD). */
export function ubTodayIso(now: Date = new Date()): string {
  return new Date(now.getTime() + UB_OFFSET_MS).toISOString().slice(0, 10);
}

function parseIso(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  return toIso(new Date(parseIso(iso).getTime() + days * DAY_MS));
}

/** Хоёр огнооны хоорондох хоног (b − a). */
export function daysBetweenIso(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / DAY_MS);
}

export type DateRange = { from: string; to: string };

/** Даваа–Ням долоо хоног (§6.19 цонх). */
export function weekRange(iso: string): DateRange {
  const d = parseIso(iso);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const from = addDaysIso(iso, 1 - dow);
  return { from, to: addDaysIso(from, 6) };
}

export function monthRange(iso: string): DateRange {
  const from = `${iso.slice(0, 7)}-01`;
  const d = parseIso(from);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { from, to: addDaysIso(toIso(next), -1) };
}

export function quarterRange(iso: string): DateRange {
  const d = parseIso(iso);
  const q = Math.floor(d.getUTCMonth() / 3);
  const from = toIso(new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1)));
  const next = toIso(new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 1)));
  return { from, to: addDaysIso(next, -1) };
}

/** Өмнөх сар (YYYY-MM-01). */
export function prevMonthStart(iso: string): string {
  const d = parseIso(`${iso.slice(0, 7)}-01`);
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
}

export function isValidIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseIso(s);
  return !Number.isNaN(d.getTime()) && toIso(d) === s;
}

const MONTH_LABEL = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

/** «2026 оны 11-р сар». */
export function monthLabel(iso: string): string {
  const d = parseIso(`${iso.slice(0, 7)}-01`);
  return `${d.getUTCFullYear()} оны ${MONTH_LABEL[d.getUTCMonth()]}-р сар`;
}

export function rangeLabel(r: DateRange): string {
  return `${r.from.replaceAll("-", ".")} – ${r.to.replaceAll("-", ".")}`;
}

// ── Тоон туслах ───────────────────────────────────────────

/** Хувь (1 оронтой); хуваагч 0 бол null («хамааралгүй»). */
export function pct(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return Math.round((1000 * num) / den) / 10;
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// ── Тохиргоо ──────────────────────────────────────────────

export type QualitySettings = {
  sample_per_criterion: number;
  grade_review_days: number;
  profile_complete_pct: number;
  showing_note_hours: number;
  consent_grace_days: number;
  fix_due_days: number;
  pass_score: number;
  commission_quality_min_pct: number;
};

export const DEFAULT_QUALITY_SETTINGS: QualitySettings = {
  sample_per_criterion: 10,
  grade_review_days: 30,
  profile_complete_pct: 100,
  showing_note_hours: 48,
  consent_grace_days: 7,
  fix_due_days: 3,
  pass_score: 90,
  commission_quality_min_pct: 80,
};

export function normalizeQualitySettings(raw: unknown): QualitySettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_QUALITY_SETTINGS;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    sample_per_criterion: clamp(Math.round(num(r.sample_per_criterion, d.sample_per_criterion)), 1, 200),
    grade_review_days: clamp(Math.round(num(r.grade_review_days, d.grade_review_days)), 1, 365),
    profile_complete_pct: clamp(num(r.profile_complete_pct, d.profile_complete_pct), 0, 100),
    showing_note_hours: clamp(Math.round(num(r.showing_note_hours, d.showing_note_hours)), 1, 720),
    consent_grace_days: clamp(Math.round(num(r.consent_grace_days, d.consent_grace_days)), 0, 365),
    fix_due_days: clamp(Math.round(num(r.fix_due_days, d.fix_due_days)), 1, 60),
    pass_score: clamp(num(r.pass_score, d.pass_score), 0, 100),
    commission_quality_min_pct: clamp(num(r.commission_quality_min_pct, d.commission_quality_min_pct), 0, 100),
  };
}

export type KpiTargets = {
  next_step_coverage_pct: number;
  overdue_max_pct: number;
  showing_feedback_hours: number;
  showing_feedback_pct: number;
  offer_followup_pct: number;
  hot_lead_frequency_pct: number;
  same_day_logging_pct: number;
  /** §8.5(5) «хангалттай урсгал»-ын босго (жинлэсэн хөлс, ₮); null бол төсвөөс тооцно. */
  sufficient_pipeline_mnt: number | null;
};

export const DEFAULT_KPI_TARGETS: KpiTargets = {
  next_step_coverage_pct: 100,
  overdue_max_pct: 5,
  showing_feedback_hours: 24,
  showing_feedback_pct: 95,
  offer_followup_pct: 100,
  hot_lead_frequency_pct: 100,
  same_day_logging_pct: 95,
  sufficient_pipeline_mnt: null,
};

export function normalizeKpiTargets(raw: unknown): KpiTargets {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_KPI_TARGETS;
  const p = (v: unknown, f: number) => Math.min(100, Math.max(0, num(v, f)));
  const suff = numOrNull(r.sufficient_pipeline_mnt);
  return {
    next_step_coverage_pct: p(r.next_step_coverage_pct, d.next_step_coverage_pct),
    overdue_max_pct: p(r.overdue_max_pct, d.overdue_max_pct),
    showing_feedback_hours: Math.max(1, Math.round(num(r.showing_feedback_hours, d.showing_feedback_hours))),
    showing_feedback_pct: p(r.showing_feedback_pct, d.showing_feedback_pct),
    offer_followup_pct: p(r.offer_followup_pct, d.offer_followup_pct),
    hot_lead_frequency_pct: p(r.hot_lead_frequency_pct, d.hot_lead_frequency_pct),
    same_day_logging_pct: p(r.same_day_logging_pct, d.same_day_logging_pct),
    sufficient_pipeline_mnt: suff != null && suff > 0 ? suff : null,
  };
}

// ── §6.29 Чанарын 12 шалгуур ──────────────────────────────

export const QUALITY_CRITERIA = [
  "duplicates",
  "owner",
  "source",
  "grade",
  "need_profile",
  "last_contact",
  "next_step",
  "stage_evidence",
  "showing_offer_notes",
  "lost_reason",
  "txn_roles",
  "data_use",
] as const;
export type QualityCriterion = (typeof QUALITY_CRITERIA)[number];

/** Шалгах зүйл ба тэнцэх нөхцөл (§6.29 хүснэгтийн нэр томьёо). */
export const QUALITY_CRITERION_LABEL: Record<QualityCriterion, { label: string; pass: string }> = {
  duplicates: { label: "Давхардсан бүртгэл", pass: "Нэгтгэсэн, шийдвэрлэсэн" },
  owner: { label: "Эзэмшигч агент", pass: "Бүртгэгдсэн" },
  source: { label: "Сэжимийн эх сурвалж", pass: "Бүртгэгдсэн" },
  grade: { label: "Сэжимийн ангилал", pass: "Шинэчлэгдсэн" },
  need_profile: { label: "Хэрэгцээний профайл", pass: "Шалгуур хангасан харилцагч бүрд бүрэн бөглөгдсөн" },
  last_contact: { label: "Сүүлийн холболт", pass: "Шинэчлэгдсэн" },
  next_step: { label: "Дараагийн үйлдэл, огноо", pass: "Идэвхтэй сэжим бүрд бүртгэгдсэн" },
  stage_evidence: { label: "Шат", pass: "Нотолгоо нь шаттайгаа тохирсон" },
  showing_offer_notes: { label: "Үзлэг, үнийн саналын тэмдэглэл", pass: "Бүрэн" },
  lost_reason: { label: "Алдсан шалтгаан", pass: "Алдсан бол заавал бүртгэгдсэн" },
  txn_roles: { label: "Хэлцлийн оролцогчдын үүрэг", pass: "Бүрэн" },
  data_use: { label: "Харилцагчийн мэдээллийн ашиглалт", pass: "Бодлогод нийцсэн" },
};

export function isQualityCriterion(v: unknown): v is QualityCriterion {
  return typeof v === "string" && (QUALITY_CRITERIA as readonly string[]).includes(v);
}

export type QualityResult = "pass" | "fail" | "na";

export const QUALITY_RESULT_LABEL: Record<QualityResult, { label: string; tone: "green" | "rose" | "neutral" }> = {
  pass: { label: "Тэнцсэн", tone: "green" },
  fail: { label: "Тэнцээгүй", tone: "rose" },
  na: { label: "Хамааралгүй", tone: "neutral" },
};

export const AUDIT_STATUS_LABEL: Record<string, { label: string; tone: "amber" | "green" | "neutral" }> = {
  in_review: { label: "Хянагдаж буй", tone: "amber" },
  completed: { label: "Дууссан", tone: "green" },
  cancelled: { label: "Цуцлагдсан", tone: "neutral" },
};

export const AUDIT_SCOPE_LABEL: Record<string, string> = {
  office: "Оффис бүхэлдээ",
  branch: "Салбар",
  agent: "Агент",
};

export type AuditItemLike = { auto_result: "pass" | "fail"; result: QualityResult | null };

export type AuditScore = {
  passed: number;
  failed: number;
  na: number;
  open: number;
  /** Тэнцсэн ÷ (тэнцсэн + тэнцээгүй) × 100; «Хамааралгүй» тооцохгүй. */
  score: number | null;
  /** Хянаагүй мөрийг автомат дүнгээр тооцсон урьдчилсан оноо. */
  provisional: number | null;
};

/** Аудитын оноо — DB-ийн crm_quality_audit_complete-тэй ижил томьёо. */
export function auditScore(items: AuditItemLike[]): AuditScore {
  let passed = 0;
  let failed = 0;
  let na = 0;
  let open = 0;
  let provPass = 0;
  let provFail = 0;
  for (const it of items) {
    const effective = it.result ?? it.auto_result;
    if (it.result == null) open += 1;
    if (it.result === "pass") passed += 1;
    else if (it.result === "fail") failed += 1;
    else if (it.result === "na") na += 1;
    if (effective === "pass") provPass += 1;
    else if (effective === "fail") provFail += 1;
  }
  return {
    passed,
    failed,
    na,
    open,
    score: open === 0 ? pct(passed, passed + failed) : null,
    provisional: pct(provPass, provPass + provFail),
  };
}

/** Шалгуур бүрийн дүн (аудитын хүснэгтэд). */
export function scoreByCriterion(
  items: (AuditItemLike & { criterion: string })[]
): Record<QualityCriterion, AuditScore> {
  const out = {} as Record<QualityCriterion, AuditScore>;
  for (const c of QUALITY_CRITERIA) out[c] = auditScore(items.filter((i) => i.criterion === c));
  return out;
}

export type QualityCheckRowLike = { criterion: string; result: "pass" | "fail"; agent_id?: string | null };

/** Нийт эзлэхүүний тэнцсэн хувь — §8.5(8) «CRM-ийн нийцэл», §6.25.6 чанарын хувь. */
export function populationPassPct(rows: QualityCheckRowLike[]): number | null {
  const pass = rows.filter((r) => r.result === "pass").length;
  return pct(pass, rows.length);
}

/**
 * §6.25.6 «CRM-ийн бүрэн, чанартай байдал» 10 оноо: чанарын хувийг жингээр
 * хувиргана. Шалгах бүртгэлгүй (хуваагч 0) бол null — оноо өгөхгүй, «хамааралгүй».
 */
export function qualityPoints(qualityPct: number | null, weight: number): number | null {
  if (qualityPct == null || !Number.isFinite(weight) || weight <= 0) return null;
  return Math.round(Math.min(100, Math.max(0, qualityPct)) * weight) / 100;
}

/**
 * §6.31: CRM-ийн чанарын босго хангаагүй хэлцлийн урамшууллыг хяналтад (зөвхөн
 * түдгэлзүүлэлт). Хувь тодорхойгүй бол хориг тавихгүй.
 */
export function commissionQualityHold(qualityPct: number | null, minPct: number): string | null {
  if (qualityPct == null || !Number.isFinite(minPct) || minPct <= 0) return null;
  if (qualityPct >= minPct) return null;
  return `Агентын CRM-ийн бүртгэлийн чанар ${qualityPct}% — тогтоосон босго ${minPct}%-иас доогуур тул хяналтад орлоо.`;
}

/** Аудитын мөрийн бүртгэл рүү очих холбоос. */
export function qualityEntityHref(entity: string, id: string, basePath: string): string | null {
  switch (entity) {
    case "crm_leads":
      return `${basePath}/leads/${id}`;
    case "crm_contacts":
      return `${basePath}/contacts/${id}`;
    case "crm_opportunities":
      return basePath.startsWith("/office") ? `${basePath}/deals/${id}` : `${basePath}/pipeline/${id}`;
    case "crm_transactions":
      return `${basePath}/transactions/${id}`;
    default:
      return null;
  }
}

export const QUALITY_ENTITY_LABEL: Record<string, string> = {
  crm_leads: "Сэжим",
  crm_contacts: "Харилцагч",
  crm_opportunities: "Боломж",
  crm_transactions: "Хэлцэл",
  crm_offers: "Үнийн санал",
  crm_activities: "Үзлэг",
};

// ── §8.1 Эргэн холбогдох ажиллагааны KPI ─────────────────

export type FollowupRow = {
  active_leads: number;
  leads_with_next_step: number;
  steps_total: number;
  steps_overdue: number;
  showings_total: number;
  showings_feedback_ok: number;
  offers_open: number;
  offers_followed: number;
  hot_leads: number;
  hot_leads_on_freq: number;
  material_total: number;
  material_same_day: number;
};

export const EMPTY_FOLLOWUP: FollowupRow = {
  active_leads: 0,
  leads_with_next_step: 0,
  steps_total: 0,
  steps_overdue: 0,
  showings_total: 0,
  showings_feedback_ok: 0,
  offers_open: 0,
  offers_followed: 0,
  hot_leads: 0,
  hot_leads_on_freq: 0,
  material_total: 0,
  material_same_day: 0,
};

export function sumFollowup(rows: Partial<FollowupRow>[]): FollowupRow {
  const out = { ...EMPTY_FOLLOWUP };
  for (const r of rows) {
    for (const k of Object.keys(out) as (keyof FollowupRow)[]) out[k] += Number(r[k] ?? 0) || 0;
  }
  return out;
}

export type KpiCode =
  | "next_step_coverage"
  | "overdue"
  | "showing_feedback"
  | "offer_followup"
  | "hot_lead_frequency"
  | "same_day_logging";

export type KpiResult = {
  code: KpiCode;
  label: string;
  num: number;
  den: number;
  value: number | null;
  target: number;
  /** "min" — зорилтоос багагүй байх; "max" — зорилтоос хэтрэхгүй байх. */
  direction: "min" | "max";
  /** ok — жишиг хангасан, warn — хангаагүй, na — тооцох бүртгэлгүй. */
  status: "ok" | "warn" | "na";
  targetLabel: string;
};

function judge(value: number | null, target: number, direction: "min" | "max"): KpiResult["status"] {
  if (value == null) return "na";
  return direction === "min" ? (value >= target ? "ok" : "warn") : value < target || (target === 0 && value === 0) ? "ok" : "warn";
}

/** §8.1-ийн 6 KPI — тоологч/хуваагч, жишигтэй харьцуулалт. */
export function followupKpis(row: FollowupRow, t: KpiTargets): KpiResult[] {
  const make = (
    code: KpiCode,
    label: string,
    n: number,
    d: number,
    target: number,
    direction: "min" | "max",
    targetLabel: string
  ): KpiResult => {
    const value = pct(n, d);
    return { code, label, num: n, den: d, value, target, direction, status: judge(value, target, direction), targetLabel };
  };
  return [
    make(
      "next_step_coverage",
      "Дараагийн үйлдлийн огноотой идэвхтэй сэжим",
      row.leads_with_next_step,
      row.active_leads,
      t.next_step_coverage_pct,
      "min",
      `${t.next_step_coverage_pct}%`
    ),
    make(
      "overdue",
      "Хугацаа хэтэрсэн эргэн холбогдолт",
      row.steps_overdue,
      row.steps_total,
      t.overdue_max_pct,
      "max",
      `${t.overdue_max_pct}%-иас бага`
    ),
    make(
      "showing_feedback",
      `Үзлэгийн эргэх холбоог ${t.showing_feedback_hours} цагийн дотор авсан`,
      row.showings_feedback_ok,
      row.showings_total,
      t.showing_feedback_pct,
      "min",
      `${t.showing_feedback_pct}% ба түүнээс дээш`
    ),
    make(
      "offer_followup",
      "Идэвхтэй үнийн саналын эргэн холбогдолт",
      row.offers_followed,
      row.offers_open,
      t.offer_followup_pct,
      "min",
      `${t.offer_followup_pct}%`
    ),
    make(
      "hot_lead_frequency",
      "Халуун сэжимтэй холбогдох давтамж",
      row.hot_leads_on_freq,
      row.hot_leads,
      t.hot_lead_frequency_pct,
      "min",
      `${t.hot_lead_frequency_pct}%`
    ),
    make(
      "same_day_logging",
      "Материаллаг үйл ажиллагааг тухайн өдөрт нь бүртгэсэн",
      row.material_same_day,
      row.material_total,
      t.same_day_logging_pct,
      "min",
      `${t.same_day_logging_pct}% ба түүнээс дээш`
    ),
  ];
}

/**
 * §6.25.5 «Эргэн холбогдолтыг хугацаанд нь хийсэн хувь» (Ш7 анхдагч санал):
 * хугацаа хэтрээгүй алхам ÷ огноотой бүх алхам. Алхамгүй бол null.
 */
export function onTimeFollowupPct(row: Pick<FollowupRow, "steps_total" | "steps_overdue">): number | null {
  return pct(Math.max(0, row.steps_total - row.steps_overdue), row.steps_total);
}

// ── §8.2 Шатлалын 10 алхам ────────────────────────────────

export const FUNNEL_STEPS = [
  "Сэжим",
  "Утга бүхий холболт",
  "Шалгуур хангасан",
  "Тохируулсан",
  "Үзлэг",
  "Сонирхсон",
  "Үнийн санал",
  "Хэлэлцээр",
  "Гэрээ",
  "Хаалт",
] as const;

export type FunnelCounts = [number, number, number, number, number, number, number, number, number, number];

export type FunnelRowLike = {
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
  s6: number;
  s7: number;
  s8: number;
  s9: number;
  s10: number;
};

export function sumFunnel(rows: FunnelRowLike[]): FunnelCounts {
  const out: FunnelCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const r of rows) {
    const vals = [r.s1, r.s2, r.s3, r.s4, r.s5, r.s6, r.s7, r.s8, r.s9, r.s10];
    vals.forEach((v, i) => (out[i] += Number(v) || 0));
  }
  return out;
}

export type FunnelStep = { label: string; count: number; fromPrev: number | null; fromFirst: number | null };

export function funnelSteps(c: FunnelCounts): FunnelStep[] {
  return FUNNEL_STEPS.map((label, i) => ({
    label,
    count: c[i],
    fromPrev: i === 0 ? null : pct(c[i], c[i - 1]),
    fromFirst: i === 0 ? null : pct(c[i], c[0]),
  }));
}

/** §8.3 Хөрвөлтийн 4 үзүүлэлт. */
export const CONVERSION_LABELS = [
  "Сэжим → Шалгуур хангасан",
  "Шалгуур хангасан → Үзлэг",
  "Үзлэг → Үнийн санал",
  "Үнийн санал → Хаалт",
] as const;

export function agentConversions(c: FunnelCounts): (number | null)[] {
  return [pct(c[2], c[0]), pct(c[4], c[2]), pct(c[6], c[4]), pct(c[9], c[6])];
}

// ── §8.5 Төсөв, төсөөлөл ─────────────────────────────────

export type BudgetLike = { month: string; amount: number; branch_id?: string | null; metric?: string };

/**
 * Хугацааны төсөв: сарын төсвийг хамрагдсан хоногоор хувааж нэмнэ (долоо
 * хоног хоёр сар дамнавал хоёулангаас). branchId заавал бол зөвхөн тэр салбар,
 * эс бол оффисын (салбаргүй) мөр.
 */
export function budgetForRange(budgets: BudgetLike[], range: DateRange, branchId: string | null = null): number {
  let total = 0;
  for (const b of budgets) {
    if ((b.metric ?? "revenue") !== "revenue") continue;
    if ((b.branch_id ?? null) !== branchId) continue;
    const m = monthRange(b.month);
    const from = m.from > range.from ? m.from : range.from;
    const to = m.to < range.to ? m.to : range.to;
    if (from > to) continue;
    const covered = daysBetweenIso(from, to) + 1;
    const monthDays = daysBetweenIso(m.from, m.to) + 1;
    total += (Number(b.amount) * covered) / monthDays;
  }
  return Math.round(total);
}

export type Variance = { variance: number; pct: number | null; status: "ok" | "warn" | "na" };

/** Гүйцэтгэл − төсөв, биелэлтийн хувь. Төсөвгүй бол «хамааралгүй». */
export function budgetVariance(actual: number, budget: number): Variance {
  if (!Number.isFinite(budget) || budget <= 0) return { variance: actual, pct: null, status: "na" };
  const p = pct(actual, budget);
  return { variance: Math.round(actual - budget), pct: p, status: actual >= budget ? "ok" : "warn" };
}

/**
 * §8.5(3) Төсөөллийн нарийвчлал = 100 − |бодит − төсөөлөл| ÷ бодит × 100 (0-оос
 * доош орохгүй). Бодит 0 бол: төсөөлөл ч 0 бол 100, эс бол 0.
 */
export function forecastAccuracy(forecast: number, actual: number): number | null {
  if (!Number.isFinite(forecast) || !Number.isFinite(actual)) return null;
  if (actual <= 0) return forecast <= 0 ? 100 : 0;
  const err = (Math.abs(actual - forecast) / actual) * 100;
  return Math.round(Math.max(0, 100 - err) * 10) / 10;
}

/**
 * §8.5(5) «Хангалттай урсгал»-ын босго: тохиргоонд заасан бол тэр; эс бол сарын
 * орлогын төсвийг идэвхтэй агентын тоонд хуваасан дүн. Аль нь ч үгүй бол null.
 */
export function sufficientPipelineThreshold(
  configured: number | null,
  monthBudget: number,
  activeAgents: number
): { value: number | null; source: "config" | "budget" | "none" } {
  if (configured != null && configured > 0) return { value: configured, source: "config" };
  if (monthBudget > 0 && activeAgents > 0) return { value: Math.round(monthBudget / activeAgents), source: "budget" };
  return { value: null, source: "none" };
}

export function perAgent(total: number, activeAgents: number): number | null {
  if (!Number.isFinite(total) || activeAgents <= 0) return null;
  return Math.round(total / activeAgents);
}

// ── Идэвхтэй агент, тогтвортой ажиллалт ──────────────────

export type StaffLike = {
  profile_id: string;
  roles: string[];
  is_active: boolean;
  offboarding?: boolean | null;
  hired_on?: string | null;
  left_on?: string | null;
};

export function isSellingAgent(s: StaffLike): boolean {
  return s.roles.includes("agent");
}

/** Идэвхтэй агент: агент дүртэй, идэвхтэй, гарах урсгалгүй, идэвхтэй сэжим эсвэл нээлттэй боломжтой. */
export function activeAgentIds(staff: StaffLike[], withWork: Set<string>): string[] {
  return staff
    .filter((s) => s.is_active && !s.offboarding && isSellingAgent(s) && withWork.has(s.profile_id))
    .map((s) => s.profile_id);
}

export type Retention = {
  atStart: number;
  hired: number;
  left: number;
  atEnd: number;
  retentionPct: number | null;
};

/** §8.5(10) Улирлын тогтвортой ажиллалт: эхэнд байсан агентаас үлдсэн хувь. */
export function agentRetention(staff: StaffLike[], range: DateRange): Retention {
  const agents = staff.filter(isSellingAgent);
  const employedOn = (s: StaffLike, d: string) =>
    (s.hired_on ?? "0000-01-01") <= d && (s.left_on == null || s.left_on > d);
  const atStart = agents.filter((s) => employedOn(s, range.from));
  const leftDuring = atStart.filter((s) => s.left_on != null && s.left_on >= range.from && s.left_on <= range.to);
  const hired = agents.filter((s) => s.hired_on != null && s.hired_on > range.from && s.hired_on <= range.to);
  const atEnd = agents.filter((s) => employedOn(s, range.to));
  return {
    atStart: atStart.length,
    hired: hired.length,
    left: leftDuring.length,
    atEnd: atEnd.length,
    retentionPct: pct(atStart.length - leftDuring.length, atStart.length),
  };
}

// ── Урамшууллын урьдчилсан тооцоо (R26) ──────────────────

export type PreviewGap = "roles" | "fee" | "verified_income";

export const PREVIEW_GAP_LABEL: Record<PreviewGap, string> = {
  roles: "Агентын урамшууллын үүрэг бүртгэгдээгүй",
  fee: "Хүлээгдэж буй хөлс бүртгэгдээгүй",
  verified_income: "Санхүү баталгаажуулсан орлого хараахан алга",
};

/** Урьдчилсан тооцооны суурь: баталгаажсан орлого байвал түүнийг, эс бол хүлээгдэж буй хөлсийг. */
export function previewBase(verifiedIncome: number, expectedFee: number | null): { base: number; gaps: PreviewGap[] } {
  const gaps: PreviewGap[] = [];
  if (verifiedIncome > 0) return { base: verifiedIncome, gaps };
  gaps.push("verified_income");
  if (expectedFee == null || expectedFee <= 0) {
    gaps.push("fee");
    return { base: 0, gaps };
  }
  return { base: expectedFee, gaps };
}
