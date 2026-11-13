import { ubParts, type DateInput } from "@/lib/format";

/**
 * Маягтын огноо/цаг ↔ ISO (үргэлж Улаанбаатар, UTC+8, зуны цаггүй).
 * <input type="datetime-local"> нь цагийн бүсгүй «2026-11-13T14:30» өгдөг — үүнийг
 * хөтчийн бүсээс үл хамааран УБ-ын цаг гэж тайлбарлана. Харуулахдаа lib/format.ts.
 */

const p2 = (n: number) => String(n).padStart(2, "0");
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * «YYYY-MM-DDTHH:mm[:ss]» (УБ) эсвэл бүсийн мэдээлэлтэй ISO мөрийг ISO (UTC) болгоно.
 * Буруу бол null.
 */
export function ubInputToIso(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const m = LOCAL_RE.exec(v);
  if (m) {
    const [, y, mo, d, h, mi, s] = m;
    const t = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s ?? "00"}+08:00`);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  // Бүстэй ISO (Z эсвэл ±HH:MM) — шууд.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(v)) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  return null;
}

/** ISO → <input type="datetime-local"> утга (УБ): «2026-11-13T14:30». */
export function isoToUbInput(iso: DateInput | null | undefined): string {
  if (iso === null || iso === undefined || iso === "") return "";
  const u = ubParts(iso);
  if (Number.isNaN(u.y)) return "";
  return `${u.y}-${p2(u.mo)}-${p2(u.d)}T${p2(u.h)}:${p2(u.mi)}`;
}

/** Өнөөдрийн огноо (УБ) «YYYY-MM-DD». */
export function ubToday(now: DateInput = Date.now()): string {
  const u = ubParts(now);
  return `${u.y}-${p2(u.mo)}-${p2(u.d)}`;
}

/** «YYYY-MM-DD» огнооны шалгалт (хуанлийн хувьд зөв). */
export function isIsoDate(value: string | null | undefined): boolean {
  const m = DATE_RE.exec((value ?? "").trim());
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** «2026-11-13» → «2026.11.13» (DB date баганыг харуулах). */
export function fmtIsoDate(value: string | null | undefined): string {
  const m = DATE_RE.exec((value ?? "").trim());
  return m ? `${m[1]}.${m[2]}.${m[3]}` : (value ?? "");
}

/** Хоёр «YYYY-MM-DD» огнооны зөрүү (хоног): b − a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Гэрээ дуусахад үлдсэн хоног (өнөөдөр УБ). Огноогүй бол null. */
export function daysUntil(isoDate: string | null | undefined, now: DateInput = Date.now()): number | null {
  if (!isoDate || !isIsoDate(isoDate)) return null;
  return daysBetween(ubToday(now), isoDate);
}

/** «Миний ажил»-ын бүлэг: хугацаа хэтэрсэн / өнөөдөр / удахгүй / хугацаагүй. */
export type TaskBucket = "overdue" | "today" | "upcoming" | "none";

export const TASK_BUCKET_LABEL: Record<TaskBucket, string> = {
  overdue: "Хугацаа хэтэрсэн",
  today: "Өнөөдөр",
  upcoming: "Удахгүй",
  none: "Хугацаагүй",
};

export function taskBucket(dueAt: string | null | undefined, now: DateInput = Date.now()): TaskBucket {
  if (!dueAt) return "none";
  const t = Date.parse(dueAt);
  if (Number.isNaN(t)) return "none";
  const nowMs = now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  if (t < nowMs) return "overdue";
  return ubToday(t) === ubToday(nowMs) ? "today" : "upcoming";
}
