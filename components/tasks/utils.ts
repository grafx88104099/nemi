import type { TaskRow } from "@/lib/queries-tasks";

/** «Хоцорсон» — deadline өнгөрсөн бөгөөд дуусаагүй (хадгалагдах төлөв биш). */
export function isTaskOverdue(t: Pick<TaskRow, "deadline" | "status">, now: Date = new Date()): boolean {
  return t.deadline != null && t.status !== "completed" && new Date(t.deadline).getTime() < now.getTime();
}

export type CalendarCell = { date: Date; iso: string; inMonth: boolean; isToday: boolean };

/** Локал огноог YYYY-MM-DD болгох (toISOString нь UTC руу шилждэг тул ашиглахгүй). */
export function localISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Сарын grid — Даваагаар эхэлсэн 7×N нүд (өмнөх/дараах сарын нөхөлттэй). */
export function buildMonthGrid(year: number, month0: number, now: Date = new Date()): CalendarCell[] {
  const first = new Date(year, month0, 1);
  // Даваа=0 болгож хөрвүүлнэ (JS: Ням=0).
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month0, 1 - lead);
  const todayISO = localISODate(now);

  const cells: CalendarCell[] = [];
  // Сарын сүүлчийн өдрийг багтаах хүртэл 7-оор үргэлжилнэ (5-6 мөр).
  const end = new Date(year, month0 + 1, 0);
  const totalDays = lead + end.getDate();
  const rows = Math.ceil(totalDays / 7);
  for (let i = 0; i < rows * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = localISODate(d);
    cells.push({ date: d, iso, inMonth: d.getMonth() === month0, isToday: iso === todayISO });
  }
  return cells;
}

/** ?m=YYYY-MM параметрийг задлах (буруу бол одоогийн сар). */
export function parseMonthParam(m: string | undefined, now: Date = new Date()): { year: number; month0: number } {
  const match = m?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month0 = Number(match[2]) - 1;
    if (year >= 2000 && year <= 2100 && month0 >= 0 && month0 <= 11) return { year, month0 };
  }
  return { year: now.getFullYear(), month0: now.getMonth() };
}

export function monthParam(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}
