/**
 * Хайлтын «нугалалт» — латин/кирилл, том/жижиг, ө/о, ү/у… ялгааг арилгасан
 * харьцуулах хэлбэр. ЦЭВЭР, клиентэд аюулгүй модуль.
 *
 * АНХААР: Энд хийсэн аливаа өөрчлөлтийг public.search_fold ба
 * public.listings_build_search_text (миграц 20261123000300_listings_search_text)
 * болон lib/search/fold-cases.json-д ЯГ ижлээр тусгана. DB-д хадгалсан
 * listings.search_text ба энд үүсгэсэн хайлтын хэв маяг нэг толиор нугалагдах
 * ёстой — зөрвөл хайлт чимээгүйгээр юу ч олохгүй болно.
 *
 * Алхмын дараалал (SQL-тэй ижил):
 *  0) lower  1) зураасны хувилбарууд → «-»  2) NFKD + нийлмэл тэмдэг арилгах + дахин lower
 *  3) латин хос үсэг  4) латин үсэг → кирилл, ө→о ү→у э→е ы→и щ→ш, ь ъ хасах
 *  5) 1,5 → 1.5  6) 2-3 → «2 3»  7) бусад «-» хасах  8) тоо+үсэг → «тоо үсэг»
 *  9) [0-9а-я.]-ээс бусдыг зай  10) тооны хоорондохоос бусад цэг → зай
 *  11) зай нэгтгэх  12) «1 р» → «1р»  13) давхар үсэг нэгтгэх  14) яа → я  15) trim
 */
import { DISTRICTS, PROPERTY_TYPES } from "@/lib/constants";

export type District = (typeof DISTRICTS)[number];
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** Зураасны юникод хувилбарууд (U+2010–U+2015, U+2212). */
const DASHES = /[\u2010-\u2015\u2212]/g;
const COMBINING = /[\u0300-\u036f]/g;

export const DIGRAPHS: ReadonlyArray<readonly [string, string]> = [
  ["kh", "х"],
  ["sh", "ш"],
  ["ch", "ч"],
  ["ts", "ц"],
  ["zh", "ж"],
  ["ya", "я"],
  ["yo", "е"],
  ["ye", "е"],
  ["yu", "ю"],
];

/** SQL translate()-ийн толь. Хоосон утга = устгана (ь, ъ). */
export const LATIN_MAP: Readonly<Record<string, string>> = {
  a: "а", b: "б", c: "ц", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "и", j: "ж",
  k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", q: "к", r: "р", s: "с", t: "т",
  u: "у", v: "в", w: "в", x: "х", y: "и", z: "з",
  ө: "о", ү: "у", э: "е", ы: "и", щ: "ш", ь: "", ъ: "",
};

// TS-ийн ES2017 зорилтод lookbehind-ийг литералаар бичихгүй (RegExp-ээр үүсгэнэ).
const RE_DIGIT_COMMA = new RegExp("(?<=[0-9]),(?=[0-9])", "g");
const RE_DIGIT_DASH = new RegExp("(?<=[0-9])-(?=[0-9])", "g");
const RE_DIGIT_LETTER = /([0-9])(?=[а-я])/g;
const RE_NON_ALPHABET = /[^0-9а-я.]+/g;
const RE_LONE_DOT = new RegExp("(?<![0-9])\\.|\\.(?![0-9])", "g");
const RE_SPACES = /\s+/g;
const RE_NUM_R = /([0-9]) р(?![а-я])/g;
const RE_REPEAT = /([а-я])\1+/g;

/** public.search_fold-ийн яг толь. Гаралт үргэлж [0-9а-я. ] үсгээс бүрдэнэ. */
export function foldSearchText(input: string | null | undefined): string {
  let s = (input ?? "").toLowerCase();
  s = s.replace(DASHES, "-");
  s = s.normalize("NFKD").replace(COMBINING, "").toLowerCase();
  for (const [from, to] of DIGRAPHS) s = s.split(from).join(to);
  let t = "";
  for (const ch of s) {
    const m = LATIN_MAP[ch];
    t += m === undefined ? ch : m;
  }
  s = t;
  s = s.replace(RE_DIGIT_COMMA, ".");
  s = s.replace(RE_DIGIT_DASH, " ");
  s = s.split("-").join("");
  s = s.replace(RE_DIGIT_LETTER, "$1 ");
  s = s.replace(RE_NON_ALPHABET, " ");
  s = s.replace(RE_LONE_DOT, " ");
  s = s.replace(RE_SPACES, " ");
  s = s.replace(RE_NUM_R, "$1р");
  s = s.replace(RE_REPEAT, "$1");
  s = s.split("яа").join("я");
  return s.trim();
}

export const DISTRICT_ABBR: Readonly<Record<District, string>> = {
  "Хан-Уул": "ХУД",
  Баянзүрх: "БЗД",
  Сүхбаатар: "СБД",
  Чингэлтэй: "ЧД",
  Баянгол: "БГД",
  Сонгинохайрхан: "СХД",
  Налайх: "НД",
};

export const TYPE_SYNONYM: Readonly<Partial<Record<PropertyType, string>>> = {
  "Орон сууц": "байр",
  Хаус: "байшин",
  Оффис: "офис",
  Обьект: "объект",
};

export const DEAL_WORDS: Readonly<Record<"sale" | "rent", string>> = {
  sale: "худалдана худалдах зарна зарах",
  rent: "түрээс түрээслэх түрээслүүлнэ хөлслүүлнэ",
};

const WORD_HYPHEN = /\p{L}[-\u2010-\u2015\u2212]\p{L}/u;
const ANY_HYPHEN = /[-\u2010-\u2015\u2212]/g;

/** Нийтийн талбарууд л — эзний утас/нэр, CRM-ийн талбар энд ОРОХГҮЙ. */
export type SearchTextSource = {
  title?: string | null;
  district?: string | null;
  type?: string | null;
  description?: string | null;
  deal?: string | null;
  rooms?: number | null;
};

const lookup = <T extends string>(map: Readonly<Partial<Record<T, string>>>, key: string | null | undefined) =>
  key != null && Object.prototype.hasOwnProperty.call(map, key) ? (map as Record<string, string>)[key] : null;

/**
 * public.listings_build_search_text-ийн толь (тест ба parity шалгалтад; runtime-д
 * DB-ийн триггер бичдэг). Эхэнд/төгсгөлд зайтай — үгийн эхээр тааруулахад.
 */
export function buildListingSearchText(l: SearchTextSource): string {
  const { title, district, type, description, deal, rooms } = l;
  const parts: (string | null | undefined)[] = [
    title,
    title != null && WORD_HYPHEN.test(title) ? title.replace(ANY_HYPHEN, " ") : null,
    district,
    district != null && district.includes("-") ? district.split("-").join(" ") : null,
    lookup(DISTRICT_ABBR, district),
    type,
    lookup(TYPE_SYNONYM, type),
    lookup(DEAL_WORDS, deal),
    rooms != null && rooms > 0 ? `${rooms} өрөө` : null,
    // left(…, 4000) нь тэмдэгтээр тоолно (UTF-16 нэгжээр биш).
    description != null ? Array.from(description).slice(0, 4000).join("") : null,
  ];
  return " " + foldSearchText(parts.filter((x) => x != null).join(" ")) + " ";
}
