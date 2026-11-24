/**
 * Бичвэр доторх Монгол утасны дугаар — олох, далдлах. ЦЭВЭР, клиентэд аюулгүй.
 *
 * PHONE_PATTERN_SOURCE нь supabase/migrations/20261124000600_crm2_publish_payload.sql-ийн
 * public.crm2_phone_pattern()-тай ТЭМДЭГТ БҮРЭЭРЭЭ ИЖИЛ байх ёстой (тест SQL файлаас
 * уншиж харьцуулна). Нэгийг өөрчилбөл нөгөөг нь заавал хамт өөрчилнө.
 *
 *  - 8 оронтой, 6–9-өөр эхэлсэн дугаар (гар утас ба 7xxx суурин утас), урдаа
 *    «+976» / «976» байж болно; 2 оронгийн бүлгүүдийн хооронд нэг зай эсвэл зураас.
 *  - Ард нь «₮», «төг», «сая» байвал үнэ гэж үзэж алгасна («65000000₮»).
 *  - Lookbehind ХЭРЭГЛЭХГҮЙ (iOS Safari 16.4-өөс өмнөх хувилбар дэмждэггүй): эхний
 *    бүлэг (^|[^0-9]) өмнөх тэмдэгтийг барьдаг тул солихдоо «$1»-ийг хадгална.
 *  - Best effort: «9911.2233» (цэгтэй) ба «99 112 233» (2-3-3) хэлбэрийг SQL хэв
 *    барихгүй. Цэгтэй хэлбэрийг энд EXTRA_PHONE_SOURCES-оор нэмж олно (зөвхөн
 *    клиентийн олох/далдлахад; нийтлэлийн DB хоригт хамаарахгүй). 2-3-3 хэлбэр нь
 *    нэгжгүй бичсэн үнэтэй («65 000 000») давхцдаг тул зориуд оруулаагүй.
 */
export const PHONE_PATTERN_SOURCE =
  "(^|[^0-9])(?:[+]?976[ -]?)?[6-9][0-9](?:[ -]?[0-9]{2}){3}(?![0-9])(?! ?(?:₮|[тТ]өг|[сС]ая))";

/** SQL-ийн '\1•••• ••••'-тэй ижил орлуулга. */
export const PHONE_MASK = "•••• ••••";

/** SQL хэвийн гадна, зөвхөн клиентэд олох нэмэлт хэлбэр («9911.2233»). */
const EXTRA_PHONE_SOURCES = ["(^|[^0-9.,])(?:[+]?976[ .-]?)?[6-9][0-9]{3}[.][0-9]{4}(?![0-9.,])"];

/**
 * SQL ба JS хоёулаа ижил дүгнэх ёстой жишээ (staff-migrations.test ба
 * listing-text.test хуваалцана). [бичвэр, таарах эсэх].
 */
export const PHONE_PATTERN_SAMPLES: readonly (readonly [string, boolean])[] = [
  ["99112233", true],
  ["Утас: 9911 2233", true],
  ["9911-2233 залгана уу", true],
  ["+976 99112233", true],
  ["+976-9911-2233", true],
  ["97699112233", true],
  ["7711-2233 (оффис)", true],
  ["88 11 22 33", true],
  ["99112233,88112233", true],
  ["65000000₮", false],
  ["65000000 төг", false],
  ["99112233 сая", false],
  ["15000000", false],
  ["5511 2233", false],
  ["991122334", false],
  ["1991122334", false],
  ["9911223", false],
  ["81,47 мкв 2 өрөө", false],
  ["Үнэ 350 сая", false],
];

const phoneRe = (flags = "g") => new RegExp(PHONE_PATTERN_SOURCE, flags);
const allPhoneRes = () => [phoneRe(), ...EXTRA_PHONE_SOURCES.map((s) => new RegExp(s, "g"))];

/** Тоон хэсэг → 8 оронтой дотоод дугаар (эсвэл null). */
function localDigits(match: string): string | null {
  let d = match.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("976")) d = d.slice(3);
  return d.length === 8 && /^[6-9]/.test(d) ? d : null;
}

/**
 * Бичвэр доторх утасны дугаарууд — 8 оронтой дотоод хэлбэрээр («99112233»),
 * давхардалгүй, гарсан дарааллаар. isFullPhone/normalizePhone (lib/crm2/phone.ts)
 * үүнийг шууд хүлээж авна.
 */
export function extractPhones(text: string): string[] {
  const src = String(text ?? "");
  const found: { at: number; phone: string }[] = [];
  for (const re of allPhoneRes()) {
    for (const m of src.matchAll(re)) {
      const phone = localDigits(m[0].slice(m[1]?.length ?? 0));
      if (phone) found.push({ at: (m.index ?? 0) + (m[1]?.length ?? 0), phone });
    }
  }
  found.sort((a, b) => a.at - b.at);
  return [...new Set(found.map((f) => f.phone))];
}

/** Утасны хэв таарах эсэх (SQL crm2_has_phone-той ижил). */
export function hasPhonePattern(text: string): boolean {
  return phoneRe("").test(String(text ?? ""));
}

/**
 * SQL crm2_mask_phones()-тэй ЯГ ижил гаралт (нийтийн бичвэрт). Олон удаа
 * дуудахад өөрчлөгдөхгүй (далдласан хэсэгт цифр үлдэхгүй).
 */
export function maskPhones(text: string): string {
  return String(text ?? "").replace(phoneRe(), `$1${PHONE_MASK}`);
}

/** maskPhones + клиентийн нэмэлт хэлбэр («9911.2233»). Хувийн бичвэрт (maskPrivate). */
export function maskPhonesLoose(text: string): string {
  let out = maskPhones(text);
  for (const s of EXTRA_PHONE_SOURCES) out = out.replace(new RegExp(s, "g"), `$1${PHONE_MASK}`);
  return out;
}

/** Нэмэлт хэлбэрийг оруулсан хэв таарах эсэх. */
export function hasPhoneLoose(text: string): boolean {
  const s = String(text ?? "");
  return hasPhonePattern(s) || EXTRA_PHONE_SOURCES.some((src) => new RegExp(src).test(s));
}
