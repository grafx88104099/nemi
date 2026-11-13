/**
 * Утасны дугаар — DB-ийн crm2_normalize_phone()-той ЯГ ижил дүрэм:
 * бүх тэмдэгтээс цифрийг үлдээнэ, «00» угтварыг хасна, 6-аас цөөн цифр → '',
 * 8 цифр (Монгол дотоод) → «976» угтвартай, бусад тохиолдолд цифрээрээ.
 * Цэвэр модуль (клиент, сервер, тест).
 */

const MN_PREFIX = "976";

export function normalizePhone(raw: string | null | undefined): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length < 6) return "";
  if (d.length === 8) return MN_PREFIX + d;
  return d;
}

/** crm2_find_contacts_by_phone бүтэн дугаар шаардана (жигдрүүлсэн ≥ 8 цифр). */
export function isFullPhone(raw: string | null | undefined): boolean {
  return normalizePhone(raw).length >= 8;
}

/** DB-д хадгалагдах боломжтой (жигдрүүлсний дараа хоосон биш, 4–40 тэмдэгт). */
export function isValidPhone(raw: string | null | undefined): boolean {
  const t = (raw ?? "").trim();
  return t.length >= 4 && t.length <= 40 && normalizePhone(t) !== "";
}

/**
 * Харуулах хэлбэр: Монгол дугаар «9911 2233», бусад нь «+<цифрүүд>».
 * Жигдрүүлэх боломжгүй бол оруулсан бичвэрийг буцаана.
 */
export function formatPhone(raw: string | null | undefined): string {
  const norm = normalizePhone(raw);
  if (!norm) return (raw ?? "").trim();
  if (norm.length === 11 && norm.startsWith(MN_PREFIX)) {
    const local = norm.slice(3);
    return `${local.slice(0, 4)} ${local.slice(4)}`;
  }
  return `+${norm}`;
}

/** tel: холбоос. */
export function telHref(raw: string | null | undefined): string | null {
  const norm = normalizePhone(raw);
  return norm ? `tel:+${norm}` : null;
}

/**
 * Хайлтын түлхүүр (crm2_contacts.search_text-д phone_norm ба сүүлийн 8 цифр орсон):
 * бичвэр зөвхөн дугаарын тэмдэгтээс (цифр, зай, +, -, (, )) тогтож ≥ 4 цифртэй бол
 * цифрүүдийг («00» угтваргүй) буцаана — хэсэгчилсэн тааралтад; эс бөгөөс null.
 */
export function phoneSearchDigits(q: string | null | undefined): string | null {
  const t = (q ?? "").trim();
  if (!t || !/^[\d\s+\-().]+$/.test(t)) return null;
  let d = t.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d.length >= 4 ? d : null;
}

/** Нэг хүний олон дугаараас давхардлыг (жигдрүүлсэн утгаар) хасна. */
export function uniquePhones<T extends { phone: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((p) => {
    const n = normalizePhone(p.phone);
    if (!n || seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}
