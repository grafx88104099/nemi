import type { Database, Json } from "@/types/database";

/**
 * CRM v2 (crm2_*) — дэлгэцүүдийн хуваалцах төрлүүд. Мөрийн төрлүүд
 * types/database.ts-ээс; энд зөвхөн богино нэр ба RPC-ийн jsonb хариуны хэлбэр.
 */

type Tables = Database["public"]["Tables"];
type Enums = Database["public"]["Enums"];
type Fns = Database["public"]["Functions"];

// ── Enum ────────────────────────────────────────────────────────────────────
export type Crm2PropertyCategory = Enums["crm2_property_category"];
export type Crm2PropertyStatus = Enums["crm2_property_status"];
export type Crm2PricePeriod = Enums["crm2_price_period"];
export type Crm2PriceBasis = Enums["crm2_price_basis"];
export type Crm2MediaKind = Enums["crm2_media_kind"];
export type Crm2BrokerageStatus = Enums["crm2_brokerage_status"];
export type Crm2CommissionType = Enums["crm2_commission_type"];
export type Crm2RecordStatus = Enums["crm2_record_status"];
export type Crm2DealStage = Enums["crm2_deal_stage"];
export type Crm2ActivityKind = Enums["crm2_activity_kind"];
export type Crm2ShowingStatus = Enums["crm2_showing_status"];
export type Crm2TaskKind = Enums["crm2_task_kind"];
export type Crm2TaskStatus = Enums["crm2_task_status"];
export type Crm2RequestKind = Enums["crm2_request_kind"];
export type Crm2RequestStatus = Enums["crm2_request_status"];
export type CrmRole = Enums["crm_role"];
export type Crm2Currency = "MNT" | "USD";

// ── Мөр ─────────────────────────────────────────────────────────────────────
export type Crm2PropertyRow = Tables["crm2_properties"]["Row"];
export type Crm2PropertyPrivateRow = Tables["crm2_property_private"]["Row"];
export type Crm2PropertyMediaRow = Tables["crm2_property_media"]["Row"];
export type Crm2BrokerageRow = Tables["crm2_brokerage_contracts"]["Row"];
export type Crm2BrokerageFileRow = Tables["crm2_brokerage_files"]["Row"];
export type Crm2ProjectRow = Tables["crm2_projects"]["Row"];
export type Crm2ContactRow = Tables["crm2_contacts"]["Row"];
export type Crm2ContactPhoneRow = Tables["crm2_contact_phones"]["Row"];
export type Crm2RequirementRow = Tables["crm2_requirements"]["Row"];
export type Crm2RequirementVersionRow = Tables["crm2_requirement_versions"]["Row"];
export type Crm2DealRow = Tables["crm2_deals"]["Row"];
export type Crm2ActivityRow = Tables["crm2_activities"]["Row"];
export type Crm2TaskRow = Tables["crm2_tasks"]["Row"];
export type Crm2HistoryRow = Tables["crm2_history"]["Row"];
export type Crm2RequestRow = Tables["crm2_requests"]["Row"];
export type Crm2UiEventRow = Tables["crm2_ui_events"]["Row"];
export type Crm2DuplicateFlagRow = Tables["crm2_duplicate_flags"]["Row"];

// ── 20261124000100 баганын утгын төрөл ───────────────────────────────────────
/** crm2_brokerage_files.kind — ownership/id нь хязгаарлагдмал (restricted) хавтас, харах эрх. */
export type Crm2BrokerageFileKind = Crm2BrokerageFileRow["kind"];
/** crm2_properties.source — 'listing'-ийг зөвхөн импортын RPC тавина. */
export type Crm2PropertySource = "manual" | "paste" | "share" | "listing";
/** crm2_contacts.consent */
export type Crm2ContactConsent = Crm2ContactRow["consent"];

// ── RPC table хариу ─────────────────────────────────────────────────────────
export type Crm2PropertyDealItem = Fns["crm2_property_deals"]["Returns"][number];
export type Crm2PropertyActivityItem = Fns["crm2_property_activities"]["Returns"][number];
export type Crm2ContactDealItem = Fns["crm2_contact_deals"]["Returns"][number];
export type Crm2PhoneMatch = Fns["crm2_find_contacts_by_phone"]["Returns"][number];
export type Crm2StaffMember = Fns["crm2_staff_directory"]["Returns"][number];
export type Crm2ProjectSuggestion = Fns["crm2_suggest_projects"]["Returns"][number];
export type Crm2LocationSuggestion = Fns["crm2_suggest_locations"]["Returns"][number];
/** crm2_property_duplicates(p_property) — харах эрхгүй илэрцэд property_id/code/status/agent_name null (зөвхөн token). */
export type Crm2PropertyDuplicate = Fns["crm2_property_duplicates"]["Returns"][number];
/** crm2_property_duplicate_flags(p_property) */
export type Crm2DuplicateFlagItem = Fns["crm2_property_duplicate_flags"]["Returns"][number];

// ── RPC jsonb хариу (миграцийн jsonb_build_object-той ижил түлхүүр) ─────────

/** crm2_my_context() — цэс, товч харуулах эрх. */
export type Crm2Context = {
  profileId: string;
  officeId: string | null;
  staffId: string | null;
  roles: CrmRole[];
  teamId: string | null;
  isMember: boolean;
  isManager: boolean;
  isTeamLead: boolean;
  isOfficeAdmin: boolean;
  canWork: boolean;
  canApprove: boolean;
  hasFinance: boolean;
  canManageSettings: boolean;
  /** roles.* / approvals.* тохиргоо (зөвхөн CEO). */
  canManageAccessSettings: boolean;
};

/** crm2_property_activation_check() */
export type Crm2ActivationCheck = {
  ok: boolean;
  missing: string[];
  missing_text: string | null;
  has_valid_contract: boolean;
};

/**
 * crm2_brokerage_register() (20261125000100) — ноорог → active, батлагчгүй. Хөрөнгийн мэдээлэл бүрэн бол
 * хөрөнгө мөн идэвхжинэ; эс бөгөөс property_missing-ийг нөхмөгц DB өөрөө идэвхжүүлнэ.
 */
export type Crm2BrokerageRegisterResult = {
  contract_status: "active";
  /** Системийн дугаар (B###); хуучин ноорогт цаасан дугаар хэвээр. */
  number: string;
  /** Бүртгэсэн өдөр (УБ). */
  start_date: string;
  end_date: string;
  property_status: Crm2PropertyStatus;
  /** crm2_property_missing — идэвхтэй бол хоосон. */
  property_missing: string[];
  /** Аль хэдийн бүртгэгдсэн (давхар дарсан) — өөрчлөлтгүй. */
  already?: boolean;
};

/** crm2_brokerage_invalidate() — «Гэрээ буруу»: гэрээ terminated, хүчинтэй гэрээ үлдээгүй бол хөрөнгө ноорог. */
export type Crm2BrokerageInvalidateResult = {
  contract_status: "terminated";
  property_status: Crm2PropertyStatus;
};

/** crm2_create_contact() давхардлын мөр. */
export type Crm2ContactDuplicate = {
  contact_id: string;
  code: string;
  display_name: string;
  can_open: boolean;
  responsible_agent_name: string;
};

/** crm2_create_contact() — contact_id null бол давхардлаас болж үүсгээгүй. */
export type Crm2CreateContactResult = {
  contact_id: string | null;
  code: string | null;
  duplicates: Crm2ContactDuplicate[];
};

/** crm2_open_deal() */
export type Crm2OpenDealResult = {
  deal_id: string;
  code: string;
  /** Харах эрхгүй бол null. */
  stage: Crm2DealStage | null;
  created: boolean;
  /** Энэ хэлцэлд бүртгэх (засах) эрхтэй. false = өөр агентынх → шилжүүлэх хүсэлт. */
  accessible: boolean;
  visible: boolean;
  agent_id: string;
  agent_name: string;
  previous_deal_id: string | null;
  origin_deal_id?: string | null;
};

/** crm2_log_call() = open_deal + activity_id, task_id. */
export type Crm2LogCallResult = Crm2OpenDealResult & {
  activity_id: string;
  task_id: string | null;
};

/**
 * crm2_request_transfer_with_call-ийн хариу (UI-д):
 *  pending  — хүсэлт үүссэн/дуудлага нэмэгдсэн; батлагдахад анхны цагаар бүртгэгдэнэ;
 *  applied  — хүсэгч өөрөө батлагч тул шууд шилжиж, дуудлага бүртгэгдсэн;
 *  logged   — шууд бүртгэх боломжтой байсан (hint crm2_log_call) → crm2_log_call-оор бүртгэсэн;
 *  retry    — түгжээ хүлээх хооронд нөхцөл өөрчлөгдсөн (hint crm2_retry; дахин илгээсэн ч давтагдсан).
 */
export type Crm2TransferWithCallResult =
  | {
      status: "pending";
      kind: "deal_transfer" | "contact_transfer";
      requestId: string | null;
      calls: number;
      appended: boolean;
      duplicate: boolean;
    }
  | {
      status: "applied";
      kind: "deal_transfer" | "contact_transfer";
      requestId: string | null;
      skipped: number;
      dealId: string | null;
      activityId: string | null;
      taskId: string | null;
      dealCreated: boolean;
    }
  | { status: "logged"; log: Crm2LogCallResult }
  | { status: "retry"; message: string };

// ── Staff шуурхай бүртгэл (20261124000300…0700) ─────────────────────────────

/**
 * crm2_create_property_quick / crm2_set_property_owner-ийн p_owner. {contact_id} л холбоно;
 * утсаар харах эрхтэй давхцал → 'needs_choice' (allow_duplicate=true бол шинэ харилцагч үүсгэнэ).
 */
export type Crm2OwnerInput =
  | { contact_id: string }
  | {
      phone: string;
      full_name?: string | null;
      /** contact.sources код */
      source?: string | null;
      source_note?: string | null;
      allow_duplicate?: boolean;
    };

/**
 * Эзний төлөв (crm2_resolve_owner / crm2_set_property_owner / quick create replay).
 *  none — эзэн өгөөгүй (эсвэл цэвэрлэсэн); linked — {contact_id}-аар холбосон; created — шинэ харилцагч;
 *  matched — харах эрхтэй давхцалыг сонгож холбосон (клиентийн төлөв; RPC одоогоор буцаахгүй); needs_choice — харах эрхтэй давхцал (match) байна, агент сонгоно;
 *  foreign — өөр агентын харилцагч (duplicates нууцалсан); no_access — сонгосон харилцагчийг харах эрхгүй;
 *  invalid_phone — 8-аас цөөн орон; pending_review — давтан илгээлт, owner_pending хадгалагдсан.
 * Эцсийн бус төлөвт сервер утсыг crm2_property_private.owner_pending-д хадгална (pending_saved = true).
 */
export type Crm2OwnerStatus =
  | "none"
  | "linked"
  | "matched"
  | "created"
  | "needs_choice"
  | "foreign"
  | "no_access"
  | "invalid_phone"
  | "pending_review";

export type Crm2OwnerResolveResult = {
  status: Crm2OwnerStatus;
  contact_id?: string;
  match?: { contact_id: string; code: string; full_name: string };
  duplicates?: Crm2ContactDuplicate[];
  pending_saved?: boolean;
  /** crm2_set_property_owner({clear: true}) — owner_pending байсан эсэх. */
  cleared?: boolean;
};

/** Эдгээр төлөвт эзний асуудал шийдэгдсэн (owner_pending цэвэрлэнэ, хувийн ноорог устгаж болно). */
export const OWNER_FINAL_STATUSES = ["none", "linked", "matched", "created"] as const;
export type Crm2OwnerFinalStatus = (typeof OWNER_FINAL_STATUSES)[number];

export function isOwnerFinal(status: Crm2OwnerStatus): status is Crm2OwnerFinalStatus {
  return (OWNER_FINAL_STATUSES as readonly string[]).includes(status);
}

/** crm2_property_private.owner_pending (утас, нэр зөвхөн хувийн талбар харах эрхтэнд). */
export type Crm2OwnerPending = {
  phone: string | null;
  name: string | null;
  source: string | null;
  source_note: string | null;
  status: Crm2OwnerStatus;
  at: string;
};

/** crm2_create_property_quick() */
export type Crm2QuickCreateResult = {
  property_id: string;
  code: string;
  /** Ижил client_key-ээр өмнө үүссэн — хадгалсан эзний төлөв, дахин тооцсон давхардал. */
  replayed: boolean;
  owner: Crm2OwnerResolveResult;
  duplicates: Crm2PropertyDuplicate[];
};

/** crm2_create_property_from_listing() — зарын зураг {path (listings bucket доторх зам), url, sort}. */
export type Crm2ImportPhoto = { path: string; url: string; sort: number };

/**
 * crm2_create_property_from_listing().
 *  existing=false — шинэ ноорог; existing=true + photos — өмнө импортолсон, засах эрхтэй (attached-д байхгүй зургийг үргэлжлүүлнэ);
 *  existing=true, photos-гүй — өөр хөрөнгөтэй холбогдсон эсвэл засах эрхгүй; property_id null — харах эрхгүй.
 */
export type Crm2ImportListingResult = {
  existing: boolean;
  property_id: string | null;
  code?: string;
  photos?: Crm2ImportPhoto[];
  /** Аль хэдийн хавсаргасан зургийн source_public_url. */
  attached?: string[];
  duplicates?: Crm2PropertyDuplicate[];
};

/** crm2_publish_preview() link_mode: link_only — эх зар идэвхтэй (зөвхөн холбоно); choice — эх зар идэвхгүй; new_only. */
export type Crm2PublishLinkMode = "link_only" | "choice" | "new_only";

/** crm2_publish_preview().link_candidate — эх зарын нийтийн талбар (утас нууцалсан). */
export type Crm2PublishLinkCandidate = {
  listing_id: string;
  title: string | null;
  description: string | null;
  status: string;
  type: string | null;
  district: string | null;
  rooms: number | null;
  area: number | null;
  floor: string | null;
  price: number | null;
  year: number | null;
  parking: number | null;
  features: string[] | null;
  rent_advance_months: number | null;
  rent_deposit_months: number | null;
  has_location: boolean;
  photo_count: number;
  owned_by_listing_agent: boolean;
  created_at: string;
};

/** crm2_publish_preview() — засах эрхгүй бол null. */
export type Crm2PublishPreview = {
  /** crm2_listing_payload — нийтэд очих талбар (type, district, features, parking, rent_* …). */
  payload: Record<string, Json>;
  title: string;
  description: string | null;
  link_mode: Crm2PublishLinkMode;
  /** Нийтлэхийг хаахгүй анхааруулга (картын бичвэрт утас г.м.). */
  warnings: string[];
  link_candidate: Crm2PublishLinkCandidate | null;
};

/** crm2_publish_property() */
export type Crm2PublishResult = {
  listing_id: string;
  /** Эх зартай холбосон (шинэ зар үүсгээгүй). */
  linked?: boolean;
  needs_photos: boolean;
};

/** 'applied' — шууд өөрчлөгдсөн; 'pending' — батлах хүсэлт үүссэн. */
export type Crm2ApplyOutcome = "applied" | "pending";

// ── Server action хариу ─────────────────────────────────────────────────────
/** field — DB/оролтын алдааны маягтын талбар (dbErrorField), мэдэгдэхгүй бол байхгүй/null. */
export type Crm2Result<T = null> = { ok: true; data: T } | { ok: false; error: string; field?: string | null };

export type { Json };
