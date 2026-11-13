/**
 * Улаанбаатарын огноо ба долоо хоногийн цонх (календарь, багийн хяналт).
 * Долоо хоног = Даваа 00:00 – Ням 24:00, Улаанбаатарын цагаар (UTC+8).
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

// ── Цаг ───────────────────────────────────────────────────

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

/** УБ-ын тухайн өдөр, цагийн бодит мөч (UTC Date). "24:00" = дараагийн өдрийн 00:00. */
export function ubDateTime(iso: string, hm: string): Date {
  const minutes = parseHmMinutes(hm) ?? 0;
  return new Date(parseIso(iso).getTime() + minutes * 60_000 - UB_OFFSET_MS);
}
