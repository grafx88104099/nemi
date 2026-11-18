/**
 * Хэрэглэгчийн бичсэн ТООН БИЧВЭРИЙГ унших — ЗАВСРЫН САНГҮЙ (zod импортлохгүй,
 * хөтөч дээрх маягт ч шууд ашиглана).
 *
 * ЯАГААД хэрэгтэй вэ: Монголд мянгатыг ихэвчлэн таслалаар («250,000,000»),
 * бутархайг цэгээр («81.47») бичдэг. Гэхдээ бутархайг ТАСЛАЛААР бичих нь
 * (гар утасны гар, Excel-ээс хуулсан утга, сургуулийн зуршил) мөн түгээмэл.
 * Өмнө нь таслалыг ЦӨМИЙГ нь мянгатын тусгаарлагч гэж үзээд хасдаг байсан тул
 * «81,47» гэж бичсэн хэмжээ 8147 м² болж ЧИМЭЭГҮЙ гажуудаж, тухайн шаардлагад
 * тохирох хөрөнгө хэзээ ч олддоггүй байв.
 *
 * Шийдэл: таслал/цэгийн үүргийг БАЙРЛАЛААР нь тодорхойлно.
 *   - хоёулаа байвал СҮҮЛД нь байгаа нь бутархайн тэмдэг («1,234.56», «1.234,56»);
 *   - зөвхөн цэг байвал нэг цэг = бутархай («96.5»), хоёр ба түүнээс дээш бол
 *     зөвхөн «1.234.567» хэлбэрийг (3 оронгийн бүлэг) мянгатад тооцно;
 *   - зөвхөн таслал байвал бүлэг нь яг 3 оронтой бол мянгат («1,234»), эс
 *     бөгөөс бутархай («81,47»).
 * Эргэлзээтэй «1,500» мэт утгыг мянгат гэж уншина — фокус алдахад маягт
 * уншсанаа буцааж харуулдаг (normalizeNumberText) тул хэрэглэгч шууд анзаарна.
 */

/** Зай, тасрахгүй зай — мянгатын тусгаарлагч байж болно. */
const SPACES = /[\s   ]/g;

/** «1,234,567» мэт 3 оронгоор бүлэглэсэн эсэх (тусгаарлагч заавал нэг ба түүнээс олон). */
function isGrouped(s: string, sep: "." | ","): boolean {
  const parts = s.split(sep);
  if (parts.length < 2) return false;
  if (!/^\d{1,3}$/.test(parts[0])) return false;
  return parts.slice(1).every((p) => /^\d{3}$/.test(p));
}

/**
 * Тоон бичвэр → тоо. Хоосон эсвэл таниагүй бол null (дуудагч нь өөрөө
 * «тоо байна» гэсэн алдаа өгнө).
 */
export function parseNumberText(text: string): number | null {
  let s = text.trim().replace(SPACES, "");
  if (!s) return null;
  let sign = 1;
  if (s[0] === "-") {
    sign = -1;
    s = s.slice(1);
  } else if (s[0] === "+") {
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const commas = (s.match(/,/g) ?? []).length;
  const dots = (s.match(/\./g) ?? []).length;

  let decimal: "." | "," | null = null;
  if (commas && dots) {
    decimal = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
  } else if (dots === 1) {
    decimal = ".";
  } else if (dots > 1) {
    if (!isGrouped(s, ".")) return null;
  } else if (commas === 1) {
    decimal = isGrouped(s, ",") ? null : ",";
  } else if (commas > 1) {
    if (!isGrouped(s, ",")) return null;
  }

  let intText = s;
  let fracText = "";
  if (decimal) {
    const at = s.lastIndexOf(decimal);
    intText = s.slice(0, at);
    fracText = s.slice(at + 1);
  }
  if (!/^\d*$/.test(fracText)) return null;

  const digits = intText.replace(/[.,]/g, "");
  // Бүхэл хэсэгт тусгаарлагч үлдсэн бол зөв бүлэглэсэн байх ёстой («1,2.3» → буруу).
  if (digits !== intText && !isGrouped(intText, intText.includes(",") ? "," : ".")) return null;
  if (!digits && !fracText) return null;

  const n = Number(`${digits || "0"}.${fracText || "0"}`);
  return Number.isFinite(n) ? sign * n : null;
}

/**
 * Маягтын талбарт уншсанаа буцааж харуулах жишиг бичвэр («81,47» → «81.47»).
 * Таниагүй бол бичсэнийг нь хэвээр үлдээнэ (алдааг схем хэлнэ).
 */
export function normalizeNumberText(text: string): string {
  const n = parseNumberText(text);
  if (n === null || Math.abs(n) >= 1e15) return text.trim();
  return String(n);
}
