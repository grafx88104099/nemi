import type {
  Crm2ActivityKind,
  Crm2BrokerageStatus,
  Crm2CommissionType,
  Crm2Currency,
  Crm2DealStage,
  Crm2MediaKind,
  Crm2PriceBasis,
  Crm2PricePeriod,
  Crm2PropertyCategory,
  Crm2PropertyStatus,
  Crm2RecordStatus,
  Crm2RequestKind,
  Crm2RequestStatus,
  Crm2ShowingStatus,
  Crm2TaskKind,
  Crm2TaskStatus,
  CrmRole,
} from "@/lib/crm2/types";

/**
 * CRM v2 — enum бүрийн монгол нэр, өнгө (components/ui/badge-ийн tone), дараалал
 * ба хуваалцах тогтмолууд. Клиент ба сервер аль алинд импортлоно (цэвэр модуль).
 */

/** components/ui/badge-ийн өнгө. */
export type Crm2Tone = "neutral" | "green" | "rose" | "amber" | "blue" | "brand";

// ── Хөрөнгийн ангилал ──────────────────────────────────────────────────────

export const PROPERTY_CATEGORIES = ["rent", "lease", "managed_rent", "sale"] as const satisfies readonly Crm2PropertyCategory[];

/** Анхдагч нэр — оффисын тохиргоо (property.category_labels) давуу. */
export const PROPERTY_CATEGORY_LABEL: Record<Crm2PropertyCategory, string> = {
  rent: "Түрээслэх",
  lease: "Хөлслөх",
  managed_rent: "Менежментийн үйлчилгээтэй түрээс",
  sale: "Зарах",
};

export const PROPERTY_CATEGORY_SHORT: Record<Crm2PropertyCategory, string> = {
  rent: "Түрээс",
  lease: "Хөлс",
  managed_rent: "Менежменттэй",
  sale: "Зарах",
};

export const PROPERTY_CATEGORY_TONE: Record<Crm2PropertyCategory, Crm2Tone> = {
  rent: "blue",
  lease: "brand",
  managed_rent: "amber",
  sale: "green",
};

/** Ангиллын нэр: тохиргооны нэр байвал түүнийг, эс бөгөөс анхдагчийг. */
export function categoryLabel(
  category: Crm2PropertyCategory,
  overrides?: Partial<Record<string, string>> | null
): string {
  const custom = overrides?.[category]?.trim();
  return custom || PROPERTY_CATEGORY_LABEL[category] || category;
}

// ── Хөрөнгийн төлөв ────────────────────────────────────────────────────────

export const PROPERTY_STATUSES = [
  "draft",
  "active",
  "suspended",
  "rented",
  "sold",
  "contract_ended",
  "archived",
] as const satisfies readonly Crm2PropertyStatus[];

export const PROPERTY_STATUS_LABEL: Record<Crm2PropertyStatus, string> = {
  draft: "Ноорог",
  active: "Идэвхтэй",
  suspended: "Түр түдгэлзсэн",
  rented: "Түрээслэгдсэн",
  sold: "Зарагдсан",
  contract_ended: "Гэрээ дууссан",
  archived: "Архив",
};

export const PROPERTY_STATUS_TONE: Record<Crm2PropertyStatus, Crm2Tone> = {
  draft: "neutral",
  active: "green",
  suspended: "amber",
  rented: "blue",
  sold: "brand",
  contract_ended: "rose",
  archived: "neutral",
};

/** Жагсаалтын харагдац: «Архив» = гэрээ дууссан + архив. */
export type PropertyStatusGroup = "active" | "archive" | "draft" | "all";

export const PROPERTY_STATUS_GROUPS: Record<Exclude<PropertyStatusGroup, "all">, Crm2PropertyStatus[]> = {
  active: ["active", "suspended", "rented", "sold"],
  archive: ["contract_ended", "archived"],
  draft: ["draft"],
};

/** «Идэвхтэй» нь зөвхөн төлвийн нэр — идэвхтэй/түдгэлзсэн/түрээслэгдсэн/зарагдсан бүлэг нь «Одоогийн». */
export const PROPERTY_STATUS_GROUP_LABEL: Record<PropertyStatusGroup, string> = {
  active: "Одоогийн",
  archive: "Архив",
  draft: "Ноорог",
  all: "Бүгд",
};

/** crm2_property_transition_ok()-той ижил шилжилт (UI-д товч харуулах). */
export const PROPERTY_TRANSITIONS: Record<Crm2PropertyStatus, Crm2PropertyStatus[]> = {
  draft: ["active", "archived"],
  active: ["suspended", "rented", "sold", "contract_ended", "archived"],
  suspended: ["active", "rented", "sold", "contract_ended", "archived"],
  rented: ["active", "sold", "contract_ended", "archived"],
  sold: ["active", "archived"],
  contract_ended: ["active", "archived"],
  archived: ["draft"],
};

export function canTransitionProperty(from: Crm2PropertyStatus, to: Crm2PropertyStatus): boolean {
  return PROPERTY_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Шалтгаангүй шилжих боломжтой эсэх (идэвхжүүлэлт: ноорог/гэрээ дууссан → идэвхтэй). */
export function statusChangeNeedsReason(from: Crm2PropertyStatus, to: Crm2PropertyStatus): boolean {
  return !(to === "active" && (from === "draft" || from === "contract_ended"));
}

/** Төлөв өөрчлөх товчны нэр. */
export const PROPERTY_STATUS_ACTION_LABEL: Record<Crm2PropertyStatus, string> = {
  draft: "Ноорог руу сэргээх",
  active: "Идэвхжүүлэх",
  suspended: "Түр түдгэлзүүлэх",
  rented: "Түрээслэгдсэн болгох",
  sold: "Зарагдсан болгох",
  contract_ended: "Гэрээ дууссан болгох",
  archived: "Архивлах",
};

// ── Үнэ, валют ─────────────────────────────────────────────────────────────

export const CURRENCIES = ["MNT", "USD"] as const satisfies readonly Crm2Currency[];

export const CURRENCY_LABEL: Record<Crm2Currency, string> = { MNT: "Төгрөг (₮)", USD: "Доллар ($)" };
export const CURRENCY_SYMBOL: Record<Crm2Currency, string> = { MNT: "₮", USD: "$" };

export const PRICE_PERIODS = ["total", "month", "day"] as const satisfies readonly Crm2PricePeriod[];

export const PRICE_PERIOD_LABEL: Record<Crm2PricePeriod, string> = {
  total: "Нийт",
  month: "Сарын",
  day: "Өдрийн",
};

/** Үнийн ард залгах богино хугацаа: «/сар», «/өдөр». */
export const PRICE_PERIOD_SUFFIX: Record<Crm2PricePeriod, string> = {
  total: "",
  month: "/сар",
  day: "/өдөр",
};

export const PRICE_BASES = ["total", "per_m2"] as const satisfies readonly Crm2PriceBasis[];

export const PRICE_BASIS_LABEL: Record<Crm2PriceBasis, string> = {
  total: "Нийт үнэ",
  per_m2: "м²-ийн үнэ",
};

/**
 * Ангилалд тохирох үнийн хугацаа (идэвхжүүлэхэд DB шалгана): зарах = нийт;
 * түрээслэх, менежменттэй түрээс = сар/өдөр; хөлслөх = аль ч.
 */
export const CATEGORY_PRICE_PERIODS: Record<Crm2PropertyCategory, Crm2PricePeriod[]> = {
  sale: ["total"],
  rent: ["month", "day"],
  managed_rent: ["month", "day"],
  lease: ["total", "month", "day"],
};

export function defaultPricePeriod(category: Crm2PropertyCategory): Crm2PricePeriod {
  return category === "sale" ? "total" : category === "lease" ? "day" : "month";
}

// ── Медиа ──────────────────────────────────────────────────────────────────

export const MEDIA_KINDS = ["image", "video"] as const satisfies readonly Crm2MediaKind[];
export const MEDIA_KIND_LABEL: Record<Crm2MediaKind, string> = { image: "Зураг", video: "Бичлэг" };

// ── Зуучлалын гэрээ ────────────────────────────────────────────────────────

export const BROKERAGE_STATUSES = ["draft", "pending", "active", "expired", "terminated"] as const satisfies readonly Crm2BrokerageStatus[];

export const BROKERAGE_STATUS_LABEL: Record<Crm2BrokerageStatus, string> = {
  draft: "Ноорог",
  pending: "Батлуулахаар илгээсэн",
  active: "Батлагдсан",
  expired: "Хугацаа дууссан",
  terminated: "Цуцлагдсан",
};

export const BROKERAGE_STATUS_TONE: Record<Crm2BrokerageStatus, Crm2Tone> = {
  draft: "neutral",
  pending: "amber",
  active: "green",
  expired: "rose",
  terminated: "neutral",
};

export const COMMISSION_TYPES = ["percent", "fixed"] as const satisfies readonly Crm2CommissionType[];

export const COMMISSION_TYPE_LABEL: Record<Crm2CommissionType, string> = {
  percent: "Хувиар",
  fixed: "Тогтмол дүн",
};

// ── Харилцагч, шаардлага ───────────────────────────────────────────────────

export const RECORD_STATUSES = ["active", "archived"] as const satisfies readonly Crm2RecordStatus[];

export const RECORD_STATUS_LABEL: Record<Crm2RecordStatus, string> = {
  active: "Идэвхтэй",
  archived: "Архивласан",
};

export const RECORD_STATUS_TONE: Record<Crm2RecordStatus, Crm2Tone> = {
  active: "green",
  archived: "neutral",
};

// ── Хэлцэл ─────────────────────────────────────────────────────────────────

export const DEAL_STAGES = [
  "interested",
  "contacted",
  "showing_scheduled",
  "shown",
  "reshow",
  "negotiating",
  "confirmed",
  "documents",
  "awaiting_payment",
  "closed",
  "cancelled",
] as const satisfies readonly Crm2DealStage[];

export const DEAL_STAGE_LABEL: Record<Crm2DealStage, string> = {
  interested: "Сонирхсон",
  contacted: "Холбогдсон",
  showing_scheduled: "Үзүүлэхээр товлосон",
  shown: "Үзүүлсэн",
  reshow: "Дахин үзэх",
  negotiating: "Хэлэлцэж байгаа",
  confirmed: "Баталгаажсан",
  documents: "Баримт бүрдүүлэх",
  awaiting_payment: "Төлбөр хүлээх",
  closed: "Хаагдсан",
  cancelled: "Цуцлагдсан",
};

export const DEAL_STAGE_TONE: Record<Crm2DealStage, Crm2Tone> = {
  interested: "neutral",
  contacted: "blue",
  showing_scheduled: "amber",
  shown: "brand",
  reshow: "amber",
  negotiating: "brand",
  confirmed: "green",
  documents: "green",
  awaiting_payment: "green",
  closed: "green",
  cancelled: "rose",
};

/** Нээлттэй бус шат (дахин нээхгүй — шинэ хэлцэл). */
export const CLOSED_DEAL_STAGES: Crm2DealStage[] = ["closed", "cancelled"];

export function isDealOpen(stage: Crm2DealStage): boolean {
  return !CLOSED_DEAL_STAGES.includes(stage);
}

/**
 * Энэ шатанд (1-р шат) гараар сонгож болох шат. documents / awaiting_payment /
 * closed нь хэлцлийн гэрээ, төлбөрийн хэсэгт (2-р шат); cancelled — «Цуцлах» үйлдлээр.
 * shown/reshow — бодит «үзүүлсэн» бүртгэлтэй үед, showing_scheduled — товлосон үзүүлэлттэй үед.
 */
export const MANUAL_DEAL_STAGES: Crm2DealStage[] = [
  "interested",
  "contacted",
  "showing_scheduled",
  "shown",
  "reshow",
  "negotiating",
  "confirmed",
];

// ── Дуудлага, үзүүлэлт ─────────────────────────────────────────────────────

export const ACTIVITY_KINDS = ["call", "showing"] as const satisfies readonly Crm2ActivityKind[];

export const ACTIVITY_KIND_LABEL: Record<Crm2ActivityKind, string> = {
  call: "Дуудлага",
  showing: "Үзүүлэлт",
};

export const SHOWING_STATUSES = ["scheduled", "shown", "cancelled", "no_show"] as const satisfies readonly Crm2ShowingStatus[];

export const SHOWING_STATUS_LABEL: Record<Crm2ShowingStatus, string> = {
  scheduled: "Товлосон",
  shown: "Үзүүлсэн",
  cancelled: "Цуцалсан",
  no_show: "Ирээгүй",
};

export const SHOWING_STATUS_TONE: Record<Crm2ShowingStatus, Crm2Tone> = {
  scheduled: "amber",
  shown: "green",
  cancelled: "neutral",
  no_show: "rose",
};

// ── Ажил (дараагийн алхам) ─────────────────────────────────────────────────

export const TASK_KINDS = [
  "call_back",
  "showing",
  "reshow",
  "negotiate",
  "send_info",
  "brokerage_renewal",
  "owner_verify",
  "other",
] as const satisfies readonly Crm2TaskKind[];

export const TASK_KIND_LABEL: Record<Crm2TaskKind, string> = {
  call_back: "Эргэж залгах",
  showing: "Үзүүлэх",
  reshow: "Дахин үзүүлэх",
  negotiate: "Хэлэлцэх",
  send_info: "Мэдээлэл илгээх",
  brokerage_renewal: "Гэрээ сунгах",
  owner_verify: "Эзэнтэй мэдээлэл тулгах",
  other: "Бусад",
};

/** Дуудлагын дараах «Дараагийн алхам» сонголт (хэлцэлтэй холбоотой). */
export const CALL_NEXT_ACTIONS: Crm2TaskKind[] = ["call_back", "showing", "reshow", "negotiate", "send_info", "other"];

export const TASK_STATUSES = ["open", "done", "cancelled"] as const satisfies readonly Crm2TaskStatus[];

export const TASK_STATUS_LABEL: Record<Crm2TaskStatus, string> = {
  open: "Хийх",
  done: "Хийсэн",
  cancelled: "Цуцалсан",
};

export const TASK_STATUS_TONE: Record<Crm2TaskStatus, Crm2Tone> = {
  open: "blue",
  done: "green",
  cancelled: "neutral",
};

// ── Хүсэлт ─────────────────────────────────────────────────────────────────

export const REQUEST_KINDS = ["property_status", "deal_transfer", "contact_transfer"] as const satisfies readonly Crm2RequestKind[];

export const REQUEST_KIND_LABEL: Record<Crm2RequestKind, string> = {
  property_status: "Хөрөнгийн төлөв өөрчлөх",
  deal_transfer: "Хэлцэл шилжүүлэх",
  contact_transfer: "Харилцагч шилжүүлэх",
};

export const REQUEST_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const satisfies readonly Crm2RequestStatus[];

export const REQUEST_STATUS_LABEL: Record<Crm2RequestStatus, string> = {
  pending: "Хүлээгдэж буй",
  approved: "Батлагдсан",
  rejected: "Татгалзсан",
  cancelled: "Цуцлагдсан",
};

export const REQUEST_STATUS_TONE: Record<Crm2RequestStatus, Crm2Tone> = {
  pending: "amber",
  approved: "green",
  rejected: "rose",
  cancelled: "neutral",
};

// ── Дүр ────────────────────────────────────────────────────────────────────

export const CRM_ROLE_LABEL: Record<CrmRole, string> = {
  agent: "Агент",
  team_lead: "Багийн ахлагч",
  sales_director: "Борлуулалтын захирал",
  ops_qc: "Үйл ажиллагаа, чанар",
  marketing: "Маркетинг",
  property_manager: "Хөрөнгийн менежер",
  finance: "Санхүү",
  aml_officer: "AML хариуцагч",
  ceo: "Гүйцэтгэх захирал",
  sysadmin: "Системийн админ",
};

/** Хөрөнгийн 3 үүрэгт агент. */
export const PROPERTY_AGENT_ROLES = ["listing_agent_id", "contract_agent_id", "photo_agent_id"] as const;
export type PropertyAgentRole = (typeof PROPERTY_AGENT_ROLES)[number];

export const PROPERTY_AGENT_ROLE_LABEL: Record<PropertyAgentRole, string> = {
  listing_agent_id: "Листлэгч агент",
  contract_agent_id: "Гэрээ хийсэн агент",
  photo_agent_id: "Зураг авсан агент",
};

// ── Идэвхжүүлэх нөхцөл (crm2_missing_text-тэй ижил) ───────────────────────

export const MISSING_ITEM_LABEL: Record<string, string> = {
  district: "дүүрэг",
  price_period: "үнийн хугацаа ангилалтай таарахгүй",
  location_text: "байршил",
  address_detail: "байршлын дэлгэрэнгүй",
  pin: "газрын зургийн цэг",
  project: "төсөл",
  property_type: "хөрөнгийн төрөл",
  area_m2: "хэмжээ",
  rooms: "өрөөний тоо",
  floor: "давхар",
  price: "үнэ",
  year_in_use: "ашиглалтад орсон он",
  listing_agent_id: "листлэгч агент",
  contract_agent_id: "гэрээ хийсэн агент",
  photo_agent_id: "зураг авсан агент",
  owner: "эзэн",
  showing_instructions: "үзүүлэх заавар",
  images: "зураг",
  brokerage_contract: "батлагдсан, хүчинтэй зуучлалын гэрээ",
  start_date: "эхлэх огноо",
  end_date: "дуусах огноо",
  end_date_past: "дуусах огноо өнгөрсөн",
  commission: "шимтгэл",
  file: "гэрээний файл",
};

export function missingItemLabel(item: string): string {
  return MISSING_ITEM_LABEL[item] ?? item;
}

// ── Код (P001, C001, D001, B001) ────────────────────────────────────────────

export type Crm2CodeKind = "property" | "contact" | "deal" | "brokerage";

export const CODE_KIND_LABEL: Record<Crm2CodeKind, string> = {
  property: "Хөрөнгө",
  contact: "Харилцагч",
  deal: "Хэлцэл",
  brokerage: "Зуучлалын гэрээ",
};

/** Кодын үсгээр төрлийг таах (P/C/D/B). */
export function codeKind(code: string | null | undefined): Crm2CodeKind | null {
  const c = (code ?? "").trim().charAt(0).toUpperCase();
  return c === "P" ? "property" : c === "C" ? "contact" : c === "D" ? "deal" : c === "B" ? "brokerage" : null;
}

// ── Хуваалцах тогтмол ──────────────────────────────────────────────────────

export const CRM2_PAGE_SIZE = 24;
export const CRM2_MAX_PAGE_SIZE = 100;
/** Харилцагчийн нэр далд үед харуулах тайлбар. */
export const MASKED_NAME_HINT = "Энэ харилцагчийг харах эрхгүй — нэрийг далдалсан";
/** Хувийн мэдээлэл (эзэн, гэрээ) харах эрхгүй үед. */
export const PRIVATE_HIDDEN_TEXT = "Энэ мэдээллийг харах эрхгүй";
export const EMPTY_VALUE = "—";
/** Ижил дугаартай боловч өөр хүнийг тусад нь бүртгэх товч (бүх маягтад нэг үг). */
export const SEPARATE_PERSON_LABEL = "Тусдаа хүн гэж бүртгэх";
/** Дараагийн шатанд нээгдэх хэсгийн нэгдсэн бичвэр. */
export const COMING_LATER_TEXT = "Дараагийн шатанд нээгдэнэ";
/** Шинэ харилцагч бүртгэхэд оруулах утасны дээд тоо (маягт бүрт ижил). */
export const CONTACT_MAX_PHONES = 10;
/** Харах эрхгүй харилцагчийн оронд харуулах шошго. */
export const HIDDEN_CONTACT_LABEL = "Харилцагч (харах эрхгүй)";
/** Харах эрхгүй хөрөнгийн оронд харуулах шошго. */
export const HIDDEN_PROPERTY_LABEL = "Хөрөнгө (харах эрхгүй)";
