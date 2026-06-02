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
