import type { z } from "zod";

import { isIsoDate } from "@/lib/crm2/datetime";
import { CATEGORY_PRICE_PERIODS, defaultPricePeriod, missingItemLabel } from "@/lib/crm2/labels";
import { normalizePhone } from "@/lib/crm2/phone";
import { propertyCreateSchema } from "@/lib/crm2/schemas";
import type {
  Crm2BrokerageRow,
  Crm2CommissionType,
  Crm2Currency,
  Crm2PriceBasis,
  Crm2PricePeriod,
  Crm2PropertyCategory,
  Crm2PropertyRow,
  Json,
} from "@/lib/crm2/types";

/**
 * S02 маягтын төлөв ↔ server action-ийн оролт (цэвэр модуль — клиент маягт, тест).
 * Маягт тоог текстээр барина (хоосон = утгагүй); хадгалахдаа энд жигдэрнэ.
 * Засах горимд зөвхөн өөрчлөгдсөн талбарыг илгээнэ (diff) — түүх цэвэр, үүрэгт
 * агентын хамгаалалтад давхар өртөхгүй.
 */

// ── Талбар тус бүрийн эх бичвэр (field_notes) ─────────────────────────────

/** Эх бичвэр хадгалах талбарууд (field_notes-ийн түлхүүр = баганын нэр). */
export const FIELD_NOTE_KEYS = [
  "project",
  "location_text",
  "area_m2",
  "rooms",
  "floor",
  "price",
  "year_in_use",
  "operating_cost",
  "available_from",
] as const;
export type FieldNoteKey = (typeof FIELD_NOTE_KEYS)[number];

export const FIELD_NOTE_MAX = 2000;

/** jsonb field_notes → текст утгатай объект (буруу утгыг хасна). */
export function parseFieldNotes(raw: Json | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string" && v.trim() && k.length <= 40) out[k] = v;
  }
  return out;
}

/** Хоосон тайлбарыг хасаж, тайрна. */
export function cleanFieldNotes(notes: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(notes).sort()) {
    const v = (notes[k] ?? "").trim();
    if (v) out[k] = v.slice(0, FIELD_NOTE_MAX);
  }
  return out;
}

// ── Хөрөнгийн маягт ────────────────────────────────────────────────────────

export type PropertyFormState = {
  category: Crm2PropertyCategory | "";
  property_type: string;
  /** Төслийн нэр (оруулга). */
  project_name: string;
  /** Жагсаалтаас сонгосон төслийн id; гараар бичсэн бол null (хадгалахад үүсгэнэ). */
  project_id: string | null;
  district: string;
  location_text: string;
  address_detail: string;
  lat: number | null;
  lng: number | null;
  pin_address: string;
  area_m2: string;
  rooms: string;
  floor: string;
  building_floors: string;
  price: string;
  currency: Crm2Currency;
  price_period: Crm2PricePeriod;
  price_basis: Crm2PriceBasis;
  year_in_use: string;
  operating_cost: string;
  operating_cost_currency: Crm2Currency;
  operating_cost_period: Crm2PricePeriod;
  operating_cost_note: string;
  condition: string;
  view_note: string;
  notes: string;
  advantages: string;
  features: string[];
  available_from: string;
  availability_note: string;
  field_notes: Record<string, string>;
  listing_agent_id: string;
  contract_agent_id: string;
  photo_agent_id: string;
};

/** Шинэ хөрөнгө: листлэгч ба гэрээ хийсэн агент анхдагчаар — өөрөө. */
export function emptyPropertyForm(me: string | null): PropertyFormState {
  return {
    category: "",
    property_type: "",
    project_name: "",
    project_id: null,
    district: "",
    location_text: "",
    address_detail: "",
    lat: null,
    lng: null,
    pin_address: "",
    area_m2: "",
    rooms: "",
    floor: "",
    building_floors: "",
    price: "",
    currency: "MNT",
    price_period: "total",
    price_basis: "total",
    year_in_use: "",
    operating_cost: "",
    operating_cost_currency: "MNT",
    operating_cost_period: "month",
    operating_cost_note: "",
    condition: "",
    view_note: "",
    notes: "",
    advantages: "",
    features: [],
    available_from: "",
    availability_note: "",
    field_notes: {},
    listing_agent_id: me ?? "",
    contract_agent_id: me ?? "",
    photo_agent_id: "",
  };
}

const str = (v: string | null | undefined) => v ?? "";
const numStr = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "" : String(v));
const cur = (v: string | null | undefined): Crm2Currency => (v === "USD" ? "USD" : "MNT");

/** DB-ийн мөрийг маягтын төлөв болгоно (засах горим). */
export function propertyToForm(
  row: Crm2PropertyRow & { project?: { id: string; name: string } | null }
): PropertyFormState {
  return {
    category: row.category,
    property_type: str(row.property_type),
    project_name: row.project?.name ?? "",
    project_id: row.project_id,
    district: str(row.district),
    location_text: str(row.location_text),
    address_detail: str(row.address_detail),
    lat: row.lat,
    lng: row.lng,
    pin_address: str(row.pin_address),
    area_m2: numStr(row.area_m2),
    rooms: numStr(row.rooms),
    floor: numStr(row.floor),
    building_floors: numStr(row.building_floors),
    price: numStr(row.price),
    currency: cur(row.currency),
    price_period: row.price_period,
    price_basis: row.price_basis,
    year_in_use: numStr(row.year_in_use),
    operating_cost: numStr(row.operating_cost),
    operating_cost_currency: cur(row.operating_cost_currency),
    operating_cost_period: row.operating_cost_period,
    operating_cost_note: str(row.operating_cost_note),
    condition: str(row.condition),
    view_note: str(row.view_note),
    notes: str(row.notes),
    advantages: str(row.advantages),
    features: [...(row.features ?? [])],
    available_from: str(row.available_from),
    availability_note: str(row.availability_note),
    field_notes: parseFieldNotes(row.field_notes),
    listing_agent_id: str(row.listing_agent_id),
    contract_agent_id: str(row.contract_agent_id),
    photo_agent_id: str(row.photo_agent_id),
  };
}

/**
 * Тоон бичвэрийг (зай, таслалтай байж болно) тоо болгоно; хоосон → null;
 * тоо биш бол бичвэрээр нь үлдээнэ (схем монгол алдаа өгнө).
 */
export function parseNumberInput(v: string): number | string | null {
  const t = v.trim().replace(/[\s,]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : v.trim();
}

const textOrNull = (v: string) => {
  const t = v.trim();
  return t ? t : null;
};

/** Хөрөнгийн багана (төсөл, хувийн талбараас бусад) — server action-ийн оролт. */
export type PropertyPayload = {
  category: Crm2PropertyCategory | "";
  property_type: string | null;
  district: string | null;
  location_text: string | null;
  address_detail: string | null;
  lat: number | null;
  lng: number | null;
  pin_address: string | null;
  area_m2: number | string | null;
  rooms: number | string | null;
  floor: number | string | null;
  building_floors: number | string | null;
  price: number | string | null;
  currency: Crm2Currency;
  price_period: Crm2PricePeriod;
  price_basis: Crm2PriceBasis;
  year_in_use: number | string | null;
  operating_cost: number | string | null;
  operating_cost_currency: Crm2Currency;
  operating_cost_period: Crm2PricePeriod;
  operating_cost_note: string | null;
  condition: string | null;
  view_note: string | null;
  notes: string | null;
  advantages: string | null;
  features: string[];
  field_notes: Record<string, string>;
  available_from: string | null;
  availability_note: string | null;
  listing_agent_id: string | null;
  contract_agent_id: string | null;
  photo_agent_id: string | null;
};

export function propertyPayload(s: PropertyFormState): PropertyPayload {
  const pinSet = s.lat !== null && s.lng !== null;
  return {
    category: s.category,
    property_type: textOrNull(s.property_type),
    district: textOrNull(s.district),
    location_text: textOrNull(s.location_text),
    address_detail: textOrNull(s.address_detail),
    lat: pinSet ? s.lat : null,
    lng: pinSet ? s.lng : null,
    pin_address: textOrNull(s.pin_address),
    area_m2: parseNumberInput(s.area_m2),
    rooms: parseNumberInput(s.rooms),
    floor: parseNumberInput(s.floor),
    building_floors: parseNumberInput(s.building_floors),
    price: parseNumberInput(s.price),
    currency: s.currency,
    price_period: s.price_period,
    price_basis: s.price_basis,
    year_in_use: parseNumberInput(s.year_in_use),
    operating_cost: parseNumberInput(s.operating_cost),
    operating_cost_currency: s.operating_cost_currency,
    operating_cost_period: s.operating_cost_period,
    operating_cost_note: textOrNull(s.operating_cost_note),
    condition: textOrNull(s.condition),
    view_note: textOrNull(s.view_note),
    notes: textOrNull(s.notes),
    advantages: textOrNull(s.advantages),
    features: [...new Set(s.features.map((f) => f.trim()).filter(Boolean))].sort(),
    field_notes: cleanFieldNotes(s.field_notes),
    available_from: textOrNull(s.available_from),
    availability_note: textOrNull(s.availability_note),
    listing_agent_id: textOrNull(s.listing_agent_id),
    contract_agent_id: textOrNull(s.contract_agent_id),
    photo_agent_id: textOrNull(s.photo_agent_id),
  };
}

/** Төслийн холбоос: сонгосон id, шинэ нэр, эсвэл хасах. */
export type ProjectPatch = { project_id: string | null } | { project_name: string } | Record<string, never>;

/** Шинэ хөрөнгөнд төслийн оролт. */
export function projectForCreate(s: PropertyFormState): ProjectPatch {
  const name = s.project_name.trim();
  if (!name) return {};
  return s.project_id ? { project_id: s.project_id } : { project_name: name };
}

/** Засах горимд төслийн өөрчлөлт (өөрчлөгдөөгүй бол хоосон). */
export function projectChange(before: PropertyFormState, after: PropertyFormState): ProjectPatch {
  const name = after.project_name.trim();
  const prevName = before.project_name.trim();
  if (!name) return before.project_id || prevName ? { project_id: null } : {};
  if (after.project_id) return after.project_id === before.project_id ? {} : { project_id: after.project_id };
  // Гараар бичсэн нэр: өмнөхтэй ижил (том/жижиг үсэг, зай) бол өөрчлөлтгүй.
  if (projectKey(name) === projectKey(prevName) && before.project_id) return {};
  return { project_name: name };
}

/** crm2_projects.name_key-тэй ижил: жижиг үсэг, нэг зай. */
export function projectKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function stable(v: unknown): string {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Өөрчлөгдсөн түлхүүрүүд. Өргөрөг/уртраг хамт (DB нэг цэг гэж шалгана). */
export function diffPayload<T extends Record<string, unknown>>(before: T, after: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(after) as (keyof T)[]) {
    if (stable(before[k]) !== stable(after[k])) out[k] = after[k];
  }
  const o = out as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  if ("lat" in o || "lng" in o) {
    if ("lat" in a) o.lat = a.lat;
    if ("lng" in a) o.lng = a.lng;
  }
  return out;
}

/**
 * Нэг агент хэд хэдэн үүрэгтэй эсэх (property.same_agent_multi_role = false үед
 * DB хориглоно) → алдаа харуулах талбар эсвэл null.
 */
export function sameAgentConflict(
  p: Pick<PropertyPayload, "listing_agent_id" | "contract_agent_id" | "photo_agent_id">,
  multiRoleAllowed: boolean
): "contract_agent_id" | "photo_agent_id" | null {
  if (multiRoleAllowed) return null;
  const { listing_agent_id: l, contract_agent_id: c, photo_agent_id: ph } = p;
  if (c && c === l) return "contract_agent_id";
  if (ph && (ph === l || ph === c)) return "photo_agent_id";
  return null;
}

/** Объектоос нэг түлхүүрийг хассан хуулбар. */
export function omitKey<T extends Record<string, unknown>>(obj: T, key: string): T {
  if (!(key in obj)) return obj;
  const next = { ...obj };
  delete next[key];
  return next;
}

// ── Ангилал ба үнийн хугацаа ───────────────────────────────────────────────

/** Ангилалд тохирох үнийн хугацаа (одоогийн утга таарахгүй ч сонголтод үлдэнэ). */
export function pricePeriodOptions(category: Crm2PropertyCategory | "", current?: Crm2PricePeriod): Crm2PricePeriod[] {
  const allowed: Crm2PricePeriod[] = category ? [...CATEGORY_PRICE_PERIODS[category]] : ["total", "month", "day"];
  if (current && !allowed.includes(current)) allowed.push(current);
  return allowed;
}

export function pricePeriodMismatch(category: Crm2PropertyCategory | "", period: Crm2PricePeriod): boolean {
  return !!category && !CATEGORY_PRICE_PERIODS[category].includes(period);
}

/** Ангилал солиход үнийн хугацаа таарахгүй бол анхдагч руу шилжүүлнэ. */
export function withCategory(s: PropertyFormState, category: Crm2PropertyCategory): PropertyFormState {
  const period = pricePeriodMismatch(category, s.price_period) || !s.category ? defaultPricePeriod(category) : s.price_period;
  return { ...s, category, price_period: period };
}

/** м²-ийн үнээр нийт дүн (урьдчилан харах). */
export function previewTotal(s: Pick<PropertyFormState, "price" | "area_m2" | "price_basis">): number | null {
  const price = parseNumberInput(s.price);
  if (typeof price !== "number") return null;
  if (s.price_basis !== "per_m2") return price;
  const area = parseNumberInput(s.area_m2);
  return typeof area === "number" ? Math.round(price * area * 100) / 100 : null;
}

// ── Хувийн талбар (эзэн, үзүүлэх заавар) ───────────────────────────────────

export type OwnerRef = { id: string; name: string; code?: string | null; phone?: string | null };

export type PrivateFormState = {
  owner: OwnerRef | null;
  owner_note: string;
  showing_instructions: string;
};

export function emptyPrivateForm(): PrivateFormState {
  return { owner: null, owner_note: "", showing_instructions: "" };
}

export type PrivatePayload = {
  owner_contact_id: string | null;
  owner_note: string | null;
  showing_instructions: string | null;
};

export function privatePayload(s: PrivateFormState): PrivatePayload {
  return {
    owner_contact_id: s.owner?.id ?? null,
    owner_note: textOrNull(s.owner_note),
    showing_instructions: textOrNull(s.showing_instructions),
  };
}

// ── Зуучлалын гэрээ ────────────────────────────────────────────────────────

export type BrokerageFormState = {
  number: string;
  start_date: string;
  end_date: string;
  terms: string;
  commission_type: Crm2CommissionType | "";
  commission_value: string;
  commission_currency: Crm2Currency;
  commission_note: string;
  /** Хоосон бол DB: гэрээ хийсэн агент → листлэгч → өөрөө. */
  responsible_agent_id: string;
};

export function emptyBrokerageForm(): BrokerageFormState {
  return {
    number: "",
    start_date: "",
    end_date: "",
    terms: "",
    commission_type: "",
    commission_value: "",
    commission_currency: "MNT",
    commission_note: "",
    responsible_agent_id: "",
  };
}

export function brokerageToForm(row: Crm2BrokerageRow): BrokerageFormState {
  return {
    number: str(row.number),
    start_date: str(row.start_date),
    end_date: str(row.end_date),
    terms: str(row.terms),
    commission_type: row.commission_type ?? "",
    commission_value: numStr(row.commission_value),
    commission_currency: cur(row.commission_currency),
    commission_note: str(row.commission_note),
    responsible_agent_id: str(row.responsible_agent_id),
  };
}

/** Гэрээний хэсэгт ямар нэг зүйл бөглөсөн эсэх (шинэ хөрөнгөнд гэрээ үүсгэх эсэх). */
export function brokerageHasInput(s: BrokerageFormState, fileCount = 0): boolean {
  return (
    fileCount > 0 ||
    !!(
      s.number.trim() ||
      s.start_date ||
      s.end_date ||
      s.terms.trim() ||
      s.commission_type ||
      s.commission_value.trim() ||
      s.commission_note.trim()
    )
  );
}

export type BrokeragePayload = {
  number: string | null;
  owner_contact_id: string | null;
  start_date: string | null;
  end_date: string | null;
  terms: string | null;
  commission_type: Crm2CommissionType | null;
  commission_value: number | string | null;
  commission_currency: Crm2Currency;
  commission_note: string | null;
  responsible_agent_id: string | null;
};

export function brokeragePayload(s: BrokerageFormState, ownerId: string | null): BrokeragePayload {
  return {
    number: textOrNull(s.number),
    owner_contact_id: ownerId,
    start_date: textOrNull(s.start_date),
    end_date: textOrNull(s.end_date),
    terms: textOrNull(s.terms),
    commission_type: s.commission_type || null,
    commission_value: parseNumberInput(s.commission_value),
    commission_currency: s.commission_currency,
    commission_note: textOrNull(s.commission_note),
    responsible_agent_id: textOrNull(s.responsible_agent_id),
  };
}

/**
 * Батлуулахаар илгээхэд дутуу зүйлс (DB-ийн crm2_brokerage_missing-тэй ижил
 * түлхүүр) — илгээхээс өмнө клиентэд анхааруулна; эцсийн шалгалт DB.
 */
export function brokerageSubmitMissing(
  s: BrokerageFormState,
  opts: { ownerId: string | null; fileCount: number; requireOwner: boolean; requireFile: boolean; today: string }
): string[] {
  const missing: string[] = [];
  if (!isIsoDate(s.start_date)) missing.push("start_date");
  if (!isIsoDate(s.end_date)) missing.push("end_date");
  else if (s.end_date < opts.today) missing.push("end_date_past");
  if (!s.commission_type || typeof parseNumberInput(s.commission_value) !== "number") missing.push("commission");
  if (opts.requireOwner && !opts.ownerId) missing.push("owner");
  if (opts.requireFile && opts.fileCount === 0) missing.push("file");
  return missing;
}

/** Дутуу зүйлсийг энгийн монгол өгүүлбэр болгоно. */
export function missingSentence(keys: string[]): string {
  return keys.map(missingItemLabel).join(", ");
}

// ── Утас (шинэ эзэн) ───────────────────────────────────────────────────────

/** Шинэ эзний дугаарууд: хоосныг хасаж, жигдрүүлсэн утгаар давхардлыг арилгана. */
export function ownerPhones(list: string[]): { phone: string }[] {
  const seen = new Set<string>();
  const out: { phone: string }[] = [];
  for (const raw of list) {
    const phone = raw.trim();
    const norm = normalizePhone(phone);
    if (!phone || !norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push({ phone });
  }
  return out;
}

// ── Медиа ──────────────────────────────────────────────────────────────────

/** Массивын i ба j байрыг солино (шинэ массив; хязгаараас гарвал хэвээр). */
export function swap<T>(list: T[], i: number, j: number): T[] {
  if (i === j || i < 0 || j < 0 || i >= list.length || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Урт бичлэгийн холбоосын шалгалт (videoLinkSchema-тэй ижил) → алдаа эсвэл null. */
export function videoLinkError(url: string, videoCount: number, maxVideos: number): string | null {
  const t = url.trim();
  if (!t) return "Холбоосыг оруулна уу.";
  if (t.length > 1000) return "Холбоос хэт урт.";
  if (!/^https:\/\/\S+$/.test(t)) return "Бичлэгийн холбоос https:// -ээр эхэлнэ.";
  if (videoCount >= maxVideos) return `Нэг хөрөнгөд ${maxVideos} хүртэл бичлэг хадгална.`;
  return null;
}

/** Хөтөч доторх түр id (дараалалд байгаа файл, холбоос). */
export function newLocalId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ── Алдаа ──────────────────────────────────────────────────────────────────

/**
 * Хөрөнгийн оролтын бүх талбарын алдаа. Ангилал сонгоогүй үед zod бусад
 * нөхцөлийг (м²-ийн үнэ, давхар) шалгахгүй тул түр ангилалтай дахин шалгаж нэг
 * дор харуулна.
 */
export function propertyInputErrors(input: Record<string, unknown>): Record<string, string> {
  const parsed = propertyCreateSchema.safeParse(input);
  if (parsed.success) return {};
  let errs = fieldErrors(parsed.error);
  if (!input.category) {
    const again = propertyCreateSchema.safeParse({ ...input, category: "sale" });
    if (!again.success) errs = { ...fieldErrors(again.error), ...errs };
  }
  return errs;
}

/** Zod алдааг талбарын түлхүүрээр (эхний алдаа) — маягтад талбар бүрийн доор харуулна. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "_";
    if (out[key]) continue;
    out[key] = /[Ѐ-ӿ]/.test(issue.message) ? issue.message : "Утга буруу байна.";
  }
  return out;
}
