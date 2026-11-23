/**
 * Ухаалаг хайлт (дүрэмд суурилсан): чөлөөт текстээс бүтэцтэй шүүлт гаргана.
 * ЦЭВЭР, клиентэд аюулгүй модуль.
 *
 *   «хан-уулд 2 өрөө 300 саяас доош» → district=Хан-Уул, rooms=2, maxPrice=300 сая
 *   «khan uul bair turees»           → district=Хан-Уул, type=Орон сууц, deal=rent
 *
 * ТӨРӨЛ, ДҮҮРЭГ, ӨРӨӨ, ТАЛБАЙ, ҮНЭ, ГҮЙЛГЭЭ, ОНЦЛОГ («тавилгатай», «зогсоолтой»…),
 * «шинэ барилга», «8%-ийн зээлд тохирох». Таниагүй үгс `rest`-д
 * анхны бичлэгээрээ үлдэж search_text-ээр хайгдана. Жижиг «нүцгэн» тоо
 * («Мандала 365», «39-р») хэзээ ч шүүлт болохгүй.
 *
 * Бүх толь нь энгийн кирилл бичлэгээр бичигдэж, модуль ачаалахад нэг удаа
 * нугалагдана (foldSearchText) — латин бичлэг (uruu, turees, bair) нугалсан
 * хувилбараар таарна.
 */
import { DISTRICTS } from "@/lib/constants";
import { normalizeFeatures, type FeatureKey } from "@/lib/listing-features";
import type { ListingFilters } from "@/lib/listing-filters";
import { DISTRICT_ABBR, foldSearchText } from "@/lib/search/fold";
import { STOPWORDS, tokenVariants } from "@/lib/search/query";

export type SmartFilters = Partial<
  Pick<
    ListingFilters,
    "deal" | "district" | "type" | "rooms" | "minPrice" | "maxPrice" | "minArea" | "maxArea" | "features" | "newBuild" | "loan8"
  >
>;
export type ParsedQuery = { filters: SmartFilters; rest: string };

// ── Толь (нугалсан) ─────────────────────────────────────────────────────────
const fold = foldSearchText;
const words = (s: string) => fold(s).split(" ").filter(Boolean);
const foldSet = (xs: string[]) => new Set(xs.map(fold).filter(Boolean));

type Phrase = { value: string; words: string[] };
const byLength = (a: Phrase, b: Phrase) => b.words.length - a.words.length;

const TYPE_ALIASES: Record<string, string[]> = {
  "Орон сууц": ["орон сууц", "орон сууцны", "байр", "байрны", "байранд", "апартмент", "apartment", "квартир"],
  Хаус: ["хаус", "байшин", "house", "вилла"],
  Газар: ["газар"],
  Оффис: ["оффис", "офис", "оффисын", "office"],
  "Худалдааны талбай": ["худалдааны талбай", "үйлчилгээний талбай"],
  Обьект: ["обьект", "объект"],
};
const TYPE_PHRASES: Phrase[] = Object.entries(TYPE_ALIASES)
  .flatMap(([value, xs]) => xs.map((x) => ({ value, words: words(x) })))
  .sort(byLength);

/** Онцлогийн хэллэг. Нүцгэн «тавилга», «тавилгагүй», тэжээвэр амьтан q-д үлдэнэ. */
const FEATURE_ALIASES: Partial<Record<FeatureKey, string[]>> = {
  furnished: ["тавилгатай", "бүрэн тавилгатай", "furnished"],
  parking: ["зогсоолтой", "гаражтай"],
  elevator: ["лифттэй"],
  balcony: ["тагттай"],
  storage: ["агуулахтай"],
  security: ["харуултай"],
  kids_playground: ["тоглоомын талбайтай"],
};
const FEATURE_PHRASES: Phrase[] = Object.entries(FEATURE_ALIASES)
  .flatMap(([value, xs]) => (xs ?? []).map((x) => ({ value, words: words(x) })))
  .sort(byLength);
const NEW_BUILD_PHRASES: Phrase[] = ["шинэ барилга", "шинэ барилгад"]
  .map((x) => ({ value: "1", words: words(x) }))
  .sort(byLength);

/** «8%-ийн [ипотекийн] зээлд тохирох» (түүхий текстээр — нугалалт % тэмдгийг хасдаг). */
const LOAN8_RE = /(^|\s)8\s?%(-?(ийн|ын))?(\s+(ипотек\S*|зээл\S*))*(\s+(тохирох|тохирно|тохиромжтой))?/iu;
const LOAN8_PHRASE_RE = /(^|\s)ипотекийн\s+зээлд\s+тохирох/iu;

/** 8%-ийн зээлийн хэллэгийг олж хасна; үлдсэн текстийн захын таслалыг цэвэрлэнэ. */
export function extractLoan8(q: string): { loan8: boolean; rest: string } {
  let rest = q;
  let loan8 = false;
  for (const re of [LOAN8_RE, LOAN8_PHRASE_RE]) {
    const m = re.exec(rest);
    if (!m) continue;
    loan8 = true;
    rest = rest.slice(0, m.index) + " " + rest.slice(m.index + m[0].length);
  }
  if (!loan8) return { loan8, rest: q };
  rest = rest
    .replace(/\s*[,;]\s*(?=[,;]|$)/gu, "")
    .replace(/^\s*[,;]+/u, "")
    .replace(/\s+/gu, " ")
    .trim();
  return { loan8, rest };
}

const DISTRICT_PHRASES: Phrase[] = DISTRICTS.flatMap((d) => [d, d.replace(/-/g, " "), DISTRICT_ABBR[d]].map((x) => ({ value: d as string, words: words(x) })))
  .sort(byLength);
/** Дүүргийн нэрийн сүүлд залгагдаж болох тийн ялгалын нөхцөл. */
const CASE_SUFFIXES = [...new Set(["", "д", "ад", "ед", "од", "т", "ын", "ийн", "ин", "аас", "оос", "ээс", "руу", "рүү", "тай", "тэй"].map(fold))];
const DISTRICT_WORD = fold("дүүр");

const NUMBER_WORDS: ReadonlyMap<string, number> = new Map(
  (
    [
      ["нэг", 1], ["хоёр", 2], ["гурав", 3], ["гурван", 3], ["дөрөв", 4], ["дөрвөн", 4],
      ["тав", 5], ["таван", 5], ["зургаа", 6], ["зургаан", 6],
    ] as [string, number][]
  ).map(([w, n]) => [fold(w), n])
);
const ROOM_PREFIX = fold("өрөө");
const ROOM_NOT = fold("орон");
const ROOM_LATIN = foldSet(["room", "rooms"]);

const ABLATIVE = foldSet(["аас", "оос", "ээс"]);
const QUAL_MIN = foldSet(["дээш", "илүү", "их", "дээгүүр"]);
const QUAL_MAX = foldSet(["хүртэл", "доош", "доор", "бага"]);
const QUAL_APPROX = foldSet(["орчим", "орчмын"]);
const MONTH = foldSet(["сард", "сарын", "сар", "сараар"]);
const CURRENCY_PREFIX = fold("төгрөг");
const CURRENCY_SHORT = fold("төг");

const MILLION = [fold("сая"), "млн", fold("мил")];
const BILLION = [fold("тэрбум"), "млрд"];
const THOUSAND = [fold("мянга")];

const RENT_PREFIX = [fold("түрээс"), fold("хөлсл")];
const RENT_EXACT = foldSet(["rent"]);
const SALE_EXACT = foldSet(["зарна", "зарах", "зарагдана", "худалдана", "худалдах", "худалдаж", "худалдан", "sale"]);

const INT_RE = /^[0-9]+$/;
const DEC_RE = /^[0-9]+(\.[0-9]+)?$/;
const GROUPED_RE = /^[0-9]{1,3}(\.[0-9]{3})+$/;

// ── Үг задлах ───────────────────────────────────────────────────────────────
type Sub = { alts: string[]; raw: number };

function tokenize(q: string): { raws: string[]; subs: Sub[] } {
  const raws = q.split(/\s+/).filter(Boolean);
  const subs: Sub[] = [];
  raws.forEach((raw, ri) => {
    const parts = fold(raw).split(" ").filter(Boolean);
    if (!parts.length) return;
    // Ижил тооны дэд үгтэй хувилбарууд (латин «uruu» → «оро», «уру»…); [0] = үндсэн.
    const variants = tokenVariants(raw)
      .map((v) => v.split(" ").filter(Boolean))
      .filter((p) => p.length === parts.length);
    if (!variants.length) variants.push(parts);
    parts.forEach((_, j) => subs.push({ alts: [...new Set(variants.map((p) => p[j]))], raw: ri }));
  });
  return { raws, subs };
}

class Cursor {
  consumed: boolean[];
  constructor(readonly subs: Sub[]) {
    this.consumed = subs.map(() => false);
  }
  get length() {
    return this.subs.length;
  }
  free(i: number) {
    return i >= 0 && i < this.subs.length && !this.consumed[i];
  }
  alts(i: number): string[] {
    return this.free(i) ? this.subs[i].alts : [];
  }
  is(i: number, set: ReadonlySet<string>) {
    return this.alts(i).some((a) => set.has(a));
  }
  starts(i: number, prefixes: readonly string[]) {
    return this.alts(i).some((a) => prefixes.some((p) => a.startsWith(p)));
  }
  /** Үндсэн бичлэг нь тоо бол утга (дан тоо, бутархай). */
  num(i: number, re: RegExp): number | null {
    if (!this.free(i)) return null;
    const a = this.subs[i].alts[0];
    return re.test(a) ? Number(a) : null;
  }
  take(from: number, to: number) {
    for (let k = from; k < to; k++) this.consumed[k] = true;
  }
}

/** i-ээс эхлэн хэллэг таарвал уртыг буцаана (сүүлийн үгэнд нөхцөл зөвшөөрч болно). */
function matchPhrase(c: Cursor, i: number, ws: string[], suffixes?: readonly string[]): number {
  for (let j = 0; j < ws.length; j++) {
    const last = j === ws.length - 1;
    const ok = c
      .alts(i + j)
      .some((a) => (last && suffixes ? suffixes.some((s) => a === ws[j] + s) : a === ws[j]));
    if (!ok) return 0;
  }
  return ws.length;
}

/** Бүх таарцыг идэж, олдсон бүх утгыг буцаана (давхардалгүй). */
function matchPhraseValues(c: Cursor, phrases: Phrase[]): string[] {
  const values: string[] = [];
  for (let i = 0; i < c.length; i++) {
    for (const p of phrases) {
      const n = matchPhrase(c, i, p.words);
      if (!n) continue;
      c.take(i, i + n);
      if (!values.includes(p.value)) values.push(p.value);
      i += n - 1;
      break;
    }
  }
  return values;
}

/** Бүх таарцыг идэж, эхний утгыг буцаана. */
function matchAllPhrases(c: Cursor, phrases: Phrase[], suffixes?: readonly string[], after?: (end: number) => number) {
  let value: string | undefined;
  for (let i = 0; i < c.length; i++) {
    for (const p of phrases) {
      const n = matchPhrase(c, i, p.words, suffixes);
      if (!n) continue;
      let end = i + n;
      if (after) end = after(end);
      c.take(i, end);
      value ??= p.value;
      i = end - 1;
      break;
    }
  }
  return value;
}

type Qual = "min" | "max" | "approx" | null;

function qualifierAt(c: Cursor, i: number): Qual {
  if (c.is(i, QUAL_MIN)) return "min";
  if (c.is(i, QUAL_MAX)) return "max";
  if (c.is(i, QUAL_APPROX)) return "approx";
  return null;
}

/** «NUM [NUM]» — эхний ба хоёр дахь тоо, дараагийн байрлал. */
function numbers(c: Cursor, i: number, re: RegExp): { a: number; b: number | null; next: number } | null {
  const a = c.num(i, re);
  if (a == null) return null;
  const b = c.num(i + 1, re);
  return { a, b, next: b == null ? i + 1 : i + 2 };
}

function range(a: number, b: number | null, qual: Qual, round: (x: number) => number): { min?: number; max?: number } {
  let min: number | undefined;
  let max: number | undefined;
  if (b != null) {
    min = round(a);
    max = round(b);
  } else if (qual === "min") min = round(a);
  else if (qual === "approx") {
    min = Math.round(a * 0.85);
    max = Math.round(a * 1.15);
  } else if (qual === "max") max = round(a);
  else return { max: undefined, min: undefined };
  const ok = (x: number | undefined) => (x != null && Number.isFinite(x) && x > 0 ? x : undefined);
  min = ok(min);
  max = ok(max);
  if (min != null && max != null && min > max) [min, max] = [max, min];
  return { min, max };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

function parseRooms(c: Cursor): number | undefined {
  let rooms: number | undefined;
  const numAt = (i: number): number | null => {
    const n = c.num(i, INT_RE);
    if (n != null) return n >= 1 && n <= 20 ? n : null;
    for (const a of c.alts(i)) {
      const w = NUMBER_WORDS.get(a);
      if (w != null) return w;
    }
    return null;
  };
  const roomWord = (i: number) =>
    c.alts(i).some((a) => (a.startsWith(ROOM_PREFIX) && !a.startsWith(ROOM_NOT)) || ROOM_LATIN.has(a));
  for (let i = 0; i < c.length; i++) {
    const a = numAt(i);
    if (a == null) continue;
    let j = i + 1;
    if (numAt(j) != null) j++;
    if (!roomWord(j)) continue;
    c.take(i, j + 1);
    rooms ??= a;
    i = j;
  }
  return rooms;
}

function areaUnitLength(c: Cursor, i: number): number {
  if (c.starts(i, ["м2", "мкв", "квм"]) || c.is(i, new Set(["кв"]))) {
    // «кв м» — хоёр үгтэй хэлбэрийг бүтнээр нь идэнэ.
    if (c.is(i, new Set(["кв"])) && c.is(i + 1, new Set(["м"]))) return 2;
    return 1;
  }
  if (c.is(i, new Set(["м"])) && c.is(i + 1, new Set(["кв"]))) return 2;
  return 0;
}

function parseArea(c: Cursor): { minArea?: number; maxArea?: number } {
  for (let i = 0; i < c.length; i++) {
    const n = numbers(c, i, DEC_RE);
    if (!n) continue;
    const u = areaUnitLength(c, n.next);
    if (!u) continue;
    let end = n.next + u;
    if (c.is(end, ABLATIVE)) end++;
    const qual = qualifierAt(c, end);
    if (qual) end++;
    const r = range(n.a, n.b, qual ?? "min", round2);
    if (r.min == null && r.max == null) continue;
    c.take(i, end);
    return { minArea: r.min, maxArea: r.max };
  }
  return {};
}

function priceUnit(c: Cursor, i: number): number {
  if (c.starts(i, BILLION)) return 1e9;
  if (c.starts(i, MILLION) || c.alts(i).includes("саи")) return 1e6;
  if (c.starts(i, THOUSAND)) return 1e3;
  return 0;
}

function parsePrice(c: Cursor): { minPrice?: number; maxPrice?: number; monthly: boolean } {
  for (let i = 0; i < c.length; i++) {
    let n = numbers(c, i, DEC_RE);
    let mult = n ? priceUnit(c, n.next) : 0;
    let end = 0;
    if (n && mult) end = n.next + 1;
    else {
      // Мянгатын цэгтэй том бүхэл тоо («1,600,000₮» → «1.600.000»).
      const g = numbers(c, i, GROUPED_RE);
      const val = (k: number) => Number(c.subs[k].alts[0].replace(/\./g, ""));
      if (!g || val(i) < 100_000) continue;
      n = { a: val(i), b: g.b != null ? val(i + 1) : null, next: g.next };
      mult = 1;
      end = g.next;
    }
    let qual: Qual = null;
    let monthly = c.is(i - 1, MONTH);
    const start = monthly ? i - 1 : i;
    // Нэгжийн дараах: төгрөг, -аас, дээш/хүртэл/орчим, сард (дурын дарааллаар).
    for (let guard = 0; guard < 4; guard++) {
      if (c.starts(end, [CURRENCY_PREFIX]) || c.is(end, new Set([CURRENCY_SHORT]))) end++;
      else if (c.is(end, ABLATIVE)) end++;
      else if (!qual && qualifierAt(c, end)) qual = qualifierAt(c, end++);
      else if (!monthly && c.is(end, MONTH)) {
        monthly = true;
        end++;
      } else break;
    }
    const r = range(n.a * mult, n.b != null ? n.b * mult : null, qual ?? "max", Math.round);
    if (r.min == null && r.max == null) continue;
    c.take(start, end);
    return { minPrice: r.min, maxPrice: r.max, monthly };
  }
  return { monthly: false };
}

function parseDeal(c: Cursor): "sale" | "rent" | undefined {
  let deal: "sale" | "rent" | undefined;
  for (let i = 0; i < c.length; i++) {
    const rent = c.starts(i, RENT_PREFIX) || c.is(i, RENT_EXACT);
    const sale = !rent && c.is(i, SALE_EXACT);
    if (!rent && !sale) continue;
    c.take(i, i + 1);
    deal ??= rent ? "rent" : "sale";
  }
  return deal;
}

/** Чөлөөт текст → шүүлт + таниагүй үлдэгдэл (анхны бичлэгээр). */
export function parseSearchQuery(q?: string): ParsedQuery {
  const loan = extractLoan8(q ?? "");
  const { raws, subs } = tokenize(loan.rest);
  const c = new Cursor(subs);
  const filters: SmartFilters = {};
  if (loan.loan8) filters.loan8 = true;

  const type = matchAllPhrases(c, TYPE_PHRASES);
  if (type) filters.type = type;

  const district = matchAllPhrases(c, DISTRICT_PHRASES, CASE_SUFFIXES, (end) =>
    c.starts(end, [DISTRICT_WORD]) ? end + 1 : end
  );
  if (district) filters.district = district;

  const features = normalizeFeatures(matchPhraseValues(c, FEATURE_PHRASES));
  if (features.length) filters.features = features;

  if (matchPhraseValues(c, NEW_BUILD_PHRASES).length) filters.newBuild = true;

  const rooms = parseRooms(c);
  if (rooms) filters.rooms = rooms;

  const area = parseArea(c);
  if (area.minArea != null) filters.minArea = area.minArea;
  if (area.maxArea != null) filters.maxArea = area.maxArea;

  const price = parsePrice(c);
  if (price.minPrice != null) filters.minPrice = price.minPrice;
  if (price.maxPrice != null) filters.maxPrice = price.maxPrice;

  const deal = parseDeal(c) ?? (price.monthly ? "rent" : undefined);
  if (deal) filters.deal = deal;

  // Түүхий үг бүх дэд үг нь идэгдсэн үед л үлдэгдлээс хасагдана.
  const hasSub = new Set<number>();
  const keep = new Set<number>();
  subs.forEach((s, k) => {
    hasSub.add(s.raw);
    if (!c.consumed[k]) keep.add(s.raw);
  });
  const rest = raws.filter((_, ri) => !hasSub.has(ri) || keep.has(ri)).join(" ");
  return { filters, rest };
}

const SMART_KEYS = [
  "q", "deal", "district", "type", "rooms", "minPrice", "maxPrice", "minArea", "maxArea", "features", "newBuild", "loan8",
] as const;

const smartValue = (v: unknown) => (Array.isArray(v) ? (v.length ? v.join(",") : undefined) : (v ?? undefined));

function sameSmart(a: ListingFilters, b: ListingFilters) {
  return SMART_KEYS.every((k) => smartValue(a[k]) === smartValue(b[k]));
}

/**
 * q-г тогтвортой цэг хүртэл задлана (давталт бүр ≥1 үг иднэ → төгсгөлтэй).
 * Задалсан утга нь URL-ийн утгыг дарна; өөрчлөгдвөл хуудас хасагдана.
 *  - Дүүрэг: q-ээс задалсан дүүрэг URL-ийн БҮХ дүүргийн жагсаалтыг СОЛЬНО
 *    (district=Хан-Уул,Баянгол + q «сүхбаатар» → district=Сүхбаатар); үр дүн чипээр харагдана.
 *  - Онцлог: URL ба задалсан онцлогийн НЭГДЭЛ (normalizeFeatures).
 *  - newBuild, loan8: задалсан бол true.
 */
export function applySmartQuery(f: ListingFilters): { filters: ListingFilters; changed: boolean } {
  let cur: ListingFilters = f;
  for (let pass = 0; pass < 16; pass++) {
    const p = parseSearchQuery(cur.q);
    const features = normalizeFeatures([...(cur.features ?? []), ...(p.filters.features ?? [])]);
    const next: ListingFilters = {
      ...cur,
      ...p.filters,
      features: features.length ? features : undefined,
      q: p.rest || undefined,
    };
    if (sameSmart(next, cur)) break;
    cur = next;
  }
  const changed = !sameSmart(cur, f);
  return { filters: changed ? { ...cur, page: undefined } : f, changed };
}

/**
 * AI-аар тайлбарлуулах нь утгатай эсэх (Stage 3-т ашиглана): дүрмээр юу ч
 * таниагүй, дүүргэгч бус ≥3 үгтэй, ≥12 тэмдэгттэй чөлөөт текст.
 */
export function shouldTryAi(q?: string): boolean {
  const p = parseSearchQuery(q);
  if (Object.keys(p.filters).length > 0) return false;
  if (p.rest.length < 12) return false;
  const wordsWithLetter = p.rest
    .split(/\s+/)
    .map(fold)
    .filter((w) => /[а-я]/.test(w) && !STOPWORDS.has(w));
  return wordsWithLetter.length >= 3;
}
