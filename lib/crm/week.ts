/**
 * Долоо хоногийн цонх ба хуваарь (U7 — PRO-001 v2.1 §6.19, §6.22, §6.24, §6.30).
 * Долоо хоног = Даваа 00:00 – Ням 24:00, Улаанбаатарын цагаар (UTC+8).
 * Хурлын цаг, түгжих мөч бүгд тохиргооноос (crm_settings 'weekly_cycle') ирнэ;
 * энд байгаа анхдагч утга нь тохиргоо уншигдаагүй үеийн нөөц (миграцитай ижил).
 * Цэвэр функц — DB-гүй, unit тестийн бай.
 */

const UB_OFFSET_MS = 8 * 3600_000;
const DAY_MS = 86_400_000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseIso(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !ISO_RE.test(v)) return false;
  const d = parseIso(v);
  return !Number.isNaN(d.getTime()) && toIso(d) === v;
}

/** Улаанбаатарын огноо (YYYY-MM-DD). */
export function ubDateIso(now: Date = new Date()): string {
  return new Date(now.getTime() + UB_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toIso(new Date(parseIso(iso).getTime() + days * DAY_MS));
}

/** ISO гариг: 1 = Даваа … 7 = Ням. */
export function isoWeekday(iso: string): number {
  const d = parseIso(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Огноо орсон долоо хоногийн Даваа. */
export function weekStartOf(iso: string): string {
  return addDays(iso, 1 - isoWeekday(iso));
}

/** Одоогийн (УБ) долоо хоногийн Даваа. */
export function currentWeekStart(now: Date = new Date()): string {
  return weekStartOf(ubDateIso(now));
}

export function addWeeks(week: string, n: number): string {
  return addDays(week, 7 * n);
}

export function weekEnd(week: string): string {
  return addDays(week, 6);
}

export function weekDays(week: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(week, i));
}

/**
 * URL-ийн ?week=… утгыг хэвийн болгоно: буруу бол одоогийн долоо хоног,
 * Даваа биш бол тухайн долоо хоногийн Даваа.
 */
export function normalizeWeekParam(raw: unknown, now: Date = new Date()): string {
  if (!isIsoDate(raw)) return currentWeekStart(now);
  return weekStartOf(raw);
}

const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

/** «2026.11.09 – 11.15» хэлбэрийн шошго. */
export function weekLabel(week: string): string {
  const end = weekEnd(week);
  const [y, m, d] = week.split("-");
  const [, m2, d2] = end.split("-");
  return `${y}.${m}.${d} – ${m2}.${d2}`;
}

/** «11-р сарын 9–15» хэлбэрийн богино шошго. */
export function weekShortLabel(week: string): string {
  const end = weekEnd(week);
  const m1 = MONTHS[Number(week.slice(5, 7)) - 1];
  const m2 = MONTHS[Number(end.slice(5, 7)) - 1];
  const d1 = Number(week.slice(8, 10));
  const d2 = Number(end.slice(8, 10));
  return m1 === m2 ? `${m1}-р сарын ${d1}–${d2}` : `${m1}-р сарын ${d1} – ${m2}-р сарын ${d2}`;
}

// ── Хуваарь ───────────────────────────────────────────────

export type WeekSlot = { weekday: number; time: string };

export type WeeklySchedule = {
  /** Даваагийн борлуулалтын хурал (§6.20, §9.5). */
  meeting: WeekSlot & { durationMin: number };
  /** Баасан гарагийн дүн шинжилгээ — урьдчилсан гүйцэтгэл энэ мөчид (Ш8). */
  review: WeekSlot;
  /** Эцсийн түгжээ: Ням 24:00-ээс хойш (+) эсвэл өмнө (−) цаг (Ш8: 0). */
  finalLockOffsetHours: number;
  /** Төлөвлөгөө бөглөөгүй агентад хурлаас хэдэн цагийн өмнө сануулах. */
  planReminderHours: number;
  /** Хурлын сануулга хэдэн минутын өмнө. */
  meetingReminderMin: number;
};

export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  meeting: { weekday: 1, time: "10:00", durationMin: 60 },
  review: { weekday: 5, time: "16:00" },
  finalLockOffsetHours: 0,
  planReminderHours: 16,
  meetingReminderMin: 30,
};

/** "HH:MM" → минут (00:00–24:00). Буруу бол null. */
export function parseHmMinutes(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function slot(raw: unknown, fallback: WeekSlot): WeekSlot {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const weekday = Math.round(num(o.weekday, fallback.weekday, 1, 7));
  const time = parseHmMinutes(o.time) != null ? String(o.time).trim() : fallback.time;
  return { weekday, time };
}

export function normalizeWeeklySchedule(raw: unknown): WeeklySchedule {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_WEEKLY_SCHEDULE;
  const meetingRaw = (o.meeting && typeof o.meeting === "object" ? o.meeting : {}) as Record<string, unknown>;
  return {
    meeting: {
      ...slot(o.meeting, d.meeting),
      durationMin: Math.round(num(meetingRaw.duration_min ?? meetingRaw.durationMin, d.meeting.durationMin, 15, 240)),
    },
    review: slot(o.review, d.review),
    finalLockOffsetHours: num(o.final_lock_offset_hours ?? o.finalLockOffsetHours, d.finalLockOffsetHours, -72, 72),
    planReminderHours: num(o.plan_reminder_hours ?? o.planReminderHours, d.planReminderHours, 0, 96),
    meetingReminderMin: num(o.meeting_reminder_min ?? o.meetingReminderMin, d.meetingReminderMin, 0, 240),
  };
}

/** УБ-ын тухайн өдөр, цагийн бодит мөч (UTC Date). "24:00" = дараагийн өдрийн 00:00. */
export function ubDateTime(iso: string, hm: string): Date {
  const minutes = parseHmMinutes(hm) ?? 0;
  return new Date(parseIso(iso).getTime() + minutes * 60_000 - UB_OFFSET_MS);
}

/** Долоо хоногийн тухайн гаригийн огноо (1 = Даваа). */
export function slotDate(week: string, weekday: number): string {
  return addDays(week, Math.min(7, Math.max(1, weekday)) - 1);
}

export function meetingAt(week: string, s: WeeklySchedule = DEFAULT_WEEKLY_SCHEDULE): Date {
  return ubDateTime(slotDate(week, s.meeting.weekday), s.meeting.time);
}

export function reviewAt(week: string, s: WeeklySchedule = DEFAULT_WEEKLY_SCHEDULE): Date {
  return ubDateTime(slotDate(week, s.review.weekday), s.review.time);
}

/** Эцсийн түгжээ = Ням 24:00 (УБ) + offset. */
export function finalLockAt(week: string, s: WeeklySchedule = DEFAULT_WEEKLY_SCHEDULE): Date {
  return new Date(ubDateTime(addDays(week, 7), "00:00").getTime() + s.finalLockOffsetHours * 3600_000);
}

export function planReminderAt(week: string, s: WeeklySchedule = DEFAULT_WEEKLY_SCHEDULE): Date {
  return new Date(meetingAt(week, s).getTime() - s.planReminderHours * 3600_000);
}

export type WeekPhase = {
  week: string;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
  /** Даваагийн хурал болсон эсэх. */
  meetingPassed: boolean;
  /** Баасан гарагийн урьдчилсан гүйцэтгэлийн мөч өнгөрсөн. */
  preliminary: boolean;
  /** Эцсийн түгжээ — гүйцэтгэл, дүн шинжилгээ засагдахгүй. */
  finalLocked: boolean;
};

export function weekPhase(week: string, now: Date = new Date(), s: WeeklySchedule = DEFAULT_WEEKLY_SCHEDULE): WeekPhase {
  const cur = currentWeekStart(now);
  const t = now.getTime();
  const locked = t >= finalLockAt(week, s).getTime();
  return {
    week,
    isCurrent: week === cur,
    isPast: week < cur,
    isFuture: week > cur,
    meetingPassed: t >= meetingAt(week, s).getTime(),
    preliminary: t >= reviewAt(week, s).getTime() && !locked,
    finalLocked: locked,
  };
}

/** Ням 24:00 хүртэл хэдэн цаг үлдсэн (сөрөг = түгжигдсэн). */
export function hoursUntilLock(week: string, now: Date = new Date(), s: WeeklySchedule = DEFAULT_WEEKLY_SCHEDULE): number {
  return Math.floor((finalLockAt(week, s).getTime() - now.getTime()) / 3600_000);
}

/** Даваагийн хурал болох мөчийн шошго: «Даваа 10:00». */
const WEEKDAY_LABEL = ["", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба", "Ням"];

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABEL[Math.min(7, Math.max(1, Math.round(weekday)))];
}

export function slotLabel(s: WeekSlot): string {
  return `${weekdayLabel(s.weekday)} ${s.time}`;
}
