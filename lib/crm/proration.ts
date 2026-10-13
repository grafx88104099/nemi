/**
 * Хувь тэнцүүлэх тооцоолол (F-585) — цэвэр функц, DB-гүй (unit тестийн бай).
 *
 * Гэрээний мужийг lease-ийн '[)' семантикаар тооцно: эхлэх өдөр орно,
 * дуусах өдөр орохгүй (exclusion constraint-тай ижил — сунгалтын шинэ гэрээ
 * хуучны end_on өдрөөс эхэлдэг тул нэг өдөр давхар тооцогдохгүй).
 *
 * Сарын нэхэмжлэх үүсгэлт (Д-13), менежментийн гэрээний эцсийн тооцоо (F-514),
 * дундуур цуцлалтын залруулга бүгд үүнийг хэрэглэнэ.
 */

/** 'YYYY-MM-DD' → UTC Date (өдрийн түвшний тооцоо тул цагийн бүс үл нөлөөлнө). */
function parseIso(iso: string): Date {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`proration: огноо буруу — "${iso}"`);
  }
  return d;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Тухайн сарын эхний өдөр ('YYYY-MM-01'). */
export function monthStart(month: string): string {
  const d = parseIso(month.length === 7 ? `${month}-01` : month);
  return `${toIso(d).slice(0, 7)}-01`;
}

/** Дараагийн сарын эхний өдөр. */
export function nextMonthStart(month: string): string {
  const start = parseIso(monthStart(month));
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return toIso(next);
}

/** Тухайн сарын хоногийн тоо (28/29/30/31). */
export function daysInMonth(month: string): number {
  const start = parseIso(monthStart(month));
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * Гэрээний [periodStart, periodEnd) муж тухайн сард хамрах хоногийн тоо.
 * periodEnd = гэрээний дуусах огноо (тэр өдөр нь тооцогдохгүй — '[)').
 */
export function occupiedDaysInMonth(periodStart: string, periodEnd: string, month: string): number {
  const mStart = parseIso(monthStart(month));
  const mEnd = parseIso(nextMonthStart(month));
  const pStart = parseIso(periodStart);
  const pEnd = parseIso(periodEnd);
  const from = pStart > mStart ? pStart : mStart;
  const to = pEnd < mEnd ? pEnd : mEnd;
  if (to <= from) return 0;
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * F-585: сарын дүнг тухайн сард ногдох хоногоор хувь тэнцүүлнэ.
 *  • Бүтэн сар → monthlyAmount (хоногоор бутархайлахгүй);
 *  • Хэсэгчилсэн сар → monthlyAmount × (хамрах хоног / сарын хоног), 2 орон;
 *  • Огт хамрахгүй сар → 0 (Д-14 «сул сард үүсгэхгүй»-ийн тооцооллын тал).
 */
export function prorate(
  monthlyAmount: number,
  periodStart: string,
  periodEnd: string,
  month: string
): number {
  if (!(monthlyAmount >= 0)) {
    throw new Error("proration: сарын дүн сөрөг байж болохгүй");
  }
  const days = occupiedDaysInMonth(periodStart, periodEnd, month);
  if (days <= 0) return 0;
  const total = daysInMonth(month);
  if (days >= total) return round2(monthlyAmount);
  return round2((monthlyAmount * days) / total);
}

/**
 * Дундуур цуцлалтын залруулга (F-585/F-514в): бүтэн сараар нэхэмжилсэн дүнгээс
 * бодит хамрах хугацааны дүнг хассан илүү төлбөр (залруулгын нэхэмжлэх/буцаалтын дүн).
 */
export function terminationAdjustment(
  monthlyAmount: number,
  invoicedAmount: number,
  periodStart: string,
  terminationDate: string,
  month: string
): number {
  const due = prorate(monthlyAmount, periodStart, terminationDate, month);
  return round2(invoicedAmount - due);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
