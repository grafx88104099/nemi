import { fmtIsoDate } from "@/lib/crm2/datetime";
import {
  CURRENCIES,
  PRICE_PERIODS,
  PRICE_PERIOD_SUFFIX,
  PROPERTY_CATEGORIES,
  categoryLabel,
  defaultPricePeriod,
} from "@/lib/crm2/labels";
import { formatAmount, formatMoney } from "@/lib/crm2/money";
import type { RequirementCreateInput } from "@/lib/crm2/schemas";
import type { Crm2Currency, Crm2PricePeriod, Crm2PropertyCategory, Crm2RequirementRow, Json } from "@/lib/crm2/types";

/**
 * Харилцагчийн шаардлага (S08): маягтын төлөв ↔ action-ийн оролт, товч тойм,
 * өмнөх хувилбарын (snapshot) задлалт ба хувилбар хоорондын ялгаа. Цэвэр модуль.
 */

/** Шаардлагын шалгуур талбарууд (хувилбарын ялгаа харуулах дараалал). */
export const REQUIREMENT_FIELDS = [
  "purpose",
  "category",
  "property_type",
  "budget_min",
  "budget_max",
  "currency",
  "price_period",
  "districts",
  "locations",
  "rooms_min",
  "rooms_max",
  "area_min",
  "area_max",
  "move_in_from",
  "move_in_note",
  "required_features",
  "must_haves",
  "notes",
] as const;

export type RequirementField = (typeof REQUIREMENT_FIELDS)[number];

/** Шаардлагын шалгуурын хэлбэр (мөр эсвэл хувилбарын snapshot). */
export type RequirementData = {
  purpose: string | null;
  category: Crm2PropertyCategory | null;
  property_type: string | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: Crm2Currency;
  price_period: Crm2PricePeriod;
  districts: string[];
  locations: string[];
  rooms_min: number | null;
  rooms_max: number | null;
  area_min: number | null;
  area_max: number | null;
  move_in_from: string | null;
  move_in_note: string | null;
  required_features: string[];
  must_haves: string[];
  notes: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Мөр эсвэл snapshot (to_jsonb(хуучин мөр)) → шалгуурын хэлбэр. */
export function toRequirementData(row: Partial<Crm2RequirementRow> | Json | null | undefined): RequirementData {
  const r: Record<string, unknown> = isRecord(row) ? (row as Record<string, unknown>) : {};
  const category = (PROPERTY_CATEGORIES as readonly string[]).includes(String(r.category))
    ? (r.category as Crm2PropertyCategory)
    : null;
  const currency = (CURRENCIES as readonly string[]).includes(String(r.currency)) ? (r.currency as Crm2Currency) : "MNT";
  const period = (PRICE_PERIODS as readonly string[]).includes(String(r.price_period))
    ? (r.price_period as Crm2PricePeriod)
    : "total";
  return {
    purpose: str(r.purpose),
    category,
    property_type: str(r.property_type),
    budget_min: num(r.budget_min),
    budget_max: num(r.budget_max),
    currency,
    price_period: period,
    districts: strList(r.districts),
    locations: strList(r.locations),
    rooms_min: num(r.rooms_min),
    rooms_max: num(r.rooms_max),
    area_min: num(r.area_min),
    area_max: num(r.area_max),
    move_in_from: str(r.move_in_from),
    move_in_note: str(r.move_in_note),
    required_features: strList(r.required_features),
    must_haves: strList(r.must_haves),
    notes: str(r.notes),
  };
}

function fieldKey(v: unknown): string {
  if (Array.isArray(v)) return JSON.stringify([...v].map(String).sort());
  return JSON.stringify(v ?? null);
}

/** a → b хооронд өөрчлөгдсөн шалгуур талбарууд. */
export function changedRequirementFields(a: RequirementData, b: RequirementData): RequirementField[] {
  return REQUIREMENT_FIELDS.filter((f) => fieldKey(a[f]) !== fieldKey(b[f]));
}

// ── Харуулах ───────────────────────────────────────────────────────────────

export type RequirementLookup = {
  categoryLabels?: Partial<Record<string, string>> | null;
  types?: Record<string, string>;
  features?: Record<string, string>;
};

/** Хоёр утгын муж: «2–3», «2-оос дээш», «3 хүртэл». */
export function rangeText(min: number | null, max: number | null, unit = "", fmt: (n: number) => string = String): string | null {
  const u = unit ? ` ${unit}` : "";
  if (min != null && max != null) return min === max ? `${fmt(min)}${u}` : `${fmt(min)}–${fmt(max)}${u}`;
  if (min != null) return `${fmt(min)}${u}-аас дээш`;
  if (max != null) return `${fmt(max)}${u} хүртэл`;
  return null;
}

/** Төсөв: «300,000–500,000₮/сар», «$150,000 хүртэл». */
export function budgetText(data: Pick<RequirementData, "budget_min" | "budget_max" | "currency" | "price_period">): string | null {
  const { budget_min: min, budget_max: max, currency, price_period: period } = data;
  if (min == null && max == null) return null;
  const suffix = PRICE_PERIOD_SUFFIX[period] ?? "";
  const money = (n: number) => formatMoney(n, currency);
  if (min != null && max != null) {
    if (min === max) return `${money(min)}${suffix}`;
    // Нэг валютын тэмдэгтэй муж: «$1,000–2,000», «300,000–500,000₮».
    return currency === "USD"
      ? `$${formatAmount(min)}–${formatAmount(max)}${suffix}`
      : `${formatAmount(min)}–${money(max)}${suffix}`;
  }
  if (min != null) return `${money(min)}${suffix}-аас дээш`;
  return `${money(max as number)}${suffix} хүртэл`;
}

/** Шаардлагын гарчиг: зорилго, эс бөгөөс ангилал (+төрөл). */
export function requirementTitle(data: RequirementData, lookup: RequirementLookup = {}): string {
  if (data.purpose) return data.purpose;
  const parts = [
    data.category ? categoryLabel(data.category, lookup.categoryLabels) : null,
    data.property_type ? (lookup.types?.[data.property_type] ?? data.property_type) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Шаардлага";
}

export type RequirementLine = { field: RequirementField | "budget" | "rooms" | "area" | "move_in"; label: string; value: string };

/** Шаардлагын товч мөрүүд (хоосон талбарыг алгасна). */
export function requirementLines(data: RequirementData, lookup: RequirementLookup = {}): RequirementLine[] {
  const lines: RequirementLine[] = [];
  const push = (field: RequirementLine["field"], label: string, value: string | null | undefined) => {
    if (value) lines.push({ field, label, value });
  };
  push("category", "Ангилал", data.category ? categoryLabel(data.category, lookup.categoryLabels) : null);
  push("property_type", "Төрөл", data.property_type ? (lookup.types?.[data.property_type] ?? data.property_type) : null);
  push("budget", "Төсөв", budgetText(data));
  push("districts", "Дүүрэг", data.districts.join(", "));
  push("locations", "Байршил", data.locations.join(", "));
  push("rooms", "Өрөө", rangeText(data.rooms_min, data.rooms_max));
  push("area", "Хэмжээ", rangeText(data.area_min, data.area_max, "м²", (n) => formatAmount(n)));
  const moveIn = [data.move_in_from ? fmtIsoDate(data.move_in_from) : null, data.move_in_note].filter(Boolean).join(" · ");
  push("move_in", "Орох хугацаа", moveIn);
  push(
    "required_features",
    "Зайлшгүй онцлог",
    data.required_features.map((f) => lookup.features?.[f] ?? f).join(", ")
  );
  push("must_haves", "Зайлшгүй нөхцөл", data.must_haves.join("; "));
  push("notes", "Тэмдэглэл", data.notes);
  return lines;
}

/** Хувилбарын ялгааны талбарыг тоймын мөрийн түлхүүрт буулгах (тодруулахад). */
export function lineFieldsOf(changed: RequirementField[]): Set<RequirementLine["field"]> {
  const out = new Set<RequirementLine["field"]>();
  for (const f of changed) {
    if (f === "budget_min" || f === "budget_max" || f === "currency" || f === "price_period") out.add("budget");
    else if (f === "rooms_min" || f === "rooms_max") out.add("rooms");
    else if (f === "area_min" || f === "area_max") out.add("area");
    else if (f === "move_in_from" || f === "move_in_note") out.add("move_in");
    else out.add(f);
  }
  return out;
}

// ── Маягт ──────────────────────────────────────────────────────────────────

/** Маягтын төлөв (бүгд текст/жагсаалт — input-ийн утга). */
export type RequirementForm = {
  purpose: string;
  category: Crm2PropertyCategory | "";
  property_type: string;
  budget_min: string;
  budget_max: string;
  currency: Crm2Currency;
  price_period: Crm2PricePeriod;
  districts: string[];
  locations: string;
  rooms_min: string;
  rooms_max: string;
  area_min: string;
  area_max: string;
  move_in_from: string;
  move_in_note: string;
  required_features: string[];
  must_haves: string;
  notes: string;
};

const numText = (n: number | null) => (n == null ? "" : String(n));

export function requirementFormFrom(data?: RequirementData | null): RequirementForm {
  const d = data ?? toRequirementData(null);
  return {
    purpose: d.purpose ?? "",
    category: d.category ?? "",
    property_type: d.property_type ?? "",
    budget_min: numText(d.budget_min),
    budget_max: numText(d.budget_max),
    currency: d.currency,
    price_period: d.price_period,
    districts: [...d.districts],
    locations: d.locations.join(", "),
    rooms_min: numText(d.rooms_min),
    rooms_max: numText(d.rooms_max),
    area_min: numText(d.area_min),
    area_max: numText(d.area_max),
    move_in_from: d.move_in_from ?? "",
    move_in_note: d.move_in_note ?? "",
    required_features: [...d.required_features],
    must_haves: d.must_haves.join("\n"),
    notes: d.notes ?? "",
  };
}

/** «a, b; c» → ["a", "b", "c"] (давхардалгүй). */
export function splitList(text: string, sep: RegExp = /[,;\n]/): string[] {
  const out: string[] = [];
  for (const part of text.split(sep)) {
    const t = part.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Ангилал сонгоход үнийн хугацааны анхдагч (зарах = нийт). */
export function periodForCategory(category: Crm2PropertyCategory | "", current: Crm2PricePeriod): Crm2PricePeriod {
  if (!category) return current;
  if (category === "sale") return "total";
  return current === "total" ? defaultPricePeriod(category) : current;
}

/**
 * Маягт → createRequirement/updateRequirement-ийн оролт (contact_id/requirement_id-гүй).
 * Хоосон тоо → null (schema дахин шалгана); жагсаалтыг задлана.
 */
export function requirementInputFromForm(form: RequirementForm): Omit<RequirementCreateInput, "contact_id"> {
  return {
    purpose: form.purpose,
    category: form.category || null,
    property_type: form.property_type || null,
    budget_min: form.budget_min,
    budget_max: form.budget_max,
    currency: form.currency,
    price_period: form.category === "sale" ? "total" : form.price_period,
    districts: [...form.districts],
    locations: splitList(form.locations),
    rooms_min: form.rooms_min,
    rooms_max: form.rooms_max,
    area_min: form.area_min,
    area_max: form.area_max,
    move_in_from: form.move_in_from,
    move_in_note: form.move_in_note,
    required_features: [...form.required_features],
    must_haves: splitList(form.must_haves, /\n/),
    notes: form.notes,
  } as Omit<RequirementCreateInput, "contact_id">;
}
