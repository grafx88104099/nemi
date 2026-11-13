import { fmtDateTime } from "@/lib/format";
import { fmtIsoDate } from "@/lib/crm2/datetime";
import {
  ACTIVITY_KIND_LABEL,
  BROKERAGE_STATUS_LABEL,
  COMMISSION_TYPE_LABEL,
  CRM_ROLE_LABEL,
  DEAL_STAGE_LABEL,
  EMPTY_VALUE,
  MEDIA_KIND_LABEL,
  PRICE_BASIS_LABEL,
  PRICE_PERIOD_LABEL,
  PROPERTY_CATEGORY_LABEL,
  PROPERTY_STATUS_LABEL,
  RECORD_STATUS_LABEL,
  SHOWING_STATUS_LABEL,
  TASK_KIND_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/crm2/labels";
import { formatAmount } from "@/lib/crm2/money";
import { CRM2_SETTING_LABEL, isCrm2SettingKey } from "@/lib/crm2/settings";
import type { Json } from "@/types/database";

/**
 * crm2_history мөрийг уншихуйц болгох (цэвэр модуль): талбарын нэр, хуучин → шинэ
 * утга (enum → монгол нэр, агент id → нэр, огноо → УБ), үйлдлийн нэр.
 */

export const HISTORY_ENTITY_LABEL: Record<string, string> = {
  property: "Хөрөнгө",
  property_private: "Хувийн мэдээлэл",
  media: "Медиа",
  brokerage: "Зуучлалын гэрээ",
  brokerage_file: "Гэрээний файл",
  contact: "Харилцагч",
  phone: "Утасны дугаар",
  requirement: "Шаардлага",
  deal: "Хэлцэл",
  activity: "Дуудлага/үзүүлэлт",
  task: "Ажил",
  project: "Төсөл",
  settings: "Тохиргоо",
};

export const HISTORY_ACTION_LABEL: Record<string, string> = {
  insert: "Бүртгэсэн",
  update: "Өөрчилсөн",
  status: "Төлөв өөрчилсөн",
  delete: "Устгасан",
  reset: "Анхдагч руу буцаасан",
};

/** Талбарын нэр (бүх entity-д нийтлэг; entity-ээс хамаарах цөөн нь доор). */
export const HISTORY_FIELD_LABEL: Record<string, string> = {
  status: "Төлөв",
  stage: "Шат",
  showing_status: "Үзүүлэлтийн төлөв",
  category: "Ангилал",
  property_type: "Хөрөнгийн төрөл",
  price: "Үнэ",
  currency: "Валют",
  price_period: "Үнийн хугацаа",
  price_basis: "Үнийн суурь",
  available_from: "Боломжтой огноо",
  availability_note: "Боломжийн тайлбар",
  last_verified_at: "Эзэнтэй тулгасан",
  listing_agent_id: "Листлэгч агент",
  contract_agent_id: "Гэрээ хийсэн агент",
  photo_agent_id: "Зураг авсан агент",
  project_id: "Төсөл",
  district: "Дүүрэг",
  location_text: "Байршил",
  address_detail: "Байршлын дэлгэрэнгүй",
  lat: "Өргөрөг",
  lng: "Уртраг",
  pin_address: "Pin-ий хаяг",
  area_m2: "Хэмжээ (м²)",
  rooms: "Өрөө",
  floor: "Давхар",
  building_floors: "Барилгын давхар",
  year_in_use: "Ашиглалтад орсон он",
  operating_cost: "Ашиглалтын зардал",
  operating_cost_currency: "Зардлын валют",
  operating_cost_period: "Зардлын хугацаа",
  operating_cost_note: "Зардлын тайлбар",
  condition: "Нөхцөл",
  view_note: "Харууц",
  notes: "Нэмэлт тайлбар",
  advantages: "Давуу тал",
  features: "Онцлог",
  field_notes: "Талбарын тайлбар",
  owner_contact_id: "Эзэн",
  owner_note: "Эзний тэмдэглэл",
  showing_instructions: "Үзүүлэх заавар",
  kind: "Төрөл",
  storage_path: "Файл",
  external_url: "Холбоос",
  caption: "Тайлбар",
  number: "Гэрээний дугаар",
  start_date: "Эхлэх огноо",
  end_date: "Дуусах огноо",
  terms: "Нөхцөл",
  commission_type: "Шимтгэлийн төрөл",
  commission_value: "Шимтгэл",
  commission_currency: "Шимтгэлийн валют",
  commission_note: "Шимтгэлийн тайлбар",
  responsible_agent_id: "Хариуцсан агент",
  approved_by: "Баталсан",
  approval_note: "Батлалтын тэмдэглэл",
  rejection_note: "Татгалзсан шалтгаан",
  termination_reason: "Цуцалсан шалтгаан",
  file_name: "Файлын нэр",
  full_name: "Нэр",
  note: "Тэмдэглэл",
  phone: "Дугаар",
  label: "Шошго",
  is_primary: "Үндсэн дугаар",
  purpose: "Зорилго",
  budget_min: "Төсөв (доод)",
  budget_max: "Төсөв (дээд)",
  locations: "Байршлууд",
  districts: "Дүүргүүд",
  rooms_min: "Өрөө (доод)",
  rooms_max: "Өрөө (дээд)",
  area_min: "Хэмжээ (доод)",
  area_max: "Хэмжээ (дээд)",
  move_in_from: "Орох огноо",
  move_in_note: "Орох хугацааны тайлбар",
  must_haves: "Зайлшгүй нөхцөл",
  required_features: "Зайлшгүй онцлог",
  agent_id: "Хариуцсан агент",
  requirement_id: "Шаардлага",
  cancel_reason_code: "Цуцалсан шалтгаан",
  cancel_reason: "Цуцлалтын тайлбар",
  origin_deal_id: "Эх хэлцэл",
  scheduled_at: "Товлосон цаг",
  occurred_at: "Бодит цаг",
  voided_at: "Хүчингүй болгосон",
  result: "Үр дүн",
  feedback: "Санал хүсэлт",
  assignee_id: "Хариуцагч",
  due_at: "Хугацаа",
  name: "Нэр",
  is_active: "Идэвхтэй",
};

/** entity-ээс хамаарах тусгай нэр. */
const ENTITY_FIELD_LABEL: Record<string, Record<string, string>> = {
  activity: { agent_id: "Гүйцэтгэсэн агент", kind: "Төрөл" },
  task: { kind: "Ажлын төрөл", note: "Тэмдэглэл" },
  requirement: { category: "Ангилал", notes: "Тэмдэглэл" },
};

export function historyFieldLabel(entity: string, field: string | null | undefined): string {
  if (!field) return "";
  if (entity === "settings" && isCrm2SettingKey(field)) return CRM2_SETTING_LABEL[field];
  return ENTITY_FIELD_LABEL[entity]?.[field] ?? HISTORY_FIELD_LABEL[field] ?? field;
}

/** Утга харуулахад хэрэгтэй нэмэлт өгөгдөл (агентын нэр, тохиргооны жагсаалт). */
export type HistoryLookup = {
  /** profile id → нэр. */
  names?: Record<string, string>;
  /** Тохиргооны жагсаалт (property.types, property.features, deal.cancel_reasons, category_labels). */
  types?: Record<string, string>;
  features?: Record<string, string>;
  cancelReasons?: Record<string, string>;
  categoryLabels?: Partial<Record<string, string>>;
  /** project id → нэр; contact id → нэр г.м. */
  refs?: Record<string, string>;
};

const AGENT_FIELDS = new Set([
  "listing_agent_id",
  "contract_agent_id",
  "photo_agent_id",
  "responsible_agent_id",
  "approved_by",
  "agent_id",
  "assignee_id",
]);
const REF_FIELDS = new Set(["project_id", "owner_contact_id", "requirement_id", "origin_deal_id"]);
const TIMESTAMP_FIELDS = new Set(["last_verified_at", "scheduled_at", "occurred_at", "voided_at", "due_at"]);
const DATE_FIELDS = new Set(["available_from", "start_date", "end_date", "move_in_from"]);
const PLAIN_NUMBER_FIELDS = new Set([
  "year_in_use",
  "floor",
  "building_floors",
  "rooms",
  "rooms_min",
  "rooms_max",
  "lat",
  "lng",
  "activity.edit_window_hours",
]);
const BOOL_TRUE = "Тийм";
const BOOL_FALSE = "Үгүй";
const MAX_TEXT = 160;

function enumLabel(entity: string, field: string, v: string, lookup: HistoryLookup): string | null {
  switch (field) {
    case "status":
      if (entity === "property") return PROPERTY_STATUS_LABEL[v as keyof typeof PROPERTY_STATUS_LABEL] ?? null;
      if (entity === "brokerage") return BROKERAGE_STATUS_LABEL[v as keyof typeof BROKERAGE_STATUS_LABEL] ?? null;
      if (entity === "task") return TASK_STATUS_LABEL[v as keyof typeof TASK_STATUS_LABEL] ?? null;
      if (entity === "contact" || entity === "requirement") return RECORD_STATUS_LABEL[v as keyof typeof RECORD_STATUS_LABEL] ?? null;
      return null;
    case "stage":
      return DEAL_STAGE_LABEL[v as keyof typeof DEAL_STAGE_LABEL] ?? null;
    case "showing_status":
      return SHOWING_STATUS_LABEL[v as keyof typeof SHOWING_STATUS_LABEL] ?? null;
    case "category":
      return lookup.categoryLabels?.[v] ?? PROPERTY_CATEGORY_LABEL[v as keyof typeof PROPERTY_CATEGORY_LABEL] ?? null;
    case "price_period":
    case "operating_cost_period":
      return PRICE_PERIOD_LABEL[v as keyof typeof PRICE_PERIOD_LABEL] ?? null;
    case "price_basis":
      return PRICE_BASIS_LABEL[v as keyof typeof PRICE_BASIS_LABEL] ?? null;
    case "commission_type":
      return COMMISSION_TYPE_LABEL[v as keyof typeof COMMISSION_TYPE_LABEL] ?? null;
    case "kind":
      if (entity === "activity") return ACTIVITY_KIND_LABEL[v as keyof typeof ACTIVITY_KIND_LABEL] ?? null;
      if (entity === "task") return TASK_KIND_LABEL[v as keyof typeof TASK_KIND_LABEL] ?? null;
      if (entity === "media") return MEDIA_KIND_LABEL[v as keyof typeof MEDIA_KIND_LABEL] ?? null;
      return null;
    case "property_type":
      return lookup.types?.[v] ?? null;
    case "cancel_reason_code":
      return lookup.cancelReasons?.[v] ?? null;
    default:
      return null;
  }
}

function truncate(s: string): string {
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : s;
}

/** Нэг утгыг текст болгох. */
export function formatHistoryValue(
  entity: string,
  field: string | null | undefined,
  value: Json | undefined,
  lookup: HistoryLookup = {}
): string {
  if (value === null || value === undefined || value === "") return EMPTY_VALUE;
  const f = field ?? "";
  if (typeof value === "boolean") return value ? BOOL_TRUE : BOOL_FALSE;
  if (typeof value === "number") return PLAIN_NUMBER_FIELDS.has(f) ? String(value) : formatAmount(value);
  if (typeof value === "string") {
    if (AGENT_FIELDS.has(f)) return lookup.names?.[value] ?? "Ажилтан";
    if (REF_FIELDS.has(f)) return lookup.refs?.[value] ?? "холбоос";
    if (TIMESTAMP_FIELDS.has(f)) {
      const t = Date.parse(value);
      return Number.isNaN(t) ? value : fmtDateTime(t);
    }
    if (DATE_FIELDS.has(f)) return fmtIsoDate(value);
    return truncate(enumLabel(entity, f, value, lookup) ?? value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return EMPTY_VALUE;
    const parts = value.map((x) => {
      if (typeof x !== "string") return String(x);
      if (f === "features" || f === "required_features") return lookup.features?.[x] ?? x;
      if (f.startsWith("roles.")) return CRM_ROLE_LABEL[x as keyof typeof CRM_ROLE_LABEL] ?? x;
      return x;
    });
    return truncate(parts.join(", "));
  }
  // Объект (field_notes, тохиргооны жагсаалт г.м.)
  const entries = Object.entries(value as Record<string, Json>)
    .filter(([, v]) => v !== null && v !== "")
    .map(([k, v]) => `${HISTORY_FIELD_LABEL[k] ?? k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  return entries.length ? truncate(entries.join("; ")) : EMPTY_VALUE;
}

export type HistoryLine = {
  id: number;
  at: string;
  actor: string;
  entityLabel: string;
  action: string;
  /** «Үнэ» г.м. (insert/delete үед хоосон). */
  field: string;
  from: string | null;
  to: string | null;
  reason: string | null;
};

type HistoryRowLike = {
  id: number;
  entity: string;
  action: string;
  field: string | null;
  old_value: Json | null;
  new_value: Json | null;
  reason: string | null;
  actor_id: string | null;
  created_at: string;
  actor?: { full_name: string | null } | null;
};

/** Түүхийн мөрийг харуулах хэлбэрт. Систем (actor_id = null) → «Систем». */
export function describeHistory(row: HistoryRowLike, lookup: HistoryLookup = {}): HistoryLine {
  const actor = row.actor?.full_name ?? (row.actor_id ? (lookup.names?.[row.actor_id] ?? "Ажилтан") : "Систем");
  const isChange = row.action === "update" || row.action === "status" || row.action === "reset";
  return {
    id: row.id,
    at: row.created_at,
    actor,
    entityLabel: HISTORY_ENTITY_LABEL[row.entity] ?? row.entity,
    action: HISTORY_ACTION_LABEL[row.action] ?? row.action,
    field: isChange ? historyFieldLabel(row.entity, row.field) : "",
    from: isChange ? formatHistoryValue(row.entity, row.field, row.old_value, lookup) : null,
    to: isChange ? formatHistoryValue(row.entity, row.field, row.new_value, lookup) : null,
    reason: row.reason?.trim() || null,
  };
}
