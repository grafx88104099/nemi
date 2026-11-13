/**
 * Улаанбаатарын цагийн туслахууд (UTC+8, зуны цаггүй). Оролт/гаралтын Date нь
 * бодит агшин (UTC) — серверийн локал цагийн бүсээс үл хамаарна. Өдрийн түвшний
 * утгыг (fromIsoDate) UTC 00:00 агшнаар илэрхийлнэ; тэр нь УБ-ын ижил огнооны
 * 08:00 тул огноо хадгалагдана.
 */

/** Улаанбаатарын UTC-ээс зөрөх минут (Монгол улс 2017 оноос зуны цаг хэрэглэдэггүй). */
export const UB_UTC_OFFSET_MIN = 8 * 60;
const OFFSET_MS = UB_UTC_OFFSET_MIN * 60000;

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
