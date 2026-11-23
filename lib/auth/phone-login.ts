/**
 * R09 Stage 2 — утсаар (SMS OTP) нэвтрэлтийн цэвэр туслахууд. Клиент, сервер, тестэд аюулгүй.
 *
 * Монгол гар утасны дүрэм НЭГ эх сурвалж энд (20261123000400_phone_login.sql-ийн
 * backfill-д ижил regex давтагдсан). Шинэ операторын муж нэмэгдвэл хоёуланг нь шинэчил.
 */
import { normalizePhone } from "@/lib/crm2/phone";
import { siteUrl } from "@/lib/seo/site";

/** `1` бол /login дээр «Утсаар» таб харагдана. Build үед inline (өөрчилбөл redeploy). */
export const PHONE_LOGIN_ENABLED = process.env.NEXT_PUBLIC_PHONE_LOGIN === "1";

/** 976 + [6-9] + 7 цифр (жигдрүүлсэн, «+»-гүй). */
export const MN_MOBILE_RE = /^976[6-9]\d{7}$/;

export function isMnPhoneDigits(d: string): boolean {
  return MN_MOBILE_RE.test(d);
}

/** Оролт → «+976XXXXXXXX» эсвэл null (Монгол гар утас биш). */
export function toMnE164(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw);
  return isMnPhoneDigits(n) ? `+${n}` : null;
}

/**
 * Утасны талбарын onChange: зөвхөн цифр, дээд тал нь 8 (дотоод дугаар).
 * Хуулж буулгасан «+976 9911 2233», «00976…» угтварыг хасна.
 */
export function localDigitsInput(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00976")) d = d.slice(5);
  else if (d.startsWith("976") && d.length > 8) d = d.slice(3);
  return d.slice(0, 8);
}

function siteHost(): string {
  return new URL(siteUrl()).host;
}

/**
 * OTP SMS-ийн бичвэр. SMS_OTP_TEMPLATE-д `{code}` байвал түүгээр ({host} сонголттой),
 * үгүй бол анхдагч. Сүүлийн мөр нь WebOTP/Android-ийн origin-bound формат.
 */
export function otpSmsText(
  code: string,
  template: string | undefined = process.env.SMS_OTP_TEMPLATE,
  host: string = siteHost()
): string {
  if (template && template.includes("{code}")) {
    return template.replaceAll("{code}", code).replaceAll("{host}", host);
  }
  return `Нэми нэвтрэх код: ${code}\n\n@${host} #${code}`;
}

/** Лог/алдаанд зориулсан: зөвхөн сүүлийн 4 цифр. */
export function maskPhone(d: string): string {
  return `****${d.replace(/\D/g, "").slice(-4)}`;
}

/**
 * SMS-ээр нэвтэрсний дараах профайлын бичилт (markPhoneVerified). Миграцын backfill-тэй
 * ижил нөхцөл: профайлын утас хоосон бол auth утсыг бичнэ; жигдрүүлсэн утга нь auth
 * утастай тэнцүү бол зөвхөн phone_verified_at-ыг тогтооно; өөр дугаар бол юу ч
 * бичихгүй (null) — хэрэглэгчийн хадгалсан холбоо барих дугаарыг хэзээ ч дарж бичихгүй.
 *
 * `authDigits` нь жигдрүүлсэн Монгол гар утас («976…», «+»-гүй) байх ёстой.
 */
export function phoneVerifyPatch(
  profilePhone: string | null | undefined,
  authDigits: string,
  nowIso: string
): { phone?: string; phone_verified_at: string } | null {
  if (!isMnPhoneDigits(authDigits)) return null;
  if (!(profilePhone ?? "").trim()) return { phone: `+${authDigits}`, phone_verified_at: nowIso };
  if (normalizePhone(profilePhone) === authDigits) return { phone_verified_at: nowIso };
  return null;
}
