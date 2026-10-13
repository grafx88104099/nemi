/**
 * Ажлын өдрийн хуанли — SQL crm_add_business_days()-ийн TS толь (F-604).
 * UI-ийн урьдчилсан харуулалт, SLA-ийн тооцоонд хэрэглэнэ; DB тал эцсийн үнэн.
 * Огноог UTC-аар боловсруулна (өдрийн түвшний тооцоо тул цагийн бүс үл нөлөөлнө).
 */

/** 'YYYY-MM-DD' → ажлын өдрийн эсэх тохиргоо (crm_calendar_days-ийн толь). */
export type CalendarExceptions = Record<string, boolean>;

export type WorkHours = {
  /** Ажлын өдрийн эхлэх цаг (0–23). */
  startHour: number;
  /** Ажлын өдрийн дуусах цаг (0–23, exclusive). */
  endHour: number;
};

export const DEFAULT_WORK_HOURS: WorkHours = { startHour: 9, endHour: 18 };

/** Date → 'YYYY-MM-DD' (UTC). */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' → Date (UTC 00:00). */
export function fromIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/**
 * Ажлын өдөр мөн үү: exceptions[iso] байвал түүнийг, үгүй бол
 * Даваа–Баасан (ISO dow 1–5) гэж үзнэ — SQL функцтэй ижил семантик.
 */
export function isWorkday(d: Date, exceptions: CalendarExceptions = {}): boolean {
  const iso = toIsoDate(d);
  if (iso in exceptions) return exceptions[iso];
  const dow = d.getUTCDay(); // 0 = Ням
  return dow >= 1 && dow <= 5;
}

/**
 * p_from-оос хойш p_days АЖЛЫН өдөр гүйлгэнэ (SQL crm_add_business_days-тай ижил:
 * маргаашаас эхэлж тоолно, эхлэх өдөр өөрөө тооцогдохгүй).
 */
export function addBusinessDays(from: Date, days: number, exceptions: CalendarExceptions = {}): Date {
  let d = fromIsoDate(toIsoDate(from));
  let n = 0;
  while (n < days) {
    d = addDays(d, 1);
    if (isWorkday(d, exceptions)) n += 1;
  }
  return d;
}

/**
 * Хоёр огнооны хоорондох ажлын өдрийн тоо (from-г оруулахгүй, to-г оруулна).
 * to < from бол 0.
 */
export function businessDaysBetween(from: Date, to: Date, exceptions: CalendarExceptions = {}): number {
  let d = fromIsoDate(toIsoDate(from));
  const end = fromIsoDate(toIsoDate(to));
  let n = 0;
  while (d.getTime() < end.getTime()) {
    d = addDays(d, 1);
    if (isWorkday(d, exceptions)) n += 1;
  }
  return n;
}

/**
 * SLA-ийн эхлэх мөч: ажлын цагийн ДОТОР ирсэн үйл явдал тэр мөчөөсөө,
 * ажлын бус цагт (шөнө/амралтын өдөр) ирсэн нь ДАРААГИЙН ажлын өдрийн
 * эхлэх цагаас тоологдоно (Д-02 «ажлын бус цагийн дараалал»).
 */
export function slaClockStart(
  at: Date,
  hours: WorkHours = DEFAULT_WORK_HOURS,
  exceptions: CalendarExceptions = {}
): Date {
  const h = at.getUTCHours();
  const sameDayWork = isWorkday(at, exceptions);
  if (sameDayWork && h >= hours.startHour && h < hours.endHour) {
    return new Date(at.getTime());
  }
  // Өнөөдрийн ажлын цаг эхлээгүй бол өнөөдрийн эхлэл; үгүй бол дараагийн ажлын өдөр.
  let day = fromIsoDate(toIsoDate(at));
  if (!(sameDayWork && h < hours.startHour)) {
    do {
      day = addDays(day, 1);
    } while (!isWorkday(day, exceptions));
  }
  const out = new Date(day.getTime());
  out.setUTCHours(hours.startHour, 0, 0, 0);
  return out;
}

/**
 * SLA-ийн дуусах мөч: эхлэх мөч дээр minutes минут нэмнэ — ажлын цагийн
 * мужид багтаан гүйлгэнэ (өдрийн төгсгөлд хүрвэл дараагийн ажлын өдөр үргэлжилнэ).
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
    const endOfDay = new Date(cursor.getTime());
    endOfDay.setUTCHours(hours.endHour, 0, 0, 0);
    const availableMin = Math.max(0, (endOfDay.getTime() - cursor.getTime()) / 60000);
    if (remaining <= availableMin) {
      return new Date(cursor.getTime() + remaining * 60000);
    }
    remaining -= availableMin;
    // Дараагийн ажлын өдрийн эхлэл рүү.
    let day = fromIsoDate(toIsoDate(cursor));
    do {
      day = addDays(day, 1);
    } while (!isWorkday(day, exceptions));
    cursor = new Date(day.getTime());
    cursor.setUTCHours(hours.startHour, 0, 0, 0);
  }
  return cursor;
}
