/**
 * Утас/и-мэйл нормалчлал (F-102, F-107) — цэвэр функцүүд, DB-гүй.
 * Давхардлын илрүүлэлт normalized утгаар тулгагдана:
 * «99112233», «9911-2233», «+976 99112233» гурвуулаа нэг утгад буулгана.
 */

/** Зөвхөн цифр үлдээнэ. */
function digitsOnly(raw: string): string {
  return raw.replace(/\D+/g, "");
}

/**
 * Утасны дугаарыг олон улсын цифрэн хэлбэрт (эх орны кодтой, +/зайгүй) буулгана.
 * - Монголын 8 оронтой дугаар → '976' угтвартай ('99112233' → '97699112233')
 * - '+976…', '976…', '00976…' → '976…'
 * - Бусад олон улсын дугаар → цифрүүд хэвээр ('00' угтварыг хасна)
 * - 6-оос цөөн цифртэй утгыг хоосон гэж үзнэ ('' буцаана — хадгалахгүй байх дохио)
 */
export function normalizePhone(raw: string): string {
  let d = digitsOnly(raw);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length < 6) return "";
  if (d.length === 8) return `976${d}`;
  if (d.length === 11 && d.startsWith("976")) return d;
  return d;
}

/** Хоёр утас ижил хүн рүү заана уу (нормалчилсан тулгалт). */
export function phonesEqual(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return na !== "" && na === nb;
}

/** Дэлгэцийн хэлбэр: '97699112233' → '9911-2233', бусад → '+…'. */
export function formatPhone(normalized: string): string {
  if (/^976\d{8}$/.test(normalized)) {
    const local = normalized.slice(3);
    return `${local.slice(0, 4)}-${local.slice(4)}`;
  }
  return normalized ? `+${normalized}` : "";
}

/** И-мэйл нормалчлал: trim + lowercase; хүчингүй бол '' буцаана. */
export function normalizeEmail(raw: string): string {
  const e = raw.trim().toLowerCase();
  // Энгийн бүтцийн шалгалт (бүрэн RFC биш — validation давхарга тусдаа).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "";
  return e;
}

/** Нэрийг харьцуулалтад бэлтгэнэ: жижиг үсэг, олон зай → нэг зай. */
export function normalizeName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}
