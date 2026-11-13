import {
  CRM_ROLE_LABEL,
  MISSING_ITEM_LABEL,
  PROPERTY_STATUS_LABEL,
} from "@/lib/crm2/labels";
import {
  CRM2_SETTING_DEFAULTS,
  CRM2_SETTING_LABEL,
  CRM2_SETTING_NUMBER_RANGE,
  CRM2_SETTING_OPTION_LABEL,
  isAccessSettingKey,
  type Crm2SettingKey,
} from "@/lib/crm2/settings";
import type { CrmRole } from "@/lib/crm2/types";

/**
 * CRM тохиргооны дэлгэц (/office/crm/settings/policies) — түлхүүр бүрийн бүлэг,
 * тайлбар, засварлагчийн төрөл, утгын шалгалт (crm2_set_setting-ийн шалгалттай
 * ижил дүрэм, эрт монголоор анхааруулна) ба харуулах текст. Цэвэр модуль.
 */

export type SettingOption = { value: string; label: string };

export type SettingEditor =
  | { kind: "boolean" }
  | { kind: "number"; min: number; max: number; unit: string }
  | { kind: "numberList"; min: number; max: number; maxItems: number; unit: string }
  | { kind: "choice"; options: SettingOption[] }
  | { kind: "multi"; options: SettingOption[]; minItems: number; forbidden: string[] }
  | { kind: "stringList"; minItems: number; maxItems: number; maxLength: number }
  | { kind: "codeLabel"; fixedCodes: string[] | null; requiredCodes: string[]; maxItems: number; maxLabel: number };

// ── Сонголтын жагсаалт ─────────────────────────────────────────────────────

/** crm_role enum-ийн бүх утга (DB-ийн дараалал). */
export const CRM_ROLES = [
  "agent",
  "team_lead",
  "sales_director",
  "ops_qc",
  "marketing",
  "property_manager",
  "finance",
  "aml_officer",
  "ceo",
  "sysadmin",
] as const satisfies readonly CrmRole[];

const ROLE_OPTIONS: SettingOption[] = CRM_ROLES.map((r) => ({ value: r, label: CRM_ROLE_LABEL[r] }));

/** Агент шууд тавьж болох төлөв (crm2_set_setting-ийн зөвшөөрөгдсөн утга). */
const DIRECT_STATUS_VALUES = ["suspended", "rented", "sold", "contract_ended", "archived"] as const;
/** Хэлцэл нээж болох хөрөнгийн төлөв. */
const OPEN_DEAL_STATUS_VALUES = ["active", "suspended"] as const;
/** Идэвхжүүлэхэд заавал болгож болох талбар. */
export const ACTIVATION_FIELD_VALUES = [
  "project",
  "district",
  "location_text",
  "address_detail",
  "pin",
  "area_m2",
  "rooms",
  "floor",
  "price",
  "year_in_use",
  "property_type",
  "listing_agent_id",
  "contract_agent_id",
  "photo_agent_id",
  "owner",
  "showing_instructions",
  "images",
] as const;

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const statusOptions = (values: readonly string[]): SettingOption[] =>
  values.map((v) => ({ value: v, label: PROPERTY_STATUS_LABEL[v as keyof typeof PROPERTY_STATUS_LABEL] ?? v }));

const choiceOptions = (key: Crm2SettingKey): SettingOption[] =>
  Object.entries(CRM2_SETTING_OPTION_LABEL[key] ?? {}).map(([value, label]) => ({ value, label }));

const UNIT: Partial<Record<Crm2SettingKey, string>> = {
  "activity.edit_window_hours": "цаг",
  "media.max_images": "ширхэг",
  "media.max_videos": "ширхэг",
  "media.max_image_mb": "МБ",
  "media.max_video_mb": "МБ",
  "docs.max_file_mb": "МБ",
  "docs.max_files_per_contract": "ширхэг",
};

/** Код/нэрийн жагсаалтын кодын хэлбэр (DB-тэй ижил). */
export const SETTING_CODE_RE = /^[a-z][a-z0-9_]{0,39}$/;

/** Түлхүүр бүрийн засварлагч. */
export function settingEditor(key: Crm2SettingKey): SettingEditor {
  const range = CRM2_SETTING_NUMBER_RANGE[key];
  if (range) return { kind: "number", min: range[0], max: range[1], unit: UNIT[key] ?? "" };
  switch (key) {
    case "brokerage.remind_days_before":
      return { kind: "numberList", min: 0, max: 365, maxItems: 20, unit: "хоног" };
    case "property.visibility":
    case "brokerage.on_expiry":
    case "approvals.allow_self":
    case "contact.foreign_deal":
      return { kind: "choice", options: choiceOptions(key) };
    case "roles.work":
      return { kind: "multi", options: ROLE_OPTIONS, minItems: 1, forbidden: [] };
    case "roles.approve":
      return { kind: "multi", options: ROLE_OPTIONS, minItems: 1, forbidden: ["sysadmin"] };
    case "roles.finance":
      return { kind: "multi", options: ROLE_OPTIONS, minItems: 0, forbidden: ["sysadmin"] };
    case "property.agent_direct_statuses":
      return { kind: "multi", options: statusOptions(DIRECT_STATUS_VALUES), minItems: 0, forbidden: [] };
    case "deal.open_property_statuses":
      return { kind: "multi", options: statusOptions(OPEN_DEAL_STATUS_VALUES), minItems: 1, forbidden: [] };
    case "property.activation_required":
      return {
        kind: "multi",
        options: ACTIVATION_FIELD_VALUES.map((v) => ({ value: v, label: capitalize(MISSING_ITEM_LABEL[v] ?? v) })),
        minItems: 0,
        forbidden: [],
      };
    case "property.districts":
      return { kind: "stringList", minItems: 1, maxItems: 60, maxLength: 60 };
    case "property.category_labels":
      return { kind: "codeLabel", fixedCodes: ["rent", "lease", "managed_rent", "sale"], requiredCodes: [], maxItems: 4, maxLabel: 80 };
    case "deal.cancel_reasons":
      return { kind: "codeLabel", fixedCodes: null, requiredCodes: ["other"], maxItems: 40, maxLabel: 80 };
    case "property.types":
    case "property.features":
      return { kind: "codeLabel", fixedCodes: null, requiredCodes: [], maxItems: 40, maxLabel: 80 };
    default:
      return { kind: "boolean" };
  }
}

// ── Бүлэг ба тайлбар ───────────────────────────────────────────────────────

export type SettingGroup = { id: string; title: string; description: string; keys: Crm2SettingKey[] };

export const SETTING_GROUPS: SettingGroup[] = [
  {
    id: "categories",
    title: "Ангилал ба төрөл",
    description: "Хөрөнгө, шаардлагын маягтад сонгох жагсаалтууд.",
    keys: ["property.category_labels", "property.types", "property.districts", "property.features"],
  },
  {
    id: "staff",
    title: "Staff ба гэрээ",
    description: "Хөрөнгийн харагдац, идэвхжүүлэлт, зуучлалын гэрээний шаардлага.",
    keys: [
      "property.visibility",
      "property.activation_required",
      "property.agent_direct_statuses",
      "property.same_agent_multi_role",
      "brokerage.require_owner",
      "brokerage.require_file",
      "brokerage.on_expiry",
    ],
  },
  {
    id: "access",
    title: "Эрх ба батлалт",
    description: "Хэн бүртгэх, батлах, санхүүд хандах вэ. Энэ бүлгийг зөвхөн гүйцэтгэх захирал өөрчилнө.",
    keys: [
      "roles.work",
      "roles.approve",
      "roles.finance",
      "approvals.team_lead",
      "approvals.office_admin",
      "approvals.allow_self",
    ],
  },
  {
    id: "deals",
    title: "Хэлцэл ба үзүүлэлт",
    description: "Харилцагч бүртгэх, хэлцэл нээх, цуцлах, дуудлага ба үзүүлэлтийн дүрэм.",
    keys: [
      "contact.require_phone",
      "contact.foreign_deal",
      "deal.open_property_statuses",
      "deal.auto_advance",
      "deal.property_agents_can_view",
      "deal.cancel_reasons",
      "showing.require_feedback",
      "activity.edit_window_hours",
    ],
  },
  {
    id: "files",
    title: "Медиа ба файл",
    description: "Нэг хөрөнгийн зураг, бичлэг, нэг гэрээний файлын хязгаар.",
    keys: [
      "media.max_images",
      "media.max_image_mb",
      "media.max_videos",
      "media.max_video_mb",
      "docs.max_files_per_contract",
      "docs.max_file_mb",
    ],
  },
  {
    id: "reminders",
    title: "Сануулга",
    description: "Апп доторх мэдэгдлийн хугацаа.",
    keys: ["brokerage.remind_days_before"],
  },
];

/** Түлхүүр бүрийн нэг мөр тайлбар (юуг, хэнд нөлөөлөх). */
export const SETTING_DESCRIPTION: Record<Crm2SettingKey, string> = {
  "property.visibility":
    "Ноорог биш Staff хөрөнгийг хэн жагсаалтаас харах вэ. Тухайн хөрөнгө дээр хэлцэлтэй эсвэл дуудлага хийсэн агент картаа үргэлж нээнэ.",
  "property.agent_direct_statuses":
    "Агент батлуулахгүйгээр шууд тавьж болох төлөвүүд. Хоосон бол агент төлөв солихдоо батлагчид хүсэлт илгээнэ.",
  "property.activation_required":
    "Хөрөнгө идэвхжихээс өмнө бөглөгдсөн байх ёстой талбарууд. Батлагдсан хүчинтэй гэрээ ба ангилалд тохирох үнийн хугацаа үргэлж шаардлагатай.",
  "property.same_agent_multi_role":
    "Нэг агент листлэгч, гэрээ хийсэн, зураг авсан үүргээс хэд хэдийг зэрэг авч болох эсэх. Хориглосон үед одоо байгаа бичлэгт нөлөөлөхгүй, зөвхөн агент шинээр оноох үед шалгана.",
  "property.category_labels":
    "Дөрвөн ангиллын дэлгэцэнд харагдах нэр. Ангиллын код ба тоо өөрчлөгдөхгүй.",
  "property.types": "Хөрөнгийн төрлийн сонголт (код ба нэр). Ашиглагдаж буй кодыг хасвал хуучин бичлэг кодоороо харагдана.",
  "property.districts": "Хөрөнгө ба шаардлагад сонгох дүүргийн жагсаалт. nemi.mn-ийн дүүргийн бичлэгтэй ижил байлгавал тааруулахад хялбар.",
  "property.features": "Хөрөнгийн онцлог ба шаардлагын «зайлшгүй онцлог»-т сонгох жагсаалт.",
  "brokerage.require_owner": "Зуучлалын гэрээг илгээх, батлахад хөрөнгийн эзэн (харилцагч) заавал холбогдсон байх эсэх.",
  "brokerage.require_file": "Зуучлалын гэрээг илгээх, батлахад дор хаяж нэг скан эсвэл PDF файл хавсаргасан байх эсэх.",
  "brokerage.remind_days_before":
    "Зуучлалын гэрээ дуусахаас хэдэн хоногийн өмнө хариуцсан агент ба түүний ахлагчид апп доторх мэдэгдэл очих вэ.",
  "brokerage.on_expiry":
    "Гэрээний хугацаа дуусаад өөр хүчинтэй гэрээгүй үлдсэн хөрөнгийг «Гэрээ дууссан» болгох уу, төлөвийг хэвээр үлдээх үү. Түрээслэгдсэн, зарагдсан хөрөнгө өөрчлөгдөхгүй.",
  "approvals.team_lead": "Багийн ахлагч өөрийн багийн агентын гэрээ, хүсэлтийг батлах эсэх.",
  "approvals.office_admin": "Оффисын админ гэрээ, хүсэлт батлах эсэх (анхдагчаар батлахгүй).",
  "approvals.allow_self":
    "Өөрийн хариуцсан, илгээсэн гэрээ эсвэл өөрийн хөрөнгийн хүсэлтийг хэн өөрөө баталж болох вэ.",
  "roles.work": "Staff хөрөнгө, харилцагч, дуудлага, үзүүлэлт бүртгэж ажиллах дүрүүд.",
  "roles.approve": "Зуучлалын гэрээ, төлөвийн болон шилжүүлэх хүсэлтийг батлах дүрүүд. Системийн админыг нэмэхгүй.",
  "roles.finance":
    "Санхүүгийн хэсэгт (нэхэмжлэл, төлбөр батлах) хандах дүрүүд. Админ, захирлын дүр энэ эрхийг дагуулж өгөхгүй — хэрэгтэй бол тусад нь нэмнэ.",
  "contact.foreign_deal":
    "Өөр агентын хариуцсан харилцагчтай шинэ хэлцэл нээхийг хориглох (шилжүүлэх хүсэлт гаргана) эсвэл зөвшөөрөх.",
  "contact.require_phone": "Харилцагч бүртгэхэд утасны дугаар заавал эсэх. Заавал бол сүүлийн дугаарыг устгахгүй.",
  "deal.open_property_statuses": "Ямар төлөвтэй хөрөнгө дээр шинэ хэлцэл нээж, дуудлага бүртгэж болох вэ.",
  "deal.auto_advance":
    "Анхны дуудлага, үзүүлэлт товлох, «үзүүлсэн» бүртгэлээр хэлцлийн шатыг автоматаар урагшлуулах эсэх. Хэзээ ч ухраахгүй.",
  "deal.property_agents_can_view":
    "Хөрөнгийн 3 үүрэгт агент тухайн хөрөнгийн бүх хэлцэл, дуудлага, үзүүлэлтийг харах эсэх (харилцагчийн нэр далд).",
  "deal.cancel_reasons": "Хэлцэл цуцлахад сонгох шалтгаанууд. «other» (Бусад) заавал байх ба сонговол тайлбар бичнэ.",
  "showing.require_feedback": "Үзүүлэлтийг «үзүүлсэн» гэж бүртгэхэд үйлчлүүлэгчийн санал хүсэлтийг заавал бичих эсэх.",
  "activity.edit_window_hours":
    "Агент өөрийн дуудлага, үзүүлэлтийг хэдэн цагийн дотор засаж болох вэ. Түүнээс хойш ахлагч эсвэл менежер засна.",
  "media.max_images": "Нэг хөрөнгөд хуулж болох зургийн дээд тоо.",
  "media.max_videos": "Нэг хөрөнгөд хуулж болох бичлэгийн дээд тоо (урт бичлэгийг холбоосоор нэмнэ).",
  "media.max_image_mb": "Нэг зургийн дээд хэмжээ.",
  "media.max_video_mb": "Нэг бичлэгийн дээд хэмжээ (сангийн хязгаар 50 МБ).",
  "docs.max_file_mb": "Зуучлалын гэрээний нэг файлын дээд хэмжээ (PDF, JPEG, PNG, WebP).",
  "docs.max_files_per_contract": "Нэг зуучлалын гэрээнд хавсаргах файлын дээд тоо.",
};

/** Тохиргоог энэ хэрэглэгч засах эсэх (CEO-only түлхүүрийг ялгана). */
export function canEditSetting(
  key: string,
  ctx: { canManageSettings: boolean; canManageAccessSettings: boolean } | null | undefined
): boolean {
  if (!ctx?.canManageSettings) return false;
  return !isAccessSettingKey(key) || ctx.canManageAccessSettings;
}

/** Засах боломжгүй шалтгаан (null = засна). */
export function settingLockReason(
  key: string,
  ctx: { canManageSettings: boolean; canManageAccessSettings: boolean } | null | undefined
): string | null {
  if (!ctx?.canManageSettings) return "Тохиргоог системийн админ, гүйцэтгэх захирал эсвэл оффисын админ өөрчилнө.";
  if (isAccessSettingKey(key) && !ctx.canManageAccessSettings) {
    return "Эрх ба батлалтын тохиргоог зөвхөн гүйцэтгэх захирал өөрчилнө.";
  }
  return null;
}

// ── Утгыг жигдрүүлэх, харьцуулах ──────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Хадгалахаас өмнө жигдрүүлэх: текстийг trim, хоосон мөрийг хасах, сануулгын
 * хоногийг давхардалгүй буурахаар эрэмбэлэх.
 */
export function normalizeSettingValue(key: Crm2SettingKey, value: unknown): unknown {
  const ed = settingEditor(key);
  switch (ed.kind) {
    case "numberList":
      return Array.isArray(value)
        ? [...new Set(value.filter((x): x is number => typeof x === "number" && Number.isFinite(x)))].sort((a, b) => b - a)
        : value;
    case "multi":
      return Array.isArray(value) ? [...new Set(value.filter((x): x is string => typeof x === "string"))] : value;
    case "stringList":
      return Array.isArray(value)
        ? value.map((x) => (typeof x === "string" ? x.trim() : x)).filter((x) => x !== "")
        : value;
    case "codeLabel": {
      if (!isRecord(value)) return value;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k.trim()] = typeof v === "string" ? v.trim() : v;
      return out;
    }
    default:
      return value;
  }
}

/** Харьцуулахад хэрэглэх тогтвортой хэлбэр (жагсаалтын дараалал, объектын түлхүүрийн дараалал хамаарахгүй). */
function canonical(key: Crm2SettingKey, value: unknown): string {
  const ed = settingEditor(key);
  if (Array.isArray(value) && (ed.kind === "multi" || ed.kind === "numberList")) {
    return JSON.stringify([...value].map(String).sort());
  }
  if (isRecord(value)) {
    return JSON.stringify(Object.keys(value).sort().map((k) => [k, value[k]]));
  }
  return JSON.stringify(value);
}

export function sameSettingValue(key: Crm2SettingKey, a: unknown, b: unknown): boolean {
  return canonical(key, a) === canonical(key, b);
}

export function isDefaultSetting(key: Crm2SettingKey, value: unknown): boolean {
  return sameSettingValue(key, value, CRM2_SETTING_DEFAULTS[key]);
}

// ── Шалгалт (crm2_set_setting-тэй ижил) ───────────────────────────────────

/** Утга зөв бол null, эс бөгөөс монгол алдааны текст. */
export function validateSettingValue(key: Crm2SettingKey, value: unknown): string | null {
  const ed = settingEditor(key);
  const label = CRM2_SETTING_LABEL[key];
  switch (ed.kind) {
    case "boolean":
      return typeof value === "boolean" ? null : "Тийм эсвэл үгүй сонгоно уу.";
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return "Тоо оруулна уу.";
      if (!Number.isInteger(value)) return "Бүхэл тоо оруулна уу.";
      if (value < ed.min || value > ed.max) return `${label}: ${ed.min}–${ed.max} хооронд байна.`;
      return null;
    }
    case "numberList": {
      if (!Array.isArray(value)) return "Жагсаалт буруу.";
      if (value.length > ed.maxItems) return `${ed.maxItems}-аас ихгүй утга оруулна.`;
      for (const x of value) {
        if (typeof x !== "number" || !Number.isInteger(x) || x < ed.min || x > ed.max) {
          return `Хоног ${ed.min}–${ed.max} хоорондох бүхэл тоо байна.`;
        }
      }
      return null;
    }
    case "choice":
      return typeof value === "string" && ed.options.some((o) => o.value === value) ? null : "Сонголтоо хийнэ үү.";
    case "multi": {
      if (!Array.isArray(value)) return "Жагсаалт буруу.";
      const allowed = new Set(ed.options.map((o) => o.value));
      if (value.some((x) => typeof x !== "string" || !allowed.has(x))) return "Жагсаалтад зөвшөөрөгдөөгүй утга байна.";
      const bad = value.find((x) => ed.forbidden.includes(x as string));
      if (bad) return `«${CRM_ROLE_LABEL[bad as CrmRole] ?? bad}» дүрд энэ эрхийг олгохгүй.`;
      if (value.length < ed.minItems) return "Дор хаяж нэгийг сонгоно уу.";
      if (value.length > 20) return "Жагсаалт хэт урт.";
      return null;
    }
    case "stringList": {
      if (!Array.isArray(value)) return "Жагсаалт буруу.";
      if (value.length < ed.minItems) return "Дор хаяж нэг утга оруулна уу.";
      if (value.length > ed.maxItems) return `${ed.maxItems}-аас ихгүй утга оруулна.`;
      const seen = new Set<string>();
      for (const x of value) {
        if (typeof x !== "string" || x.trim() !== x || x.length < 1 || x.length > ed.maxLength) {
          return `Утга бүр 1–${ed.maxLength} тэмдэгт, эхэнд/төгсгөлд зайгүй байна.`;
        }
        if (seen.has(x)) return `«${x}» давхардсан байна.`;
        seen.add(x);
      }
      return null;
    }
    case "codeLabel": {
      if (!isRecord(value)) return "Жагсаалт буруу.";
      const entries = Object.entries(value);
      if (entries.length > ed.maxItems) return `${ed.maxItems}-аас ихгүй мөр оруулна.`;
      for (const [code, name] of entries) {
        if (!SETTING_CODE_RE.test(code)) {
          return `«${code}» код буруу: латин жижиг үсгээр эхэлж, жижиг үсэг, тоо, «_» (40 хүртэл тэмдэгт).`;
        }
        if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > ed.maxLabel) {
          return `«${code}»-ийн нэр 1–${ed.maxLabel} тэмдэгт байна.`;
        }
      }
      if (ed.fixedCodes) {
        const want = [...ed.fixedCodes].sort().join(",");
        if (Object.keys(value).sort().join(",") !== want) return "Бүх ангиллын нэрийг бөглөнө үү.";
      }
      for (const req of ed.requiredCodes) {
        if (!(req in value)) return `«${req}» мөр заавал байна.`;
      }
      return null;
    }
  }
}

// ── Харуулах текст ─────────────────────────────────────────────────────────

const YES = "Тийм";
const NO = "Үгүй";

/** Утгыг нэг мөр текст болгоно (тойм, зөвхөн унших горимд). */
export function settingValueText(key: Crm2SettingKey, value: unknown): string {
  const ed = settingEditor(key);
  switch (ed.kind) {
    case "boolean":
      return value === true ? YES : value === false ? NO : "—";
    case "number":
      return typeof value === "number" ? `${value}${ed.unit ? ` ${ed.unit}` : ""}` : "—";
    case "numberList":
      return Array.isArray(value) && value.length
        ? `${[...value].sort((a, b) => Number(b) - Number(a)).join(", ")} ${ed.unit}`
        : "Сануулахгүй";
    case "choice":
      return ed.options.find((o) => o.value === value)?.label ?? String(value ?? "—");
    case "multi":
      if (!Array.isArray(value) || value.length === 0) return "Байхгүй";
      return value.map((v) => ed.options.find((o) => o.value === v)?.label ?? String(v)).join(", ");
    case "stringList":
      return Array.isArray(value) && value.length ? value.join(", ") : "—";
    case "codeLabel":
      if (!isRecord(value)) return "—";
      return Object.values(value).filter((v) => typeof v === "string").join(", ") || "—";
  }
}

// ── Эзэн батлах анхдагч шийдвэрүүдийн тойм ────────────────────────────────

export type DefaultDecision = { title: string; note: string; keys: Crm2SettingKey[] };

/**
 * Хөгжүүлэлт эхлэхэд эзний батлах ёстой, тохиргоогоор өөрчлөгдөх гол шийдвэрүүд.
 * Дэлгэцийн дээд хэсэгт одоогийн утгаар нь жагсаана.
 */
export const DEFAULT_DECISIONS: DefaultDecision[] = [
  {
    title: "Ангиллын нэр: Түрээслэх, Хөлслөх",
    note: "Санал болгосон утга: сарын төлбөртэй удаан хугацааны байрлалт — «Түрээслэх», хоногоор тооцох богино хугацааны — «Хөлслөх». Нэрийг солиж болно.",
    keys: ["property.category_labels"],
  },
  {
    title: "Гэрээ ба хүсэлтийн батлагч",
    note: "Анхдагчаар удирдлага (менежер) болон тухайн агентын багийн ахлагч батална; оффисын админд энэ эрх олгогдоогүй.",
    keys: ["roles.approve", "approvals.team_lead", "approvals.office_admin"],
  },
  {
    title: "Өөрийн гэрээ, хүсэлтийг батлах",
    note: "Анхдагчаар зөвхөн менежер өөрт хамаатай гэрээ, хүсэлтээ өөрөө баталж чадна.",
    keys: ["approvals.allow_self"],
  },
  {
    title: "Гэрээ дуусахад хөрөнгийн төлөв",
    note: "Анхдагчаар хөрөнгө «Гэрээ дууссан» төлөвт орж, архивын харагдацад шилжинэ; дуудлага, үзүүлэлт, түүх устахгүй.",
    keys: ["brokerage.on_expiry"],
  },
  {
    title: "Хөрөнгийн төлөвийг хэн өөрчлөх",
    note: "Батлах эрхтэн төлөвийг шууд сольж, бусад агент шалтгаанаа бичиж хүсэлт гаргана.",
    keys: ["property.agent_direct_statuses"],
  },
  {
    title: "Staff хөрөнгийн харагдац",
    note: "Анхдагчаар идэвхжсэн бүх хөрөнгө оффисын CRM ажилтан бүрийн жагсаалтад харагдана.",
    keys: ["property.visibility"],
  },
  {
    title: "Бусдын харилцагчтай хэлцэл нээх",
    note: "Анхдагчаар зөвшөөрөхгүй: агент тухайн харилцагчийг өөрт нь шилжүүлэх хүсэлт гаргана.",
    keys: ["contact.foreign_deal"],
  },
  {
    title: "Идэвхжүүлэхэд заавал бөглөх талбар",
    note: "Батлагдсан хүчинтэй гэрээнээс гадна эдгээр талбар бөглөгдсөн байх ёстой.",
    keys: ["property.activation_required"],
  },
  {
    title: "Нэг агент олон үүрэгтэй байх",
    note: "Анхдагчаар нэг хүн листлэгч, гэрээ хийсэн, зураг авсан агентын аль ч хослолыг хавсарч болно.",
    keys: ["property.same_agent_multi_role"],
  },
  {
    title: "Санхүүд хандах эрх",
    note: "Анхдагчаар зөвхөн санхүүгийн дүртэй ажилтан; админ эсвэл захирал байх нь энэ эрхийг өгөхгүй.",
    keys: ["roles.finance"],
  },
  {
    title: "Гэрээ дуусахын өмнөх сануулга",
    note: "Хариуцсан агент ба ахлагчид апп доторх мэдэгдэл.",
    keys: ["brokerage.remind_days_before"],
  },
  {
    title: "Зураг, бичлэг, гэрээний файлын хязгаар",
    note: "HEIC зургийг хүлээж авахгүй; урт бичлэгийг холбоосоор нэмнэ.",
    keys: ["media.max_images", "media.max_image_mb", "media.max_video_mb", "docs.max_file_mb"],
  },
];

/** Тохиргоогоор өөрчлөгдөхгүй, тогтсон дүрэм (тоймд мэдээлэл болгон). */
export const FIXED_RULES: string[] = [
  "Нэг талбайг хэсэгчлэн түрээслүүлбэл хэсэг тус бүрийг өөр өөр Staff хөрөнгө болгон бүртгэнэ.",
  "Жагсаалтын «идэвхжсэн» огноо нь хөрөнгө хамгийн анх идэвхтэй болсон өдөр бөгөөд дахин идэвхжүүлсэн ч хөдлөхгүй.",
  "Дуудлага ба үзүүлэлт тусдаа бүртгэл: үзүүлэлтийн үр дүнг агент бодит цагтай нь өөрөө тэмдэглэнэ, товлосон цаг өнгөрөхөд систем өөрөө «үзүүлсэн» гэж тооцохгүй.",
];

/** Бүх түлхүүр нэг бүлэгт л орсон эсэх (тест). */
export function groupedSettingKeys(): Crm2SettingKey[] {
  return SETTING_GROUPS.flatMap((g) => g.keys);
}
