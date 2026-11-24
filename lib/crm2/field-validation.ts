import { parseNumberText } from "@/lib/number-input";

/**
 * Staff маягтын талбарын шалгалт (P1d) — цэвэр, фокус алдахад (blur) дуудна.
 *   * error   — хадгалахыг (DB-ийн check/идэвхжүүлэлт) саатуулах зөрчил;
 *   * warning — нийтлэхэд саад болох эсвэл нэгжийн алдаа мэт утга (хадгалахыг ХЭЗЭЭ Ч саатуулахгүй).
 * Мөн үнийн оролт: «350» + «сая» → 350 000 000 ₮, шууд урьдчилан харах мөр, нийт ↔ м²-ийн үнэ.
 */

// ── Үнийн оролт ────────────────────────────────────────────────────────────

export type PriceUnit = "none" | "сая" | "тэрбум";

export const PRICE_UNIT_FACTOR: Record<PriceUnit, number> = { none: 1, "сая": 1e6, "тэрбум": 1e9 };

/** Үнийн бичвэр + нэгж → төгрөгийн дүн. «2,5» ба «2.5» хоёулаа 2.5. Таниагүй/сөрөг бол null. */
export function parsePriceInput(text: string | null | undefined, unit: PriceUnit = "none"): number | null {
  const n = parseNumberText(text ?? "");
  if (n === null || !Number.isFinite(n) || n < 0) return null;
  const v = n * PRICE_UNIT_FACTOR[unit];
  // Сая/тэрбумаар бол бүхэл төгрөг; нэгжгүй бол 2 оронтой бутархай (DB numeric).
  return unit === "none" ? Math.round(v * 100) / 100 : Math.round(v);
}

/** Төгрөгийн дүнг тухайн нэгжээр бичвэр болгоно (маягтыг дахин бөглөхөд): 350000000 + сая → «350». */
export function priceToInput(amount: number | null | undefined, unit: PriceUnit = "none"): string {
  if (amount == null || !Number.isFinite(amount)) return "";
  const v = amount / PRICE_UNIT_FACTOR[unit];
  const r = Math.round(v * 1000) / 1000;
  return String(r);
}

/** Зайгаар бүлэглэсэн бүхэл дүн: 350000000 → «350 000 000». */
export function groupDigits(n: number): string {
  const neg = n < 0;
  const int = Math.round(Math.abs(n)).toString();
  return `${neg ? "-" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
}

/** Товч: 5 400 000 → «5.4 сая», 1 250 000 000 → «1.25 тэрбум», бусад нь бүлэглэсэн. */
export function shortAmount(n: number): string {
  const a = Math.abs(n);
  const trim = (x: number, d: number) => String(Math.round(x * 10 ** d) / 10 ** d);
  if (a >= 1e9) return `${trim(n / 1e9, 2)} тэрбум`;
  if (a >= 1e6) return `${trim(n / 1e6, 1)} сая`;
  return groupDigits(n);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** м²-ийн үнэ → нийт үнэ (талбайгүй бол null). */
export function totalFromPerM2(perM2: number | null | undefined, area: number | null | undefined): number | null {
  if (perM2 == null || area == null || !(area > 0) || !Number.isFinite(perM2)) return null;
  return round2(perM2 * area);
}

/** Нийт үнэ → м²-ийн үнэ (талбайгүй бол null). */
export function perM2FromTotal(total: number | null | undefined, area: number | null | undefined): number | null {
  if (total == null || area == null || !(area > 0) || !Number.isFinite(total)) return null;
  return round2(total / area);
}

export type PricePreviewInput = {
  amount: number | null;
  currency?: string | null;
  basis?: "total" | "per_m2" | null;
  period?: "total" | "month" | "day" | null;
  area_m2?: number | null;
};

const PERIOD_SUFFIX: Record<string, string> = { month: "/сар", day: "/өдөр", total: "" };

/**
 * Шууд харуулах бүтэн дүн: «350 000 000 ₮ · м² нь 5.4 сая» (нийт үнэ),
 * «5 400 000 ₮/м² · нийт 350 сая» (м²-ийн үнэ). Дүнгүй бол хоосон.
 */
export function formatPricePreview(p: PricePreviewInput): string {
  if (p.amount == null || !Number.isFinite(p.amount)) return "";
  const usd = p.currency === "USD";
  const money = (n: number) => (usd ? `$${groupDigits(n)}` : `${groupDigits(n)} ₮`);
  const short = (n: number) => (usd ? `$${shortAmount(n)}` : shortAmount(n));
  const suffix = PERIOD_SUFFIX[p.period ?? "total"] ?? "";
  if (p.basis === "per_m2") {
    const total = totalFromPerM2(p.amount, p.area_m2);
    const head = `${money(p.amount)}/м²${suffix}`;
    return total == null ? head : `${head} · нийт ${short(total)}`;
  }
  const per = perM2FromTotal(p.amount, p.area_m2);
  const head = `${money(p.amount)}${suffix}`;
  return per == null ? head : `${head} · м² нь ${short(per)}`;
}

// ── Талбарын шалгалт ───────────────────────────────────────────────────────

export type FieldIssue = {
  field: string;
  level: "error" | "warning";
  message: string;
  /** Нийтлэхэд саад болох сануулга. */
  publish?: boolean;
};

export type FieldValidationInput = {
  category?: string | null;
  price?: number | null;
  currency?: string | null;
  price_period?: string | null;
  price_basis?: string | null;
  area_m2?: number | null;
  floor?: number | null;
  building_floors?: number | null;
};

const RENT_CATEGORIES = new Set(["rent", "lease", "managed_rent"]);

export const PRICE_TOO_LOW = "Үнэ хэт бага байна — нэгжийг шалгана уу";
export const PRICE_TOO_HIGH = "Үнэ хэт их байна — нэгжийг шалгана уу";

/** Ангилал тус бүрийн үнийн боломжит муж (төгрөг). Гадна бол нэгжийн алдаа байх магадлалтай. */
export const PRICE_BANDS = {
  saleTotal: [5e6, 5e10],
  rentMonth: [1e5, 1e8],
  perM2: [1e5, 5e7],
} as const;

function band(value: number, [lo, hi]: readonly [number, number]): string | null {
  if (value < lo) return PRICE_TOO_LOW;
  if (value > hi) return PRICE_TOO_HIGH;
  return null;
}

/** Үнийн хэмжээний сануулга (зөвхөн төгрөг, үнэ > 0). */
export function priceMagnitudeWarning(v: FieldValidationInput): string | null {
  const price = v.price;
  if (price == null || !(price > 0) || (v.currency ?? "MNT") !== "MNT" || !v.category) return null;
  const perM2 = v.price_basis === "per_m2";
  const total = perM2 ? totalFromPerM2(price, v.area_m2) : price;
  if (v.category === "sale") {
    if (perM2) return band(price, PRICE_BANDS.perM2);
    return band(price, PRICE_BANDS.saleTotal);
  }
  if (RENT_CATEGORIES.has(v.category) && (v.price_period ?? "month") === "month") {
    return total == null ? null : band(total, PRICE_BANDS.rentMonth);
  }
  return null;
}

/** Нэг маягтын талбаруудын алдаа ба сануулга (DB-ийн дүрэмтэй ижил алдааны текст). */
export function validateFields(v: FieldValidationInput): FieldIssue[] {
  const out: FieldIssue[] = [];
  if (v.floor != null && v.building_floors != null && v.floor > v.building_floors) {
    out.push({ field: "floor", level: "error", message: "Давхар барилгын давхраас их байж болохгүй." });
  }
  if (v.price_basis === "per_m2" && (v.area_m2 == null || !(v.area_m2 > 0))) {
    out.push({ field: "area_m2", level: "error", message: "м²-ийн үнэтэй бол хэмжээг оруулна уу." });
  }
  const cat = v.category ?? null;
  const period = v.price_period ?? null;
  if (cat === "sale" && period && period !== "total") {
    out.push({ field: "price_period", level: "error", message: "Худалдах үнийг нийт дүнгээр оруулна." });
  } else if ((cat === "rent" || cat === "managed_rent") && period === "total") {
    out.push({ field: "price_period", level: "error", message: "Түрээсийн үнийг сар эсвэл өдрөөр оруулна." });
  } else if (cat && RENT_CATEGORIES.has(cat) && period && period !== "month") {
    out.push({
      field: "price_period",
      level: "warning",
      publish: true,
      message: period === "day" ? "Өдрийн үнэ нийтлэхэд саад болно — сарын үнийг оруулна уу." : "Нийт үнэ нийтлэхэд саад болно — сарын үнийг оруулна уу.",
    });
  }
  if (v.currency === "USD") {
    out.push({ field: "currency", level: "warning", publish: true, message: "Доллараар бол нийтлэхэд саад болно (нийтийн зар зөвхөн ₮)." });
  }
  const mag = priceMagnitudeWarning(v);
  if (mag) out.push({ field: "price", level: "warning", message: mag });
  return out;
}

/** Талбар → эхний алдаа/сануулгын текст (маягтад харуулахад). */
export function issuesByField(issues: FieldIssue[], level?: FieldIssue["level"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) if ((!level || i.level === level) && !(i.field in out)) out[i.field] = i.message;
  return out;
}

export function hasFieldErrors(issues: FieldIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}
