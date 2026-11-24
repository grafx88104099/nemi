import { z } from "zod";

import { UNCONFIRMABLE_KEYS, isUnconfirmableKey } from "@/lib/crm2/checklist";
import { isFullPhone } from "@/lib/crm2/phone";
import { ownerContactSchema, ownerNewSchema, quickCreateSchema, type QuickCreateInput, type QuickCreatePayload } from "@/lib/crm2/schemas";
import { zodErrorText } from "@/lib/crm2/result";
import { parseNumberText } from "@/lib/number-input";
import type { Crm2OwnerInput, Crm2PropertyDuplicate, Crm2QuickCreateResult } from "@/lib/crm2/types";

/**
 * Шуурхай бүртгэлийн (P8) илгээх хэлбэр — ЦЭВЭР модуль ('use server' биш; клиент, route, тест).
 *
 * Утсан дээрх ноорог (QuickDraftForm + битүүмжилсэн хувийн хэсэг) → POST /api/crm2/quick-create-ийн body
 * (= quickCreateSchema-ийн оролт {property, owner?, private?}). Route нь энэ body-г шалгаад
 * crm2_create_property_quick(p_property, p_owner, p_private)-д дамжуулна.
 *
 * Дүрэм:
 *  - хоосон утга илгээхгүй (DB анхдагч: MNT, ангиллаар total/month, листлэгч = өөрөө);
 *  - гэрээний агентыг ХЭЗЭЭ Ч тавихгүй (R22 — гэрээний доод цонх тавина);
 *  - unconfirmed: зөвхөн UNCONFIRMABLE_KEYS ба утга нь бодитоор байгаа талбар;
 *  - буруу (8-аас цөөн оронтой) эзний утсыг сервер рүү илгээхгүй — бүх бүртгэлийг 400-д унагахгүйн тулд.
 *    Клиент утсыг vault-д хадгалж, хадгалсны дараа «Эзэн» цонхоор дахин асууна (ownerSkipped).
 */

/** Route-ийн body-ийн дээд хэмжээ (байт). */
export const QUICK_CREATE_MAX_BYTES = 64 * 1024;
/** Хэмжилтийн route-ийн body-ийн дээд хэмжээ (байт). */
export const UI_EVENT_MAX_BYTES = 4 * 1024;
/** field_notes.source_text (наасан зарын нууцалсан үлдэгдэл) дээд урт. */
export const SOURCE_TEXT_MAX = 2000;

type Num = string | number | null | undefined;
type Text = string | null | undefined;

/** Утсан дээрх шуурхай ноорогийн нийтийн (хувийн биш) хэсэг. Бүх талбар сонголттой. */
export type QuickDraftForm = {
  clientKey: string;
  source?: "manual" | "paste" | "share" | null;
  category?: string | null;
  property_type?: Text;
  project_id?: Text;
  project_name?: Text;
  district?: Text;
  location_text?: Text;
  address_detail?: Text;
  lat?: Num;
  lng?: Num;
  pin_address?: Text;
  area_m2?: Num;
  rooms?: Num;
  floor?: Num;
  building_floors?: Num;
  price?: Num;
  currency?: Text;
  price_period?: Text;
  price_basis?: Text;
  year_in_use?: Num;
  features?: readonly string[] | null;
  parking_spaces?: Num;
  rent_advance_months?: Num;
  rent_deposit_months?: Num;
  advantages?: Text;
  notes?: Text;
  available_from?: Text;
  /** Наасан зарын нууцалсан үлдэгдэл (field_notes.source_text, ≤2000). */
  source_text?: Text;
  listing_agent_id?: Text;
  photo_agent_id?: Text;
  /** Автоматаар бөглөгдсөн (наасан, төслөөс, анхдагч) — шалгах шаардлагатай талбарууд. */
  unconfirmed?: readonly string[] | null;
};

/** Ноорогийн битүүмжилсэн (vault) хэсэг. */
export type QuickDraftPrivate = {
  owner?: Crm2OwnerInput | null;
  owner_note?: Text;
  showing_instructions?: Text;
};

export type QuickPayloadBuild = {
  payload: QuickCreateInput;
  /** Эзний утас бүтэн биш тул илгээгээгүй (клиент хадгалж, «Эзэн» цонхоор дахин асууна). */
  ownerSkipped: boolean;
};

const NUMERIC_KEYS = [
  "lat",
  "lng",
  "area_m2",
  "rooms",
  "floor",
  "building_floors",
  "price",
  "year_in_use",
  "parking_spaces",
  "rent_advance_months",
  "rent_deposit_months",
] as const;

const TEXT_KEYS = [
  "property_type",
  "project_id",
  "district",
  "location_text",
  "address_detail",
  "pin_address",
  "currency",
  "price_period",
  "price_basis",
  "advantages",
  "notes",
  "available_from",
  "listing_agent_id",
  "photo_agent_id",
] as const;

function cleanText(v: Text): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function cleanNumber(v: Num): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  return parseNumberText(v);
}

/** unconfirmed-ийн түлхүүр → утга байгаа эсэх (утгагүй талбарыг «шалгана уу» гэж тэмдэглэхгүй). */
function hasValueFor(key: string, p: Record<string, unknown>): boolean {
  switch (key) {
    case "project":
      return p.project_id != null || p.project_name != null;
    case "lat":
      return p.lat != null && p.lng != null;
    case "currency":
    case "price_period":
    case "price_basis":
      return p.price != null;
    case "features":
      return Array.isArray(p.features) && p.features.length > 0;
    default:
      return p[key] != null;
  }
}

/** Ноорог → POST body. Цэвэр, детерминистик. */
export function buildQuickCreatePayload(form: QuickDraftForm, priv: QuickDraftPrivate | null = null): QuickPayloadBuild {
  const property: Record<string, unknown> = { client_key: form.clientKey };
  property.source = form.source === "paste" || form.source === "share" ? form.source : "manual";
  const category = cleanText(form.category);
  if (category) property.category = category;

  for (const k of TEXT_KEYS) {
    const v = cleanText(form[k]);
    if (v !== null) property[k] = v;
  }
  for (const k of NUMERIC_KEYS) {
    const v = cleanNumber(form[k]);
    if (v !== null) property[k] = v;
  }
  // Цэгийн өргөрөг/уртраг хамт л (checkProperty).
  if ((property.lat == null) !== (property.lng == null)) {
    delete property.lat;
    delete property.lng;
    delete property.pin_address;
  }
  if (property.project_id == null) {
    const name = cleanText(form.project_name);
    if (name) property.project_name = name.slice(0, 120);
  }
  if (Array.isArray(form.features) && form.features.length) {
    property.features = [...new Set(form.features.filter((f) => typeof f === "string" && f))].slice(0, 40);
  }
  const sourceText = cleanText(form.source_text);
  if (sourceText) property.field_notes = { source_text: sourceText.slice(0, SOURCE_TEXT_MAX) };

  const unconfirmed = [...new Set(form.unconfirmed ?? [])]
    .filter((k): k is (typeof UNCONFIRMABLE_KEYS)[number] => isUnconfirmableKey(k))
    // Гэрээний агентыг шуурхай бүртгэл тавьдаггүй (R22).
    .filter((k) => k !== "contract_agent_id" && hasValueFor(k, property))
    .sort();
  if (unconfirmed.length) property.unconfirmed = unconfirmed;

  const payload: QuickCreateInput = { property: property as QuickCreateInput["property"] };

  let ownerSkipped = false;
  const owner = priv?.owner ?? null;
  if (owner && "contact_id" in owner) {
    if (owner.contact_id) payload.owner = { contact_id: owner.contact_id };
  } else if (owner && cleanText(owner.phone)) {
    if (isFullPhone(owner.phone)) {
      const o: Record<string, unknown> = { phone: owner.phone.trim() };
      const name = cleanText(owner.full_name);
      if (name) o.full_name = name;
      const source = cleanText(owner.source);
      if (source) o.source = source;
      const note = cleanText(owner.source_note);
      if (note) o.source_note = note;
      if (owner.allow_duplicate) o.allow_duplicate = true;
      payload.owner = o as QuickCreateInput["owner"];
    } else {
      ownerSkipped = true;
    }
  }

  const ownerNote = cleanText(priv?.owner_note);
  const showing = cleanText(priv?.showing_instructions);
  if (ownerNote || showing) {
    payload.private = {
      ...(ownerNote ? { owner_note: ownerNote } : {}),
      ...(showing ? { showing_instructions: showing } : {}),
    };
  }
  return { payload, ownerSkipped };
}

// ── Route-ийн шалгалт (цэвэр) ──────────────────────────────────────────────

export type QuickValidation =
  | { ok: true; data: QuickCreatePayload }
  | { ok: false; error: string; field: string | null };

/** zod-ийн замыг маягтын талбарын түлхүүр болгоно: property.floor → floor, owner.phone → owner.phone. */
export function issueField(path: readonly PropertyKey[]): string | null {
  const parts = path.filter((p): p is string | number => typeof p === "string" || typeof p === "number").map(String);
  if (parts.length === 0) return null;
  if (parts[0] === "property" || parts[0] === "private") return parts.slice(1).join(".") || null;
  return parts.join(".");
}

function fromZod(error: z.ZodError, prefix: string[] = []): { error: string; field: string | null } {
  const issue = error.issues[0];
  return { error: zodErrorText(error), field: issue ? issueField([...prefix, ...issue.path]) : null };
}

/**
 * quickCreateSchema-аар шалгана. Эзний (union) алдааг ойлгомжтой болгохын тулд эзнийг түрүүлж,
 * хэлбэрээр нь (contact_id / phone) тусад нь шалгана.
 */
export function validateQuickCreate(body: unknown): QuickValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Оролт буруу байна.", field: null };
  const owner = (body as { owner?: unknown }).owner;
  if (owner && typeof owner === "object" && !Array.isArray(owner)) {
    const schema = "contact_id" in owner ? ownerContactSchema : ownerNewSchema;
    const o = schema.safeParse(owner);
    if (!o.success) return { ok: false, ...fromZod(o.error, ["owner"]) };
  }
  const parsed = quickCreateSchema.safeParse(body);
  if (!parsed.success) return { ok: false, ...fromZod(parsed.error) };
  return { ok: true, data: parsed.data };
}

/** RPC-ийн jsonb хариуг Crm2QuickCreateResult болгоно (хэлбэр буруу бол null). */
export function toQuickCreateResult(raw: unknown): Crm2QuickCreateResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.property_id !== "string" || typeof r.code !== "string") return null;
  const owner = (r.owner && typeof r.owner === "object" ? r.owner : { status: "none" }) as Crm2QuickCreateResult["owner"];
  const duplicates = Array.isArray(r.duplicates) ? (r.duplicates as Crm2PropertyDuplicate[]) : [];
  return { property_id: r.property_id, code: r.code, replayed: r.replayed === true, owner, duplicates };
}

/** RPC-ийн p_property: zod-оор цэвэрлэсэн талбарууд (undefined түлхүүргүй). */
export function rpcPropertyJson(p: QuickCreatePayload["property"]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined) out[k] = v;
  return out;
}

// ── Хүсэлтийн хамгаалалт (route-ууд хуваалцана) ─────────────────────────────

/**
 * CSRF: Origin толгойн host нь хүсэлтийн host-той ижил байх ёстой. Origin байхгүй бол зөвхөн
 * sec-fetch-site=same-origin үед зөвшөөрнө (хуучин хөтөч). Proxy-ийн x-forwarded-host-ыг давуу.
 */
export function sameOriginRequest(request: Request): boolean {
  const h = request.headers;
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? safeHost(request.url) ?? "").split(",")[0].trim().toLowerCase();
  if (!host) return false;
  const origin = h.get("origin");
  if (!origin) return h.get("sec-fetch-site") === "same-origin";
  if (origin === "null") return false;
  const oh = safeHost(origin);
  return !!oh && oh.toLowerCase() === host;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
