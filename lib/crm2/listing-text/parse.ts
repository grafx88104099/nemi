/**
 * Зарын чөлөөт бичвэр (Viber, Facebook, хуулсан зар) → Staff хөрөнгийн талбар.
 * ЦЭВЭР, ДЕТЕРМИНИСТ, клиентэд аюулгүй (сүлжээгүй, AI-гүй).
 *
 * Аюулгүй байдал:
 *  - Утасны дугаарыг эхлээд далдална; бүх задлалт далдалсан бичвэр дээр явагдана,
 *    тиймээс утасны цифр ХЭЗЭЭ Ч талбарт (үнэ, талбай, төслийн нэр…) орохгүй.
 *    Олдсон дугаар зөвхөн `phones`-д буцна — эзний талбарыг агент өөрөө сонгоно.
 *  - evidence ба restMasked нь maskPrivate-аар далдалсан бичвэрээс.
 *  - Задалсан бүх утга «шалгана уу» (unconfirmed) — хэрэглэгчийн бичсэнийг дарахгүй.
 */
import { foldSearchText } from "@/lib/search/fold";
import { maskPrivate } from "@/lib/crm2/text-privacy";
import {
  NUMBER_WORDS,
  findCategory,
  findDistrict,
  findFeatures,
  findParkingSpaces,
  findPropertyType,
  findRentTerms,
  foldTokens,
  type ParsedCategory,
  type ParsedPropertyType,
} from "@/lib/crm2/listing-text/dictionary";
import { findFloorInText } from "@/lib/crm2/listing-text/floor";
import { extractPhones, maskPhonesLoose } from "@/lib/crm2/listing-text/phones";
import { findPriceInText, type ParsedCurrency, type ParsedPriceBasis, type ParsedPricePeriod } from "@/lib/crm2/listing-text/price";
import { parseNumberText } from "@/lib/number-input";

export const LISTING_TEXT_MAX = 10_000;
export const REST_MASKED_MAX = 2000;
export const YEAR_MIN = 1950;
export const YEAR_MAX = 2049;

export type ListingTextContext = {
  /** Оффисын property.districts. */
  districts: readonly string[];
  /** Оффисын төслүүд (typeahead-ийн кэш г.м.). */
  projects: readonly { id: string; name: string }[];
  /** Оффисын property.features түлхүүрүүд. */
  featureKeys: readonly string[];
};

export type ParsedListingFields = {
  category?: ParsedCategory;
  property_type?: ParsedPropertyType;
  area_m2?: number;
  rooms?: number;
  floor?: number;
  building_floors?: number;
  price?: number;
  currency?: ParsedCurrency;
  price_basis?: ParsedPriceBasis;
  price_period?: ParsedPricePeriod;
  year_in_use?: number;
  district?: string;
  project_id?: string;
  project_name?: string;
  features?: string[];
  parking_spaces?: number;
  rent_advance_months?: number;
  rent_deposit_months?: number;
};

export type ParsedFieldKey = keyof ParsedListingFields;
export type ParseConfidence = "high" | "low";

export type ParsedListingText = {
  fields: ParsedListingFields;
  /** Талбар → бичвэрийн хэсэг (далдалсан, ≤80 тэмдэгт). */
  evidence: Partial<Record<ParsedFieldKey, string>>;
  confidence: Partial<Record<ParsedFieldKey, ParseConfidence>>;
  /** Олдсон утас (8 оронтой) — талбарт ОРОХГҮЙ. */
  phones: string[];
  /** Хувийн мэдээллийг далдалсан эх бичвэр (тэмдэглэлд, ≤2000). */
  restMasked: string;
  /** Сөрөг онцлог («тавилгагүй», «хагас тавилгатай») — UI-д мэдээлэл. */
  negatedFeatures: string[];
};

const L = "а-яөүёa-z";
const clip = (s: string, max = 80) => s.replace(/\s+/g, " ").trim().slice(0, max);
const NUMBER_WORD_RE = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join("|");

// ── Өрөө ───────────────────────────────────────────────────────────────────

function findRooms(low: string): { value: number; confidence: ParseConfidence; evidence: string } | null {
  const re = new RegExp(
    `(^|[^0-9.,${L}])(\\d{1,2}|${NUMBER_WORD_RE})\\s*-?\\s*(?:өрөө|uruu|oroo|rooms?)`,
    "g"
  );
  const vals: { n: number; ev: string }[] = [];
  for (const m of low.matchAll(re)) {
    const raw = m[2];
    const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
    if (n === undefined || n < 1 || n > 30) continue;
    vals.push({ n, ev: m[0].slice(m[1].length) });
  }
  const label = /өрөө(?:ний\s+тоо)?\s*:\s*(\d{1,2})(?![0-9])/.exec(low);
  if (label) vals.push({ n: Number(label[1]), ev: label[0] });
  if (!vals.length) return null;
  const distinct = new Set(vals.map((v) => v.n));
  return { value: vals[0].n, confidence: distinct.size === 1 ? "high" : "low", evidence: clip(vals[0].ev) };
}

// ── Талбай ─────────────────────────────────────────────────────────────────

const AREA_UNIT = "(?:м2|м²|м\\.\\s?кв\\.?|м\\s?кв\\.?|кв\\.?\\s?м(?![а-яөү])\\.?|мкв|квм|m2|m²|sqm|sq\\.?\\s?m|mkv)";

function findArea(low: string, landHint: boolean): { value: number; confidence: ParseConfidence; evidence: string } | null {
  const re = new RegExp(`(^|[^0-9.,${L}])(\\d{1,6}(?:[.,]\\d{1,3})?)\\s*${AREA_UNIT}(\\s*(?:-?\\s*(?:ийн|ын)\\s*үнэ|нь))?`, "g");
  const vals: { n: number; ev: string }[] = [];
  for (const m of low.matchAll(re)) {
    if (m[3]) continue; // «1м2 нь 4.6 сая» — үнийн суурь.
    const n = parseNumberText(m[2]);
    if (n === null || n <= 1 || n >= 10_000_000) continue;
    vals.push({ n: Math.round(n * 100) / 100, ev: m[0].slice(m[1].length) });
  }
  if (!vals.length) {
    const label = /(?:талбай|хэмжээ)\s*:\s*(\d{1,6}(?:[.,]\d{1,3})?)(?![0-9])/.exec(low);
    if (label) {
      const n = parseNumberText(label[1]);
      if (n !== null && n > 1) vals.push({ n, ev: label[0] });
    }
  }
  if (!vals.length && landHint) {
    const ha = /(^|[^0-9.,])(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:га|гa)(?![а-яөү])/.exec(low);
    if (ha) {
      const n = parseNumberText(ha[2]);
      if (n !== null && n > 0) return { value: Math.round(n * 10_000), confidence: "low", evidence: clip(ha[0]) };
    }
  }
  if (!vals.length) return null;
  const distinct = new Set(vals.map((v) => v.n));
  return { value: vals[0].n, confidence: distinct.size === 1 ? "high" : "low", evidence: clip(vals[0].ev) };
}

// ── Ашиглалтад орсон он ────────────────────────────────────────────────────

function findYear(low: string): { value: number; confidence: ParseConfidence; evidence: string } | null {
  const re = /(^|[^0-9])(19[5-9][0-9]|20[0-4][0-9])\s*(?:-?\s*(?:он|оны|онд|оноос|on|onii|ond)(?![а-яөүa-z])|\s*(?=ашиглалт))/g;
  for (const m of low.matchAll(re)) {
    const at = m.index ?? 0;
    const near = low.slice(Math.max(0, at - 40), at + m[0].length + 40);
    return { value: Number(m[2]), confidence: /ашиглалт|ashiglalt/.test(near) ? "high" : "low", evidence: clip(m[0].slice(m[1].length)) };
  }
  const label = /ашиглалт[а-яөү]*\s*(?:орсон\s*)?(?:он\s*)?:?\s*(19[5-9][0-9]|20[0-4][0-9])(?![0-9])/.exec(low);
  if (label) return { value: Number(label[1]), confidence: "high", evidence: clip(label[0]) };
  return null;
}

// ── Төсөл ──────────────────────────────────────────────────────────────────

const PROJECT_SUFFIXES = ["", "д", "т", "ын", "ийн", "ин", "ад", "ед", "од", "аас", "ээс", "оос", "ид"].map(foldSearchText);
const PROJECT_KEYWORD = /(хотхон|хороолол|residence|резиденс|ресидэнс|tower|тауэр|апартмент|apartment|plaza|плаза)([а-яөүё]*)/gi;
const KEEP_KEYWORD = /^(residence|резиденс|ресидэнс|tower|тауэр|апартмент|apartment|plaza|плаза)$/i;
const NAME_WORD = /^(?:[A-ZА-ЯЁӨҮ0-9][\p{L}0-9.'’&-]*|[a-z][a-z0-9.'’&-]*)$/u;
const NAME_STOP = new Set(
  [
    "энэ", "тус", "манай", "шинэ", "тансаг", "ХУД", "БЗД", "СБД", "ЧД", "БГД", "СХД", "НД", "УБ", "Улаанбаатар", "Хотын", "Нэмэлт",
    "at", "in", "the", "for", "of", "on", "near", "sqm", "m2", "space", "office", "rent", "sale",
  ].map((w) => w.toLowerCase())
);

/** «Vega City хотхонд», «Misheel residence», «Буянт-Ухаа 1 хороололд» → нэрийн нэр дэвшигч. */
function projectNameCandidates(masked: string): { name: string; evidence: string }[] {
  const out: { name: string; evidence: string }[] = [];
  for (const m of masked.matchAll(PROJECT_KEYWORD)) {
    const at = m.index ?? 0;
    const head = masked.slice(Math.max(0, at - 80), at);
    const segment = head.split(/[\n.!?|:;,()✅✔•*#📍🌿🏡"«»“”]/u).pop() ?? "";
    const words = segment.trim().split(/\s+/).filter(Boolean);
    const picked: string[] = [];
    for (let i = words.length - 1; i >= 0 && picked.length < 4; i--) {
      const w = words[i].replace(/[-–]+$/, (x) => (i === words.length - 1 ? "" : x));
      if (w === "-" || w === "–") {
        picked.unshift("-");
        continue;
      }
      // «Хангарьд сити 1 хотхон» — тооны өмнөх жижиг үсэгтэй нэг үгийг нэрэнд оруулна.
      const afterNumber = picked.length > 0 && picked.every((x) => /^[0-9]/.test(x)) && /^[а-яөүё]{2,}$/.test(w);
      if ((!NAME_WORD.test(w) && !afterNumber) || NAME_STOP.has(w.toLowerCase()) || /^\d+-?р$/.test(w)) break;
      picked.unshift(w);
    }
    while (picked[0] === "-") picked.shift();
    if (!picked.length) continue;
    const keyword = m[1];
    const numericOnly = picked.every((w) => /^[0-9]/.test(w));
    let name = picked.join(" ").replace(/\s*-\s*/g, "-");
    if (KEEP_KEYWORD.test(keyword) || numericOnly) name = `${name} ${keyword}`;
    name = name.replace(/\s+/g, " ").trim().slice(0, 120);
    if (name.length >= 2) out.push({ name, evidence: clip(masked.slice(Math.max(0, at - name.length - 2), at + m[0].length)) });
  }
  return out;
}

function matchProject(
  masked: string,
  candidates: { name: string }[],
  projects: ListingTextContext["projects"]
): { id: string; name: string; evidence: string } | null {
  if (!projects.length) return null;
  const tokens = foldTokens(masked);
  const keyed = projects
    .map((p) => ({ p, words: foldSearchText(p.name).split(" ").filter(Boolean) }))
    .filter((x) => x.words.length)
    .sort((a, b) => b.words.join(" ").length - a.words.join(" ").length);
  for (const { p, words } of keyed) {
    for (let i = 0; i + words.length <= tokens.length; i++) {
      let ok = true;
      for (let j = 0; j < words.length && ok; j++) {
        const t = tokens[i + j].t;
        ok = j === words.length - 1 ? PROJECT_SUFFIXES.some((s) => t === words[j] + s) : t === words[j];
      }
      if (ok) {
        return { id: p.id, name: p.name, evidence: clip(masked.slice(tokens[i].start, tokens[i + words.length - 1].end)) };
      }
    }
  }
  const folded = candidates.map((c) => foldSearchText(c.name));
  for (const { p, words } of keyed) {
    const key = words.join(" ");
    if (folded.includes(key)) return { id: p.id, name: p.name, evidence: p.name };
  }
  return null;
}

// ── Нэгтгэх ────────────────────────────────────────────────────────────────

/**
 * Бичвэр → талбар. Бичвэрийн эхний 10 000 тэмдэгтийг л уншина. Утас `phones`-д,
 * далдалсан эх бичвэр `restMasked`-д.
 */
export function parseListingText(text: string, ctx: ListingTextContext): ParsedListingText {
  const src = String(text ?? "").normalize("NFC").slice(0, LISTING_TEXT_MAX);
  const phones = extractPhones(src);
  const masked = maskPrivate(src);
  // Задлалтын бичвэр: утсыг далдалсан, бага үсэгтэй (тоот/код далдлах нь давхар, өрөөний тоо г.м.-ийг андуурахаас сэргийлнэ).
  const work = maskPhonesLoose(masked);
  const low = work.toLowerCase();
  const tokens = foldTokens(work);

  const fields: ParsedListingFields = {};
  const evidence: ParsedListingText["evidence"] = {};
  const confidence: ParsedListingText["confidence"] = {};
  const set = <K extends ParsedFieldKey>(k: K, v: ParsedListingFields[K], c: ParseConfidence, ev?: string) => {
    if (v === undefined) return;
    fields[k] = v;
    confidence[k] = c;
    if (ev) evidence[k] = clip(ev);
  };

  const type = findPropertyType(work, tokens);
  if (type) set("property_type", type.value, type.confidence, type.evidence);

  const rooms = findRooms(low);
  if (rooms) set("rooms", rooms.value, rooms.confidence, rooms.evidence);

  const area = findArea(low, type?.value === "land");
  if (area) set("area_m2", area.value, area.confidence, area.evidence);

  const floor = findFloorInText(low);
  if (floor.floor !== undefined) set("floor", floor.floor, floor.floorConfidence ?? "low", floor.evidence);
  if (floor.buildingFloors !== undefined) set("building_floors", floor.buildingFloors, floor.buildingConfidence ?? "low", floor.evidence);

  const price = findPriceInText(low);
  const category = findCategory(work, tokens);
  let cat: ParsedCategory | undefined = category?.value;
  let catConf: ParseConfidence = category?.confidence ?? "low";
  if (!cat && price?.period === "month") {
    cat = "rent";
    catConf = "low";
  }
  if (cat) set("category", cat, catConf, category?.evidence);

  if (price) {
    set("price", price.price, price.confidence, price.evidence);
    set("currency", price.currency, price.currency === "USD" ? "high" : price.confidence, price.evidence);
    set("price_basis", price.basis, price.confidence, price.evidence);
    const period: ParsedPricePeriod | undefined =
      price.period ?? (cat === "rent" ? "month" : cat === "sale" ? "total" : undefined);
    if (period) set("price_period", period, price.period ? "high" : "low", price.period ? price.evidence : undefined);
  }

  const year = findYear(low);
  if (year && year.value >= YEAR_MIN && year.value <= YEAR_MAX) set("year_in_use", year.value, year.confidence, year.evidence);

  const district = findDistrict(work, tokens, ctx.districts);
  if (district) set("district", district.value, district.confidence, district.evidence);

  const candidates = projectNameCandidates(work);
  const project = matchProject(work, candidates, ctx.projects);
  if (project) set("project_id", project.id, "high", project.evidence);
  else if (candidates[0]) set("project_name", candidates[0].name, "low", candidates[0].evidence);

  const features = findFeatures(work, tokens, ctx.featureKeys);
  if (features.positive.length) set("features", features.positive, "low", features.evidence.join(" · "));

  const parking = findParkingSpaces(low);
  if (parking) set("parking_spaces", parking.value, parking.confidence, parking.evidence);

  if (cat === "rent") {
    const terms = findRentTerms(low);
    if (terms.advance) set("rent_advance_months", terms.advance.value, terms.advance.confidence, terms.advance.evidence);
    if (terms.deposit) set("rent_deposit_months", terms.deposit.value, terms.deposit.confidence, terms.deposit.evidence);
  }

  return {
    fields,
    evidence,
    confidence,
    phones,
    restMasked: masked.replace(/[ \t]+/g, " ").trim().slice(0, REST_MASKED_MAX),
    negatedFeatures: features.negative,
  };
}
