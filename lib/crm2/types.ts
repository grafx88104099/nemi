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

// ── RPC table хариу ─────────────────────────────────────────────────────────
export type Crm2PropertyDealItem = Fns["crm2_property_deals"]["Returns"][number];
export type Crm2PropertyActivityItem = Fns["crm2_property_activities"]["Returns"][number];
export type Crm2ContactDealItem = Fns["crm2_contact_deals"]["Returns"][number];
export type Crm2PhoneMatch = Fns["crm2_find_contacts_by_phone"]["Returns"][number];
export type Crm2StaffMember = Fns["crm2_staff_directory"]["Returns"][number];
export type Crm2ProjectSuggestion = Fns["crm2_suggest_projects"]["Returns"][number];
export type Crm2LocationSuggestion = Fns["crm2_suggest_locations"]["Returns"][number];

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

/** crm2_brokerage_approve() */
export type Crm2BrokerageApproveResult = {
  contract_status: Crm2BrokerageStatus;
  property_status: Crm2PropertyStatus;
  property_missing: string[];
  activate_on_start: boolean;
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

/** 'applied' — шууд өөрчлөгдсөн; 'pending' — батлах хүсэлт үүссэн. */
export type Crm2ApplyOutcome = "applied" | "pending";

// ── Server action хариу ─────────────────────────────────────────────────────
export type Crm2Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

export type { Json };
