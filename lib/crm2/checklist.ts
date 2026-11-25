import { CHECKLIST_GROUPS, MISSING_ITEM_LABEL, type Crm2ChecklistGroup, type Crm2FieldStage } from "@/lib/crm2/labels";

/**
 * Staff хөрөнгийн «шалгах жагсаалт» (P3) ба «Дараагийн алхам» — цэвэр модуль (сервер, клиент, тест).
 * DB-ийн дүрмийг давхардуулж харуулна; эцсийн шалгалт DB дээр:
 *   activationMissing        ≙ crm2_property_missing (20261124000300)
 *   contractRegisterMissing  ≙ crm2_brokerage_missing (20261125000100 — гэрээ бүртгэх)
 *   hasValidContract         ≙ crm2_property_has_valid_contract (20261125000100)
 *   publishMissing           ≙ crm2_publish_blockers (20261124000600) — төлөв ба гэрээнээс бусад
 * Гэрээг батлахгүй: агент PMC-ийн тамга, гарын үсэгтэй PDF-ээр бүртгэмэгц хүчинтэй болж, хөрөнгийн
 * мэдээлэл бүрэн бол хөрөнгө автоматаар идэвхжинэ.
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
  /** Төлөв сүүлд өөрчлөгдсөн агшин — «гэрээ дууссан» хөрөнгийн автомат идэвхжүүлэлтэд (autoActivates). */
  status_changed_at?: string | null;
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
  /** Хуучин урсгалаар батлагдсан огноо. */
  approved_at: string | null;
  /** Бүртгэсэн огноо (20261125000100). Хүчинтэй гэрээ = active ба (approved_at эсвэл registered_at). */
  registered_at: string | null;
  /** «PMC-ийн тамга, гарын үсэгтэй»-г агент бүртгэхдээ баталгаажуулсан (шинэ дүрмээр шилжүүлсэнд false). */
  stamp_confirmed: boolean;
  /** Гэрээний эзэн; null бол DB хөрөнгийн эзнийг (crm2_property_private) авна. */
  owner_contact_id: string | null;
  /** Гэрээний (эсвэл хөрөнгийн) эзний нэр баталгаажаагүй. */
  ownerNameUnverified: boolean;
  ownerSource: string | null;
  /** kind='contract' ба application/pdf файлын тоо (DB нэгээс олныг зөвшөөрөхгүй). */
  pdfCount: number;
  /** kind='contract' боловч PDF биш (хуучин зураг) — устгатал бүртгэхгүй ('file_not_pdf'). */
  nonPdfContractCount: number;
  /**
   * kind='ownership' файлын тоо. null = мэдэгдэхгүй (restricted баримт харах эрхгүй — RLS нуудаг): 'ownership_doc'-ийг
   * дутуу гэж үзэхгүй, DB (crm2_brokerage_missing) өөрөө шалгана.
   */
  ownershipFileCount: number | null;
};

/** Шалгах жагсаалтад хэрэгтэй тохиргоо (crm2 тохиргооноос checklistSettings()-ээр). */
export type ChecklistSettings = {
  activationRequired: readonly string[];
  minImages: number;
  requireOwner: boolean;
  requireOwnershipDoc: boolean;
};

export type ChecklistInput = {
  property: ChecklistProperty;
  owner: ChecklistOwner;
  /** crm2_property_private.owner_pending тавигдсан (эзэн шийдвэрлэгдээгүй). */
  ownerPending: boolean;
  /** Үзүүлэх заавар (хувийн). 'hidden' = харах эрхгүй. */
  showingInstructions?: string | null | "hidden";
  /** Одоогийн гэрээ (хүчинтэй нь, эс бөгөөс сүүлийн ноорог); дууссан/цуцлагдсан бол null. */
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
  "brokerage.require_ownership_doc": boolean;
}): ChecklistSettings {
  return {
    activationRequired: s["property.activation_required"],
    minImages: s["property.min_images"],
    requireOwner: s["brokerage.require_owner"],
    requireOwnershipDoc: s["brokerage.require_ownership_doc"],
  };
}

/** Гэрээний файлын тоо (kind хоосон = 'contract'): PDF гэрээ, PDF биш гэрээ (хуучин зураг), өмчлөл, бусад. */
export type ContractFileCounts = { pdf: number; nonPdf: number; ownership: number; other: number };

export function countContractFiles(
  files: readonly { kind: string | null; mime_type?: string | null }[] | null | undefined
): ContractFileCounts {
  const out: ContractFileCounts = { pdf: 0, nonPdf: 0, ownership: 0, other: 0 };
  for (const f of files ?? []) {
    const kind = f.kind ?? "contract";
    if (kind === "contract") {
      if ((f.mime_type ?? "").toLowerCase() === "application/pdf") out.pdf++;
      else out.nonPdf++;
    } else if (kind === "ownership") out.ownership++;
    else out.other++;
  }
  return out;
}

// ── Гэрээний дуусах огноо (crm2_brokerage_register-тэй ижил) ─────────────────

/** Дуусах огноо бүртгэсэн өдрөөс хамгийн хол (сар) — «5 жилээс хол байж болохгүй». */
export const BROKERAGE_MAX_TERM_MONTHS = 60;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD + N сар (Postgres `date + interval 'N months'`: сарын сүүлийн өдрийг хавчина). */
export function addMonthsIso(day: string, months: number): string | null {
  const m = ISO_DAY.exec(day);
  if (!m || !Number.isFinite(months)) return null;
  const [y0, mo0, d0] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Буруу огноо (13-р сар, 2-р сарын 30 г.м.) → null.
  if (mo0 < 1 || mo0 > 12 || d0 < 1 || d0 > new Date(Date.UTC(y0, mo0, 0)).getUTCDate()) return null;
  const target = mo0 - 1 + Math.round(months);
  const y = y0 + Math.floor(target / 12);
  const mo = ((target % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, mo, Math.min(d0, last))).toISOString().slice(0, 10);
}

/** Бүртгэх үеийн дуусах огнооны дээд хязгаар (өнөөдөр + 60 сар). */
export function brokerageMaxEndDate(today: string): string {
  return addMonthsIso(today, BROKERAGE_MAX_TERM_MONTHS) ?? today;
}

/** Дуусах огнооны алдаа (null = зөв): өнөөдрөөс өмнө эсвэл 5 жилээс хол байж болохгүй. */
export function brokerageEndDateError(end: string | null | undefined, today: string): string | null {
  if (!end) return "Дуусах огноо оруулна уу.";
  if (addMonthsIso(end, 0) === null) return "Дуусах огноо буруу (ОООО-СС-ӨӨ).";
  if (end < today) return "Дуусах огноо өнөөдрөөс өмнө байж болохгүй.";
  if (end > brokerageMaxEndDate(today)) return "Дуусах огноо 5 жилээс хол байж болохгүй.";
  return null;
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
  contract_draft: "Гэрээ (PMC тамгатай PDF) бүртгэх",
  file_not_pdf: "Гэрээний зураг файлыг устгах (гэрээ зөвхөн PDF)",
  brokerage_contract: "Бүртгэгдсэн, хүчинтэй зуучлалын гэрээ",
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
  // Гэрээ (20261125000100: PDF + дуусах огноо + тамганы тэмдэглэгээ)
  contract_draft: "file",
  brokerage_contract: null,
  file: "file",
  file_not_pdf: "file",
  stamp_unconfirmed: "stamp_confirmed",
  ownership_doc: "ownership_doc",
  end_date_past: "end_date",
};

const CONTRACT_KEYS = new Set([
  "contract_draft",
  "end_date",
  "end_date_past",
  "file",
  "file_not_pdf",
  "stamp_unconfirmed",
  "ownership_doc",
  "brokerage_contract",
]);

function targetOf(key: string): ChecklistTarget {
  const sheet: ChecklistSheet = CONTRACT_KEYS.has(key) ? "contract" : (SHEET_OF[key] ?? "details");
  const field = key in FIELD_OF ? FIELD_OF[key] : key;
  return { sheet, field };
}

// ── DB-ийн толь ────────────────────────────────────────────────────────────

/** crm2_property_has_valid_contract: бүртгэгдсэн (эсвэл хуучин урсгалаар батлагдсан), өнөөдөр хүчинтэй гэрээ. */
export function hasValidContract(input: ChecklistInput): boolean {
  const c = input.contract;
  const today = input.today ?? todayUb();
  if (!c || c.status !== "active") return false;
  if (!c.approved_at && !c.registered_at) return false;
  return !!c.start_date && !!c.end_date && c.start_date <= today && c.end_date >= today;
}

/** Гэрээ хөрөнгийн төлөв сүүлд өөрчлөгдсөнөөс хойш (эсвэл тэр агшинд) бүртгэгдсэн эсэх. */
export function registeredSinceStatusChange(registeredAt: string | null | undefined, statusChangedAt: string | null | undefined): boolean {
  const r = Date.parse(registeredAt ?? "");
  const s = Date.parse(statusChangedAt ?? "");
  return Number.isFinite(r) && Number.isFinite(s) && r >= s;
}

/**
 * crm2_property_try_activate-ийн автомат замын дүрэм: бүртгэгдсэн (хүчинтэй) гэрээтэй хөрөнгийг мэдээлэл
 * нөхөгдөхөд DB өөрөө идэвхжүүлэх эсэх. Ноорог — тийм; «гэрээ дууссан» — тэр төлөвт орсноос хойш гэрээ
 * (сунгалт) бүртгэгдсэн бол л (хүчинтэй гэрээтэй байхад гараар дуусгасныг сэргээхгүй).
 */
export function autoActivates(
  property: { status: PropertyStatus; status_changed_at?: string | null },
  contract: { status: BrokerageStatus; registered_at: string | null } | null
): boolean {
  if (!contract || contract.status !== "active") return false;
  if (property.status === "draft") return true;
  return property.status === "contract_ended" && registeredSinceStatusChange(contract.registered_at, property.status_changed_at);
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

/** Гэрээгүй үед: хөрөнгийн эзэнтэй хоосон ноорог (бүртгэхэд DB хөрөнгийн эзнийг гэрээнд хуулна). */
function virtualDraft(input: ChecklistInput): ChecklistContract {
  const o = input.owner;
  const owner = o && o !== "hidden" ? o : null;
  return {
    status: "draft",
    start_date: null,
    end_date: null,
    approved_at: null,
    registered_at: null,
    stamp_confirmed: false,
    owner_contact_id: null,
    ownerNameUnverified: owner?.nameUnverified ?? false,
    ownerSource: owner?.source ?? null,
    pdfCount: 0,
    nonPdfContractCount: 0,
    ownershipFileCount: 0,
  };
}

/**
 * Гэрээний эзэн (DB: coalesce(гэрээний эзэн, хөрөнгийн эзэн)). Хувийн талбар харах эрхгүй бол 'hidden' —
 * эзэн байгаа эсэхийг үнэлэхгүй (DB өөрөө шалгана).
 */
function contractOwner(input: ChecklistInput, c: ChecklistContract): string | null {
  if (c.owner_contact_id) return c.owner_contact_id;
  const o = input.owner;
  if (o === "hidden") return "hidden";
  return o?.id ?? null;
}

/**
 * crm2_brokerage_missing-ийн толь (20261125000100): ноорог гэрээг бүртгэхэд дутуу зүйлс, DB-ийн дарааллаар.
 * Гэрээгүй бол хоосон ноорогт юу дутахыг буцаана. «PMC-ийн тамга, гарын үсэгтэй» тэмдэглэгээ (UI-ийн
 * төлөв) энд орохгүй — RPC p_stamp_confirmed-гүй бол 'stamp_unconfirmed'-ийг нэмнэ.
 *   end_date_past → owner (brokerage.require_owner) → owner_name → file (PDF алга) →
 *   file_not_pdf (kind='contract' зураг) → ownership_doc (brokerage.require_ownership_doc).
 * Хоосон дуусах огноо (гэрээгүй, сунгалтын ноорог) дутуу БИШ: «Гэрээ бүртгэх» цонх анхдагчаар бөглөж,
 * RPC ч coalesce(p_end_date, ноорогийнх, өнөөдөр + brokerage.default_term_months − 1)-ээр тавина —
 * DB-ийн 'end_date' бүртгэлийн үед хэзээ ч гарахгүй. Цонхны хоосолсон огноог contractMissing шалгана.
 * Өмчлөлийн баримтын тоо мэдэгдэхгүй (null — restricted харах эрхгүй) бол DB шалгана.
 */
export function contractRegisterMissing(input: ChecklistInput): string[] {
  const c = input.contract ?? virtualDraft(input);
  const s = input.settings;
  const today = input.today ?? todayUb();
  const out: string[] = [];
  if (c.end_date && c.end_date < today) out.push("end_date_past");
  const owner = contractOwner(input, c);
  if (s.requireOwner && !owner) out.push("owner");
  if (owner && owner !== "hidden" && c.ownerNameUnverified) out.push("owner_name");
  if (c.pdfCount === 0) out.push("file");
  if (c.nonPdfContractCount > 0) out.push("file_not_pdf");
  if (s.requireOwnershipDoc && c.ownershipFileCount === 0) out.push("ownership_doc");
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
  const intakeKeys = [...s.activationRequired.filter((k) => k !== "contract_agent_id"), ...coreIntakeKeys(input)];
  const owner = input.owner;
  if (owner && owner !== "hidden" && owner.nameUnverified) intakeKeys.push("owner_name");
  for (const key of intakeKeys) {
    if (skip(key)) continue;
    push(makeItem(input, key, "intake", itemFilled(key, input), required.has(key), required.has(key) ? "start" : null));
  }

  // 2. Гэрээ: (гэрээгүй бол «бүртгэх») → бүртгэхэд хэрэгтэй зүйлс → гэрээ байгуулсан агент → хүчинтэй гэрээ.
  const c = input.contract;
  const registerMissing = contractRegisterMissing(input);
  // Бүртгэгдсэн (active) гэрээнд бүртгэлийн шаардлага биелсэн — хуучин гэрээний зургийг дутуу гэж тооцохгүй.
  const missingC = new Set(c && c.status === "active" ? [] : registerMissing);
  if (!c) push(makeItem(input, "contract_draft", "contract", false, true, "contract"));
  for (const key of contractRegisterKeys(input, missingC)) {
    push(makeItem(input, key, "contract", !missingC.has(key), true, "contract"));
  }
  push(makeItem(input, "contract_agent_id", "contract", input.property.contract_agent_id != null, required.has("contract_agent_id"), "contract"));
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

/**
 * Гэрээний бүлэгт харуулах бүртгэлийн мөрүүд (contractRegisterMissing-ийн дарааллаар): дуусах огноо, эзэн
 * (тохиргоогоор), PDF, өмчлөлийн баримт (тохиргоогоор) үргэлж; эзний нэр ба PDF биш файл зөвхөн дутуу үед.
 */
function contractRegisterKeys(input: ChecklistInput, missing: ReadonlySet<string>): string[] {
  const s = input.settings;
  const keys = [missing.has("end_date_past") ? "end_date_past" : "end_date"];
  if (s.requireOwner) keys.push("owner");
  if (missing.has("owner_name")) keys.push("owner_name");
  keys.push("file");
  if (missing.has("file_not_pdf")) keys.push("file_not_pdf");
  // Тоо нь мэдэгдэхгүй (restricted харах эрхгүй) бол мөрийг харуулахгүй — «бүрэн» гэж хуурахгүй.
  if (s.requireOwnershipDoc && (input.contract === null || input.contract.ownershipFileCount !== null)) keys.push("ownership_doc");
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
  // Гэрээгүй эсвэл ноорог: «Гэрээ бүртгэх» (PDF эхэнд — гол алхам).
  if (!c || c.status !== "active") {
    const missing = contractRegisterMissing(input);
    const n = missing.length + (c ? 0 : 1);
    const first = missing.find((k) => k === "file" || k === "file_not_pdf") ?? missing[0];
    return {
      label: n > 0 ? `Гэрээ бүртгэх (${n})` : "Гэрээ бүртгэх",
      group: "contract",
      missingCount: n,
      target: { sheet: "contract", field: first ? targetOf(first).field : "file" },
    };
  }
  // Гэрээ бүртгэгдсэн ч хөрөнгө ноорог (эсвэл сунгалт бүртгэгдсэн «гэрээ дууссан»): мэдээллээ нөхмөгц DB
  // автоматаар идэвхжүүлнэ.
  if (autoActivates(p, c)) {
    const gaps = activationMissing(input).filter((k) => k !== "brokerage_contract");
    if (gaps.length > 0) {
      return {
        label: `Хөрөнгийн мэдээллийг гүйцээх (${gaps.length})`,
        group: CONTRACT_KEYS.has(gaps[0]) || gaps[0] === "contract_agent_id" ? "contract" : "intake",
        missingCount: gaps.length,
        target: targetOf(gaps[0]),
      };
    }
    // Бүрэн ч идэвхжээгүй (ховор — автомат идэвхжүүлэлт гацсан).
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
