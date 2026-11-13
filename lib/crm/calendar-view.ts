/**
 * CRM календарийн цэвэр логик — клиент, сервер хоёуланд ажиллана (DB-гүй).
 *
 *  • CalendarItem — үйл явдал, даалгавар, сэжмийн дараагийн үйлдэл, үзлэг,
 *    боломжийн уулзалт, сайтын үзлэгийг нэг хэлбэрт нэгтгэнэ.
 *  • Улаанбаатарын цаг: «өдөр» = УБ-ын огноо 'YYYY-MM-DD' (тогтмол UTC+8, зуны
 *    цаггүй); агшин бүр ISO (UTC) мөр. Хөтөч, серверийн цагийн бүсийг ашиглахгүй.
 *  • Өдөр/долоо хоног (Даваагаас)/сарын тор, 15 минутын алхам, чирэх тооцоо.
 *  • Өдрийн давхцлын байршил (Google Calendar маягийн багана, өргөн) ба
 *    бүтэн өдрийн мөрийн эгнээ.
 *  • Харах, зөөх эрхийн толь — DB-ийн RLS/RPC эцсийн үнэн, энд зөвхөн UI-д.
 */

import { addDays, isIsoDate, parseHmMinutes, ubDateIso, weekDays, weekShortLabel, weekStartOf } from "@/lib/crm/week";
import { fmtDayWithWeekday, fmtMonthYear, fmtTime, fmtTimeRange, type DateInput } from "@/lib/format";

const UB_OFFSET_MS = 8 * 3_600_000;
const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

/** Өдрийн минут. */
export const DAY_MINUTES = 1440;
/** Чирэх, шинээр үүсгэх алхам (минут). */
export const SLOT_MINUTES = 15;
/** crm_calendar_events()-ийн дээд муж. */
export const MAX_RANGE_DAYS = 62;
/** crm_events_range: нэг үйл явдал 31 хоногоос урт байж болохгүй. */
export const MAX_EVENT_DAYS = 31;
/** Хугацаагүй зүйлсийн (даалгавар, уулзалт) дэлгэцийн үргэлжлэх хугацаа. */
export const TASK_BLOCK_MINUTES = 30;
export const MEETING_BLOCK_MINUTES = 60;
export const SHOWING_DEFAULT_MINUTES = 60;
export const VIEWING_BLOCK_MINUTES = 60;

// ── Төрөл ─────────────────────────────────────────────────

export const CALENDAR_SOURCES = ["event", "task", "showing", "viewing"] as const;
export type CalendarSource = (typeof CALENDAR_SOURCES)[number];

export const CALENDAR_EVENT_KINDS = ["meeting", "call", "showing", "personal", "other"] as const;
export type CalendarEventKind = (typeof CALENDAR_EVENT_KINDS)[number];

export const CALENDAR_SOURCE_LABEL: Record<CalendarSource, string> = {
  event: "Үйл явдал",
  task: "Даалгавар",
  showing: "Үзүүлэлт",
  viewing: "Сайтын үзлэг",
};

export const CALENDAR_EVENT_KIND_LABEL: Record<CalendarEventKind, string> = {
  meeting: "Уулзалт",
  call: "Дуудлага",
  showing: "Үзлэг",
  personal: "Хувийн",
  other: "Бусад",
};

/** Нуугдсан (хувийн) үйл явдлын гарчиг — RPC-тэй ижил. */
export const CALENDAR_BUSY_TITLE = "Завгүй";

/** Өнгөний түлхүүр — UI нь Tailwind класс руу буулгана. */
export type CalendarColorKey = CalendarEventKind | Exclude<CalendarSource, "event" | "showing"> | "busy";

/** Үйл явдлын дэлгэрэнгүй (зөвхөн source = "event"); нуугдсан бол хоосон. */
export type CalendarEventDetail = {
  kind: CalendarEventKind;
  description: string | null;
  location: string | null;
  isPrivate: boolean;
  ownerId: string;
  /** Зохион байгуулагчийн (эзний) нэр. */
  ownerName: string | null;
  attendeeIds: string[];
  /** Урилгатай хүмүүсийн нэр (attendeeIds-ийн дарааллаар). */
  attendees: { profileId: string; name: string }[];
};

export type CalendarItem = {
  /** `${source}:${id}` — бүх эх сурвалжид давтагдахгүй. */
  key: string;
  source: CalendarSource;
  /** Эх хүснэгтийн мөрийн id. */
  id: string;
  title: string;
  subtitle: string | null;
  /** ISO агшин (UTC). */
  start: string;
  /** ISO агшин, хамаарахгүй (exclusive). Бүтэн өдрийнх бол сүүлийн өдрийн дараах УБ 00:00. */
  end: string;
  allDay: boolean;
  /** Календарийн эзэн: үйл явдлын эзэн, даалгаврын хариуцагч, үзүүлэлтийн агент. */
  personId: string;
  personName: string | null;
  /**
   * Сонгосон хүмүүсээс энэ зүйлд хамаарах нь (эзэн + урилгатай). Нуугдсан үйл явдлын
   * урилгатай хүн нууц тул хоосон байж болно — нэгдсэн харагдацад ч харуулна.
   */
  personIds: string[];
  colorKey: CalendarColorKey;
  /** Зүйлийн хуудас (даалгавар, Staff хэлцэл, зар); үйл явдалд null → цонхоор нээнэ. */
  href: string | null;
  /** Чирж цагийг өөрчлөх боломжтой эсэх (rescheduleItem/updateEvent). */
  canMove: boolean;
  /** Ирмэгээс сунгаж үргэлжлэх хугацааг өөрчлөх (зөвхөн өөрийн үйл явдал). */
  canResize: boolean;
  /** Зөөх боломжгүй шалтгаан (tooltip). */
  lockedReason: string | null;
  /** Хувийн үйл явдлыг «Завгүй» болгож нуусан. */
  masked: boolean;
  /** Эх сурвалжийн төлөв (даалгавар, үзүүлэлт, сайтын үзлэг). */
  status: string | null;
  /** Дууссан/хийгдсэн — UI бүдгэрүүлнэ. */
  done: boolean;
  event: CalendarEventDetail | null;
};

/** Сонгож болох хүн (getCalendarPeople). */
export type CalendarPerson = { profileId: string; name: string; teamId: string | null; isSelf: boolean };

export function isCalendarSource(v: unknown): v is CalendarSource {
  return typeof v === "string" && (CALENDAR_SOURCES as readonly string[]).includes(v);
}

export function isCalendarEventKind(v: unknown): v is CalendarEventKind {
  return typeof v === "string" && (CALENDAR_EVENT_KINDS as readonly string[]).includes(v);
}

export function eventColorKey(kind: CalendarEventKind, masked: boolean): CalendarColorKey {
  return masked ? "busy" : kind;
}

// ── Улаанбаатарын цаг ─────────────────────────────────────

function toMs(input: DateInput): number {
  if (input instanceof Date) return input.getTime();
  if (typeof input === "number") return input;
  return Date.parse(input);
}

/** Агшны УБ-ын огноо 'YYYY-MM-DD'. */
export function ubDay(input: DateInput): string {
  return ubDateIso(new Date(toMs(input)));
}

/** УБ-ын өдрийн 00:00 агшин. */
export function ubDayStart(day: string): Date {
  return new Date(Date.parse(`${day.slice(0, 10)}T00:00:00Z`) - UB_OFFSET_MS);
}

/** УБ-ын өдрийн төгсгөл = дараагийн өдрийн 00:00 (exclusive). */
export function ubDayEnd(day: string): Date {
  return ubDayStart(addDays(day.slice(0, 10), 1));
}

/** УБ-ын тухайн өдрийн N минутын агшин (1440 = дараагийн өдрийн 00:00). */
export function ubAt(day: string, minutes: number): Date {
  return new Date(ubDayStart(day).getTime() + minutes * MIN_MS);
}

/** Агшны УБ-ын өдрийн минут (0–1439, бүхэл). */
export function ubMinuteOfDay(input: DateInput): number {
  const wall = toMs(input) + UB_OFFSET_MS;
  return Math.floor((((wall % DAY_MS) + DAY_MS) % DAY_MS) / MIN_MS);
}

/** Огнооны зөрүү хоногоор (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / DAY_MS);
}

/** Огнооны сар нэмэх — сарын өдөр хэтэрвэл сүүлийн өдөр (1-31 + 1 сар = 2-28). */
export function addMonths(day: string, n: number): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7)) - 1 + n;
  const d = Number(day.slice(8, 10));
  const first = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/** Тухайн огноо орсон долоо хоногийн Даваа. */
export function calendarWeekStart(day: string): string {
  return weekStartOf(day);
}

// ── Харагдац, тор ─────────────────────────────────────────

export const CALENDAR_VIEWS = ["day", "week", "month", "agenda"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const CALENDAR_VIEW_LABEL: Record<CalendarView, string> = {
  day: "Өдөр",
  week: "7 хоног",
  month: "Сар",
  agenda: "Жагсаалт",
};

/** Жагсаалтын (agenda) харагдац: сонгосон өдрөөс хэдэн хоног. */
export const AGENDA_DAYS = 14;

export function normalizeCalendarView(raw: unknown, fallback: CalendarView = "week"): CalendarView {
  return typeof raw === "string" && (CALENDAR_VIEWS as readonly string[]).includes(raw) ? (raw as CalendarView) : fallback;
}

/** URL-ийн ?date= утга: буруу бол өнөөдөр (УБ). */
export function normalizeCalendarDate(raw: unknown, now: Date = new Date()): string {
  return isIsoDate(raw) ? raw : ubDateIso(now);
}

export type MonthGrid = {
  /** 'YYYY-MM'. */
  month: string;
  /** Сарын эхний, сүүлийн өдөр. */
  first: string;
  last: string;
  /** Даваагаас эхэлсэн 7 хоногийн мөрүүд (өмнөх/дараагийн сарын өдрүүдтэй). */
  weeks: string[][];
};

/** Сарын тор: Даваагаас эхэлсэн 4–6 мөр; fixedWeeks бол үргэлж 6 мөр (42 өдөр). */
export function monthGrid(day: string, opts: { fixedWeeks?: boolean } = {}): MonthGrid {
  const first = `${day.slice(0, 7)}-01`;
  const last = addDays(addMonths(first, 1), -1);
  const gridStart = weekStartOf(first);
  const rows = opts.fixedWeeks ? 6 : Math.floor(daysBetween(gridStart, weekStartOf(last)) / 7) + 1;
  const weeks = Array.from({ length: rows }, (_, r) => weekDays(addDays(gridStart, r * 7)));
  return { month: day.slice(0, 7), first, last, weeks };
}

export type CalendarRange = {
  days: string[];
  /** Уншилтын муж — ISO агшин, эхний өдрийн УБ 00:00 … сүүлийн өдрийн дараах 00:00. */
  from: string;
  to: string;
};

function consecutiveDays(first: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(first, i));
}

function rangeOfDays(days: string[]): CalendarRange {
  return {
    days,
    from: ubDayStart(days[0]).toISOString(),
    to: ubDayEnd(days[days.length - 1]).toISOString(),
  };
}

/** Харагдацын өдрүүд ба уншилтын муж (сар = 6 мөр хүртэл, 62 хоногоос бага). */
export function calendarRange(view: CalendarView, day: string): CalendarRange {
  const days =
    view === "day"
      ? [day]
      : view === "week"
        ? weekDays(weekStartOf(day))
        : view === "agenda"
          ? consecutiveDays(day, AGENDA_DAYS)
          : monthGrid(day).weeks.flat();
  return rangeOfDays(days);
}

/**
 * «Автомат» харагдац (URL-д ?view байхгүй): утсанд жагсаалт, бусадд 7 хоног —
 * зөвшөөрөгдөөгүй бол views-ийн эхнийх.
 */
export function autoCalendarViews(views: readonly CalendarView[] = CALENDAR_VIEWS): {
  phone: CalendarView;
  wide: CalendarView;
} {
  const pick = (want: CalendarView) => (views.includes(want) ? want : (views[0] ?? "week"));
  return { phone: pick("agenda"), wide: pick("week") };
}

/**
 * Серверийн уншилтын муж. view = null бол дэлгэцийн өргөнийг сервер мэдэхгүй тул
 * хоёр автомат харагдацын нэгдэл (7 хоног + жагсаалт = ≤ 20 хоног; ≤ 62).
 */
export function calendarFetchRange(
  view: CalendarView | null,
  day: string,
  views?: readonly CalendarView[]
): CalendarRange {
  if (view) return calendarRange(view, day);
  const auto = autoCalendarViews(views);
  const a = calendarRange(auto.phone, day).days;
  const b = calendarRange(auto.wide, day).days;
  const first = a[0] < b[0] ? a[0] : b[0];
  const last = a[a.length - 1] > b[b.length - 1] ? a[a.length - 1] : b[b.length - 1];
  return rangeOfDays(consecutiveDays(first, daysBetween(first, last) + 1));
}


/** URL-ийн ?people=: зөвхөн өөрийгөө харж байвал хасна (null). */
export function calendarPeopleParam(people: readonly string[], viewerId: string): string[] | null {
  return people.length === 1 && people[0] === viewerId ? null : [...people];
}

/** Өмнөх/дараагийн хуудас: step = −1 / +1. */
export function shiftCalendarDate(view: CalendarView, day: string, step: number): string {
  if (view === "day") return addDays(day, step);
  if (view === "week") return addDays(day, 7 * step);
  if (view === "agenda") return addDays(day, AGENDA_DAYS * step);
  return addMonths(day, step);
}

function monthDay(day: string): { y: number; m: number; d: number } {
  return { y: Number(day.slice(0, 4)), m: Number(day.slice(5, 7)), d: Number(day.slice(8, 10)) };
}

/** Огнооны мужийн шошго: «11-р сарын 11–24», «11-р сарын 25 – 12-р сарын 8», өөр онд онтой. */
export function dayRangeLabel(first: string, last: string): string {
  const a = monthDay(first);
  const b = monthDay(last);
  if (first === last) return `${a.m}-р сарын ${a.d}`;
  if (a.y !== b.y) return `${a.y} оны ${a.m}-р сарын ${a.d} – ${b.y} оны ${b.m}-р сарын ${b.d}`;
  if (a.m === b.m) return `${a.m}-р сарын ${a.d}–${b.d}`;
  return `${a.m}-р сарын ${a.d} – ${b.m}-р сарын ${b.d}`;
}

/** Толгойн шошго: «11-р сарын 9–15», «2026 оны 11-р сар», «11-р сарын 11, лхагва», жагсаалтад муж. */
export function calendarTitle(view: CalendarView, day: string): string {
  if (view === "week") return weekShortLabel(weekStartOf(day));
  if (view === "agenda") return dayRangeLabel(day, addDays(day, AGENDA_DAYS - 1));
  const noon = ubAt(day, 12 * 60);
  return view === "month" ? fmtMonthYear(noon) : fmtDayWithWeekday(noon);
}

// ── 15 минутын алхам, чирэх ───────────────────────────────

export type SnapMode = "round" | "floor" | "ceil";

export function snapMinutes(minutes: number, step: number = SLOT_MINUTES, mode: SnapMode = "round"): number {
  const f = mode === "floor" ? Math.floor : mode === "ceil" ? Math.ceil : Math.round;
  // −0-ийг 0 болгоно (Object.is тэгшитгэлд саад болохгүй).
  return f(minutes / step) * step + 0;
}

/** Агшныг УБ-ын өдрийн доторх алхамд тааруулна. */
export function snapInstant(input: DateInput, step: number = SLOT_MINUTES, mode: SnapMode = "round"): Date {
  const t = toMs(input);
  const dayStart = ubDayStart(ubDay(t)).getTime();
  return new Date(dayStart + snapMinutes((t - dayStart) / MIN_MS, step, mode) * MIN_MS);
}

/** Өдрийн баганын дээрээс offsetPx зайг минут болгоно (алхмаар доош тааруулж, өдөрт багтаана). */
export function pointerMinute(offsetPx: number, columnHeightPx: number, step: number = SLOT_MINUTES): number {
  if (!(columnHeightPx > 0)) return 0;
  const raw = (offsetPx / columnHeightPx) * DAY_MINUTES;
  return Math.min(DAY_MINUTES - step, Math.max(0, snapMinutes(raw, step, "floor")));
}

export type TimeRange = { start: string; end: string };
export type DragMode = "move" | "resize-start" | "resize-end";

/**
 * Чирэлтийн шинэ муж: deltaMinutes-ийг алхамд тааруулж, зөөх үед үргэлжлэх
 * хугацааг хадгална; сунгах үед хамгийн багадаа minMinutes үлдээнэ.
 */
export function dragRange(
  range: TimeRange,
  deltaMinutes: number,
  mode: DragMode,
  opts: { step?: number; minMinutes?: number } = {}
): TimeRange {
  const step = opts.step ?? SLOT_MINUTES;
  const min = (opts.minMinutes ?? step) * MIN_MS;
  const delta = snapMinutes(deltaMinutes, step) * MIN_MS;
  const s = Date.parse(range.start);
  const e = Date.parse(range.end);
  if (mode === "move") return { start: new Date(s + delta).toISOString(), end: new Date(e + delta).toISOString() };
  if (mode === "resize-end") return { start: range.start, end: new Date(Math.max(e + delta, s + min)).toISOString() };
  return { start: new Date(Math.min(s + delta, e - min)).toISOString(), end: range.end };
}

/** Цагтай зүйлийг өөр өдөр, цаг руу зөөнө (үргэлжлэх хугацаа хадгалагдана). */
export function moveToSlot(range: TimeRange, day: string, minuteOfDay: number, step: number = SLOT_MINUTES): TimeRange {
  const duration = Date.parse(range.end) - Date.parse(range.start);
  const start = ubAt(day, snapMinutes(minuteOfDay, step));
  return { start: start.toISOString(), end: new Date(start.getTime() + duration).toISOString() };
}

/** Бүтэн өдөр, сарын харагдацад өдрөөр зөөнө — УБ-ын цаг, үргэлжлэх хугацаа хадгалагдана. */
export function moveToDay(range: TimeRange, day: string): TimeRange {
  const shift = daysBetween(ubDay(range.start), day) * DAY_MS;
  return {
    start: new Date(Date.parse(range.start) + shift).toISOString(),
    end: new Date(Date.parse(range.end) + shift).toISOString(),
  };
}

/**
 * Хугацаагүй зүйлийн (даалгаврын хугацаа, уулзалт) дэлгэцийн төгсгөл: start + minutes,
 * гэхдээ УБ-ын шөнө дундаас хэтрүүлэхгүй (23:50-ийн даалгавар дараагийн өдөрт орохгүй).
 */
export function blockEnd(start: DateInput, minutes: number): string {
  const s = toMs(start);
  return new Date(Math.min(s + minutes * MIN_MS, ubDayEnd(ubDay(s)).getTime())).toISOString();
}

/** Бүтэн өдрийн муж: эхний өдрийн 00:00 … сүүлийн өдрийн (оролцуулан) дараах 00:00. */
export function allDayRange(firstDay: string, lastDay: string = firstDay): TimeRange {
  const last = lastDay < firstDay ? firstDay : lastDay;
  return { start: ubDayStart(firstDay).toISOString(), end: ubDayEnd(last).toISOString() };
}

/**
 * Бүтэн өдрийн үйл явдлын хадгалах муж: эхлэлийг УБ 00:00 руу доош, төгсгөлийг
 * дараагийн 00:00 руу дээш тааруулна (хамгийн багадаа 1 өдөр).
 */
export function normalizeAllDayRange(range: TimeRange): TimeRange {
  const startDay = ubDay(range.start);
  const e = Date.parse(range.end);
  const endDayStart = ubDayStart(ubDay(e)).getTime();
  const lastDay = e === endDayStart ? addDays(ubDay(e), -1) : ubDay(e);
  return allDayRange(startDay, lastDay);
}

// ── Өдрийн хэрчим ─────────────────────────────────────────

type Timed = { key: string; start: string; end: string; allDay?: boolean };

/** Бүтэн өдрийн мөрөнд харуулах уу: бүтэн өдрийн эсвэл 24 цагаас урт. */
export function isAllDayLike(item: Pick<Timed, "start" | "end" | "allDay">): boolean {
  return Boolean(item.allDay) || Date.parse(item.end) - Date.parse(item.start) >= DAY_MS;
}

/** Зүйлийн хамаарах УБ-ын өдрүүд (төгсгөл exclusive). */
export function itemDays(item: Pick<Timed, "start" | "end">): string[] {
  const s = Date.parse(item.start);
  const e = Math.max(s, Date.parse(item.end) - 1);
  const first = ubDay(s);
  const n = daysBetween(first, ubDay(e));
  return Array.from({ length: n + 1 }, (_, i) => addDays(first, i));
}

export type DaySegment<T extends Timed = CalendarItem> = {
  item: T;
  day: string;
  /** Өдрийн эхнээс минут (0–1440). */
  startMin: number;
  endMin: number;
  /** Өмнөх өдрөөс үргэлжилсэн / дараагийн өдөрт үргэлжилнэ (шөнө дунд дамнасан). */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/** Цагтай зүйлийн тухайн өдөрт хамаарах хэсэг (байхгүй бол null). */
export function daySegment<T extends Timed>(item: T, day: string): DaySegment<T> | null {
  const s = Date.parse(item.start);
  const e = Math.max(s, Date.parse(item.end));
  const ds = ubDayStart(day).getTime();
  const de = ds + DAY_MS;
  const overlaps = e > s ? s < de && e > ds : s >= ds && s < de;
  if (!overlaps) return null;
  return {
    item,
    day,
    startMin: Math.max(0, (s - ds) / MIN_MS),
    endMin: Math.min(DAY_MINUTES, (e - ds) / MIN_MS),
    continuesBefore: s < ds,
    continuesAfter: e > de,
  };
}

/** Тухайн өдрийн цагтай хэрчмүүд, эхлэлээр эрэмбэлсэн (сарын нүдэнд). */
export function timedSegmentsOnDay<T extends Timed>(items: readonly T[], day: string): DaySegment<T>[] {
  const out: DaySegment<T>[] = [];
  for (const it of items) {
    if (isAllDayLike(it)) continue;
    const seg = daySegment(it, day);
    if (seg) out.push(seg);
  }
  return out.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin || cmp(a.item.key, b.item.key));
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ── Давхцлын байршил (Google Calendar маяг) ───────────────

export type LaidOutSegment<T extends Timed = CalendarItem> = DaySegment<T> & {
  /** Багана (0-ээс), бөөгнөрлийн нийт багана. */
  column: number;
  columns: number;
  /** Баруун тийш сул баганаар сунгасан баганын тоо (≥ 1). */
  span: number;
  /** Өдрийн баганын өргөнөөс эзлэх хувь (0–1). */
  left: number;
  width: number;
};

/**
 * Өдрийн цагтай зүйлсийн байршил: давхцсан зүйлс бөөгнөрөл болж багана
 * хуваана; зүйл бүр эхний сул баганад орж, баруун талын сул баганаар
 * сунана. minMinutes — богино зүйлийн дэлгэц дээрх хамгийн бага өндөр
 * (давхцлыг түүгээр тооцно).
 */
export function layoutDay<T extends Timed>(
  items: readonly T[],
  day: string,
  opts: { minMinutes?: number } = {}
): LaidOutSegment<T>[] {
  const minMinutes = opts.minMinutes ?? SLOT_MINUTES;
  const segs = timedSegmentsOnDay(items, day).map((s) => ({
    seg: s,
    top: s.startMin,
    bottom: Math.min(DAY_MINUTES, Math.max(s.endMin, s.startMin + minMinutes)),
    column: 0,
  }));
  segs.sort((a, b) => a.top - b.top || b.bottom - a.bottom || cmp(a.seg.item.key, b.seg.item.key));

  const out: LaidOutSegment<T>[] = [];
  let i = 0;
  while (i < segs.length) {
    // Бөөгнөрөл: өмнөхүүдийн хамгийн их төгсгөлөөс өмнө эхэлсэн бүх зүйл.
    const cluster = [segs[i]];
    let maxBottom = segs[i].bottom;
    let j = i + 1;
    while (j < segs.length && segs[j].top < maxBottom) {
      cluster.push(segs[j]);
      maxBottom = Math.max(maxBottom, segs[j].bottom);
      j += 1;
    }
    const colEnds: number[] = [];
    for (const c of cluster) {
      let col = colEnds.findIndex((end) => end <= c.top);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(c.bottom);
      } else {
        colEnds[col] = c.bottom;
      }
      c.column = col;
    }
    const columns = colEnds.length;
    for (const c of cluster) {
      let span = 1;
      for (let k = c.column + 1; k < columns; k += 1) {
        const blocked = cluster.some((o) => o.column === k && o.top < c.bottom && o.bottom > c.top);
        if (blocked) break;
        span += 1;
      }
      out.push({ ...c.seg, column: c.column, columns, span, left: c.column / columns, width: span / columns });
    }
    i = j;
  }
  return out.sort((a, b) => a.startMin - b.startMin || a.column - b.column);
}

export type AllDayPlacement<T extends Timed = CalendarItem> = {
  item: T;
  /** days доторх эхний багана ба эзлэх өдрийн тоо. */
  startCol: number;
  span: number;
  /** Мөр (0-ээс). */
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/**
 * Бүтэн өдрийн мөрийн байршил (7 хоногийн толгой, сарын нэг мөр): олон өдөр
 * дамнасан зүйлс нэг зурвас болж, давхцахгүй эгнээнд байрлана.
 */
export function layoutAllDay<T extends Timed>(
  items: readonly T[],
  days: readonly string[]
): { placements: AllDayPlacement<T>[]; lanes: number } {
  if (!days.length) return { placements: [], lanes: 0 };
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const rows: Omit<AllDayPlacement<T>, "lane">[] = [];
  for (const item of items) {
    if (!isAllDayLike(item)) continue;
    const span = itemDays(item);
    const a = span[0];
    const b = span[span.length - 1];
    if (b < firstDay || a > lastDay) continue;
    const from = a < firstDay ? firstDay : a;
    const to = b > lastDay ? lastDay : b;
    const startCol = days.indexOf(from);
    const endCol = days.indexOf(to);
    if (startCol === -1 || endCol === -1) continue;
    rows.push({ item, startCol, span: endCol - startCol + 1, continuesBefore: a < firstDay, continuesAfter: b > lastDay });
  }
  rows.sort(
    (x, y) =>
      x.startCol - y.startCol ||
      y.span - x.span ||
      Date.parse(x.item.start) - Date.parse(y.item.start) ||
      cmp(x.item.key, y.item.key)
  );
  const laneEnds: number[] = [];
  const placements = rows.map((r) => {
    let lane = laneEnds.findIndex((end) => end < r.startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(r.startCol + r.span - 1);
    } else {
      laneEnds[lane] = r.startCol + r.span - 1;
    }
    return { ...r, lane };
  });
  return { placements, lanes: laneEnds.length };
}

// ── Эрх (DB-ийн толь; эцсийн шийдвэр RLS/RPC) ─────────────

export type CalendarViewer = {
  profileId: string;
  /** crm_staff.roles. */
  roles: readonly string[];
  /** crm_staff.team_id. */
  teamId: string | null;
  /** profiles.role (даалгаврын эрхэд: office_admin, admin). */
  userRole?: string | null;
};

/** crm_is_manager(): бүх хүний календарийг харна. */
export const CALENDAR_MANAGER_ROLES = ["sales_director", "ops_qc", "ceo"] as const;

export function isCalendarManager(roles: readonly string[]): boolean {
  return roles.some((r) => (CALENDAR_MANAGER_ROLES as readonly string[]).includes(r));
}

function isTeamOf(viewer: CalendarViewer, personTeamId: string | null | undefined): boolean {
  return viewer.roles.includes("team_lead") && !!viewer.teamId && personTeamId === viewer.teamId;
}

/** crm_calendar_can_view(): өөрөө, менежер, эсвэл багийн ахлагч өөрийн багийн идэвхтэй гишүүнийг. */
export function canViewCalendar(
  viewer: CalendarViewer,
  person: { profileId: string; teamId: string | null; isActive?: boolean | null }
): boolean {
  if (person.profileId === viewer.profileId) return true;
  if (isCalendarManager(viewer.roles)) return true;
  return person.isActive !== false && isTeamOf(viewer, person.teamId);
}

/** can_edit_task(): үүсгэгч, хариуцагч, оффисын админ, платформын админ. */
export function canEditTask(viewer: CalendarViewer, task: { created_by: string; responsible_id: string }): boolean {
  return (
    task.created_by === viewer.profileId ||
    task.responsible_id === viewer.profileId ||
    viewer.userRole === "office_admin" ||
    viewer.userRole === "admin"
  );
}

export const CALENDAR_LOCK_REASON = {
  masked: "Хувийн үйл явдал",
  notOwner: "Зөвхөн үүсгэсэн хүн өөрчилнө",
  noRights: "Танд өөрчлөх эрх алга",
  taskDone: "Дууссан даалгаврын хугацааг өөрчлөхгүй",
  showing: "Үзүүлэлтийн цагийг Staff хэлцлийн хуудаснаас өөрчилнө",
  viewing: "Сайтын үзлэгийн цагийг календарьаас өөрчлөхгүй",
} as const;

export type Movability = { canMove: boolean; canResize: boolean; lockedReason: string | null };

export function lockedMovability(reason: string): Movability {
  return { canMove: false, canResize: false, lockedReason: reason };
}

const LOCKED = lockedMovability;
const MOVABLE: Movability = { canMove: true, canResize: false, lockedReason: null };

export function eventMovability(e: { can_edit: boolean; masked: boolean }): Movability {
  if (e.masked) return LOCKED(CALENDAR_LOCK_REASON.masked);
  if (!e.can_edit) return LOCKED(CALENDAR_LOCK_REASON.notOwner);
  return { canMove: true, canResize: true, lockedReason: null };
}

/** Даалгаврын хугацаа: updateTask (засах эрхтэй, дуусаагүй). */
export function taskMovability(viewer: CalendarViewer, t: { created_by: string; responsible_id: string; status: string }): Movability {
  if (t.status === "completed") return LOCKED(CALENDAR_LOCK_REASON.taskDone);
  return canEditTask(viewer, t) ? MOVABLE : LOCKED(CALENDAR_LOCK_REASON.noRights);
}

/**
 * Зөөх газар зөвшөөрөгдөх эсэх (UI-д урьдчилж). Одоогийн эх сурвалжуудад өдрийн
 * хязгаар байхгүй; day, todayIso (УБ-ын өнөөдөр) нь дараа нэмэгдэх дүрэмд.
 */
export function canDropOnDay(item: Pick<CalendarItem, "source" | "canMove">, day: string, todayIso: string): boolean {
  void day;
  void todayIso;
  return item.canMove;
}

// ── Холбоос ───────────────────────────────────────────────

/** basePath: "/agent/crm" эсвэл "/office/crm". */
function isOffice(basePath: string): boolean {
  return basePath.startsWith("/office");
}

export const calendarHref = {
  contact: (basePath: string, id: string) => `${basePath}/contacts/${id}`,
  /** Staff хөрөнгийн карт. */
  property: (basePath: string, id: string) => `${basePath}/staff/${id}`,
  /** Хөрөнгө × харилцагчийн хэлцэл. */
  deal: (basePath: string, propertyId: string, dealId: string) => `${basePath}/staff/${propertyId}/deals/${dealId}`,
  task: (basePath: string, id: string) => `${isOffice(basePath) ? "/office" : "/agent"}/tasks/${id}`,
  viewing: (listingId: string) => `/listings/${listingId}`,
  /** Календарийн хуудас (мэдэгдлийн холбоос, revalidate). opts — тодорхой харагдац, хүмүүстэй нээх. */
  calendar: (
    basePath: string,
    day?: string | null,
    opts: { view?: CalendarView | null; people?: readonly string[] | null } = {}
  ) => `${basePath}/calendar${calendarSearch("", { view: opts.view ?? null, date: day ?? null, people: opts.people ?? null })}`,
};

// ── Нэгтгэл ───────────────────────────────────────────────

/** Сонгосон хүмүүсээс зүйлд хамаарах нь (давхардалгүй, эзэн эхэнд). */
export function personIdsIn(candidates: readonly (string | null | undefined)[], people: readonly string[]): string[] {
  const set = new Set(people);
  const out: string[] = [];
  for (const c of candidates) if (c && set.has(c) && !out.includes(c)) out.push(c);
  return out;
}

/** Эх сурвалжуудыг нэгтгэж эрэмбэлнэ: эхлэл, бүтэн өдрийнх түрүүнд, урт нь түрүүнд, key. */
export function sortCalendarItems<T extends Timed>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      Date.parse(a.start) - Date.parse(b.start) ||
      Number(isAllDayLike(b)) - Number(isAllDayLike(a)) ||
      Date.parse(b.end) - Date.parse(a.end) ||
      cmp(a.key, b.key)
  );
}

/** Зүйл уншилтын мужтай давхцах эсэх (хугацаагүй цэг зүйлийг эхлэлээр). */
export function overlapsRange(item: Pick<Timed, "start" | "end">, from: string, to: string): boolean {
  const s = Date.parse(item.start);
  const e = Date.parse(item.end);
  const f = Date.parse(from);
  const t = Date.parse(to);
  return e > s ? s < t && e > f : s >= f && s < t;
}

// ── UI туслах (components/crm/calendar) ───────────────────

/** Цагийн торын нэг цагийн өндөр (px). */
export const HOUR_PX = 48;
/** Цагийн торыг анх энэ минут орчим гүйлгэнэ (08:00). */
export const CALENDAR_SCROLL_MINUTE = 8 * 60;
/** Хоосон нүдэн дээр дарж үүсгэх үйл явдлын үргэлжлэх хугацаа. */
export const CREATE_DEFAULT_MINUTES = 60;
/** Нэг дор давхарлаж харах хүний дээд тоо (URL ?people=). */
export const MAX_CALENDAR_PEOPLE = 12;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParamValue = string | string[] | undefined;

function firstParam(v: SearchParamValue): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** URL-ийн төлөв: view = null бол «автомат» (утсанд жагсаалт, бусадд 7 хоног). */
export type CalendarQuery = { view: CalendarView | null; date: string; people: string[] };

/** ?people=uuid,uuid — буруу, давхардсаныг хасаж, MAX_CALENDAR_PEOPLE хүртэл. */
export function parsePeopleParam(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    if (UUID_RE.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= MAX_CALENDAR_PEOPLE) break;
  }
  return out;
}

/** searchParams → харагдац, огноо (УБ), хүмүүс. defaults — URL-д байхгүй үеийн утга (суулгасан хуудсанд). */
export function parseCalendarQuery(
  sp: Record<string, SearchParamValue>,
  now: Date = new Date(),
  defaults: { view?: CalendarView | null; date?: string | null } = {}
): CalendarQuery {
  const rawView = firstParam(sp.view);
  const view = (CALENDAR_VIEWS as readonly string[]).includes(rawView ?? "")
    ? (rawView as CalendarView)
    : (defaults.view ?? null);
  const rawDate = firstParam(sp.date);
  const date = isIsoDate(rawDate) ? rawDate : isIsoDate(defaults.date) ? defaults.date : ubDateIso(now);
  return { view, date, people: parsePeopleParam(firstParam(sp.people)) };
}

/** Одоогийн query-д view/date/people-г солино (null = хасна); бусад параметр хэвээр. «?…» эсвэл "". */
export function calendarSearch(
  current: string | URLSearchParams,
  patch: { view?: CalendarView | null; date?: string | null; people?: readonly string[] | null }
): string {
  const p = new URLSearchParams(current);
  const put = (key: string, value: string | null | undefined) => {
    if (value === undefined) return;
    if (value) p.set(key, value);
    else p.delete(key);
  };
  put("view", patch.view);
  put("date", patch.date);
  if (patch.people !== undefined) put("people", patch.people?.length ? patch.people.join(",") : null);
  const s = p.toString();
  return s ? `?${s}` : "";
}

// Товчлол (Google Calendar маяг).

export type CalendarShortcut =
  | { type: "today" }
  | { type: "view"; view: CalendarView }
  | { type: "shift"; step: 1 | -1 }
  | { type: "create" };

const SHORTCUT_BY_CODE: Record<string, CalendarShortcut> = {
  KeyT: { type: "today" },
  KeyD: { type: "view", view: "day" },
  KeyW: { type: "view", view: "week" },
  KeyM: { type: "view", view: "month" },
  KeyA: { type: "view", view: "agenda" },
  KeyJ: { type: "shift", step: 1 },
  KeyN: { type: "shift", step: 1 },
  KeyK: { type: "shift", step: -1 },
  KeyP: { type: "shift", step: -1 },
  KeyC: { type: "create" },
};

/** Товчлуур → үйлдэл. Физик товчоор (e.code) — монгол кирилл байрлалд ч ажиллана. */
export function calendarShortcut(e: {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): CalendarShortcut | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
  if (e.key === "ArrowRight") return { type: "shift", step: 1 };
  if (e.key === "ArrowLeft") return { type: "shift", step: -1 };
  const byCode = SHORTCUT_BY_CODE[e.code ?? ""];
  if (byCode) return byCode;
  return e.key.length === 1 ? (SHORTCUT_BY_CODE[`Key${e.key.toUpperCase()}`] ?? null) : null;
}

// Хүнээр өнгөлөх (олон хүн давхарлаж харахад).

export const PERSON_COLOR_COUNT = 8;

/** Зүйлийг аль сонгосон хүний өнгөөр будах: эзэн, эс бөгөөс урилгатай сонгосон хүн. */
export function itemPersonId(item: Pick<CalendarItem, "personId" | "personIds">, selected: readonly string[]): string {
  if (selected.includes(item.personId)) return item.personId;
  return item.personIds.find((id) => selected.includes(id)) ?? item.personId;
}

export function personColorIndex(personId: string, selected: readonly string[]): number {
  const i = selected.indexOf(personId);
  return (i < 0 ? 0 : i) % PERSON_COLOR_COUNT;
}

// Хулгана, хуруугаар үүсгэх, зөөх.

function clampMinute(m: number, max: number = DAY_MINUTES - SLOT_MINUTES): number {
  return Math.min(max, Math.max(0, m));
}

export function sameRange(a: TimeRange, b: TimeRange): boolean {
  return Date.parse(a.start) === Date.parse(b.start) && Date.parse(a.end) === Date.parse(b.end);
}

/** Хоосон нүдэн дээр дарахад: алхмаар доош тааруулсан эхлэл, durationMin (УБ шөнө дундаас хэтрэхгүй). */
export function clickCreateRange(day: string, minute: number, durationMin: number = CREATE_DEFAULT_MINUTES): TimeRange {
  const s = clampMinute(snapMinutes(minute, SLOT_MINUTES, "floor"));
  return { start: ubAt(day, s).toISOString(), end: ubAt(day, Math.min(DAY_MINUTES, s + durationMin)).toISOString() };
}

/** Хоосон хэсгийг босоо чирж сонгох: хоёр цэгийн нүднүүдийг хамруулна (хамгийн багадаа 1 алхам). */
export function dragCreateRange(day: string, anchorMin: number, pointerMin: number): TimeRange {
  const a = clampMinute(snapMinutes(anchorMin, SLOT_MINUTES, "floor"));
  const b = clampMinute(snapMinutes(pointerMin, SLOT_MINUTES, "floor"));
  return {
    start: ubAt(day, Math.min(a, b)).toISOString(),
    end: ubAt(day, Math.min(DAY_MINUTES, Math.max(a, b) + SLOT_MINUTES)).toISOString(),
  };
}

/**
 * Цагийн торд зөөх: segDay-ийн баганад grabMin минутад барьж, targetDay-ийн
 * pointerMin минут руу авчирсан. Шилжилтийг 15 минутаар тааруулж (хөдлөөгүй бол
 * өөрчлөгдөхгүй), шинэ эхлэлийг зорилтот өдрийн 00:00–23:45-д багтаана. Шөнө дундын
 * дараах хэсгээс (өмнөх өдрөөс үргэлжилсэн) барьсан бол эхлэл өмнөх өдөрт үлдэж
 * болно — зорилтот баганад дор хаяж 15 минут (эсвэл одоо байгаа хэсэг) үлдэхээр.
 */
export function dragMoveTimed(
  origin: TimeRange,
  segDay: string,
  grabMin: number,
  targetDay: string,
  pointerMin: number
): TimeRange {
  const dayShift = daysBetween(segDay, targetDay) * DAY_MINUTES;
  let delta = snapMinutes(pointerMin - grabMin) + dayShift;
  if (delta === 0) return { start: origin.start, end: origin.end };
  const s = Date.parse(origin.start);
  const startInSeg = (s - ubDayStart(segDay).getTime()) / MIN_MS;
  const durationMin = (Date.parse(origin.end) - s) / MIN_MS;
  const min = startInSeg < 0 ? Math.min(startInSeg, SLOT_MINUTES - durationMin) : 0;
  const startInTarget = (s - ubDayStart(targetDay).getTime()) / MIN_MS + delta;
  delta += Math.min(DAY_MINUTES - SLOT_MINUTES, Math.max(min, startInTarget)) - startInTarget;
  return dragRange(origin, delta, "move", { step: 1 });
}

/** Бүтэн өдрийн мөр, сарын торд өдрөөр зөөх: fromDay-ээс toDay руу (цаг хадгалагдана). */
export function shiftByDays(origin: TimeRange, fromDay: string, toDay: string): TimeRange {
  const n = daysBetween(fromDay, toDay);
  return n === 0 ? { start: origin.start, end: origin.end } : moveToDay(origin, addDays(ubDay(origin.start), n));
}

/** Зөөсөн газар зөвшөөрөгдөх эсэх (сэжмийн алхам өнгөрсөн өдөр рүү орохгүй). */
export function dropAllowed(item: Pick<CalendarItem, "source" | "canMove">, range: TimeRange, todayIso: string): boolean {
  return canDropOnDay(item, ubDay(range.start), todayIso);
}

// Сарын тор.

export type MonthCell<T extends Timed = CalendarItem> = {
  day: string;
  /** Энэ өдрийг дайрсан харагдах зурвасын мөрийн тоо — цагтай зүйлс түүний доороос. */
  rowsTop: number;
  /** Харагдах цагтай зүйлс. */
  timed: DaySegment<T>[];
  /** «+N» — нуугдсан зүйлсийн тоо (зурвас + цагтай). */
  hidden: number;
};

export type MonthWeekLayout<T extends Timed = CalendarItem> = {
  /** Харагдах бүтэн өдрийн / олон өдрийн зурвасууд. */
  bars: AllDayPlacement<T>[];
  cells: MonthCell<T>[];
};

/**
 * Сарын нэг 7 хоногийн мөр: нүд бүрт maxRows мөр багтана. Багтахгүй өдөрт сүүлийн
 * мөрийг «+N»-д үлдээнэ; ийм өдрийг дайрсан сүүлийн эгнээний зурвас ч нуугдана.
 */
export function layoutMonthWeek<T extends Timed>(
  items: readonly T[],
  days: readonly string[],
  maxRows: number
): MonthWeekLayout<T> {
  const rows = Math.max(1, Math.floor(maxRows));
  const { placements } = layoutAllDay(items, days);
  const covers = (p: AllDayPlacement<T>, col: number) => col >= p.startCol && col < p.startCol + p.span;
  const timedByCol = days.map((d) => timedSegmentsOnDay(items, d));
  const overflow = days.map((_, col) => {
    const lanes = placements.filter((p) => covers(p, col)).map((p) => p.lane);
    const top = lanes.length ? Math.max(...lanes) + 1 : 0;
    return top + timedByCol[col].length > rows;
  });
  const visible = (p: AllDayPlacement<T>) => {
    if (p.lane >= rows) return false;
    if (p.lane < rows - 1) return true;
    for (let c = p.startCol; c < p.startCol + p.span; c += 1) if (overflow[c]) return false;
    return true;
  };
  const bars = placements.filter(visible);
  const cells = days.map((day, col) => {
    const here = placements.filter((p) => covers(p, col));
    const shownLanes = here.filter(visible).map((p) => p.lane);
    const hiddenBars = here.length - shownLanes.length;
    const rowsTop = shownLanes.length ? Math.max(...shownLanes) + 1 : 0;
    const capacity = rows - rowsTop;
    const all = timedByCol[col];
    if (hiddenBars === 0 && all.length <= capacity) return { day, rowsTop, timed: all, hidden: 0 };
    // Сүүлийн мөр «+N»-д; зөвхөн нуусан зурвас дайрсан өдөрт ч (цагтай зүйл цөөн) «+N» гарна.
    const shown = Math.min(all.length, Math.max(0, capacity - 1));
    return { day, rowsTop, timed: all.slice(0, shown), hidden: all.length - shown + hiddenBars };
  });
  return { bars, cells };
}

// Жагсаалт (agenda).

export type AgendaEntry<T extends Timed = CalendarItem> = DaySegment<T> & { allDay: boolean };

/** Өдрөөр бүлэглэсэн жагсаалт: бүтэн өдрийнх түрүүнд, дараа нь цагаар. Хоосон өдрийг алгасна. */
export function agendaGroups<T extends Timed>(
  items: readonly T[],
  days: readonly string[]
): { day: string; entries: AgendaEntry<T>[] }[] {
  const out: { day: string; entries: AgendaEntry<T>[] }[] = [];
  for (const day of days) {
    const allDay: AgendaEntry<T>[] = [];
    for (const it of items) {
      if (!isAllDayLike(it)) continue;
      const seg = daySegment(it, day);
      if (seg) allDay.push({ ...seg, allDay: true });
    }
    allDay.sort((a, b) => Date.parse(a.item.start) - Date.parse(b.item.start) || cmp(a.item.key, b.item.key));
    const timed = timedSegmentsOnDay(items, day).map((s) => ({ ...s, allDay: false }));
    if (allDay.length || timed.length) out.push({ day, entries: [...allDay, ...timed] });
  }
  return out;
}

// Шошго.

/** Цагийн шошго: «Бүтэн өдөр», «14:00–15:30»; даалгавар (хугацаа) «14:00». */
export function itemTimeLabel(item: Pick<CalendarItem, "start" | "end" | "allDay" | "source">): string {
  if (isAllDayLike(item)) return "Бүтэн өдөр";
  if (item.source === "task") return fmtTime(item.start);
  return fmtTimeRange(item.start, item.end);
}

/** Дэлгэрэнгүйн цаг: «11-р сарын 11, лхагва · 14:00–15:30», олон өдрийнхөд муж. */
export function itemWhenLabel(item: Pick<CalendarItem, "start" | "end" | "allDay" | "source">): string {
  if (item.allDay) {
    const days = itemDays(item);
    const first = days[0];
    const last = days[days.length - 1];
    return first === last ? fmtDayWithWeekday(ubAt(first, 720)) : dayRangeLabel(first, last);
  }
  const day = fmtDayWithWeekday(item.start);
  if (item.source === "task") return `${day} · ${fmtTime(item.start)}`;
  const endDay = ubDay(Math.max(Date.parse(item.start), Date.parse(item.end) - 1));
  if (endDay === ubDay(item.start)) return `${day} · ${fmtTimeRange(item.start, item.end)}`;
  return `${day} ${fmtTime(item.start)} – ${fmtDayWithWeekday(item.end)} ${fmtTime(item.end)}`;
}

// Үйл явдлын маягтын огноо, цаг (УБ-ын ханын цаг; <input type=date|time>).

export type EventFormTimes = {
  allDay: boolean;
  /** 'YYYY-MM-DD'. */
  startDay: string;
  /** 'HH:MM'. */
  startTime: string;
  endDay: string;
  endTime: string;
};

/** Минут → «HH:MM» (1440 → «00:00»). */
export function hmOf(minutes: number): string {
  const m = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Муж → маягтын талбарууд. Бүтэн өдрийнхөд дуусах өдөр нь сүүлийн өдөр (оролцуулан). */
export function rangeToFormTimes(range: TimeRange, allDay: boolean): EventFormTimes {
  const s = Date.parse(range.start);
  const e = Date.parse(range.end);
  if (allDay) {
    return { allDay, startDay: ubDay(s), startTime: "09:00", endDay: ubDay(Math.max(s, e - 1)), endTime: "10:00" };
  }
  return {
    allDay,
    startDay: ubDay(s),
    startTime: hmOf(ubMinuteOfDay(s)),
    endDay: ubDay(e),
    endTime: hmOf(ubMinuteOfDay(e)),
  };
}

const FORM_RANGE_ERR = "Дуусах цаг эхлэх цагаас хойш байна.";

/** Маягтын талбарууд → хадгалах муж (ISO, Z) эсвэл монгол алдаа. */
export function formTimesToRange(f: EventFormTimes): { range: TimeRange } | { error: string } {
  if (!isIsoDate(f.startDay) || !isIsoDate(f.endDay)) return { error: "Огноо буруу байна." };
  let range: TimeRange;
  if (f.allDay) {
    if (f.endDay < f.startDay) return { error: FORM_RANGE_ERR };
    range = allDayRange(f.startDay, f.endDay);
  } else {
    const sm = parseHmMinutes(f.startTime);
    const em = parseHmMinutes(f.endTime);
    if (sm == null || em == null) return { error: "Цаг буруу байна." };
    range = { start: ubAt(f.startDay, sm).toISOString(), end: ubAt(f.endDay, em).toISOString() };
    if (Date.parse(range.end) <= Date.parse(range.start)) return { error: FORM_RANGE_ERR };
  }
  if (Date.parse(range.end) - Date.parse(range.start) > MAX_EVENT_DAYS * DAY_MS) {
    return { error: `Үйл явдал ${MAX_EVENT_DAYS} хоногоос урт байж болохгүй.` };
  }
  return { range };
}

/** Эхлэлийг өөрчлөхөд үргэлжлэх хугацааг хадгалж дуусахыг шилжүүлнэ (Google маяг). */
export function withFormStart(f: EventFormTimes, startDay: string, startTime: string): EventFormTimes {
  const next = { ...f, startDay, startTime };
  if (!isIsoDate(startDay)) return next;
  if (f.allDay) {
    if (!isIsoDate(f.startDay) || !isIsoDate(f.endDay)) return next;
    return { ...next, endDay: addDays(startDay, Math.max(0, daysBetween(f.startDay, f.endDay))) };
  }
  const prev = formTimesToRange(f);
  const sm = parseHmMinutes(startTime);
  if (!("range" in prev) || sm == null) return next;
  const duration = Date.parse(prev.range.end) - Date.parse(prev.range.start);
  const end = ubAt(startDay, sm).getTime() + duration;
  return { ...next, endDay: ubDay(end), endTime: hmOf(ubMinuteOfDay(end)) };
}

/**
 * «Бүтэн өдөр»-ийг асаах/унтраах. Шөнө дунд (00:00) дуусах цагтай бол бүтэн өдрийн
 * дуусах өдөр нь өмнөх өдөр (23:00–00:00 → тэр өдөр л); буцаан унтраахад дараагийн өдрийн 00:00.
 */
export function withFormAllDay(f: EventFormTimes, allDay: boolean): EventFormTimes {
  if (allDay === f.allDay) return f;
  const datesOk = isIsoDate(f.startDay) && isIsoDate(f.endDay);
  const midnightEnd = datesOk && parseHmMinutes(f.endTime) === 0;
  if (allDay) {
    const endDay = midnightEnd && f.endDay > f.startDay ? addDays(f.endDay, -1) : f.endDay;
    return { ...f, allDay, endDay };
  }
  const sm = parseHmMinutes(f.startTime);
  const endDay = midnightEnd && f.endDay === f.startDay && sm != null && sm > 0 ? addDays(f.endDay, 1) : f.endDay;
  return { ...f, allDay, endDay };
}

// Шинээр үүсгэх.

/** Үүсгэж буй (хадгалаагүй) үйл явдлын түр key — торд «(Гарчиггүй)» гэж харагдана. */
export const CALENDAR_DRAFT_KEY = "draft:new";
export const CALENDAR_DRAFT_TITLE = "(Гарчиггүй)";

/** «Үйл явдал нэмэх» товчны анхны муж: өнөөдөр бол дараагийн бүтэн цаг, бусад өдөр 09:00 (1 цаг). */
export function defaultCreateRange(day: string, now: DateInput = new Date()): TimeRange {
  if (day !== ubDay(now)) return clickCreateRange(day, 9 * 60);
  const next = Math.min(23 * 60, (Math.floor(ubMinuteOfDay(now) / 60) + 1) * 60);
  return clickCreateRange(day, next);
}

/** Үүсгэж буй үйл явдлыг торд харуулах түр зүйл (зөөхгүй, холбоосгүй). */
export function calendarDraftItem(range: TimeRange, allDay: boolean, viewerId: string): CalendarItem {
  return {
    key: CALENDAR_DRAFT_KEY,
    source: "event",
    id: CALENDAR_DRAFT_KEY,
    title: CALENDAR_DRAFT_TITLE,
    subtitle: null,
    start: range.start,
    end: range.end,
    allDay,
    personId: viewerId,
    personName: null,
    personIds: [viewerId],
    colorKey: "meeting",
    href: null,
    canMove: false,
    canResize: false,
    lockedReason: null,
    masked: false,
    status: null,
    done: false,
    event: null,
  };
}
