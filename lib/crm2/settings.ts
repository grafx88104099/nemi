import type { Json } from "@/types/database";
import type { Crm2PropertyCategory, Crm2PropertyStatus, CrmRole } from "@/lib/crm2/types";
import { PROPERTY_CATEGORY_LABEL } from "@/lib/crm2/labels";

/**
 * crm2_settings_effective() — тохиргооны төрөлтэй уншигч (цэвэр модуль: сервер,
 * клиент аль алинд). Анхдагч утга нь миграцийн crm2_setting_default()-тэй ижил;
 * RPC алдаа гарвал эсвэл утгын төрөл буруу бол анхдагчаар ажиллана.
 */

export type Crm2SettingValues = {
  "property.visibility": "office" | "team" | "own";
  "property.agent_direct_statuses": Crm2PropertyStatus[];
  "property.activation_required": string[];
  "property.same_agent_multi_role": boolean;
  "property.category_labels": Record<Crm2PropertyCategory, string>;
  /** Түлхүүр → нэр (жагсаалтын дараалал хадгалагдана). */
  "property.types": Record<string, string>;
  "property.districts": string[];
  "property.features": Record<string, string>;
  "brokerage.require_owner": boolean;
  "brokerage.require_file": boolean;
  "brokerage.remind_days_before": number[];
  "brokerage.on_expiry": "contract_ended" | "keep";
  "approvals.team_lead": boolean;
  "approvals.office_admin": boolean;
  "approvals.allow_self": "nobody" | "managers" | "all";
  "roles.work": CrmRole[];
  "roles.approve": CrmRole[];
  "roles.finance": CrmRole[];
  "contact.foreign_deal": "deny" | "allow";
  "contact.require_phone": boolean;
  "deal.open_property_statuses": Crm2PropertyStatus[];
  "deal.auto_advance": boolean;
  "deal.property_agents_can_view": boolean;
  "deal.cancel_reasons": Record<string, string>;
  "showing.require_feedback": boolean;
  "activity.edit_window_hours": number;
  "media.max_images": number;
  "media.max_videos": number;
  "media.max_image_mb": number;
  "media.max_video_mb": number;
  "docs.max_file_mb": number;
  "docs.max_files_per_contract": number;
};

export type Crm2SettingKey = keyof Crm2SettingValues;
export type Crm2Settings = Crm2SettingValues;

export const CRM2_SETTING_DEFAULTS: Crm2SettingValues = {
  "property.visibility": "office",
  "property.agent_direct_statuses": [],
  "property.activation_required": ["location_text", "price", "listing_agent_id", "contract_agent_id"],
  "property.same_agent_multi_role": true,
  "property.category_labels": { ...PROPERTY_CATEGORY_LABEL },
  "property.types": {
    apartment: "Орон сууц",
    house: "Хувийн сууц",
    office: "Оффис",
    commercial: "Худалдаа, үйлчилгээ",
    land: "Газар",
    garage: "Гараж, агуулах",
    other: "Бусад",
  },
  "property.districts": [
    "Баянгол",
    "Баянзүрх",
    "Сонгинохайрхан",
    "Сүхбаатар",
    "Хан-Уул",
    "Чингэлтэй",
    "Налайх",
    "Багануур",
    "Багахангай",
  ],
  "property.features": {
    parking: "Зогсоол",
    garage: "Гараж",
    furnished: "Тавилгатай",
    balcony: "Тагт",
    elevator: "Лифт",
    pets: "Тэжээвэр амьтан зөвшөөрнө",
  },
  "brokerage.require_owner": true,
  "brokerage.require_file": true,
  "brokerage.remind_days_before": [30, 7, 1],
  "brokerage.on_expiry": "contract_ended",
  "approvals.team_lead": true,
  "approvals.office_admin": false,
  "approvals.allow_self": "managers",
  "roles.work": ["agent", "team_lead", "sales_director", "ops_qc", "ceo", "property_manager"],
  "roles.approve": ["sales_director", "ops_qc", "ceo"],
  "roles.finance": ["finance"],
  "contact.foreign_deal": "deny",
  "contact.require_phone": true,
  "deal.open_property_statuses": ["active"],
  "deal.auto_advance": true,
  "deal.property_agents_can_view": true,
  "deal.cancel_reasons": {
    price: "Үнэ таараагүй",
    location: "Байршил таараагүй",
    size: "Хэмжээ, өрөө таараагүй",
    condition: "Хөрөнгийн байдал таалагдаагүй",
    timing: "Хугацаа таараагүй",
    chose_other: "Өөр хөрөнгө сонгосон",
    financing: "Санхүүжилт бүрдээгүй",
    no_response: "Холбоо тасарсан",
    owner_withdrew: "Эзэн татгалзсан",
    other: "Бусад",
  },
  "showing.require_feedback": true,
  "activity.edit_window_hours": 72,
  "media.max_images": 40,
  "media.max_videos": 5,
  "media.max_image_mb": 15,
  "media.max_video_mb": 50,
  "docs.max_file_mb": 20,
  "docs.max_files_per_contract": 20,
};

export const CRM2_SETTING_KEYS = Object.keys(CRM2_SETTING_DEFAULTS) as Crm2SettingKey[];

export function isCrm2SettingKey(key: string): key is Crm2SettingKey {
  return Object.prototype.hasOwnProperty.call(CRM2_SETTING_DEFAULTS, key);
}

/** roles.* ба approvals.* — зөвхөн CEO өөрчилнө (crm2_set_setting). */
export function isAccessSettingKey(key: string): boolean {
  return key.startsWith("roles.") || key.startsWith("approvals.");
}

/** Тохиргооны дэлгэц (S11) ба түүхэнд харуулах нэр. */
export const CRM2_SETTING_LABEL: Record<Crm2SettingKey, string> = {
  "property.visibility": "Staff хөрөнгийг хэн харах",
  "property.agent_direct_statuses": "Агент шууд өөрчилж болох хөрөнгийн төлөв",
  "property.activation_required": "Идэвхжүүлэхэд заавал бөглөх талбар",
  "property.same_agent_multi_role": "Нэг агент хэд хэдэн үүрэг авч болох",
  "property.category_labels": "Ангиллын нэр",
  "property.types": "Хөрөнгийн төрөл",
  "property.districts": "Дүүргийн жагсаалт",
  "property.features": "Онцлогийн жагсаалт",
  "brokerage.require_owner": "Зуучлалын гэрээнд эзэн заавал",
  "brokerage.require_file": "Зуучлалын гэрээнд файл заавал",
  "brokerage.remind_days_before": "Гэрээ дуусахаас өмнө сануулах хоног",
  "brokerage.on_expiry": "Гэрээ дуусахад хөрөнгийн төлөв",
  "approvals.team_lead": "Багийн ахлагч гэрээ, хүсэлт батлах",
  "approvals.office_admin": "Оффисын админ гэрээ, хүсэлт батлах",
  "approvals.allow_self": "Өөрийн гэрээ, хүсэлтийг батлах",
  "roles.work": "Бүртгэл хийх дүрүүд",
  "roles.approve": "Батлах дүрүүд",
  "roles.finance": "Санхүүгийн эрхтэй дүрүүд",
  "contact.foreign_deal": "Өөр агентын харилцагчтай хэлцэл нээх",
  "contact.require_phone": "Харилцагчийн утас заавал",
  "deal.open_property_statuses": "Хэлцэл нээж болох хөрөнгийн төлөв",
  "deal.auto_advance": "Хэлцлийн шатыг автоматаар урагшлуулах",
  "deal.property_agents_can_view": "Хөрөнгийн 3 агент хэлцлийг харах",
  "deal.cancel_reasons": "Хэлцэл цуцлах шалтгаан",
  "showing.require_feedback": "Үзүүлсний дараа санал хүсэлт заавал",
  "activity.edit_window_hours": "Дуудлага, үзүүлэлт засах хугацаа (цаг)",
  "media.max_images": "Нэг хөрөнгийн зургийн дээд тоо",
  "media.max_videos": "Нэг хөрөнгийн бичлэгийн дээд тоо",
  "media.max_image_mb": "Зургийн дээд хэмжээ (МБ)",
  "media.max_video_mb": "Бичлэгийн дээд хэмжээ (МБ)",
  "docs.max_file_mb": "Гэрээний файлын дээд хэмжээ (МБ)",
  "docs.max_files_per_contract": "Нэг гэрээний файлын дээд тоо",
};

/** Сонголттой тохиргооны утгын нэр. */
export const CRM2_SETTING_OPTION_LABEL: Partial<Record<Crm2SettingKey, Record<string, string>>> = {
  "property.visibility": { office: "Оффисын бүх ажилтан", team: "Зөвхөн баг", own: "Зөвхөн өөрийн" },
  "brokerage.on_expiry": { contract_ended: "«Гэрээ дууссан» болгох", keep: "Төлөвийг хэвээр үлдээх" },
  "approvals.allow_self": { nobody: "Хэн ч үгүй", managers: "Зөвхөн менежер", all: "Бүгд" },
  "contact.foreign_deal": { deny: "Хориглох (шилжүүлэх хүсэлт)", allow: "Зөвшөөрөх" },
};

/** Тоон тохиргооны хязгаар (crm2_set_setting-тэй ижил). */
export const CRM2_SETTING_NUMBER_RANGE: Partial<Record<Crm2SettingKey, [number, number]>> = {
  "activity.edit_window_hours": [0, 8760],
  "media.max_images": [1, 200],
  "media.max_videos": [0, 50],
  "media.max_image_mb": [1, 50],
  "media.max_video_mb": [1, 50],
  "docs.max_file_mb": [1, 20],
  "docs.max_files_per_contract": [1, 100],
};

// ── Уншигч ─────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sameShape(value: unknown, fallback: unknown): boolean {
  if (Array.isArray(fallback)) return Array.isArray(value);
  if (isRecord(fallback)) return isRecord(value);
  return typeof value === typeof fallback;
}

function cleanValue(key: Crm2SettingKey, value: unknown): unknown {
  const fallback = CRM2_SETTING_DEFAULTS[key];
  if (value === undefined || value === null || !sameShape(value, fallback)) return fallback;
  if (Array.isArray(fallback)) {
    const want = typeof (fallback as unknown[])[0];
    const arr = (value as unknown[]).filter((x) =>
      fallback.length === 0 ? typeof x === "string" : typeof x === want
    );
    return arr;
  }
  if (isRecord(fallback)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k] = v;
    }
    if (key === "property.category_labels") return { ...(fallback as Record<string, string>), ...out };
    return out;
  }
  return value;
}

/** crm2_settings_effective()-ийн jsonb-ийг төрөлтэй объект болгоно. */
export function parseCrm2Settings(raw: Json | null | undefined): Crm2SettingValues {
  const src = isRecord(raw) ? raw : {};
  const out = {} as Record<Crm2SettingKey, unknown>;
  for (const key of CRM2_SETTING_KEYS) out[key] = cleanValue(key, src[key]);
  return out as Crm2SettingValues;
}

/** Жагсаалт (түлхүүр → нэр) -ийг сонголт болгох: [{ value, label }]. */
export function settingOptions(map: Record<string, string>): { value: string; label: string }[] {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

/** Хөрөнгийн төрлийн нэр (тохиргооноос; олдохгүй бол түлхүүр). */
export function propertyTypeLabel(settings: Pick<Crm2SettingValues, "property.types">, key: string | null | undefined): string {
  if (!key) return "";
  return settings["property.types"][key] ?? key;
}

export function featureLabel(settings: Pick<Crm2SettingValues, "property.features">, key: string): string {
  return settings["property.features"][key] ?? key;
}

export function cancelReasonLabel(settings: Pick<Crm2SettingValues, "deal.cancel_reasons">, code: string | null | undefined): string {
  if (!code) return "";
  return settings["deal.cancel_reasons"][code] ?? code;
}

/** Медиа, гэрээний файлын хязгаар (storage.ts-ийн шалгалтад). */
export type Crm2FileLimits = {
  maxImages: number;
  maxVideos: number;
  maxImageMb: number;
  maxVideoMb: number;
  maxDocMb: number;
  maxDocsPerContract: number;
};

export function fileLimits(settings: Crm2SettingValues): Crm2FileLimits {
  return {
    maxImages: settings["media.max_images"],
    maxVideos: settings["media.max_videos"],
    maxImageMb: settings["media.max_image_mb"],
    maxVideoMb: settings["media.max_video_mb"],
    maxDocMb: settings["docs.max_file_mb"],
    maxDocsPerContract: settings["docs.max_files_per_contract"],
  };
}
