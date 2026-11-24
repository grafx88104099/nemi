/**
 * Зарын бичвэр доторх үнэ — дүн + нэгж (сая, тэрбум, мянга), валют (₮, $),
 * суурь (м² нь / нийт) ба хугацаа (сард, /сар, өдөр). ЦЭВЭР, клиентэд аюулгүй.
 *
 * Оролт нь БАГА ҮСЭГТЭЙ, утсыг нь далдалсан бичвэр (parse.ts) — утасны цифр энд
 * хэзээ ч үнэ болохгүй. Тоог lib/number-input parseNumberText-ээр уншина
 * («2,5» → 2.5, «1,550,000» → 1550000); нэгжгүй «99.000» хэлбэрийг мянгат гэж үзнэ.
 */
import { parseNumberText } from "@/lib/number-input";

export type ParsedCurrency = "MNT" | "USD";
export type ParsedPriceBasis = "total" | "per_m2";
export type ParsedPricePeriod = "total" | "month" | "day";

export type PriceFinding = {
  price: number;
  currency: ParsedCurrency;
  basis: ParsedPriceBasis;
  /** Бичвэрт тодорхой хугацаа байвал (сард, /сар, өдөр); эс бөгөөс null. */
  period: ParsedPricePeriod | null;
  confidence: "high" | "low";
  evidence: string;
};

type Candidate = {
  value: number;
  currency: ParsedCurrency;
  basis: ParsedPriceBasis;
  basisExplicit: boolean;
  period: ParsedPricePeriod | null;
  score: number;
  at: number;
  text: string;
};

const L = "а-яөүёa-z";
const NUM = "(\\d{1,3}(?:[,.\\u00a0 ]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)";
/** Нэгж: араас нь үсэг залгахгүй («саяхан», «мянгат» таарахгүй). */
const UNIT = `(тэрбум(?:аар|ын)?|млрд|сая(?:ар|д|ын)?|saya|сай|млн|mln|мянга(?:н|аар|ын)?|myanga|k)(?![${L}])`;
const CUR = `(₮|төгрөг[${L}]*|төг\\.?|tug(?:rug)?|mnt|\\$|usd|ам\\.?\\s?доллар[${L}]*|доллар[${L}]*|dollar[s]?)`;

const PRICE_RE = new RegExp(
  `(^|[^0-9${L}.,])(\\$\\s?)?${NUM}\\s*(?:${UNIT})?\\s*(?:${CUR})?`,
  "g"
);
const BILLION_TAIL = new RegExp(`^\\s*(\\d{1,3}(?:[.,]\\d+)?)\\s*(?:сая|saya|млн)(?![${L}])\\s*(?:${CUR})?`);

const AREA_UNIT = "(?:м2|м²|м\\.?\\s?кв\\.?|кв\\.?\\s?м\\.?|мкв|квм|m2|m²|sqm|mkv)";

const unitMultiplier = (u: string | undefined): number => {
  if (!u) return 1;
  if (/^(тэрбум|млрд)/.test(u)) return 1e9;
  if (/^(сая|saya|сай|млн|mln)/.test(u)) return 1e6;
  if (/^(мянга|myanga|k)/.test(u)) return 1e3;
  return 1;
};

const isUsd = (c: string | undefined, dollarPrefix: string | undefined) =>
  !!dollarPrefix || (!!c && /^(\$|usd|ам|доллар|dollar)/.test(c));

/** Нэгжгүй тооны бичвэр: «99.000», «1,550,000», «194 000 000» → бүхэл; бусад нь parseNumberText. */
export function parseAmountText(numText: string, hasUnit: boolean): number | null {
  const t = numText.replace(/ /g, " ").trim();
  if (!hasUnit && /^\d{1,3}(?:[,. ]\d{3})+$/.test(t)) return Number(t.replace(/[,. ]/g, ""));
  if (/ /.test(t)) {
    if (!/^\d{1,3}(?: \d{3})+(?:[.,]\d+)?$/.test(t)) return null;
    return parseNumberText(t.replace(/ /g, ""));
  }
  return parseNumberText(t);
}

const before = (s: string, at: number, n: number) => s.slice(Math.max(0, at - n), at);

/** «мкв нь», «1м2-ийн үнэ», «м2 нь сард:» — үнийн ӨМНӨХ м²-ийн суурь. */
const PER_M2_BEFORE = new RegExp(
  `${AREA_UNIT}\\s*(?:-?\\s*(?:ийн|ын))?\\s*(?:үнэ|une)?\\s*(?:нь|ni)?\\s*(?:сард|сарын)?\\s*:?\\s*$`
);
function perM2Before(pre: string): boolean {
  const m = PER_M2_BEFORE.exec(pre);
  if (!m) return false;
  // «51.78 мкв 140 сая» — нэгжийн өмнө талбайн тоо (1-ээс бусад) байвал энэ нь талбай.
  const head = pre.slice(0, m.index).replace(/\s+$/, "");
  const num = /(\d+(?:[.,]\d+)?)$/.exec(head);
  return !num || num[1] === "1";
}
const PER_M2_AFTER = new RegExp(
  `^\\s*(?:${CUR})?\\s*(?:\\/\\s*(?:1\\s*)?${AREA_UNIT}|(?:1\\s*)?${AREA_UNIT}\\s*(?:нь|-?(?:д|т|ийн))(?![${L}])|per\\s+(?:sqm|m2))`
);
const MONTH_AFTER = new RegExp(
  `^\\s*(?:${CUR})?\\s*(?:\\/\\s*(?:1\\s*)?${AREA_UNIT})?\\s*(?:\\/\\s*сар|сард|сарын|сараар|сар(?![${L}])|\\/\\s*mo|sard|per\\s+month|a\\s+month|monthly|\\/\\s*month)`
);
const MONTH_BEFORE = /(?:сарын|сардаа|сард|сараар|сарын\s+түрээс(?:ийн)?(?:\s+үнэ)?|түрээс(?:ийн)?\s+(?:үнэ\s+)?сард?|sard|sariin|monthly)\s*(?:нь|төлбөр)?\s*:?\s*$/;
const DAY_AFTER = /^\s*(?:₮|төг\S*|\$)?\s*(?:\/\s*(?:өдөр|хоног)|өдөрт|хоногт|хоногийн|per\s+day|\/\s*day)/;
const DAY_BEFORE = /(?:өдрийн|хоногийн|өдөрт|хоногт)\s*:?\s*$/;
const TOTAL_BEFORE = /(?:нийт|niit|total)\s*(?:үнэ)?\s*:?\s*$/;
/** Өгүүлбэрийн хил (. ! ? ; мөр) давахгүй. */
const PRICE_WORD_BEFORE = /(?:үнэ|үнийн|une|price|төлбөр|түрээс)[^0-9.!?;\n]{0,14}$/;
const NOT_PRICE_BEFORE =
  /(?:зогсоол|гараж|граж|урьдчилгаа|барьцаа|зээл|сөх|ашиглалтын\s+зардал|менежмент|цалин|хөнгөлөлт)[^0-9.!?;\n]{0,14}$/;
const NOT_PRICE_AFTER = /^\s{0,2}(?:зогсоол|гараж|граж)/;

/**
 * Бичвэрээс үнийн бүх нэр дэвшигч. Нэгж/валюттай эсвэл «үнэ»-ийн дараах тоо,
 * эсвэл мянгатаар бүлэглэсэн том тоо л нэр дэвшинэ.
 */
function candidates(low: string): Candidate[] {
  const out: Candidate[] = [];
  for (const m of low.matchAll(PRICE_RE)) {
    const lead = m[1] ?? "";
    const dollarPrefix = m[2];
    const numText = m[3];
    const unit = m[4];
    const cur = m[5];
    const at = (m.index ?? 0) + lead.length;
    const end = (m.index ?? 0) + m[0].length;
    let text = m[0].slice(lead.length);
    const hasUnit = !!unit;
    let value = parseAmountText(numText, hasUnit);
    if (value === null || !Number.isFinite(value)) continue;
    value *= unitMultiplier(unit);
    let tailEnd = end;
    if (unit && /^(тэрбум|млрд)/.test(unit)) {
      const tail = BILLION_TAIL.exec(low.slice(end));
      if (tail) {
        const extra = parseNumberText(tail[1]);
        if (extra !== null && extra < 1000) {
          value += extra * 1e6;
          tailEnd = end + tail[0].length;
          text = low.slice(at, tailEnd);
        }
      }
    }
    const usd = isUsd(cur, dollarPrefix ?? (lead === "$" ? "$" : undefined));
    const pre = before(low, at, 40);
    const post = low.slice(tailEnd, tailEnd + 30);
    const priceWord = PRICE_WORD_BEFORE.test(before(low, at, 22));
    const grouped = !hasUnit && /^\d{1,3}(?:[,. ]\d{3})+$/.test(numText.trim());

    let score = 0;
    if (hasUnit || cur || dollarPrefix || lead === "$") score += 2;
    else if (grouped && value >= 10_000) score += 1;
    else if (priceWord && value >= 1000) score += 1;
    else continue;
    if (hasUnit && unit === "k" && !usd && !cur) continue;
    if (!hasUnit && !usd && value < 1000) continue;
    if (priceWord) score += 3;
    if (NOT_PRICE_BEFORE.test(before(low, at, 22)) || NOT_PRICE_AFTER.test(post)) score -= 4;
    // Нэгжийн ард шууд талбайн нэгж («5.4 сая м2» биш, «120 м2») — тоо нь талбай.
    if (!hasUnit && !cur && new RegExp(`^\\s*${AREA_UNIT}`).test(post)) continue;

    let basis: ParsedPriceBasis = "total";
    let basisExplicit = false;
    if (perM2Before(pre) || PER_M2_AFTER.test(post)) {
      basis = "per_m2";
      basisExplicit = true;
    } else if (TOTAL_BEFORE.test(pre)) {
      basisExplicit = true;
      score += 1;
    }
    let period: ParsedPricePeriod | null = null;
    if (MONTH_AFTER.test(post) || MONTH_BEFORE.test(pre)) period = "month";
    else if (DAY_AFTER.test(post) || DAY_BEFORE.test(pre)) period = "day";

    out.push({ value, currency: usd ? "USD" : "MNT", basis, basisExplicit, period, score, at, text: text.trim() });
  }
  return out;
}

/**
 * Хамгийн итгэлтэй үнэ. Оноо тэнцвэл нийт үнийг м²-ийнхээс илүүд үзнэ, дараа нь
 * эхэнд бичигдсэнийг. Хүчингүй (≤0, хэт их) утга орохгүй.
 */
export function findPriceInText(low: string): PriceFinding | null {
  const list = candidates(low).filter((c) => c.value > 0 && c.value < 1e14 && c.score > 0);
  if (!list.length) return null;
  list.sort(
    (a, b) => b.score - a.score || (a.basis === "total" ? 0 : 1) - (b.basis === "total" ? 0 : 1) || a.at - b.at
  );
  const best = list[0];
  const distinct = new Set(list.filter((c) => c.score >= best.score - 1 && c.basis === best.basis).map((c) => c.value));
  const confidence = best.score >= 5 && distinct.size === 1 ? "high" : "low";
  return {
    price: best.currency === "USD" ? Math.round(best.value * 100) / 100 : Math.round(best.value),
    currency: best.currency,
    basis: best.basis,
    period: best.period,
    confidence,
    evidence: best.text,
  };
}
