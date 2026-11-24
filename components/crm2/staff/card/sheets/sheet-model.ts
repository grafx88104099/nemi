import { PRIVATE_DRAFT_KEYS } from "@/lib/crm2/device/draft-store";
import { HISTORY_FIELD_LABEL } from "@/lib/crm2/history";
import { PROPERTY_AGENT_ROLE_LABEL } from "@/lib/crm2/labels";
import type { ChecklistSheet, NextStep } from "@/lib/crm2/checklist";
import type { PropertyUpdateInput } from "@/lib/crm2/schemas";

import {
  confirmFields,
  diffPayload,
  projectChange,
  propertyPayload,
  type PropertyFormState,
  type PropertyPayload,
} from "../../form/form-model";

/**
 * Картын доод цонхнуудын (sheets) цэвэр логик: ?sheet= параметр, цонх тус бүрийн талбар,
 * diff-ээр хадгалах патч, утсан дээрх нооргийг (IDB) серверийн утгатай нийлүүлэх.
 * Клиент бүрэлдэхүүн ба тест хоёулаа ашиглана.
 */

// ── Цонхнууд ────────────────────────────────────────────────────────────────

/** Хөрөнгийн талбар засах цонхнууд (картын хост өөрөө харуулна). */
export const CARD_FIELD_SHEETS = ["location", "size", "price", "roles", "owner", "details", "photos", "confirm"] as const;
export type CardFieldSheet = (typeof CARD_FIELD_SHEETS)[number];

/** ?sheet=-ийн бүх утга: талбарын цонх, шалгах жагсаалт, «дараагийн алхам», гэрээ, нийтлэх. */
export type CardSheetParam = CardFieldSheet | "checklist" | "next" | "contract" | "publish";

export function isCardFieldSheet(v: unknown): v is CardFieldSheet {
  return typeof v === "string" && (CARD_FIELD_SHEETS as readonly string[]).includes(v);
}

export function parseSheetParam(v: string | null | undefined): CardSheetParam | null {
  if (!v) return null;
  if (isCardFieldSheet(v)) return v;
  return v === "checklist" || v === "next" || v === "contract" || v === "publish" ? v : null;
}

/** «next» → дараагийн алхмын цонх; бусад нь хэвээр. Талбар (?field=) зөвхөн мөрийн нэрийн хэлбэртэй. */
export function resolveSheet(
  param: CardSheetParam | null,
  field: string | null | undefined,
  next: Pick<NextStep, "target">
): { sheet: Exclude<CardSheetParam, "next"> | null; field: string | null } {
  const safeField = field && /^[a-z][a-z0-9_.]{0,60}$/.test(field) ? field : null;
  if (param === "next") return { sheet: next.target.sheet as ChecklistSheet, field: next.target.field };
  return { sheet: param, field: param ? safeField : null };
}

export const SHEET_TITLE: Record<Exclude<CardSheetParam, "next">, string> = {
  location: "Байршил",
  size: "Хэмжээ, давхар",
  price: "Үнэ",
  roles: "Агентын үүрэг",
  owner: "Эзэн",
  details: "Ангилал ба тайлбар",
  photos: "Зураг, бичлэг",
  confirm: "Автомат утгыг шалгах",
  checklist: "Шалгах жагсаалт",
  contract: "Зуучлалын гэрээ",
  publish: "Нийтлэх",
};

/** Хөрөнгийн маягтын талбарыг засах цонхнууд ба тэдгээрийн талбар (PropertyFormState-ийн түлхүүр). */
export type PropertyFormSheet = "location" | "size" | "price" | "roles" | "details";

export const SHEET_FORM_KEYS: Record<PropertyFormSheet, readonly (keyof PropertyFormState)[]> = {
  location: ["project_name", "project_id", "district", "location_text", "address_detail", "lat", "lng", "pin_address"],
  size: ["area_m2", "rooms", "floor", "building_floors", "year_in_use", "parking_spaces"],
  price: [
    "price",
    "currency",
    "price_period",
    "price_basis",
    "operating_cost",
    "operating_cost_currency",
    "operating_cost_period",
    "operating_cost_note",
    "rent_advance_months",
    "rent_deposit_months",
  ],
  roles: ["listing_agent_id", "photo_agent_id"],
  details: [
    "category",
    "property_type",
    "features",
    "condition",
    "view_note",
    "advantages",
    "notes",
    "available_from",
    "availability_note",
  ],
};

/** Маягтын (төслөөс бусад) түлхүүр → server action-ийн payload-ын түлхүүр. */
function payloadKeys(sheet: PropertyFormSheet): (keyof PropertyPayload)[] {
  return SHEET_FORM_KEYS[sheet].filter((k): k is keyof PropertyPayload & keyof PropertyFormState =>
    k !== "project_name" && k !== "project_id"
  );
}

function pick<T extends Record<string, unknown>>(obj: T, keys: readonly (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

/**
 * Цонхны патч: зөвхөн тухайн цонхны өөрчлөгдсөн талбар + unconfirmed (зөвхөн багасна) + төслийн
 * өөрчлөлт (байршил). Өөрчлөлтгүй бол хоосон объект.
 */
export function sheetPatch(sheet: PropertyFormSheet, base: PropertyFormState, form: PropertyFormState): PropertyUpdateInput {
  const keys = [...payloadKeys(sheet), "unconfirmed" as const];
  const before = pick(propertyPayload(base), keys);
  const after = pick(propertyPayload(form), keys);
  const patch = diffPayload(before, after) as Record<string, unknown>;
  if (sheet === "location") Object.assign(patch, projectChange(base, form));
  // Ангиллыг хоосон болгохгүй (DB NOT NULL).
  if (patch.category === "") delete patch.category;
  return patch as PropertyUpdateInput;
}

export function isEmptyPatch(patch: object): boolean {
  return Object.keys(patch).length === 0;
}

/** Цонхонд засагдсан талбарыг баталгаажсанд тооцно (утга өөрчлөгдсөн бол unconfirmed-аас хасна). */
export function withEdited(form: PropertyFormState, keys: readonly (keyof PropertyFormState)[]): PropertyFormState {
  return { ...form, unconfirmed: confirmFields(form.unconfirmed, keys as string[]) };
}

// ── Талбарын id, алдааны талбар ────────────────────────────────────────────

/** Цонх доторх оруулгын DOM id (checklist target.field / dbErrorField → фокус). */
export function sheetFieldId(field: string): string {
  return `cs-${field.replace(/[^a-z0-9_]/gi, "-")}`;
}

/** DB/checklist-ийн талбарын нэр → цонхны оруулгын түлхүүр (нэг оруулгад хэд хэдэн багана). */
export function sheetFieldKey(field: string): string {
  if (field === "owner" || field.startsWith("owner.")) return field === "owner.source" ? "owner-source" : "owner";
  if (field === "project_id" || field === "project") return "project_name";
  if (field === "lng" || field === "pin") return "lat";
  if (field === "building_floors") return "floor";
  if (field === "currency" || field === "price_basis") return "price";
  return field;
}

// ── Утсан дээрх ноорог (IDB) ────────────────────────────────────────────────

/** Нооргийн нэг хэсэг: цонх нээсэн үеийн серверийн утга (base) ба засварласан утга (values). */
export type SheetDraftPart = { base: Record<string, unknown>; values: Record<string, unknown> };

const PRIVATE_SET = new Set<string>(PRIVATE_DRAFT_KEYS);

/** Ил хадгалах (form) ба vault-д битүүмжлэх (private) хэсэгт хуваана. */
export function splitPrivate(obj: Record<string, unknown>): { pub: Record<string, unknown>; priv: Record<string, unknown> } {
  const pub: Record<string, unknown> = {};
  const priv: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) (PRIVATE_SET.has(k) ? priv : pub)[k] = v;
  return { pub, priv };
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

export function sameValue(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

/** Засварласан түлхүүрүүд (values ≠ base). */
export function changedKeys(part: SheetDraftPart, keys: readonly string[]): string[] {
  return keys.filter((k) => k in part.values && !sameValue(part.values[k], part.base[k]));
}

/**
 * Хадгалсан ноорогийг одоогийн серверийн утга дээр нийлүүлнэ: агентын засварласан (values ≠ base)
 * талбар л сэргээгдэнэ; бусад нь серверийн шинэ утгаараа. Сэргээсэн талбар unconfirmed-аас хасагдана.
 */
export function mergeSheetDraft(
  current: PropertyFormState,
  part: SheetDraftPart,
  keys: readonly (keyof PropertyFormState)[]
): { form: PropertyFormState; restored: (keyof PropertyFormState)[] } {
  const restored: (keyof PropertyFormState)[] = [];
  const next = { ...current } as Record<string, unknown>;
  for (const k of changedKeys(part, keys as string[]) as (keyof PropertyFormState)[]) {
    if (sameValue(part.values[k], current[k])) continue;
    if (!typeMatches(part.values[k], current[k])) continue;
    next[k] = part.values[k];
    restored.push(k);
  }
  const form = next as PropertyFormState;
  return { form: restored.length ? withEdited(form, restored) : form, restored };
}

/** Хадгалсан утга маягтын төрөлтэй таарч байгаа эсэх (хуучин/эвдэрсэн ноорог). */
function typeMatches(stored: unknown, current: unknown): boolean {
  if (current === null) return stored === null || typeof stored === "number" || typeof stored === "string";
  if (Array.isArray(current)) return Array.isArray(stored) && stored.every((x) => typeof x === "string");
  if (typeof current === "object") return !!stored && typeof stored === "object" && !Array.isArray(stored);
  return typeof stored === typeof current || (typeof current === "number" && stored === null);
}

/** Энгийн бичвэрийн хэсэг (эзний тэмдэглэл, үзүүлэх заавар) — засварласан утгыг сэргээнэ. */
export function mergeTextDraft<T extends Record<string, string>>(current: T, part: SheetDraftPart | null | undefined): { values: T; restored: string[] } {
  if (!part) return { values: current, restored: [] };
  const out: Record<string, string> = { ...current };
  const restored: string[] = [];
  for (const k of changedKeys(part, Object.keys(current))) {
    const v = part.values[k];
    if (typeof v !== "string" || v === current[k]) continue;
    out[k] = v;
    restored.push(k);
  }
  return { values: out as T, restored };
}

// ── Баталгаажаагүй (автомат) утга ──────────────────────────────────────────

/** unconfirmed түлхүүрийн нэр (агентад). */
export const UNCONFIRMED_LABEL: Record<string, string> = {
  project: "Төсөл, хотхон",
  lat: "Газрын зургийн цэг",
  area_m2: "Талбай (м²)",
  notes: "Нэмэлт тайлбар",
  advantages: "Давуу тал",
  features: "Онцлог",
  listing_agent_id: PROPERTY_AGENT_ROLE_LABEL.listing_agent_id,
  contract_agent_id: PROPERTY_AGENT_ROLE_LABEL.contract_agent_id,
  photo_agent_id: PROPERTY_AGENT_ROLE_LABEL.photo_agent_id,
};

export function unconfirmedLabel(key: string): string {
  return UNCONFIRMED_LABEL[key] ?? HISTORY_FIELD_LABEL[key] ?? key;
}

/** unconfirmed түлхүүрийг засах цонх. */
export const UNCONFIRMED_SHEET: Record<string, Exclude<CardSheetParam, "next" | "confirm" | "checklist">> = {
  category: "details",
  property_type: "details",
  features: "details",
  advantages: "details",
  notes: "details",
  available_from: "details",
  project: "location",
  district: "location",
  location_text: "location",
  lat: "location",
  area_m2: "size",
  rooms: "size",
  floor: "size",
  building_floors: "size",
  year_in_use: "size",
  parking_spaces: "size",
  price: "price",
  currency: "price",
  price_period: "price",
  price_basis: "price",
  rent_advance_months: "price",
  rent_deposit_months: "price",
  listing_agent_id: "roles",
  photo_agent_id: "roles",
  contract_agent_id: "contract",
};

/** Үнийн дөрвөн түлхүүрийг нэг мөрөөр («Үнийг шалгана уу») баталгаажуулна. */
export const PRICE_GROUP_KEYS = ["price", "currency", "price_basis", "price_period"] as const;

export type UnconfirmedRow = { id: string; keys: string[]; label: string; sheet: string };

/** Баталгаажуулах мөрүүд: үнийн түлхүүрүүд нэг мөрөнд, бусад нь тус тусдаа. */
export function unconfirmedRows(list: readonly string[]): UnconfirmedRow[] {
  const rows: UnconfirmedRow[] = [];
  const priceKeys = list.filter((k) => (PRICE_GROUP_KEYS as readonly string[]).includes(k));
  if (priceKeys.length) rows.push({ id: "price", keys: priceKeys, label: "Үнэ (дүн, валют, суурь, хугацаа)", sheet: "price" });
  for (const k of list) {
    if ((PRICE_GROUP_KEYS as readonly string[]).includes(k)) continue;
    rows.push({ id: k, keys: [k], label: unconfirmedLabel(k), sheet: UNCONFIRMED_SHEET[k] ?? "details" });
  }
  return rows;
}

/** Үүргийн агент түгжигдсэн эсэх (одоогийн дүрэм: идэвхтэй хөрөнгө, томилогдсон, ахлагч/менежер биш). */
export function roleLocked(
  status: string,
  current: string | null | undefined,
  canReassign: boolean
): boolean {
  return status !== "draft" && !canReassign && !!current;
}
