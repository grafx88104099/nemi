/**
 * Агентын «Өнөөдөр» дэлгэцийн цэвэр логик (§8.3 «Өнөөдөр», §6.22, §6.23, R16).
 *
 * Нэг дараалал: эхний холболтын хугацаа → хүлээн авах → хугацаа хэтэрсэн
 * алхам → үзлэгийн эргэх холбоо → даалгавар → өнөөдрийн алхам, үзлэг,
 * уулзалт. Хойшлуулалт нь зөвхөн дэлгэцээс түр нуух бөгөөд алхмын огноо,
 * хэтрэлтийн тооцоонд нөлөөлөхгүй. Эхний холболтын хугацааг хойшлуулахгүй.
 *
 * Бүх тоон утга (босго, цаг, норм) тохиргооноос (crm_settings) ирнэ —
 * энд зөвхөн тохиргоо байхгүй үеийн нөөц утга.
 */

const UB_OFFSET_MS = 8 * 3600_000; // Монгол — зуны цаггүй, UTC+8

/** УБ-ын огноо 'YYYY-MM-DD'. */
export function ubIso(now: Date = new Date()): string {
  return new Date(now.getTime() + UB_OFFSET_MS).toISOString().slice(0, 10);
}

/** УБ-ын цаг (0–23). */
export function ubHour(now: Date = new Date()): number {
  return new Date(now.getTime() + UB_OFFSET_MS).getUTCHours();
}

/** УБ-ын гариг: 1 = Даваа … 7 = Ням. */
export function ubWeekday(now: Date = new Date()): number {
  const d = new Date(now.getTime() + UB_OFFSET_MS).getUTCDay();
  return d === 0 ? 7 : d;
}

/** УБ-ын өдрийн эхлэл/төгсгөлийн UTC мөч. */
export function ubDayBounds(iso: string): { start: string; end: string } {
  const start = new Date(Date.parse(`${iso}T00:00:00Z`) - UB_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 3600_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ── Тохиргоо ─────────────────────────────────────────────

export type TodaySettings = {
  slaWarnMin: number;
  snoozeHours: number[];
  snoozeMaxPerDay: number;
  conversionDays: number;
  dayCloseHour: number;
};

export const DEFAULT_TODAY_SETTINGS: TodaySettings = {
  slaWarnMin: 10,
  snoozeHours: [1, 3, 24],
  snoozeMaxPerDay: 10,
  conversionDays: 90,
  dayCloseHour: 17,
};

function posInt(v: unknown, fallback: number, max = 10_000): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n) : fallback;
}

export function normalizeTodaySettings(raw: unknown): TodaySettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_TODAY_SETTINGS;
  const hours = Array.isArray(r.snooze_hours)
    ? [...new Set(r.snooze_hours.map((h) => posInt(h, -1, 168)).filter((h) => h > 0))].sort((a, b) => a - b)
    : [];
  return {
    slaWarnMin: posInt(r.sla_warn_min, d.slaWarnMin, 240),
    snoozeHours: hours.length ? hours : d.snoozeHours,
    snoozeMaxPerDay: posInt(r.snooze_max_per_day, d.snoozeMaxPerDay, 200),
    conversionDays: Math.max(posInt(r.conversion_days, d.conversionDays, 92), 7),
    dayCloseHour: Math.min(posInt(r.day_close_hour, d.dayCloseHour, 23), 23),
  };
}

// ── Дарааллын мөр ────────────────────────────────────────

export type TodayKind = "sla" | "accept" | "lead_step" | "opp_step" | "feedback" | "task" | "showing" | "meeting";

/** Дэлгэцийн дараалал (R16): бага тоо түрүүлнэ. */
export const TODAY_GROUP: Record<TodayKind, number> = {
  sla: 0,
  accept: 0,
  lead_step: 1,
  opp_step: 1,
  feedback: 2,
  task: 3,
  showing: 4,
  meeting: 4,
};

export const TODAY_KIND_LABEL: Record<TodayKind, string> = {
  sla: "Эхний холболт",
  accept: "Хүлээн авах",
  lead_step: "Эргэн холбогдолт",
  opp_step: "Боломжийн алхам",
  feedback: "Үзлэгийн эргэх холбоо",
  task: "Даалгавар",
  showing: "Үзлэг",
  meeting: "Уулзалт",
};

export type TodayAction = "log" | "complete" | "open";

export type TodayItem = {
  key: string;
  kind: TodayKind;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  /** Хугацаа (мөч) — тоолуурт. */
  dueAt: string | null;
  /** Огнооны алхам (өдрийн түвшин). */
  dueDate: string | null;
  overdue: boolean;
  action: TodayAction;
  contactId: string | null;
  leadId: string | null;
  opportunityId: string | null;
  grade: string | null;
  leadIsNew: boolean;
  phone: string | null;
};

/** Хойшлуулж болох эсэх: эхний холболт, хүлээн авах хугацааг нуухгүй. */
export function canSnooze(kind: TodayKind): boolean {
  return kind !== "sla" && kind !== "accept";
}

function sortValue(i: TodayItem): number {
  if (i.dueAt) return Date.parse(i.dueAt);
  if (i.dueDate) return Date.parse(`${i.dueDate}T00:00:00Z`);
  return Number.MAX_SAFE_INTEGER;
}

/** R16 дараалал: бүлэг → хэтэрсэн нь түрүүнд → хугацаагаар. */
export function sortTodayItems(items: TodayItem[]): TodayItem[] {
  return [...items].sort((a, b) => {
    const g = TODAY_GROUP[a.kind] - TODAY_GROUP[b.kind];
    if (g !== 0) return g;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const t = sortValue(a) - sortValue(b);
    if (t !== 0) return t;
    return a.key.localeCompare(b.key);
  });
}

export type SnoozeRow = { item_kind: string; item_id: string; until: string; created_at?: string };

/** Идэвхтэй хойшлуулалттай мөрийг нууна (эхний холболт, хүлээн авахыг хэзээ ч нуухгүй). */
export function applySnoozes(
  items: TodayItem[],
  snoozes: SnoozeRow[],
  now: Date = new Date()
): { visible: TodayItem[]; snoozed: TodayItem[] } {
  const active = new Set(
    snoozes.filter((s) => Date.parse(s.until) > now.getTime()).map((s) => `${s.item_kind}:${s.item_id}`)
  );
  const visible: TodayItem[] = [];
  const snoozed: TodayItem[] = [];
  for (const i of items) {
    if (canSnooze(i.kind) && active.has(`${i.kind}:${i.id}`)) snoozed.push(i);
    else visible.push(i);
  }
  return { visible, snoozed };
}

/** Хойшлуулах хүсэлтийн шалгалт. Алдаа бол монгол мессеж. */
export function snoozeError(
  kind: TodayKind,
  hours: number,
  settings: TodaySettings,
  usedToday: number
): string | null {
  if (!canSnooze(kind)) return "Эхний холболтын хугацааг хойшлуулах боломжгүй — хугацаандаа холбогдоно уу.";
  if (!settings.snoozeHours.includes(hours)) return "Хойшлуулах хугацааг жагсаалтаас сонгоно уу.";
  if (usedToday >= settings.snoozeMaxPerDay) return "Өнөөдрийн хойшлуулах дээд тоонд хүрсэн байна.";
  return null;
}

export function snoozeUntil(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 3600_000);
}

export type SlaClock = { minutesLeft: number; overdue: boolean; tone: "rose" | "amber" | "green" };

/** Эхний холболтын тоолуур. */
export function slaClock(dueAt: string, now: Date, warnMin: number): SlaClock {
  const minutesLeft = Math.floor((Date.parse(dueAt) - now.getTime()) / 60_000);
  const overdue = minutesLeft < 0;
  return { minutesLeft, overdue, tone: overdue ? "rose" : minutesLeft <= warnMin ? "amber" : "green" };
}

/** «12 мин үлдсэн», «35 мин хэтэрсэн», «2 ц 10 мин үлдсэн». */
export function clockLabel(minutesLeft: number): string {
  const m = Math.abs(minutesLeft);
  const text = m >= 60 * 24 ? `${Math.floor(m / 1440)} хоног` : m >= 60 ? `${Math.floor(m / 60)} ц ${m % 60} мин` : `${m} мин`;
  return minutesLeft < 0 ? `${text} хэтэрсэн` : `${text} үлдсэн`;
}

/** Хэдэн хоног хэтэрсэн (огнооны алхам). */
export function daysOverdue(dueDate: string, todayIso: string): number {
  return Math.round((Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000);
}

// ── §6.22 Жишиг хэмнэл ───────────────────────────────────

export type DailyRhythm = Record<number, string[]>;

/** Тохиргооноос гариг бүрийн чиглэлийн шошго (1 = Даваа). */
export function normalizeRhythm(raw: unknown): DailyRhythm {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: DailyRhythm = {};
  for (let d = 1; d <= 7; d++) {
    const v = r[String(d)];
    out[d] = Array.isArray(v)
      ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim().slice(0, 60)).slice(0, 6)
      : [];
  }
  return out;
}

export const WEEKDAY_LONG = ["", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба", "Ням"];

// ── §6.23 Өдрийн блок, норм ──────────────────────────────

export type DailyNorms = {
  prospecting_new_opps: number;
  client_meaningful_contacts: number;
  client_meetings: number;
  property_showings: number;
  property_listings: number;
  closing_actions: number;
};

export const DEFAULT_DAILY_NORMS: DailyNorms = {
  prospecting_new_opps: 1,
  client_meaningful_contacts: 8,
  client_meetings: 1,
  property_showings: 1,
  property_listings: 0,
  closing_actions: 1,
};

export function normalizeDailyNorms(raw: unknown): DailyNorms {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_DAILY_NORMS };
  for (const k of Object.keys(out) as (keyof DailyNorms)[]) out[k] = posInt(r[k], DEFAULT_DAILY_NORMS[k], 500);
  return out;
}

export type DailyCounts = {
  newOpportunities: number;
  meaningfulContacts: number;
  meetings: number;
  showings: number;
  listingsActivated: number;
  closingActions: number;
};

export type BlockMetric = { label: string; value: number; norm: number; met: boolean };
export type DailyBlock = { code: "prospecting" | "client" | "property" | "closing"; label: string; metrics: BlockMetric[] };

function metric(label: string, value: number, norm: number): BlockMetric {
  return { label, value, norm, met: norm <= 0 || value >= norm };
}

/** §6.23-ын 4 блок, өдрийн нормтой харьцуулсан. Норм 0 бол «шаардлагагүй» гэж тооцно. */
export function dailyBlocks(c: DailyCounts, n: DailyNorms): DailyBlock[] {
  return [
    { code: "prospecting", label: "Идэвхтэй хайлт", metrics: [metric("Шинэ боломж", c.newOpportunities, n.prospecting_new_opps)] },
    {
      code: "client",
      label: "Харилцагч",
      metrics: [
        metric("Утга бүхий холболт", c.meaningfulContacts, n.client_meaningful_contacts),
        metric("Уулзалт", c.meetings, n.client_meetings),
      ],
    },
    {
      code: "property",
      label: "Үл хөдлөх",
      metrics: [metric("Үзлэг", c.showings, n.property_showings), metric("Шинэ листинг", c.listingsActivated, n.property_listings)],
    },
    { code: "closing", label: "Хаалт", metrics: [metric("Санал, хэлэлцээр, баримт", c.closingActions, n.closing_actions)] },
  ];
}

export type DayCloseInput = {
  activitiesToday: number;
  openWithoutNextStep: number;
  remainingToday: number;
  overdue: number;
};

export type DayCloseItem = { label: string; ok: boolean; hint: string };

/** «Өдрийн хаалт» — өдөр дуусахад шалгах зүйлс (§6.23 «Өдөр дуусахад»). */
export function dayCloseChecklist(i: DayCloseInput): DayCloseItem[] {
  return [
    {
      label: "Өнөөдрийн үйл ажиллагаа бүртгэгдсэн",
      ok: i.activitiesToday > 0,
      hint: i.activitiesToday > 0 ? `${i.activitiesToday} бүртгэл` : "Өнөөдөр нэг ч бүртгэл алга",
    },
    {
      label: "Нээлттэй бүртгэл бүр дараагийн үйлдлийн огноотой",
      ok: i.openWithoutNextStep === 0,
      hint: i.openWithoutNextStep === 0 ? "Бүгд огноотой" : `${i.openWithoutNextStep} бүртгэлд огноо алга`,
    },
    {
      label: "Өнөөдрийн ажил дууссан",
      ok: i.remainingToday === 0,
      hint: i.remainingToday === 0 ? "Үлдэгдэлгүй" : `${i.remainingToday} мөр үлдсэн`,
    },
    {
      label: "Хугацаа хэтэрсэн эргэн холбогдолт алга",
      ok: i.overdue === 0,
      hint: i.overdue === 0 ? "Хэтрэлтгүй" : `${i.overdue} хэтэрсэн`,
    },
  ];
}

// ── §8.3 Хэлцлийн урсгалын мини самбар ───────────────────

export const PIPELINE_BUCKETS = ["matched", "showing", "offer", "negotiation", "contract", "closing"] as const;
export type PipelineBucket = (typeof PIPELINE_BUCKETS)[number];

export const PIPELINE_BUCKET_LABEL: Record<PipelineBucket, string> = {
  matched: "Тохируулсан",
  showing: "Үзлэг",
  offer: "Үнийн санал",
  negotiation: "Хэлэлцээр",
  contract: "Гэрээ",
  closing: "Хаалт",
};

/** Шатны кодыг §8.3-ын «Хэлцлийн урсгал» багананд буулгана. Хамаарахгүй бол null. */
export function stageBucket(code: string): PipelineBucket | null {
  switch (code) {
    case "matched":
      return "matched";
    case "showing":
    case "showings":
    case "interested":
      return "showing";
    case "offer":
      return "offer";
    case "negotiation":
      return "negotiation";
    case "contract":
      return "contract";
    case "payment_closing":
    case "closing":
      return "closing";
    default:
      return null;
  }
}

export type OppLite = { stageCode: string; probability: number; expectedFee: number | null; terminal: boolean };

/** §8.3 «Орлого»: хүлээгдэж буй ба магадлалаар жинлэсэн цэвэр хөлс (Ш6). */
export function pipelineRevenue(opps: OppLite[]): { pending: number; weighted: number; missingFee: number } {
  let pending = 0;
  let weighted = 0;
  let missingFee = 0;
  for (const o of opps) {
    if (o.terminal) continue;
    if (o.expectedFee == null || !(o.expectedFee > 0)) {
      missingFee += 1;
      continue;
    }
    pending += o.expectedFee;
    weighted += (o.expectedFee * Math.max(0, Math.min(100, o.probability))) / 100;
  }
  return { pending: Math.round(pending), weighted: Math.round(weighted), missingFee };
}

/** Хувь (хуваагч 0 бол null). */
export function pctOf(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null;
}

// ── UX-6 Доод таб ────────────────────────────────────────

/**
 * Доод таб харагдах эсэх: /agent/crm, /agent/crm/<хэсэг>, ажлын жагсаалт,
 * холбоос. Карт (сэжим, харилцагч, боломж…) өөрийн доод үйлдлийн мөртэй.
 */
export function showBottomNav(pathname: string): boolean {
  const seg = pathname.split("/").filter(Boolean);
  if (seg[0] !== "agent" || seg[1] !== "crm") return false;
  if (seg.length <= 3) return true;
  return seg[2] === "worklists" || seg[2] === "links";
}
