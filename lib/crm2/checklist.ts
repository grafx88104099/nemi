import { CHECKLIST_GROUPS, MISSING_ITEM_LABEL, type Crm2ChecklistGroup, type Crm2FieldStage } from "@/lib/crm2/labels";

/**
 * Staff хөрөнгийн «шалгах жагсаалт» (P3) ба «Дараагийн алхам» — цэвэр модуль (сервер, клиент, тест).
 * DB-ийн дүрмийг давхардуулж харуулна; эцсийн шалгалт DB дээр:
 *   activationMissing      ≙ crm2_property_missing (20261124000300)
 *   contractSubmitMissing  ≙ crm2_brokerage_missing (20261124000300)
 *   publishMissing         ≙ crm2_publish_blockers (20261124000600) — төлөв ба гэрээнээс бусад
 * Оролт (ChecklistInput) нь өөрийн тодорхой төрөлтэй — DB-ийн мөрийн төрлөөс хамаарахгүй, дуудагч
 * (queries/checklist.ts) мөрөөс угсарна.
 */

// ── DB-тэй ИЖИЛ жагсаалт (staff-migrations.test.ts текстээр нь уншиж харьцуулна) ──────────

/** crm2_properties.unconfirmed-д орж болох түлхүүр (20261124000100 crm2_properties_unconfirmed_chk). */
export const UNCONFIRMABLE_KEYS = [
  "category", "property_type", "project", "district", "location_text", "lat", "area_m2", "rooms", "floor",
  "building_floors", "price", "currency", "price_period", "price_basis", "year_in_use", "features",
  "parking_spaces", "rent_advance_months", "rent_deposit_months", "advantages", "notes", "available_from",
  "listing_agent_id", "contract_agent_id", "photo_agent_id",
] as const;
export type UnconfirmableKey = (typeof UNCONFIRMABLE_KEYS)[number];

/** Нийтлэхээс өмнө баталгаажуулах түлхүүр (20261124000600 crm2_publish_confirm_keys, дараалал ч ижил). */
export const PUBLISH_CONFIRM_KEYS = [
  "category", "property_type", "project", "district", "location_text", "lat", "area_m2", "rooms", "floor",
  "building_floors", "price", "currency", "price_period", "price_basis", "year_in_use", "features",
  "parking_spaces", "rent_advance_months", "rent_deposit_months", "advantages", "available_from",
] as const;

export function isUnconfirmableKey(key: string): key is UnconfirmableKey {
  return (UNCONFIRMABLE_KEYS as readonly string[]).includes(key);
}

// ── Оролт ──────────────────────────────────────────────────────────────────

type Category = "rent" | "lease" | "managed_rent" | "sale";
type PropertyStatus = "draft" | "active" | "suspended" | "rented" | "sold" | "contract_ended" | "archived";
type BrokerageStatus = "draft" | "pending" | "active" | "expired" | "terminated";
type PricePeriod = "total" | "month" | "day";

export type ChecklistProperty = {
  category: Category | null;
  property_type: string | null;
  project_id: string | null;
  district: string | null;
  location_text: string | null;
  /** Хувийн биш ч зөвхөн үүрэгт агентад харагддаг. */
  address_detail?: string | null;
  lat: number | null;
  area_m2: number | null;
  rooms: number | null;
  floor: number | null;
  building_floors: number | null;
  year_in_use?: number | null;
  price: number | null;
  price_total: number | null;
  currency: string | null;
  price_period: PricePeriod | null;
  listing_agent_id: string | null;
  contract_agent_id: string | null;
  photo_agent_id: string | null;
  last_verified_at: string | null;
  unconfirmed: readonly string[] | null;
  status: PropertyStatus;
  listing_id: string | null;
  source_listing_id: string | null;
  published_at: string | null;
  // Нийтийн бичвэр (зар, карт).
  advantages?: string | null;
  condition?: string | null;
  view_note?: string | null;
  availability_note?: string | null;
  features: readonly string[] | null;
};

/** Эзэн: холбогдсон харилцагч, байхгүй (null), эсвэл харах эрхгүй ('hidden'). */
export type ChecklistOwner = { id: string; nameUnverified: boolean; source: string | null } | null | "hidden";

export type ChecklistContract = {
  status: BrokerageStatus;
  start_date: string | null;
  end_date: string | null;
  /** Батлагдсан огноо (crm2_property_has_valid_contract approved_at шаардана). Өгөхгүй бол status='active'-ийг батлагдсан гэж үзнэ. */
  approved_at?: string | null;
  commission_type: string | null;
  commission_value: number | null;
  owner_contact_id: string | null;
  ownerNameUnverified: boolean;
  ownerSource: string | null;
  terms: string | null;
  no_special_terms: boolean;
  signer_differs: boolean;
  signer_note: string | null;
  prefilled: readonly string[];
  /** kind='contract' файлын тоо (ноорогт зөвхөн эдгээр тооцогдоно). */
  fileCount: number;
  /** kind='ownership' файлын тоо (харах эрхгүй бол 0 — DB-ээс тоогоор нь авна). */
  ownershipFileCount: number;
  /** kind='id' | 'other' файлын тоо (илгээсэн/батлагдсан гэрээнд аль ч файл тооцогдоно). */
  otherFileCount?: number;
  /** «Гэрээ оффист үлдсэн» — зөвхөн сануулга; 'file'-ийг ХЭЗЭЭ Ч хангахгүй. */
  file_at_office: boolean;
};

/** Шалгах жагсаалтад хэрэгтэй тохиргоо (crm2 тохиргооноос checklistSettings()-ээр). */
export type ChecklistSettings = {
  activationRequired: readonly string[];
  minImages: number;
  requireOwner: boolean;
  requireFile: boolean;
  requireSpecialTerms: boolean;
  requireOwnershipDoc: boolean;
  activationMode: "auto" | "manual";
};

export type ChecklistInput = {
  property: ChecklistProperty;
  owner: ChecklistOwner;
  /** crm2_property_private.owner_pending тавигдсан (эзэн шийдвэрлэгдээгүй). */
  ownerPending: boolean;
  /** Үзүүлэх заавар (хувийн). 'hidden' = харах эрхгүй. */
  showingInstructions?: string | null | "hidden";
  /** Одоогийн гэрээ (сүүлийн ноорог/илгээсэн/батлагдсан); дууссан/цуцлагдсан бол null. */
  contract: ChecklistContract | null;
  imageCount: number;
  /** Хөрөнгө авчирсан агент nemi.mn-д идэвхтэй нийтийн бүртгэлтэй (agents.status='active'). */
  listingAgentPublic: boolean;
  settings: ChecklistSettings;
  /** findPublicTextRisks()-ийн үр дүн (нийтийн бичвэр дэх 'phone' | 'unit_no' | 'door_code'). */
  publicTextRisks: readonly string[];
  /** УБ-ын өнөөдөр (YYYY-MM-DD); өгөхгүй бол системийн цагаар. */
  today?: string;
};

/** Тохиргооны объектоос (Crm2SettingValues) шалгах жагсаалтын хэсгийг авна. */
export function checklistSettings(s: {
  "property.activation_required": readonly string[];
  "property.min_images": number;
  "brokerage.require_owner": boolean;
  "brokerage.require_file": boolean;
  "brokerage.require_special_terms": boolean;
  "brokerage.require_ownership_doc": boolean;
  "brokerage.activation_mode": "auto" | "manual";
}): ChecklistSettings {
  return {
    activationRequired: s["property.activation_required"],
    minImages: s["property.min_images"],
    requireOwner: s["brokerage.require_owner"],
    requireFile: s["brokerage.require_file"],
    requireSpecialTerms: s["brokerage.require_special_terms"],
    requireOwnershipDoc: s["brokerage.require_ownership_doc"],
    activationMode: s["brokerage.activation_mode"],
  };
}

// ── Гаралт ─────────────────────────────────────────────────────────────────

/** Карт дээр нээх доод цонх (?sheet=...). 'publish' = нийтлэх хэсэг, 'checklist' = бүх жагсаалт. */
export type ChecklistSheet =
  | "location"
  | "size"
  | "price"
  | "roles"
  | "owner"
  | "details"
  | "photos"
  | "confirm"
  | "contract"
  | "publish"
  | "checklist";

export type ChecklistTarget = { sheet: ChecklistSheet; field: string | null };

export type ChecklistItem = {
  key: string;
  group: Crm2ChecklistGroup;
  label: string;
  done: boolean;
  /** Дараагийн шат руу шилжихэд заавал. */
  required: boolean;
  /** Утга байгаа ч автоматаар бөглөгдөж баталгаажаагүй («автомат» шошго). */
  auto: boolean;
  stage: Crm2FieldStage | null;
  target: ChecklistTarget;
};

export type ChecklistGroupView = { group: Crm2ChecklistGroup; items: ChecklistItem[]; done: number; total: number };

export type Checklist = { groups: ChecklistGroupView[]; percent: number };

export type NextStep = {
  label: string;
  group: Crm2ChecklistGroup | null;
  missingCount: number;
  target: ChecklistTarget;
};

// ── Туслах ─────────────────────────────────────────────────────────────────

const blank = (s: string | null | undefined) => !s || s.trim() === "";
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const todayUb = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

function unconfirmedSet(p: ChecklistProperty): Set<string> {
  return new Set(p.unconfirmed ?? []);
}

/** Нийтэд гарах баталгаажаагүй түлхүүрүүд (PUBLISH_CONFIRM_KEYS-ийн дарааллаар). */
export function unconfirmedPublicKeys(p: ChecklistProperty): string[] {
  const u = unconfirmedSet(p);
  return PUBLISH_CONFIRM_KEYS.filter((k) => u.has(k));
}

/** Шалгах жагсаалтын мөрийн түлхүүр → unconfirmed-ийн түлхүүрүүд. */
const ITEM_UNCONFIRMED: Record<string, readonly string[]> = {
  pin: ["lat"],
  price: ["price", "currency", "price_period", "price_basis"],
  price_period: ["price_period"],
};
function unconfirmedFor(key: string): readonly string[] {
  return ITEM_UNCONFIRMED[key] ?? (isUnconfirmableKey(key) ? [key] : []);
}

/** Мөрийн нэр (эерэг хэлбэрээр). Бусад нь MISSING_ITEM_LABEL. */
const ITEM_LABEL: Record<string, string> = {
  category: "Ангилал",
  price_period: "Ангилалд тохирох үнийн хугацаа",
  owner_pending: "Эзнийг шалгах",
  last_verified_at: "Эзэнтэй мэдээлэл тулгасан",
  features: "Онцлог",
  building_floors: "Барилгын давхар",
  contract_draft: "Гэрээний ноорог үүсгэх",
  contract_submitted: "Гэрээг батлуулахаар илгээх",
  brokerage_contract: "Батлагдсан, хүчинтэй зуучлалын гэрээ",
  publish_currency: "Үнэ төгрөгөөр (MNT)",
  publish_period: "Нийтлэх үнийн хугацаа (худалдах — нийт, түрээс — сар)",
  publish_price: "Үнэ (0-ээс их)",
  publish_district: "Дүүрэг",
  publish_area: "Талбай (0-ээс их)",
  publish_images: "Нийтлэх зураг",
  agent_public: "Хөрөнгө авчирсан агентын nemi.mn профайл идэвхтэй",
  publish_unconfirmed: "Автомат утгыг баталгаажуулах",
  public_text_phone: "Нийтийн бичвэрт утасны дугаар байхгүй",
  public_text_private: "Нийтийн бичвэрт тоот, хаалганы код байхгүй",
  unconfirmed: "Автомат утгыг баталгаажуулах",
};

function itemLabel(key: string, input?: ChecklistInput): string {
  if (key === "images" && input && input.settings.minImages > 1) return `Зураг (дор хаяж ${input.settings.minImages})`;
  if (key === "publish_images" && input) return input.settings.minImages > 0 ? `Нийтлэх зураг (дор хаяж ${input.settings.minImages})` : "Нийтлэх зураг";
  return ITEM_LABEL[key] ?? cap(MISSING_ITEM_LABEL[key] ?? key);
}

const SHEET_OF: Record<string, ChecklistSheet> = {
  category: "details",
  property_type: "details",
  features: "details",
  project: "location",
  district: "location",
  location_text: "location",
  address_detail: "location",
  pin: "location",
  area_m2: "size",
  rooms: "size",
  floor: "size",
  building_floors: "size",
  year_in_use: "size",
  price: "price",
  price_period: "price",
  last_verified_at: "price",
  listing_agent_id: "roles",
  photo_agent_id: "roles",
  contract_agent_id: "contract",
  owner: "owner",
  owner_source: "owner",
  owner_name: "owner",
  owner_pending: "owner",
  showing_instructions: "owner",
  images: "photos",
  unconfirmed: "confirm",
  publish_currency: "price",
  publish_period: "price",
  publish_price: "price",
  publish_district: "location",
  publish_area: "size",
  publish_images: "photos",
  publish_unconfirmed: "confirm",
  agent_public: "publish",
  public_text_phone: "details",
  public_text_private: "details",
};

/** Мөр → талбар (картын доод цонхонд фокуслах). */
const FIELD_OF: Record<string, string | null> = {
  pin: "lat",
  project: "project_id",
  owner: "owner",
  owner_source: "owner.source",
  owner_name: "owner.full_name",
  owner_pending: "owner",
  images: null,
  unconfirmed: null,
  publish_currency: "currency",
  publish_period: "price_period",
  publish_price: "price",
  publish_district: "district",
  publish_area: "area_m2",
  publish_images: null,
  publish_unconfirmed: null,
  agent_public: null,
  public_text_phone: "advantages",
  public_text_private: "advantages",
  // Гэрээ
  contract_draft: null,
  contract_submitted: null,
  brokerage_contract: null,
  commission: "commission_value",
  file: "file",
  special_terms: "terms",
  signer_authority: "signer_note",
  defaults_unconfirmed: "prefilled",
  ownership_doc: "ownership_doc",
  role_unconfirmed: "contract_agent_id",
  end_date_past: "end_date",
};

const CONTRACT_KEYS = new Set([
  "contract_draft",
  "start_date",
  "end_date",
  "end_date_past",
  "commission",
  "file",
  "special_terms",
  "signer_authority",
  "defaults_unconfirmed",
  "ownership_doc",
  "role_unconfirmed",
  "contract_submitted",
  "brokerage_contract",
]);

function targetOf(key: string): ChecklistTarget {
  const sheet: ChecklistSheet = CONTRACT_KEYS.has(key) ? "contract" : (SHEET_OF[key] ?? "details");
  const field = key in FIELD_OF ? FIELD_OF[key] : key;
  return { sheet, field };
}

// ── DB-ийн толь ────────────────────────────────────────────────────────────

/** crm2_property_has_valid_contract: батлагдсан, өнөөдөр хүчинтэй гэрээ. */
export function hasValidContract(input: ChecklistInput): boolean {
  const c = input.contract;
  const today = input.today ?? todayUb();
  if (!c || c.status !== "active") return false;
  if (c.approved_at === null) return false;
  return !!c.start_date && !!c.end_date && c.start_date <= today && c.end_date >= today;
}

/** Ангилалд үнийн хугацаа таарахгүй (crm2_property_missing 'price_period'). */
export function pricePeriodMismatch(category: Category | null, period: PricePeriod | null): boolean {
  if (!category || !period) return false;
  return (category === "sale" && period !== "total") || ((category === "rent" || category === "managed_rent") && period === "total");
}

/** Нэг идэвхжүүлэх шаардлага дутуу эсэх (crm2_property_missing-ийн CASE). Мэдэгдэхгүй түлхүүр → false. */
function activationItemMissing(key: string, input: ChecklistInput): boolean {
  const p = input.property;
  const o = input.owner;
  const hidden = o === "hidden";
  switch (key) {
    case "project":
      return p.project_id == null;
    case "district":
      return p.district == null;
    case "location_text":
      return blank(p.location_text);
    case "address_detail":
      return p.address_detail !== undefined && blank(p.address_detail);
    case "pin":
      return p.lat == null;
    case "area_m2":
      return p.area_m2 == null;
    case "rooms":
      return p.rooms == null;
    case "floor":
      return p.floor == null;
    case "price":
      return p.price == null;
    case "year_in_use":
      return p.year_in_use === null;
    case "property_type":
      return p.property_type == null;
    case "listing_agent_id":
      return p.listing_agent_id == null;
    case "contract_agent_id":
      return p.contract_agent_id == null;
    case "photo_agent_id":
      return p.photo_agent_id == null;
    // Хувийн талбарыг харах эрхгүй бол үнэлэхгүй (засаж чадахгүй — DB өөрөө шалгана).
    case "owner":
      return !hidden && o == null;
    case "owner_source":
      return !hidden && (o == null || o.source == null);
    case "owner_name":
      return !hidden && (o == null || o.nameUnverified);
    case "showing_instructions":
      return input.showingInstructions !== "hidden" && input.showingInstructions !== undefined && blank(input.showingInstructions);
    case "images":
      return input.imageCount < input.settings.minImages;
    case "unconfirmed":
      return unconfirmedPublicKeys(p).length > 0;
    default:
      return false;
  }
}

/** crm2_property_missing-ийн толь: идэвхжүүлэхэд дутуу зүйлсийн код (DB-ийн дарааллаар). */
export function activationMissing(input: ChecklistInput): string[] {
  const out: string[] = [];
  for (const req of input.settings.activationRequired) if (activationItemMissing(req, input)) out.push(req);
  if (pricePeriodMismatch(input.property.category, input.property.price_period)) out.push("price_period");
  if (!hasValidContract(input)) out.push("brokerage_contract");
  return out;
}

/** Гэрээгүй үед: хөрөнгийн эзэнтэй хоосон ноорог (crm2_private_owner_to_drafts эзнийг хуулна). */
function virtualDraft(input: ChecklistInput): ChecklistContract {
  const o = input.owner;
  const owner = o && o !== "hidden" ? o : null;
  return {
    status: "draft",
    start_date: null,
    end_date: null,
    commission_type: null,
    commission_value: null,
    owner_contact_id: owner?.id ?? (o === "hidden" ? "hidden" : null),
    ownerNameUnverified: owner?.nameUnverified ?? false,
    ownerSource: owner?.source ?? null,
    terms: null,
    no_special_terms: false,
    signer_differs: false,
    signer_note: null,
    prefilled: [],
    fileCount: 0,
    ownershipFileCount: 0,
    otherFileCount: 0,
    file_at_office: false,
  };
}

/**
 * crm2_brokerage_missing-ийн толь: гэрээг илгээх/батлахад дутуу зүйлс. Гэрээгүй бол хоосон ноорогт
 * юу дутахыг буцаана. 'file' — «гэрээ оффист үлдсэн» (file_at_office) үүнийг ХЭЗЭЭ Ч хангахгүй;
 * ноорогт зөвхөн kind='contract' файл тооцогдоно. Эзний эх сурвалжийг DB гэрээн дээр шаарддаггүй
 * (property.activation_required 'owner_source'-оор «Бүртгэл» бүлэгт).
 */
export function contractSubmitMissing(input: ChecklistInput): string[] {
  const c = input.contract ?? virtualDraft(input);
  const s = input.settings;
  const today = input.today ?? todayUb();
  const out: string[] = [];
  if (!c.start_date) out.push("start_date");
  if (!c.end_date) out.push("end_date");
  else if (c.end_date < today) out.push("end_date_past");
  if (!c.commission_type || c.commission_value == null) out.push("commission");
  if (s.requireOwner && !c.owner_contact_id) out.push("owner");
  const files = c.status === "draft" ? c.fileCount : c.fileCount + c.ownershipFileCount + (c.otherFileCount ?? 0);
  if (s.requireFile && files === 0) out.push("file");
  if (c.status === "draft") {
    if (c.owner_contact_id && c.ownerNameUnverified) out.push("owner_name");
    if (s.requireSpecialTerms && blank(c.terms) && !c.no_special_terms) out.push("special_terms");
    if (c.signer_differs && blank(c.signer_note)) out.push("signer_authority");
    if (c.prefilled.length > 0) out.push("defaults_unconfirmed");
    if (s.requireOwnershipDoc && c.ownershipFileCount === 0) out.push("ownership_doc");
    const p = input.property;
    if (p.contract_agent_id == null || unconfirmedSet(p).has("contract_agent_id")) out.push("role_unconfirmed");
  }
  return out;
}

/** Нийтлэх саад (crm2_publish_blockers − төлөв, гэрээ) — шалгах жагсаалтын түлхүүрээр. */
export function publishMissing(input: ChecklistInput): string[] {
  const p = input.property;
  const out: string[] = [];
  if ((p.currency ?? "MNT") !== "MNT") out.push("publish_currency");
  const want: PricePeriod = p.category === "sale" ? "total" : "month";
  if (p.price_period !== want) out.push("publish_period");
  if ((p.price_total ?? 0) <= 0) out.push("publish_price");
  if (p.district == null) out.push("publish_district");
  if ((p.area_m2 ?? 0) <= 0) out.push("publish_area");
  if (input.imageCount < Math.max(input.settings.minImages, 0)) out.push("publish_images");
  if (!input.listingAgentPublic) out.push("agent_public");
  if (unconfirmedPublicKeys(p).length > 0) out.push("publish_unconfirmed");
  if (input.publicTextRisks.includes("phone")) out.push("public_text_phone");
  return out;
}

// ── Шат (маягтын шошго) ────────────────────────────────────────────────────

/** Маягт дээрх талбар хэзээ хэрэгтэй болох: эхлэх (идэвхжүүлэх), гэрээ, нийтлэх эсвэл null. */
export function fieldStage(key: string, settings: Pick<ChecklistSettings, "activationRequired" | "requireOwner">): Crm2FieldStage | null {
  const k = key === "lat" || key === "lng" ? "pin" : key === "project_id" ? "project" : key;
  if (k === "category" || k === "price_period") return "start";
  if (k === "contract_agent_id") return "contract";
  if (settings.activationRequired.includes(k)) return "start";
  if (k === "owner" && settings.requireOwner) return "contract";
  if (k === "district" || k === "area_m2" || k === "price" || k === "currency" || k === "images") return "publish";
  return null;
}

// ── Шалгах жагсаалт ────────────────────────────────────────────────────────

const ROOM_TYPES = new Set(["apartment", "house", "office"]);
const FLOOR_TYPES = new Set(["apartment", "office", "commercial"]);

/** «Бүртгэл» бүлгийн үндсэн мөрүүд (идэвхжүүлэх шаардлагагүй ч харуулна). */
function coreIntakeKeys(input: ChecklistInput): string[] {
  const t = input.property.property_type;
  const keys = ["property_type", "location_text", "district", "area_m2"];
  if (!t || ROOM_TYPES.has(t)) keys.push("rooms");
  if (!t || FLOOR_TYPES.has(t)) keys.push("floor");
  keys.push("price", "owner", "owner_source", "listing_agent_id");
  return keys;
}

const EXTRA_KEYS = [
  "project",
  "pin",
  "address_detail",
  "building_floors",
  "year_in_use",
  "features",
  "photo_agent_id",
  "showing_instructions",
  "last_verified_at",
];

/** Мөр дууссан эсэх (шаардлагагүй мөрүүдэд ч). */
function itemFilled(key: string, input: ChecklistInput): boolean {
  const p = input.property;
  switch (key) {
    case "category":
      return p.category != null;
    case "price_period":
      return !pricePeriodMismatch(p.category, p.price_period);
    case "building_floors":
      return p.building_floors != null;
    case "features":
      return (p.features?.length ?? 0) > 0;
    case "last_verified_at":
      return p.last_verified_at != null;
    case "address_detail":
      return !blank(p.address_detail);
    case "year_in_use":
      return p.year_in_use != null;
    case "showing_instructions":
      return input.showingInstructions === "hidden" || !blank(input.showingInstructions);
    default:
      return !activationItemMissing(key, input);
  }
}

function makeItem(
  input: ChecklistInput,
  key: string,
  group: Crm2ChecklistGroup,
  done: boolean,
  required: boolean,
  stage: Crm2FieldStage | null
): ChecklistItem {
  const u = unconfirmedSet(input.property);
  const auto = unconfirmedFor(key).some((k) => u.has(k));
  return {
    key,
    group,
    label: itemLabel(key, input),
    // Баталгаажаагүй (автомат) утга дууссанд тооцогдохгүй.
    done: done && !auto,
    required,
    auto,
    stage,
    target: targetOf(key),
  };
}

/** Картын 4 бүлэгтэй шалгах жагсаалт ба гүйцэтгэлийн хувь. */
export function buildChecklist(input: ChecklistInput): Checklist {
  const s = input.settings;
  const seen = new Set<string>();
  const groups: Record<Crm2ChecklistGroup, ChecklistItem[]> = { intake: [], contract: [], publish: [], extra: [] };
  const push = (item: ChecklistItem) => {
    if (seen.has(item.key)) return;
    seen.add(item.key);
    groups[item.group].push(item);
  };
  const hiddenOwner = input.owner === "hidden";
  const ownerKeys = new Set(["owner", "owner_source", "owner_name", "owner_pending", "showing_instructions"]);
  const skip = (key: string) =>
    (hiddenOwner && ownerKeys.has(key)) || (key === "showing_instructions" && input.showingInstructions === "hidden");

  // 1. Бүртгэл
  if (input.ownerPending && !hiddenOwner) push(makeItem(input, "owner_pending", "intake", false, true, "start"));
  push(makeItem(input, "category", "intake", itemFilled("category", input), true, "start"));
  push(makeItem(input, "price_period", "intake", itemFilled("price_period", input), true, "start"));
  const required = new Set(s.activationRequired);
  const contractKeys = contractSubmitMissingKeysApplicable(input);
  const intakeKeys = [...s.activationRequired.filter((k) => k !== "contract_agent_id"), ...coreIntakeKeys(input)];
  const owner = input.owner;
  if (owner && owner !== "hidden" && owner.nameUnverified) intakeKeys.push("owner_name");
  for (const key of intakeKeys) {
    if (skip(key)) continue;
    push(makeItem(input, key, "intake", itemFilled(key, input), required.has(key), required.has(key) ? "start" : null));
  }

  // 2. Гэрээ
  const c = input.contract;
  const missingC = new Set(contractSubmitMissing(input));
  if (!c) push(makeItem(input, "contract_draft", "contract", false, true, "contract"));
  for (const key of contractKeys) {
    push(makeItem(input, key, "contract", !missingC.has(key), true, "contract"));
  }
  if (!contractKeys.includes("role_unconfirmed")) {
    push(makeItem(input, "contract_agent_id", "contract", input.property.contract_agent_id != null, required.has("contract_agent_id"), "contract"));
  }
  push(makeItem(input, "contract_submitted", "contract", c != null && c.status !== "draft", true, "contract"));
  push(makeItem(input, "brokerage_contract", "contract", hasValidContract(input), true, "contract"));

  // 3. Нийтлэхэд бэлэн (ноорог шатнаас харагдана)
  const pub = new Set(publishMissing(input));
  const twin: Record<string, string> = {
    publish_district: "district",
    publish_area: "area_m2",
    publish_images: "images",
    publish_unconfirmed: "unconfirmed",
  };
  for (const key of [
    "publish_currency",
    "publish_period",
    "publish_price",
    "publish_district",
    "publish_area",
    "publish_images",
    "agent_public",
    "publish_unconfirmed",
    "public_text_phone",
  ]) {
    // «Бүртгэл»-д ижил нөхцөлтэй заавал мөр байвал давхар харуулахгүй (publishMissing тоололд орсон хэвээр).
    if (twin[key] && required.has(twin[key])) continue;
    push(makeItem(input, key, "publish", !pub.has(key), true, "publish"));
  }
  if (input.publicTextRisks.some((r) => r === "unit_no" || r === "door_code")) {
    push(makeItem(input, "public_text_private", "publish", false, false, "publish"));
  }

  // 4. Нэмэлт
  for (const key of EXTRA_KEYS) {
    if (skip(key)) continue;
    push(makeItem(input, key, "extra", itemFilled(key, input), false, null));
  }

  const views: ChecklistGroupView[] = CHECKLIST_GROUPS.map((g) => ({
    group: g,
    items: groups[g],
    done: groups[g].filter((i) => i.done).length,
    total: groups[g].length,
  }));
  const req = views.flatMap((v) => v.items).filter((i) => i.required);
  const percent = req.length ? Math.round((100 * req.filter((i) => i.done).length) / req.length) : 100;
  return { groups: views, percent };
}

/** Гэрээний бүлэгт харуулах (тохиргоо, нөхцөлөөр хамаарах) мөрүүд. */
function contractSubmitMissingKeysApplicable(input: ChecklistInput): string[] {
  const s = input.settings;
  const c = input.contract ?? virtualDraft(input);
  const keys = ["start_date", "end_date", "commission"];
  if (c.end_date && c.end_date < (input.today ?? todayUb())) keys.splice(2, 0, "end_date_past");
  if (s.requireOwner) keys.push("owner");
  if (s.requireFile) keys.push("file");
  if (c.status === "draft") {
    if (c.owner_contact_id && c.ownerNameUnverified) keys.push("owner_name");
    if (s.requireSpecialTerms) keys.push("special_terms");
    if (c.signer_differs) keys.push("signer_authority");
    if (c.prefilled.length > 0) keys.push("defaults_unconfirmed");
    if (s.requireOwnershipDoc) keys.push("ownership_doc");
    keys.push("role_unconfirmed");
  }
  return keys;
}

// ── Дараагийн алхам ────────────────────────────────────────────────────────

const CLOSED_STATUSES = new Set<PropertyStatus>(["rented", "sold", "archived"]);

/** Шаардлагатай «Бүртгэл» мөрүүдээс дутуу нь (эзэн хүлээгдэж буйг оролцуулахгүй). */
export function intakeMissing(input: ChecklistInput): ChecklistItem[] {
  const intake = buildChecklist(input).groups.find((g) => g.group === "intake");
  return (intake?.items ?? []).filter((i) => i.required && !i.done && i.key !== "owner_pending");
}

/** Картын гарчгийн доорх нэг мөр «Дараагийн алхам». */
export function nextStep(input: ChecklistInput): NextStep {
  const p = input.property;
  const done: NextStep = { label: "Бүрэн", group: null, missingCount: 0, target: { sheet: "checklist", field: null } };
  if (CLOSED_STATUSES.has(p.status)) return done;

  if (input.ownerPending && input.owner !== "hidden") {
    return { label: "Эзнийг шалгах", group: "intake", missingCount: 1, target: targetOf("owner_pending") };
  }
  const intake = intakeMissing(input);
  if (intake.length > 0) {
    return {
      label: `Бүртгэл гүйцээх (${intake.length} зүйл дутуу)`,
      group: "intake",
      missingCount: intake.length,
      target: intake[0].target,
    };
  }
  const c = input.contract;
  const contractStep = (label: string): NextStep => {
    const missing = contractSubmitMissing(input);
    const n = missing.length + (c ? 0 : 1);
    return {
      label: n > 0 ? `${label} (${n})` : label,
      group: "contract",
      missingCount: n,
      target: { sheet: "contract", field: missing[0] ? targetOf(missing[0]).field : null },
    };
  };
  if (!c) return contractStep("Гэрээ байгуулах");
  if (c.status === "draft") return contractStep("Гэрээг батлуулахаар илгээх");
  if (c.status === "pending") {
    return { label: "Гэрээ батлагдахыг хүлээж байна", group: "contract", missingCount: 0, target: { sheet: "contract", field: null } };
  }
  // Батлагдсан ч хөрөнгө ноорог: гар горим, эсвэл автомат идэвхжүүлэлт гацсан.
  if (c.status === "active" && p.status === "draft") {
    return { label: "Хөрөнгийг идэвхжүүлэх", group: "contract", missingCount: 0, target: { sheet: "contract", field: null } };
  }
  if (p.status === "active") {
    const pub = publishMissing(input);
    if (pub.length > 0) {
      return { label: `Нийтлэхэд бэлдэх (${pub.length})`, group: "publish", missingCount: pub.length, target: targetOf(pub[0]) };
    }
    if (!p.published_at || !p.listing_id) {
      return { label: "Нийтлэх", group: "publish", missingCount: 0, target: { sheet: "publish", field: null } };
    }
  }
  return done;
}
