/** Үнэ форматлагч — legacy data.js-ээс. */
export function fmtMNT(n: number): string {
  return new Intl.NumberFormat("mn-MN").format(n) + "₮";
}

/** Богино үнэ: 1.65 тэрбум₮ / 285 сая₮. */
export function shortMNT(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + " тэрбум₮";
  if (n >= 1e6) return (n / 1e6).toFixed(0) + " сая₮";
  return n.toLocaleString("mn-MN") + "₮";
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

/** Бүтэн огноо: «2026 оны 6-р сарын 6». */
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()} оны ${d.getMonth() + 1}-р сарын ${d.getDate()}`;
}

/** Огноо + цаг: «2026.06.08 14:30». */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
