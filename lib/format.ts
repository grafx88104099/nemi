/** Үнэ форматлагч — legacy data.js-ээс. */
export function fmtMNT(n: number): string {
  return new Intl.NumberFormat("mn-MN").format(n) + "₮";
}

/** Тоог d оронтой тойруулж, илүү тэгийг хасна: 2.50 → «2.5», 4.0 → «4». */
function trimFixed(x: number, d: number): string {
  return String(Number(x.toFixed(d)));
}

/** Богино үнэ (CRM, зайгүй ₮): 1.65 тэрбум₮ / 285 сая₮ / 2.5 сая₮. */
export function shortMNT(n: number): string {
  if (n >= 1e9) return trimFixed(n / 1e9, 2) + " тэрбум₮";
  if (n >= 1e6) return trimFixed(n / 1e6, n >= 1e8 ? 0 : 1) + " сая₮";
  return n.toLocaleString("mn-MN") + "₮";
}

const PRICE_UNITS = [
  { v: 1e3, label: "мянга" },
  { v: 1e6, label: "сая" },
  { v: 1e9, label: "тэрбум" },
] as const;

/**
 * Нийтийн UI-ийн нэг богино үнийн формат: «320 сая ₮», «2.5 сая ₮/сар»,
 * «1.65 тэрбум ₮», «850 мянга ₮», «950 ₮». Карт, шүүлтийн chip, панелийн туслах
 * мөр, газрын зургийн popup бүгд үүнийг хэрэглэнэ (whitespace-nowrap tabular-nums-тэй зур).
 * lib/seo/listing.ts priceShort (гарчиг/OG) болон CRM-ийн shortMNT-ээс тусдаа.
 *
 * Нарийвчлал: ≥1 тэрбум 2 орон; 100–999 сая бүхэл; 1–99.9 сая 1 орон;
 * 100–999 мянга бүхэл; 1–99.9 мянга 1 орон. Тойруулсны дараа нэгж ахина
 * (999 999 → «1 сая ₮», 999 600 000 → «1 тэрбум ₮»).
 */
export function fmtPriceShort(n: number, deal?: string | null): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  const suffix = deal === "rent" ? "/сар" : "";
  // n-д тохирох хамгийн том нэгж (−1 = 1000-аас бага).
  let i = -1;
  for (let k = 0; k < PRICE_UNITS.length; k++) if (n >= PRICE_UNITS[k].v) i = k;
  for (;;) {
    if (i < 0) {
      const r = Math.round(n);
      if (r < 1e3) return `${r} ₮${suffix}`;
      i = 0; // 999.6 → «1 мянга ₮»
      continue;
    }
    const u = PRICE_UNITS[i];
    const x = n / u.v;
    const d = u.v === 1e9 ? 2 : x >= 100 ? 0 : 1;
    // Тойруулаад 1000 хүрвэл дараагийн том нэгжид ахина (тэрбумаас дээш нэгжгүй).
    if (i < PRICE_UNITS.length - 1 && Number(x.toFixed(d)) >= 1000) {
      i++;
      continue;
    }
    return `${trimFixed(x, d)} ${u.label} ₮${suffix}`;
  }
}

/** Талбайн м² формат. */
export function fmtArea(n: number | null | undefined): string {
  return n == null ? "—" : `${n} м²`;
}

const DAY_MS = 86_400_000;

/** Нийтэлснээс хойш өнгөрсөн бүхэл хоног. */
export function daysSince(iso: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS);
}

/** Зар «шинэ» эсэх (анхдагч 7 хоног дотор нийтэлсэн). */
export function isFresh(iso: string, days = 7, now: Date = new Date()): boolean {
  const d = daysSince(iso, now);
  return d >= 0 && d < days;
}

/** Харьцангуй огноо: «Өнөөдөр», «Өчигдөр», «3 хоногийн өмнө», «2 сарын өмнө». */
export function relativeDate(iso: string, now: Date = new Date()): string {
  const day = daysSince(iso, now);
  if (day < 0) return "Удахгүй";
  if (day === 0) return "Өнөөдөр";
  if (day === 1) return "Өчигдөр";
  if (day < 7) return `${day} хоногийн өмнө`;
  if (day < 30) return `${Math.floor(day / 7)} долоо хоногийн өмнө`;
  if (day < 365) return `${Math.floor(day / 30)} сарын өмнө`;
  return `${Math.floor(day / 365)} жилийн өмнө`;
}

// ── Огноо, цаг — үргэлж Улаанбаатарын цагаар ─────────────────────────────
// Server (Vercel — UTC) ба хөтөч ижил мөр гаргах ёстой: эс бөгөөс цаг 8 цагаар
// зөрж, React hydration алдаа гарна. toLocale*("mn-MN") нь Node/Chrome-ийн ICU-ээс
// хамаарч өөр өөр үр дүн өгдөг тул ашиглахгүй. Монгол 2017 оноос хойш зуны цаг
// хэрэглэдэггүй — тогтмол UTC+8.
const UB_OFFSET_MS = 8 * 3_600_000;
const WEEKDAYS = ["ням", "даваа", "мягмар", "лхагва", "пүрэв", "баасан", "бямба"];
const WEEKDAYS_SHORT = ["Ня", "Да", "Мя", "Лх", "Пү", "Ба", "Бя"];

export type DateInput = string | number | Date;

/** Агшны Улаанбаатарын он, сар (1–12), өдөр, цаг, минут, гараг (0 = ням). */
export function ubParts(input: DateInput) {
  const t = input instanceof Date ? input.getTime() : typeof input === "number" ? input : Date.parse(input);
  const d = new Date(t + UB_OFFSET_MS);
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
    wd: d.getUTCDay(),
  };
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** Бүтэн огноо: «2026 оны 6-р сарын 6». */
export function fmtDate(iso: DateInput): string {
  const u = ubParts(iso);
  return `${u.y} оны ${u.mo}-р сарын ${u.d}`;
}

/** Огноо + цаг: «2026.06.08 14:30». */
export function fmtDateTime(iso: DateInput): string {
  const u = ubParts(iso);
  return `${u.y}.${p2(u.mo)}.${p2(u.d)} ${p2(u.h)}:${p2(u.mi)}`;
}

/** Тоон огноо: «2026.06.08». */
export function fmtDateNum(iso: DateInput): string {
  const u = ubParts(iso);
  return `${u.y}.${p2(u.mo)}.${p2(u.d)}`;
}

/** Цаг: «14:30». */
export function fmtTime(iso: DateInput): string {
  const u = ubParts(iso);
  return `${p2(u.h)}:${p2(u.mi)}`;
}

/** Сар.өдөр: «06.08». */
export function fmtDayMonth(iso: DateInput): string {
  const u = ubParts(iso);
  return `${p2(u.mo)}.${p2(u.d)}`;
}

/** Сар.өдөр цаг: «06.08 14:30». */
export function fmtShortDateTime(iso: DateInput): string {
  const u = ubParts(iso);
  return `${p2(u.mo)}.${p2(u.d)} ${p2(u.h)}:${p2(u.mi)}`;
}

/** Гарагтай огноо: «11-р сарын 8, ням». */
export function fmtDayWithWeekday(iso: DateInput): string {
  const u = ubParts(iso);
  return `${u.mo}-р сарын ${u.d}, ${WEEKDAYS[u.wd]}`;
}

/** Гарагийн богино нэр: «Да», «Мя» … «Ня». */
export function fmtWeekdayShort(iso: DateInput): string {
  return WEEKDAYS_SHORT[ubParts(iso).wd];
}

/** Он, сар: «2026 оны 11-р сар». */
export function fmtMonthYear(iso: DateInput): string {
  const u = ubParts(iso);
  return `${u.y} оны ${u.mo}-р сар`;
}

/** Цагийн муж: «14:00–15:30» (УБ). */
export function fmtTimeRange(start: DateInput, end: DateInput): string {
  return `${fmtTime(start)}–${fmtTime(end)}`;
}
