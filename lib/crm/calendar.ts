/**
 * Ажлын өдрийн хуанли ба SLA-ийн цагийн тооцоо (PRO-001 v2.1 §6.4).
 * SQL crm_add_business_days()-ийн TS толь; DB тал эцсийн үнэн.
 *
 * Цагийн бүс: бүх «өдөр», «ажлын цаг» Улаанбаатарын цагаар (UTC+8, зуны
 * цаггүй). Оролт/гаралтын Date нь бодит агшин (UTC) — серверийн локал
 * цагийн бүсээс үл хамаарна. Өдрийн түвшний утгыг (fromIsoDate) UTC 00:00
 * агшнаар илэрхийлнэ; тэр нь УБ-ын ижил огнооны 08:00 тул огноо хадгалагдана.
 *
 * Ажлын цаг, эх сурвалжийн SLA бодлого кодонд биш — crm_settings
 * ('sla_policy', 'sla_first_contact_min'), онцгой өдөр crm_calendar_days.
 */

/** Улаанбаатарын UTC-ээс зөрөх минут (Монгол улс 2017 оноос зуны цаг хэрэглэдэггүй). */
export const UB_UTC_OFFSET_MIN = 8 * 60;
const OFFSET_MS = UB_UTC_OFFSET_MIN * 60000;
const DAY_MS = 86400000;

/** 'YYYY-MM-DD' → ажлын өдрийн эсэх тохиргоо (crm_calendar_days-ийн толь). */
export type CalendarExceptions = Record<string, boolean>;

export type WorkHours = {
  /** Ажлын өдрийн эхлэх цаг (УБ, 0–23). */
  startHour: number;
  /** Ажлын өдрийн дуусах цаг (УБ, 1–24, exclusive). */
  endHour: number;
};

/** Fallback — бодит утгыг crm_settings.sla_policy.work_hours-оос workHoursFromPolicy()-оор. */
export const DEFAULT_WORK_HOURS: WorkHours = { startHour: 9, endHour: 18 };

/** crm_calendar_days мөрүүдийг толь болгоно. */
export function calendarExceptionsFromRows(
  rows: ReadonlyArray<{ day: string; is_workday: boolean }> | null | undefined
): CalendarExceptions {
  const out: CalendarExceptions = {};
  for (const r of rows ?? []) out[r.day.slice(0, 10)] = r.is_workday;
  return out;
}

/** УБ-ын «ханын цаг»-ийг UTC талбарт агуулсан Date (дотоод тооцоонд). */
function wall(d: Date): Date {
  return new Date(d.getTime() + OFFSET_MS);
}

/** Date → УБ-ын огноо 'YYYY-MM-DD'. */
export function toIsoDate(d: Date): string {
  return wall(d).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' → Date (UTC 00:00 — өдрийн түвшний утга). */
export function fromIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** УБ-ын тухайн огноо, цагийн агшин (жишээ нь 'YYYY-MM-DD' 09:00 УБ). */
export function ubTime(iso: string, hour: number, minute = 0): Date {
  return new Date(fromIsoDate(iso).getTime() + (hour * 60 + minute) * 60000 - OFFSET_MS);
}

/** УБ-ын цаг (0–23). */
export function ubHour(d: Date): number {
  return wall(d).getUTCHours();
}

/** УБ-ын гараг (0 = Ням … 6 = Бямба). */
export function ubWeekday(d: Date): number {
  return wall(d).getUTCDay();
}

function shiftIso(iso: string, days: number): string {
  return new Date(fromIsoDate(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function isWorkdayIso(iso: string, exceptions: CalendarExceptions): boolean {
  if (iso in exceptions) return exceptions[iso];
  const dow = fromIsoDate(iso).getUTCDay();
  return dow >= 1 && dow <= 5;
}

/**
 * Ажлын өдөр мөн үү (УБ-ын огноогоор): exceptions[iso] байвал түүнийг, үгүй
 * бол Даваа–Баасан — SQL функцтэй ижил семантик.
 */
export function isWorkday(d: Date, exceptions: CalendarExceptions = {}): boolean {
  return isWorkdayIso(toIsoDate(d), exceptions);
}

/** Тухайн агшин ажлын цагийн дотор уу (УБ). */
export function isWithinWorkHours(
  at: Date,
  hours: WorkHours = DEFAULT_WORK_HOURS,
  exceptions: CalendarExceptions = {}
): boolean {
  if (!isWorkday(at, exceptions)) return false;
  const w = wall(at);
  const minutes = w.getUTCHours() * 60 + w.getUTCMinutes();
  return minutes >= hours.startHour * 60 && minutes < hours.endHour * 60;
}

/**
 * from-оос хойш days АЖЛЫН өдөр гүйлгэнэ (SQL crm_add_business_days-тай ижил:
 * маргаашаас эхэлж тоолно, эхлэх өдөр өөрөө тооцогдохгүй). Өдрийн түвшний утга буцаана.
 */
export function addBusinessDays(from: Date, days: number, exceptions: CalendarExceptions = {}): Date {
  let iso = toIsoDate(from);
  let n = 0;
  while (n < days) {
    iso = shiftIso(iso, 1);
    if (isWorkdayIso(iso, exceptions)) n += 1;
  }
  return fromIsoDate(iso);
}

/**
 * Хоёр огнооны хоорондох ажлын өдрийн тоо (from-г оруулахгүй, to-г оруулна).
 * to < from бол 0.
 */
export function businessDaysBetween(from: Date, to: Date, exceptions: CalendarExceptions = {}): number {
  let iso = toIsoDate(from);
  const end = toIsoDate(to);
  let n = 0;
  while (iso < end) {
    iso = shiftIso(iso, 1);
    if (isWorkdayIso(iso, exceptions)) n += 1;
  }
  return n;
}

function nextWorkdayIso(iso: string, exceptions: CalendarExceptions): string {
  let d = iso;
  do {
    d = shiftIso(d, 1);
  } while (!isWorkdayIso(d, exceptions));
  return d;
}

/**
 * SLA-ийн эхлэх мөч: ажлын цагийн ДОТОР ирсэн үйл явдал тэр мөчөөсөө,
 * ажлын бус цагт (шөнө/амралтын өдөр) ирсэн нь ДАРААГИЙН ажлын цагийн
 * эхлэлээс тоологдоно (Д-02 ажлын бус цагийн дараалал).
 */
export function slaClockStart(
  at: Date,
  hours: WorkHours = DEFAULT_WORK_HOURS,
  exceptions: CalendarExceptions = {}
): Date {
  if (isWithinWorkHours(at, hours, exceptions)) return new Date(at.getTime());
  const iso = toIsoDate(at);
  const beforeStart = ubHour(at) < hours.startHour;
  const day = isWorkdayIso(iso, exceptions) && beforeStart ? iso : nextWorkdayIso(iso, exceptions);
  return ubTime(day, hours.startHour);
}

/**
 * SLA-ийн дуусах мөч: эхлэх мөч дээр minutes ажлын минут нэмнэ — өдрийн
 * төгсгөлд хүрвэл дараагийн ажлын өдөр үргэлжилнэ.
 */
export function slaDeadline(
  at: Date,
  minutes: number,
  hours: WorkHours = DEFAULT_WORK_HOURS,
  exceptions: CalendarExceptions = {}
): Date {
  let cursor = slaClockStart(at, hours, exceptions);
  let remaining = minutes;
  while (remaining > 0) {
    const endOfDay = ubTime(toIsoDate(cursor), hours.endHour);
    const availableMin = Math.max(0, (endOfDay.getTime() - cursor.getTime()) / 60000);
    if (remaining <= availableMin) {
      return new Date(cursor.getTime() + remaining * 60000);
    }
    remaining -= availableMin;
    cursor = ubTime(nextWorkdayIso(toIsoDate(cursor), exceptions), hours.startHour);
  }
  return cursor;
}

// ── Эх сурвалжаар ялгаатай SLA (§6.4) ─────────────────────

/** Нэг эх сурвалжийн бодлого: ажлын N минут, эсвэл мэдээлэл авсан өдөрт нь. */
export type SourceSlaRule = { kind: "minutes"; minutes: number } | { kind: "same_day" };

/** crm_settings key='sla_policy'. */
export type SlaPolicy = {
  work_hours?: { start: number; end: number };
  /** Эх сурвалжийн код → дүрэм; 'default' нь бусад бүх эх сурвалжид. */
  by_source?: Record<string, SourceSlaRule>;
};

/** sla_policy.work_hours → WorkHours (буруу утгад анхдагч). */
export function workHoursFromPolicy(policy: SlaPolicy | null | undefined): WorkHours {
  const wh = policy?.work_hours;
  if (
    !wh ||
    !Number.isInteger(wh.start) ||
    !Number.isInteger(wh.end) ||
    wh.start < 0 ||
    wh.end > 24 ||
    wh.start >= wh.end
  ) {
    return DEFAULT_WORK_HOURS;
  }
  return { startHour: wh.start, endHour: wh.end };
}

/** Эх сурвалжид хамаарах дүрэм (тохиргоогүй бол fallbackMinutes ажлын минут). */
export function sourceSlaRule(
  policy: SlaPolicy | null | undefined,
  sourceCode: string | null | undefined,
  fallbackMinutes: number
): SourceSlaRule {
  const map = policy?.by_source ?? {};
  const rule = (sourceCode ? map[sourceCode] : undefined) ?? map.default;
  if (rule?.kind === "same_day") return rule;
  if (rule?.kind === "minutes" && Number.isFinite(rule.minutes) && rule.minutes > 0) return rule;
  return { kind: "minutes", minutes: fallbackMinutes };
}

/**
 * Сэжимийн эхний холболтын хугацаа (§6.4):
 *  - «minutes» — ажлын цагаар N минут (ажлын бус цагт ирсэн бол дараагийн ажлын цагаас);
 *  - «same_day» — мэдээлэл авсан УБ-ын өдрийн 24:00 хүртэл (реферал, хувийн сүлжээ).
 * receivedAt — мэдээлэл хүлээн авсан мөч (бүртгэлээс өмнө байж болно).
 */
export function leadSlaDeadline(
  receivedAt: Date,
  sourceCode: string | null | undefined,
  opts: {
    policy?: SlaPolicy | null;
    fallbackMinutes: number;
    exceptions?: CalendarExceptions;
  }
): Date {
  const rule = sourceSlaRule(opts.policy, sourceCode, opts.fallbackMinutes);
  if (rule.kind === "same_day") {
    return ubTime(shiftIso(toIsoDate(receivedAt), 1), 0);
  }
  return slaDeadline(receivedAt, rule.minutes, workHoursFromPolicy(opts.policy), opts.exceptions ?? {});
}
