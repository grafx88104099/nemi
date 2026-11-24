/**
 * Хувийн мэдээллийг бичвэрээс далдлах ба нийтийн бичвэрийн эрсдэлийг илрүүлэх.
 * ЦЭВЭР, клиентэд аюулгүй.
 *
 * maskPrivate: утас, «N тоот», хаалга/орцны код, имэйл, «эзэн»-ий дараах нэр, утасны хажуудах
 *   ба «холбогдох/залгаарай» зэрэг холбоо барих үгийн дараах нэр.
 *   Олон удаа дуудахад үр дүн өөрчлөгдөхгүй (idempotent): далдласан хэсэгт цифр,
 *   үсэг үлдэхгүй тул дахин таарахгүй.
 * findPublicTextRisks: нийтлэх бичвэрт утас (DB нийтлэлийг хориглоно), тоот ба
 *   хаалганы код (анхааруулга) байгаа эсэх.
 */
import { hasPhoneLoose, maskPhonesLoose } from "@/lib/crm2/listing-text/phones";

export type PublicTextRisk = "phone" | "unit_no" | "door_code";

const DOTS = "••";
const L = "а-яөүёa-z";

/** «45 тоот», «45-р тоот», «Б12 тоот», «тоот: 45», «№45 тоот». */
const UNIT_SOURCES = [
  `(^|[^0-9])(№\\s*)?([0-9]{1,4}(?:\\s*[-/]\\s*[0-9]{1,4})?[а-яa-z]?)(\\s*-?\\s*(?:р|ын|ийн)?\\s*)(тоот)`,
  `(^|[^${L}])(тоот)(\\s*(?:нь|:|№)\\s*№?\\s*)([0-9]{1,4}[а-яa-z]?)(?![0-9])`,
];
/** «код 1234», «орцны код: 2580#», «домофон 45», «door code 1234». */
const CODE_SOURCE = `(^|[^${L}])((?:код|кодтой|кодыг|кодоор|домофон|domofon|code|kod)\\s*(?:нь|:|-|—)?\\s*)([0-9#*]{2,10})`;
const EMAIL_SOURCE = "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}";
/** «эзэн Бат», «эзэн нь Болд-Эрдэнэ», «Эзэн: сараа» (тодорхой тусгаарлагчтай бол жижиг үсэг ч зөвшөөрнө). */
const OWNER_NAME_SOURCES = [
  "(^|[^а-яөүё])([Ээ]з(?:эн|ний|нийх)(?:\\s+нь)?\\s*(?:[:\\-—]\\s*)?)([А-ЯЁӨҮA-Z][а-яёөүa-z]+(?:-[А-ЯЁӨҮа-яёөүA-Za-z][а-яёөүa-z]+)?(?:\\s+[А-ЯЁӨҮ][а-яёөү]+)?)",
  "(^|[^а-яөүё])([Ээ]з(?:эн|ний|нийх)(?:\\s+нь)?\\s*[:\\-—]\\s*)([а-яёөү]{2,}(?:-[а-яёөү]+)?)",
];
/** «эзэн нь өөрөө» мэт нэр биш үгс. */
const NOT_NAMES = new Set(["өөрөө", "биш", "байхгүй", "утас", "утсаар", "залгана", "нь", "холбогдоно", "гадаадад", "хотод"]);

/**
 * Утас/холбоо барих үгийн хажуудах том үсгээр эхэлсэн үгийг нэр гэж далдлахдаа алгасах үгс
 * («Утас 9911…», «Холбогдох: …»).
 */
const CONTACT_WORDS = new Set([
  ...NOT_NAMES,
  "тел",
  "утасны",
  "дугаар",
  "дугаараар",
  "холбогдох",
  "холбоо",
  "залга",
  "залгах",
  "залгаарай",
  "яриарай",
  "мессеж",
  "вайбер",
  "лавлах",
  "мэдээлэл",
  "үнэ",
  "зуучлал",
  "зуучлалгүй",
  "зуучлагч",
  "агент",
  "шууд",
  "эзэн",
  "эзний",
]);

/** Том үсгээр эхэлсэн (кирилл) нэр, «Бат-Эрдэнэ» хэлбэр. */
const NAME = "[А-ЯЁӨҮ][а-яёөү]+(?:-[А-ЯЁӨҮа-яёөү][а-яёөү]+)?";
/** Нэрийн араас ирдэг хүндэтгэл/хамаатны үг. */
const KIN = "(?:ах|эгч|гуай|дүү|баавай)";
/** maskPhonesLoose-ийн далдалсан утас. */
const MASKED_PHONE = "•{4} •{4}";
const NOT_LETTER = "(?![а-яёөүa-z])";
/** «Холбогдох: Сараа», «залгаарай Болд» — холбоо барих үгийн дараах нэр. */
const CUE_NAME_SOURCE = `(^|[^${L}])((?:[Хх]олбогдох|[Хх]олбоо\\s+барих|[Зз]алга(?:х|арай)?|[Яя]ри(?:х|арай))(?:\\s+(?:хүн|нь))?\\s*[:\\-—]?\\s*)(${NAME})${NOT_LETTER}`;
/** «Сараа 9911 2233», «Болд ах залгаарай 8811 2233» — утасны өмнөх нэр. */
const NAME_BEFORE_PHONE_SOURCE = `(^|[^${L}])(${NAME})((?:\\s+${KIN})?(?:\\s+[а-яёөү]+)?\\s*[:,\\-—]?\\s*)(?=${MASKED_PHONE})`;
/** «8811 2233 Болд», «9911 2233 Сараа эгч.» — утасны араас мөр/өгүүлбэр төгсөх нэр. */
const NAME_AFTER_PHONE_SOURCE = `(${MASKED_PHONE}\\s*[,\\-—]?\\s*)(${NAME})(?=(?:\\s+${KIN})?\\s*(?:$|[\\n.,;!)]))`;

const unitRes = () => UNIT_SOURCES.map((s) => new RegExp(s, "gi"));
const codeRe = () => new RegExp(CODE_SOURCE, "gi");
const emailRe = () => new RegExp(EMAIL_SOURCE, "g");
const ownerRes = () => OWNER_NAME_SOURCES.map((s) => new RegExp(s, "g"));
const isContactWord = (w: string) => CONTACT_WORDS.has(w.toLowerCase());

/** Хувийн мэдээллийг «••»-ээр далдална. Нийт уртын хязгааргүй — дуудагч нь таслана. */
export function maskPrivate(text: string): string {
  let s = maskPhonesLoose(String(text ?? ""));
  s = s.replace(emailRe(), "•••@•••");
  const [unitA, unitB] = unitRes();
  s = s.replace(unitA, (_m, lead: string, _no: string | undefined, _n: string, mid: string, word: string) => `${lead}${DOTS}${mid}${word}`);
  s = s.replace(unitB, (_m, lead: string, word: string, mid: string) => `${lead}${word}${mid}${DOTS}`);
  s = s.replace(codeRe(), (_m, lead: string, word: string) => `${lead}${word}${DOTS}`);
  for (const re of ownerRes()) {
    s = s.replace(re, (m, lead: string, word: string, name: string) =>
      NOT_NAMES.has(name.toLowerCase()) ? m : `${lead}${word}${DOTS}`
    );
  }
  // Утасны хажуудах ба холбоо барих үгийн дараах нэр (эзний нэр хувийн хэсгээс гадна гарахгүй).
  s = s.replace(new RegExp(CUE_NAME_SOURCE, "g"), (m, lead: string, cue: string, name: string) =>
    isContactWord(name) ? m : `${lead}${cue}${DOTS}`
  );
  s = s.replace(new RegExp(NAME_BEFORE_PHONE_SOURCE, "g"), (m, lead: string, name: string, rest: string) =>
    isContactWord(name) ? m : `${lead}${DOTS}${rest}`
  );
  s = s.replace(new RegExp(NAME_AFTER_PHONE_SOURCE, "gm"), (m, phone: string, name: string) =>
    isContactWord(name) ? m : `${phone}${DOTS}`
  );
  return s;
}

/** Нийтлэх бичвэрийн эрсдэл (давхардалгүй, тогтмол дараалал). */
export function findPublicTextRisks(text: string): PublicTextRisk[] {
  const s = String(text ?? "");
  const out: PublicTextRisk[] = [];
  if (hasPhoneLoose(s)) out.push("phone");
  if (unitRes().some((re) => new RegExp(re.source, "i").test(s))) out.push("unit_no");
  if (new RegExp(CODE_SOURCE, "i").test(s)) out.push("door_code");
  return out;
}
