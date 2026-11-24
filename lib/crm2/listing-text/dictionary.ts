/**
 * Зарын бичвэрийн толь — ангилал, төрөл, онцлог, дүүрэг, зогсоол, түрээсийн
 * нөхцөл. ЦЭВЭР, клиентэд аюулгүй.
 *
 * Үгсийг lib/search/fold.ts foldSearchText-ээр нугалж харьцуулна (латин бичлэг,
 * ө/о, ү/у, том/жижиг ялгаагүй). Толийн үгс энгийн кириллээр бичигдэж модуль
 * ачаалахад нэг удаа нугалагдана.
 *
 * Дүрэм:
 *  - ангилал: түрээс/хөлслүүлнэ → rent, зарна/худалдана → sale. lease ба
 *    managed_rent-ийг ХЭЗЭЭ Ч автоматаар сонгохгүй (оффисын шийдвэр).
 *  - онцлог: «-тай/-тэй», «бий», «байгаа» → эерэг; «-гүй», «байхгүй», «үгүй»,
 *    «хагас тавилга», «гал тогооны тавилга» → сөрөг (онцлогт орохгүй).
 */
import { DISTRICT_ABBR, foldSearchText } from "@/lib/search/fold";

export type FoldToken = { t: string; start: number; end: number };

const fold = foldSearchText;
const fw = (s: string) => fold(s).split(" ").filter(Boolean);

/** Бичвэр → нугалсан дэд үгс, анхны үгийн байрлалтай (нотолгоо таслахад). */
export function foldTokens(text: string): FoldToken[] {
  const out: FoldToken[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    const start = m.index ?? 0;
    for (const t of fw(m[0])) out.push({ t, start, end: start + m[0].length });
  }
  return out;
}

export const snippet = (text: string, start: number, end: number, max = 80) =>
  text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, max);

// ── Ангилал ────────────────────────────────────────────────────────────────

export type ParsedCategory = "rent" | "sale";

const RENT_PREFIXES = ["түрээс", "хөлсл", "хулсл", "rent"].map(fold);
const RENT_EXACT = new Set(["forrent", "for rent"].map(fold));
const SALE_EXACT = new Set(
  ["зарна", "зарах", "зарагдана", "зарлая", "худалдана", "худалдах", "худалдаж", "борлуулна", "sale", "forsale", "zarna", "hudaldana", "khudaldana"].map(fold)
);
/** «түрээслүүлэхэд ашигтай», «түрээслэгчтэй», «түрээсийн орлого» — хөрөнгө оруулалтын үг, ангилал биш. */
const RENT_NOT = [/^туреслул?е?хед/, /^туреслегч/, /^туреслулх?ед/];
const INCOME = fold("орлого");

export type CategoryFinding = { value: ParsedCategory; confidence: "high" | "low"; evidence: string };

export function findCategory(text: string, tokens: FoldToken[]): CategoryFinding | null {
  let rent = 0;
  let sale = 0;
  let first: { v: ParsedCategory; tok: FoldToken } | null = null;
  tokens.forEach((tok, i) => {
    const t = tok.t;
    let v: ParsedCategory | null = null;
    if (SALE_EXACT.has(t)) v = "sale";
    else if (RENT_EXACT.has(t) || t.startsWith("форент") || RENT_PREFIXES.some((p) => t.startsWith(p))) {
      const investment = RENT_NOT.some((re) => re.test(t)) || (tokens[i + 1]?.t ?? "").startsWith(INCOME);
      if (!investment) v = "rent";
    }
    if (!v) return;
    if (v === "rent") rent++;
    else sale++;
    first ??= { v, tok };
  });
  if (!first) return null;
  const f = first as { v: ParsedCategory; tok: FoldToken };
  const value: ParsedCategory = rent === sale ? f.v : rent > sale ? "rent" : "sale";
  return { value, confidence: rent && sale ? "low" : "high", evidence: snippet(text, f.tok.start, f.tok.end) };
}

// ── Хөрөнгийн төрөл (crm2 property.types түлхүүр) ─────────────────────────

export type ParsedPropertyType = "apartment" | "house" | "office" | "land" | "garage" | "commercial";

type Phrase = { words: string[]; prefixLast?: boolean };
const phrase = (s: string, prefixLast = false): Phrase => ({ words: fw(s), prefixLast });

/** i-ээс эхлэн хэллэг таарвал урт; сүүлийн үг prefixLast бол угтвараар. */
function matchAt(tokens: FoldToken[], i: number, p: Phrase): number {
  for (let j = 0; j < p.words.length; j++) {
    const t = tokens[i + j]?.t;
    if (t === undefined) return 0;
    const last = j === p.words.length - 1;
    if (last && p.prefixLast ? !t.startsWith(p.words[j]) : t !== p.words[j]) return 0;
  }
  return p.words.length;
}

const TYPE_PHRASES: Record<ParsedPropertyType, Phrase[]> = {
  commercial: [
    phrase("үйлчилгээний талбай", true),
    phrase("худалдааны талбай", true),
    phrase("үйлчилгээний зориулалт", true),
    phrase("үйлчилгээний байр", true),
    phrase("лангуу", true),
    phrase("обьект", true),
    phrase("объект", true),
  ],
  office: [phrase("оффис", true), phrase("офис", true), phrase("office", true)],
  house: [
    phrase("хаус", true),
    phrase("байшин", true),
    phrase("townhouse", true),
    phrase("house", true),
    phrase("хувийн сууц", true),
    phrase("амины орон сууц", true),
  ],
  land: [phrase("газар"), phrase("газартай"), phrase("газрын"), phrase("газраа"), phrase("газрыг")],
  garage: [phrase("гараж"), phrase("граж"), phrase("гаражийг"), phrase("гаражаа"), phrase("garage")],
  apartment: [
    phrase("орон сууц", true),
    phrase("байр"),
    phrase("байрны"),
    phrase("байранд"),
    phrase("байрыг"),
    phrase("байраа"),
    phrase("байрт"),
    phrase("bair"),
    phrase("апартмент", true),
    phrase("apartment", true),
    phrase("квартир", true),
  ],
};

const ROOM_STEMS = ["өрөө", "uruu", "oroo", "room"].map(fold);
const LAND_BLOCK_NEXT = [fold("доор"), fold("дээр")];
const LAND_BLOCK_PREV = new Set(["цаазат", "үйлчилгээний", "худалдааны"].map(fold));

export type TypeFinding = { value: ParsedPropertyType; confidence: "high" | "low"; evidence: string };

export function findPropertyType(text: string, tokens: FoldToken[]): TypeFinding | null {
  const hasRooms = tokens.some((t) => ROOM_STEMS.some((r) => t.t.startsWith(r)));
  const hits: { type: ParsedPropertyType; i: number; n: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    for (const type of Object.keys(TYPE_PHRASES) as ParsedPropertyType[]) {
      for (const p of TYPE_PHRASES[type]) {
        const n = matchAt(tokens, i, p);
        if (!n) continue;
        if (type === "land") {
          const next = tokens[i + 1]?.t ?? "";
          const prev = tokens[i - 1]?.t ?? "";
          if (hasRooms || LAND_BLOCK_NEXT.some((b) => next.startsWith(b)) || LAND_BLOCK_PREV.has(prev)) continue;
        }
        if (type === "garage") {
          const prev = tokens[i - 1]?.t ?? "";
          if (hasRooms || /^[0-9]+$/.test(prev)) continue;
        }
        hits.push({ type, i, n });
      }
    }
  }
  const ev = (i: number, n: number) => snippet(text, tokens[i].start, tokens[i + n - 1].end);
  if (hits.length) {
    hits.sort((a, b) => a.i - b.i);
    let best = hits[0];
    // «D5 оффис, үйлчилгээний зориулалттай талбай» — үйлчилгээний талбай нь оффисоос давуу.
    if (best.type === "office") {
      const com = hits.find((h) => h.type === "commercial");
      if (com) best = com;
    }
    const distinct = new Set(hits.map((h) => h.type));
    return {
      value: best.type,
      confidence: distinct.size === 1 || (best.type !== "apartment" && distinct.size === 2 && distinct.has("apartment")) ? "high" : "low",
      evidence: ev(best.i, best.n),
    };
  }
  if (hasRooms) {
    const i = tokens.findIndex((t) => ROOM_STEMS.some((r) => t.t.startsWith(r)));
    return { value: "apartment", confidence: "low", evidence: ev(i, 1) };
  }
  return null;
}

// ── Онцлог (crm2 property.features түлхүүр) ───────────────────────────────

type FeatureRule = { key: string; stems: Phrase[]; anyForm?: boolean };

const FEATURE_RULES: FeatureRule[] = [
  { key: "furnished", stems: [phrase("тавилга", true), phrase("furnished", true)] },
  { key: "garage", stems: [phrase("гараж", true), phrase("граж", true), phrase("дулаан зогсоол", true), phrase("дулаан авто зогсоол", true), phrase("garage", true)] },
  { key: "parking", stems: [phrase("зогсоол", true), phrase("паркинг", true), phrase("parking", true)] },
  { key: "elevator", stems: [phrase("лифт", true), phrase("elevator", true)] },
  { key: "balcony", stems: [phrase("тагт", true), phrase("балкон", true), phrase("balcony", true)] },
  { key: "security", stems: [phrase("харуул", true), phrase("камер", true), phrase("security", true)], anyForm: true },
  { key: "storage", stems: [phrase("агуулах", true), phrase("storage", true)], anyForm: true },
  { key: "kids_playground", stems: [phrase("тоглоомын талбай", true), phrase("playground", true)], anyForm: true },
  { key: "pets", stems: [phrase("тэжээвэр амьтан", true), phrase("pets", true)] },
];

const COMITATIVE = ["тай", "тэй", "той"].map(fold);
/** «-тай/-тэй/-той»; нугалалт давхар үсгийг нэгтгэдэг тул «лифттэй» → «лифтеи» (т-ээр төгссөн угт). */
const isComitative = (stem: string, rest: string) =>
  COMITATIVE.includes(rest) || (stem.endsWith("т") && ["аи", "еи", "ои"].includes(rest));
const PRESENT_NEXT = new Set(["байна", "байгаа", "бий", "бүхий", "орсон", "үлдэнэ", "yes", "bii"].map(fold));
const NEG_NEXT = new Set(["байхгүй", "үгүй", "алга", "хориглоно", "болохгүй", "зөвшөөрөхгүй", "no"].map(fold));
const NEG_SUFFIX = fold("гүй");
const PARTIAL_PREV = [["хагас"], ["гал", "тогооны"], ["гал", "тогоо"], ["суурин"], ["суурилсан"]].map((ws) => ws.map(fold));
const FULL_PREV = new Set(["бүрэн", "бүх", "full", "fully"].map(fold));
const PET_OK = fold("зөвшөөр");

export type FeatureFinding = { positive: string[]; negative: string[]; evidence: string[] };

/** Онцлогийн үгс → эерэг/сөрөг түлхүүр. allowed-д байхгүй түлхүүр гарахгүй. */
export function findFeatures(text: string, tokens: FoldToken[], allowed: readonly string[]): FeatureFinding {
  const pos = new Set<string>();
  const neg = new Set<string>();
  const evidence: string[] = [];
  const used = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    if (used.has(i)) continue;
    for (const rule of FEATURE_RULES) {
      let n = 0;
      let stemLast = "";
      for (const p of rule.stems) {
        n = matchAt(tokens, i, p);
        if (n) {
          stemLast = p.words[p.words.length - 1];
          break;
        }
      }
      if (!n) continue;
      const last = tokens[i + n - 1].t;
      const rest = last.slice(stemLast.length);
      const next = tokens[i + n]?.t ?? "";
      const prev1 = tokens[i - 1]?.t ?? "";
      const prev2 = tokens[i - 2]?.t ?? "";
      let verdict: "pos" | "neg" | null = null;
      if (rest.endsWith(NEG_SUFFIX) || NEG_NEXT.has(next)) verdict = "neg";
      else if (rule.key === "furnished" && PARTIAL_PREV.some((ws) => (ws.length === 1 ? prev1 === ws[0] : prev2 === ws[0] && prev1 === ws[1]))) {
        verdict = "neg";
      } else if (rule.key === "pets") {
        if (next.startsWith(PET_OK) && !next.endsWith(fold("хгүй"))) verdict = "pos";
        else if (isComitative(stemLast, rest)) verdict = "pos";
      } else if (isComitative(stemLast, rest)) verdict = "pos";
      else if (PRESENT_NEXT.has(next) || (rule.key === "furnished" && FULL_PREV.has(prev1))) verdict = "pos";
      else if (rule.anyForm) verdict = "pos";
      for (let k = i; k < i + n; k++) used.add(k);
      if (!verdict || !allowed.includes(rule.key)) break;
      if (verdict === "pos") {
        if (!neg.has(rule.key)) pos.add(rule.key);
      } else {
        neg.add(rule.key);
        pos.delete(rule.key);
      }
      evidence.push(snippet(text, tokens[Math.max(0, i - 1)].start, tokens[Math.min(tokens.length - 1, i + n)].end, 60));
      break;
    }
  }
  return { positive: allowed.filter((k) => pos.has(k)), negative: allowed.filter((k) => neg.has(k)), evidence };
}

// ── Дүүрэг ─────────────────────────────────────────────────────────────────

/** Дүүргийн нэрийн сүүлд залгагдаж болох нөхцөл (parse-query.ts-тэй ижил толь). */
const CASE_SUFFIXES = [
  ...new Set(["", "д", "ад", "ед", "од", "эд", "т", "ын", "ийн", "ин", "аас", "оос", "ээс", "руу", "рүү", "тай", "тэй", "д", "ийнх"].map(fold)),
];

export type DistrictFinding = { value: string; confidence: "high" | "low"; evidence: string };

/**
 * Оффисын дүүргийн жагсаалтаас (property.districts) бичвэрт гарсныг олно:
 * бүтэн нэр, зураасгүй хувилбар, товчлол (ХУД, БЗД…). Хоёр үсэгтэй товчлолыг
 * (ЧД, НД) зөвхөн том үсгээр бичсэн үед таниулна («1-нд» мэт нөхцөлтэй андуурахгүй).
 */
export function findDistrict(text: string, tokens: FoldToken[], districts: readonly string[]): DistrictFinding | null {
  type V = { d: string; words: string[]; abbr2?: string };
  const variants: V[] = [];
  for (const d of districts) {
    const names = new Set([fold(d), fold(d.replace(/-/g, " "))]);
    for (const n of names) if (n) variants.push({ d, words: n.split(" ") });
    const abbr = (DISTRICT_ABBR as Record<string, string | undefined>)[d];
    if (abbr) variants.push({ d, words: [fold(abbr)], abbr2: abbr.length <= 2 ? abbr : undefined });
  }
  variants.sort((a, b) => b.words.length - a.words.length);
  const hits: { d: string; i: number; n: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    for (const v of variants) {
      let ok = true;
      for (let j = 0; j < v.words.length && ok; j++) {
        const t = tokens[i + j]?.t;
        const last = j === v.words.length - 1;
        ok = t !== undefined && (last ? CASE_SUFFIXES.some((s) => t === v.words[j] + s) : t === v.words[j]);
      }
      if (!ok) continue;
      if (v.abbr2) {
        const raw = text.slice(tokens[i].start, tokens[i].end);
        if (!raw.includes(v.abbr2)) continue;
      }
      hits.push({ d: v.d, i, n: v.words.length });
      i += v.words.length - 1;
      break;
    }
  }
  if (!hits.length) return null;
  const first = hits[0];
  const distinct = new Set(hits.map((h) => h.d));
  return {
    value: first.d,
    confidence: distinct.size === 1 ? "high" : "low",
    evidence: snippet(text, tokens[first.i].start, tokens[first.i + first.n - 1].end),
  };
}

// ── Тоо үгээр ───────────────────────────────────────────────────────────────

export const NUMBER_WORDS: Readonly<Record<string, number>> = {
  нэг: 1, хоёр: 2, гурав: 3, гурван: 3, дөрөв: 4, дөрвөн: 4, тав: 5, таван: 5, зургаа: 6, зургаан: 6,
  долоо: 7, долоон: 7, найм: 8, найман: 8, ес: 9, есөн: 9, арав: 10, арван: 10,
};
const NUMBER_WORD_RE = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join("|");

const toInt = (s: string): number | null => {
  if (/^\d+$/.test(s)) return Number(s);
  return NUMBER_WORDS[s] ?? null;
};

// ── Зогсоол ────────────────────────────────────────────────────────────────

export type CountFinding = { value: number; confidence: "high" | "low"; evidence: string };

const L = "а-яөүёa-z";

/** «2 зогсоолтой», «2 машины дулаан зогсоол», «1 дулаан авто зогсоол», «2 гаражтай»; «зогсоолгүй» → 0. */
export function findParkingSpaces(low: string): CountFinding | null {
  const re = new RegExp(
    `(^|[^0-9.,${L}])(\\d{1,2}|${NUMBER_WORD_RE})\\s*(?:ширхэг\\s+)?(?:машины\\s+|авто\\s+машины\\s+)?(?:(?:дулаан|гадна|авто|газар\\s+доорх|хаалттай|зэрэгцээ)\\s+)*(зогсоол|гараж|граж|parking)`,
    "g"
  );
  for (const m of low.matchAll(re)) {
    const n = toInt(m[2]);
    if (n === null || n < 0 || n > 50) continue;
    return { value: n, confidence: "high", evidence: m[0].slice(m[1].length).trim() };
  }
  const none = /(зогсоолгүй|зогсоол\s+байхгүй)/.exec(low);
  if (none) return { value: 0, confidence: "low", evidence: none[0] };
  return null;
}

// ── Түрээсийн нөхцөл ───────────────────────────────────────────────────────

export type RentTermsFinding = {
  advance?: CountFinding;
  deposit?: CountFinding;
};

const MONTHS_MAX = 24;
const MN = `(\\d{1,2}|${NUMBER_WORD_RE})`;

/** «урьдчилгаа 3 сар», «3 сарын урьдчилгаа», «барьцаа 1 сар», «барьцаагүй», «3+1». */
export function findRentTerms(low: string): RentTermsFinding {
  const out: RentTermsFinding = {};
  const set = (k: "advance" | "deposit", raw: string, ev: string, confidence: "high" | "low" = "high") => {
    if (out[k]) return;
    const n = toInt(raw);
    if (n === null || n < 0 || n > MONTHS_MAX) return;
    out[k] = { value: n, confidence, evidence: ev.trim() };
  };
  const ADV = "(?:урьдчилгаа|урьдчилж|uridchilgaa|urdchilgaa)";
  const DEP = "(?:барьцаа|baritsaa|bartsaa)";
  const NONE = {
    advance: /урьдчилгаагүй|урьдчилгаа\s+(?:байхгүй|авахгүй)/,
    deposit: /барьцаагүй|барьцаа\s+(?:байхгүй|авахгүй)/,
  };
  for (const [k, word] of [["advance", ADV], ["deposit", DEP]] as const) {
    const after = new RegExp(`${word}[${L}]*\\s*(?:төлбөр\\s*)?:?\\s*${MN}\\s*(?:сар|sar)`, "g");
    for (const m of low.matchAll(after)) set(k, m[1], m[0]);
    const beforeRe = new RegExp(`(^|[^0-9])${MN}\\s*(?:сарын|сар|sariin)\\s+(?:түрээсийн\\s+)?${word}`, "g");
    for (const m of low.matchAll(beforeRe)) set(k, m[2], m[0]);
    const none = NONE[k].exec(low);
    if (none) set(k, "0", none[0]);
  }
  if (!out.advance || !out.deposit) {
    const plus = /(^|[^0-9.,])(\d{1,2})\s*\+\s*(\d{1,2})(?![0-9])(?!\s*өрөө)/.exec(low);
    if (plus) {
      set("advance", plus[2], plus[0], "low");
      set("deposit", plus[3], plus[0], "low");
    }
  }
  return out;
}
