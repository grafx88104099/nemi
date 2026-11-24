/**
 * Оффисын шимтгэлийн анхдагч (brokerage.default_commission) — цэвэр модуль.
 * Утга: '<төрөл>:<тоо>' — percent:3 (үнийн 3%), rent_x:1 (сарын түрээсийн 1 дахин), fixed:500000 (₮).
 * crm2_set_setting-ийн шалгалттай ижил: ^(percent|rent_x|fixed):\d{1,10}(\.\d{1,2})?$, percent ≤ 100,
 * rent_x 0.1–12. Урьдчилан бөглөсөн утгыг агент «Зөв» гэж баталгаажуулна (prefilled 'commission').
 */

export type CommissionDefaultKind = "percent" | "rent_x" | "fixed";
export type CommissionDefault = { kind: CommissionDefaultKind; value: number };

export const COMMISSION_DEFAULT_RE = /^(percent|rent_x|fixed):\d{1,10}(\.\d{1,2})?$/;

export const COMMISSION_DEFAULT_KIND_LABEL: Record<CommissionDefaultKind, string> = {
  percent: "Хувь (%)",
  rent_x: "Сарын түрээсийн N дахин",
  fixed: "Тогтмол (₮)",
};

/** '<төрөл>:<утга>' → объект; DB-ийн дүрмээр буруу бол null. */
export function parseCommissionDefault(raw: string | null | undefined): CommissionDefault | null {
  const s = (raw ?? "").trim();
  if (!COMMISSION_DEFAULT_RE.test(s)) return null;
  const [kind, num] = s.split(":") as [CommissionDefaultKind, string];
  const value = Number(num);
  if (!Number.isFinite(value)) return null;
  if (kind === "percent" && value > 100) return null;
  if (kind === "rent_x" && (value < 0.1 || value > 12)) return null;
  return { kind, value };
}

/** Объект → '<төрөл>:<утга>' (хадгалах хэлбэр). */
export function formatCommissionDefault(d: CommissionDefault): string {
  const v = Math.round(d.value * 100) / 100;
  return `${d.kind}:${Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "")}`;
}

/** Тохиргооны утгын шалгалт (null = зөв). */
export function commissionDefaultError(raw: string): string | null {
  const s = raw.trim();
  if (!COMMISSION_DEFAULT_RE.test(s)) return "Шимтгэлийн анхдагч буруу (жишээ: percent:3, rent_x:1, fixed:500000).";
  const d = parseCommissionDefault(s);
  if (!d) {
    return s.startsWith("percent") ? "Шимтгэлийн хувь 100-аас ихгүй." : "Сарын түрээсийн дахин тоо 0.1–12 хооронд байна.";
  }
  return null;
}

export type CommissionPrefill = {
  commission_type: "percent" | "fixed";
  commission_value: number;
  commission_note: string | null;
  prefilledKey: "commission";
};

type PriceBasis = {
  price_total: number | null | undefined;
  currency: string | null | undefined;
  price_period: string | null | undefined;
  /** м²-ийн үнээр оруулсан бол rent_x хэрэглэхгүй. */
  price_basis?: string | null;
};

/**
 * Хөрөнгийн ангилал, үнээс гэрээний шимтгэлийг урьдчилан бөглөнө (эсвэл null).
 * rent_x зөвхөн төгрөгийн САРЫН нийт (м²-ийн биш) түрээсэд: fixed = round(price_total × N), тайлбар
 * «сарын түрээсийн N дахин». Бусад суурь (нийт, өдөр, жил), валют эсвэл үнэгүй бол null.
 */
export function applyCommissionDefault(
  category: string | null | undefined,
  price: PriceBasis,
  settings: { "brokerage.default_commission"?: Partial<Record<string, string>> | null }
): CommissionPrefill | null {
  if (!category) return null;
  const d = parseCommissionDefault(settings["brokerage.default_commission"]?.[category] ?? null);
  if (!d) return null;
  if (d.kind === "percent") return { commission_type: "percent", commission_value: d.value, commission_note: null, prefilledKey: "commission" };
  if (d.kind === "fixed") return { commission_type: "fixed", commission_value: d.value, commission_note: null, prefilledKey: "commission" };
  const total = price.price_total;
  if (price.currency !== "MNT" || price.price_period !== "month" || (price.price_basis ?? "total") !== "total" || total == null || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return {
    commission_type: "fixed",
    commission_value: Math.round(total * d.value),
    commission_note: `сарын түрээсийн ${d.value} дахин`,
    prefilledKey: "commission",
  };
}

const RENT_CATEGORIES = new Set(["rent", "lease", "managed_rent"]);

/** Сэжигтэй шимтгэлийн сануулга (null = хэвийн): хувь ≥ 50, эсвэл түрээсэд 100%. */
export function suspiciousCommission(
  type: string | null | undefined,
  value: number | null | undefined,
  category: string | null | undefined
): string | null {
  if (type !== "percent" || value == null || !Number.isFinite(value)) return null;
  if (value >= 100 && category && RENT_CATEGORIES.has(category)) {
    return "Түрээсийн шимтгэл 100% байна — «сарын түрээсийн 1 дахин» гэвэл тогтмол дүнгээр оруулна уу.";
  }
  if (value >= 50) return "Шимтгэлийн хувь хэт өндөр байна — дахин шалгана уу.";
  return null;
}
