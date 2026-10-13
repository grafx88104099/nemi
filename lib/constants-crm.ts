/**
 * PMC CRM — төвлөрсөн enum/тэмдэглэгээ (lib/constants.ts хэв маяг).
 * DB enum-уудтай (20260901000100_crm_foundation.sql) ЯГ таарна;
 * z.enum / searchParam шалгалт / <select> сонголт гурвуулаа нэг эх сурвалж.
 * DB дахь pipelines/stages нь эх үнэн — эндхи PL_CODES зөвхөн label/fallback.
 */

import type { StatusTone } from "@/lib/constants";

export type CrmTone = StatusTone;

// ── Дүр (crm_role) ────────────────────────────────────────
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
] as const;
export type CrmRole = (typeof CRM_ROLES)[number];

export const CRM_ROLE_LABEL: Record<CrmRole, string> = {
  agent: "Агент",
  team_lead: "Багийн ахлагч",
  sales_director: "Борлуулалтын захирал",
  ops_qc: "Үйл ажиллагаа/ЧМТ",
  marketing: "Маркетинг",
  property_manager: "ҮХХ менежмент",
  finance: "Санхүү",
  aml_officer: "МУТСТ ажилтан",
  ceo: "Ерөнхий захирал",
  sysadmin: "Системийн админ",
};

// ── Харилцагч ─────────────────────────────────────────────
export const CONTACT_KINDS = ["person", "company"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];
export const CONTACT_KIND_LABEL: Record<ContactKind, string> = {
  person: "Хувь хүн",
  company: "Байгууллага",
};

export const CONTACT_TYPES = ["buyer", "seller", "tenant", "landlord", "investor", "applicant"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];
export const CONTACT_TYPE_LABEL: Record<ContactType, string> = {
  buyer: "Худалдан авагч",
  seller: "Худалдагч",
  tenant: "Түрээслэгч",
  landlord: "Түрээслүүлэгч",
  investor: "Хөрөнгө оруулагч",
  applicant: "Горилогч",
};

export const CRM_LIFECYCLES = ["new", "active", "recycled", "inactive", "archived"] as const;
export type CrmLifecycle = (typeof CRM_LIFECYCLES)[number];
export const CRM_LIFECYCLE_LABEL: Record<CrmLifecycle, { label: string; tone: CrmTone }> = {
  new: { label: "Шинэ", tone: "neutral" },
  active: { label: "Идэвхтэй", tone: "green" },
  recycled: { label: "Эргэлтэд", tone: "amber" },
  inactive: { label: "Идэвхгүй", tone: "neutral" },
  archived: { label: "Архив", tone: "neutral" },
};

export const LEAD_GRADES = ["a", "b", "c", "d"] as const;
export type LeadGrade = (typeof LEAD_GRADES)[number];
export const LEAD_GRADE_LABEL: Record<LeadGrade, { label: string; tone: CrmTone }> = {
  a: { label: "A — Халуун", tone: "rose" },
  b: { label: "B — Дулаан", tone: "amber" },
  c: { label: "C — Сэрүүн", tone: "blue" },
  d: { label: "D — Хүйтэн", tone: "neutral" },
};

export const CONSENT_STATUSES = ["granted", "not_asked", "declined"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];
export const CONSENT_STATUS_LABEL: Record<ConsentStatus, { label: string; tone: CrmTone }> = {
  granted: { label: "Зөвшөөрсөн", tone: "green" },
  not_asked: { label: "Аваагүй", tone: "neutral" },
  declined: { label: "Татгалзсан", tone: "rose" },
};

export const KYC_STATUSES = ["pending", "verified", "edd", "suspended"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];
export const KYC_STATUS_LABEL: Record<KycStatus, { label: string; tone: CrmTone }> = {
  pending: { label: "Хүлээгдэж буй", tone: "neutral" },
  verified: { label: "Баталгаажсан", tone: "green" },
  edd: { label: "EDD", tone: "amber" },
  suspended: { label: "Түр зогсоосон", tone: "rose" },
};

export const PROFILE_STATUSES = ["active", "paused", "fulfilled", "lost"] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];
export const PROFILE_STATUS_LABEL: Record<ProfileStatus, { label: string; tone: CrmTone }> = {
  active: { label: "Идэвхтэй", tone: "green" },
  paused: { label: "Түр зогссон", tone: "amber" },
  fulfilled: { label: "Хангагдсан", tone: "blue" },
  lost: { label: "Алдсан", tone: "rose" },
};

// ── Объект ────────────────────────────────────────────────
export const SERVICE_KINDS = ["sale", "standard_rental", "managed_rental"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];
export const SERVICE_KIND_LABEL: Record<ServiceKind, string> = {
  sale: "Худалдах",
  standard_rental: "Энгийн түрээс",
  managed_rental: "Менежменттэй түрээс",
};

export const CRM_PROPERTY_STATUSES = ["draft", "active", "reserved", "sold", "rented", "withdrawn"] as const;
export type CrmPropertyStatus = (typeof CRM_PROPERTY_STATUSES)[number];
export const CRM_PROPERTY_STATUS_LABEL: Record<CrmPropertyStatus, { label: string; tone: CrmTone }> = {
  draft: { label: "Ноорог", tone: "neutral" },
  active: { label: "Идэвхтэй", tone: "green" },
  reserved: { label: "Захиалгатай", tone: "amber" },
  sold: { label: "Зарагдсан", tone: "blue" },
  rented: { label: "Түрээслэгдсэн", tone: "blue" },
  withdrawn: { label: "Татагдсан", tone: "rose" },
};

export const OCCUPANCY_STATUSES = ["vacant", "occupied", "make_ready", "notice_given"] as const;
export type OccupancyStatus = (typeof OCCUPANCY_STATUSES)[number];
export const OCCUPANCY_STATUS_LABEL: Record<OccupancyStatus, { label: string; tone: CrmTone }> = {
  vacant: { label: "Сул", tone: "amber" },
  occupied: { label: "Түрээслэгдсэн", tone: "green" },
  make_ready: { label: "Бэлтгэл", tone: "blue" },
  notice_given: { label: "Гарах мэдэгдэлтэй", tone: "rose" },
};

export const CRM_PROPERTY_ROLES = ["sourcing", "photo", "contract"] as const;
export type CrmPropertyRole = (typeof CRM_PROPERTY_ROLES)[number];
export const CRM_PROPERTY_ROLE_LABEL: Record<CrmPropertyRole, string> = {
  sourcing: "Эх сурвалжийн агент",
  photo: "Зураг авалтын агент",
  contract: "Гэрээний агент",
};

export const CRM_PROPERTY_TYPES = ["apartment", "house", "office", "retail", "land", "other"] as const;
export type CrmPropertyType = (typeof CRM_PROPERTY_TYPES)[number];
export const CRM_PROPERTY_TYPE_LABEL: Record<CrmPropertyType, string> = {
  apartment: "Орон сууц",
  house: "Хаус",
  office: "Оффис",
  retail: "Худалдааны талбай",
  land: "Газар",
  other: "Бусад",
};

// ── Үйл ажиллагаа, боломж ─────────────────────────────────
export const ACTIVITY_CHANNELS = ["call", "chat", "email", "meeting", "showing", "task"] as const;
export type CrmActivityChannel = (typeof ACTIVITY_CHANNELS)[number];
export const ACTIVITY_CHANNEL_LABEL: Record<CrmActivityChannel, string> = {
  call: "Залгалт",
  chat: "Чат",
  email: "И-мэйл",
  meeting: "Уулзалт",
  showing: "Үзлэг",
  task: "Даалгавар",
};

export const ACTIVITY_OUTCOMES = ["open", "advanced", "lost", "won"] as const;
export type ActivityOutcome = (typeof ACTIVITY_OUTCOMES)[number];
export const ACTIVITY_OUTCOME_LABEL: Record<ActivityOutcome, { label: string; tone: CrmTone }> = {
  open: { label: "Нээлттэй", tone: "neutral" },
  advanced: { label: "Ахисан", tone: "blue" },
  lost: { label: "Алдсан", tone: "rose" },
  won: { label: "Амжилттай", tone: "green" },
};

export const MATCH_RESPONSES = ["interested", "maybe", "not_fit", "no_response"] as const;
export type MatchResponse = (typeof MATCH_RESPONSES)[number];
export const MATCH_RESPONSE_LABEL: Record<MatchResponse, { label: string; tone: CrmTone }> = {
  interested: { label: "Сонирхсон", tone: "green" },
  maybe: { label: "Магадгүй", tone: "amber" },
  not_fit: { label: "Тохироогүй", tone: "rose" },
  no_response: { label: "Хариу өгөөгүй", tone: "neutral" },
};

export const MATCH_STRENGTHS = ["strong", "possible", "weak"] as const;
export type MatchStrength = (typeof MATCH_STRENGTHS)[number];
export const MATCH_STRENGTH_LABEL: Record<MatchStrength, { label: string; tone: CrmTone }> = {
  strong: { label: "Хүчтэй", tone: "green" },
  possible: { label: "Боломжит", tone: "blue" },
  weak: { label: "Сул", tone: "neutral" },
};

export const OPP_STATES = ["open", "won", "lost"] as const;
export type OppState = (typeof OPP_STATES)[number];
export const OPP_STATE_LABEL: Record<OppState, { label: string; tone: CrmTone }> = {
  open: { label: "Нээлттэй", tone: "blue" },
  won: { label: "Амжилттай", tone: "green" },
  lost: { label: "Алдсан", tone: "rose" },
};

// ── Хэлцэл ────────────────────────────────────────────────
export const TXN_TYPES = ["sale", "standard_rental", "managed_rental", "international_sale", "replacement"] as const;
export type TxnType = (typeof TXN_TYPES)[number];
export const TXN_TYPE_LABEL: Record<TxnType, string> = {
  sale: "Худалдах",
  standard_rental: "Энгийн түрээс",
  managed_rental: "Менежменттэй түрээс",
  international_sale: "Олон улсын худалдаа",
  replacement: "Дахин түрээслүүлэх",
};

export const TXN_STATUSES = ["draft", "contract", "payment", "closed", "cancelled"] as const;
export type TxnStatus = (typeof TXN_STATUSES)[number];
export const TXN_STATUS_LABEL: Record<TxnStatus, { label: string; tone: CrmTone }> = {
  draft: { label: "Ноорог", tone: "neutral" },
  contract: { label: "Гэрээ", tone: "blue" },
  payment: { label: "Төлбөр", tone: "amber" },
  closed: { label: "Хаагдсан", tone: "green" },
  cancelled: { label: "Цуцлагдсан", tone: "rose" },
};

export const PARTY_ROLES = ["seller", "buyer", "lessor", "lessee"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];
export const PARTY_ROLE_LABEL: Record<PartyRole, string> = {
  seller: "Худалдагч",
  buyer: "Худалдан авагч",
  lessor: "Түрээслүүлэгч",
  lessee: "Түрээслэгч",
};

// ── Гейт (G0–G6) ──────────────────────────────────────────
export const GATES = ["g0", "g1", "g2", "g3", "g4", "g5", "g6"] as const;
export type GateCode = (typeof GATES)[number];
export const GATE_LABEL: Record<GateCode, string> = {
  g0: "G0 — Сэжим",
  g1: "G1 — Чанаржуулалт",
  g2: "G2 — Санал/хэлэлцээр",
  g3: "G3 — Листингийн гэрээ",
  g4: "G4 — Гэрээ (KYC/баримт)",
  g5: "G5 — Хаалт (төлбөр/хүлээлцэх)",
  g6: "G6 — Хэлцлийн дараах",
};

// ── МУТСТ ─────────────────────────────────────────────────
export const AML_CASE_STATUSES = ["open", "investigating", "str_sent", "closed"] as const;
export type AmlCaseStatus = (typeof AML_CASE_STATUSES)[number];
export const AML_CASE_STATUS_LABEL: Record<AmlCaseStatus, { label: string; tone: CrmTone }> = {
  open: { label: "Нээлттэй", tone: "amber" },
  investigating: { label: "Шалгаж буй", tone: "blue" },
  str_sent: { label: "СГТ илгээсэн", tone: "rose" },
  closed: { label: "Хаагдсан", tone: "green" },
};

export const AML_RISKS = ["low", "medium", "high", "prohibited"] as const;
export type AmlRisk = (typeof AML_RISKS)[number];
export const AML_RISK_LABEL: Record<AmlRisk, { label: string; tone: CrmTone }> = {
  low: { label: "Бага", tone: "green" },
  medium: { label: "Дунд", tone: "amber" },
  high: { label: "Өндөр", tone: "rose" },
  prohibited: { label: "Хориотой", tone: "rose" },
};

// ── Түрээс ────────────────────────────────────────────────
export const LEASE_STATUSES = ["draft", "active", "renewed", "terminated", "expired"] as const;
export type LeaseStatus = (typeof LEASE_STATUSES)[number];
export const LEASE_STATUS_LABEL: Record<LeaseStatus, { label: string; tone: CrmTone }> = {
  draft: { label: "Ноорог", tone: "neutral" },
  active: { label: "Идэвхтэй", tone: "green" },
  renewed: { label: "Сунгагдсан", tone: "blue" },
  terminated: { label: "Цуцлагдсан", tone: "rose" },
  expired: { label: "Дууссан", tone: "neutral" },
};

export const INVOICE_TYPES = ["mgmt_fee", "brokerage_fee", "extra_service"] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];
export const INVOICE_TYPE_LABEL: Record<InvoiceType, string> = {
  mgmt_fee: "Менежментийн хөлс",
  brokerage_fee: "Зуучлалын хөлс",
  extra_service: "Нэмэлт үйлчилгээ",
};

export const INVOICE_STATUSES = ["planned", "sent", "partially_paid", "paid", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, { label: string; tone: CrmTone }> = {
  planned: { label: "Төлөвлөсөн", tone: "neutral" },
  sent: { label: "Илгээсэн", tone: "blue" },
  partially_paid: { label: "Хэсэгчлэн төлөгдсөн", tone: "amber" },
  paid: { label: "Төлөгдсөн", tone: "green" },
  cancelled: { label: "Хүчингүй", tone: "rose" },
};

export const PAYMENT_KINDS = ["income", "control"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];
export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  income: "Орлогын",
  control: "Хяналтын",
};

export const EXPENSE_BEARERS = ["tenant", "landlord", "pmc"] as const;
export type ExpenseBearer = (typeof EXPENSE_BEARERS)[number];
export const EXPENSE_BEARER_LABEL: Record<ExpenseBearer, string> = {
  tenant: "Түрээслэгч",
  landlord: "Өмчлөгч",
  pmc: "PMC",
};

export const MAINTENANCE_STATUSES = ["new", "pending_approval", "assigned", "in_progress", "closed", "rejected"] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];
export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceStatus, { label: string; tone: CrmTone }> = {
  new: { label: "Шинэ", tone: "neutral" },
  pending_approval: { label: "Зөвшөөрөл хүлээж буй", tone: "amber" },
  assigned: { label: "Оноогдсон", tone: "blue" },
  in_progress: { label: "Хийгдэж буй", tone: "blue" },
  closed: { label: "Хаагдсан", tone: "green" },
  rejected: { label: "Татгалзсан", tone: "rose" },
};

export const URGENCIES = ["urgent", "normal", "planned"] as const;
export type Urgency = (typeof URGENCIES)[number];
export const URGENCY_LABEL: Record<Urgency, { label: string; tone: CrmTone }> = {
  urgent: { label: "Яаралтай", tone: "rose" },
  normal: { label: "Энгийн", tone: "blue" },
  planned: { label: "Төлөвлөгөөт", tone: "neutral" },
};

export const INSPECTION_KINDS = ["move_in", "move_out", "periodic"] as const;
export type InspectionKind = (typeof INSPECTION_KINDS)[number];
export const INSPECTION_KIND_LABEL: Record<InspectionKind, string> = {
  move_in: "Орох үзлэг",
  move_out: "Гарах үзлэг",
  periodic: "Ээлжит үзлэг",
};

// ── Шимтгэл ───────────────────────────────────────────────
export const COMMISSION_STATUSES = ["calculated", "reviewed", "approved", "paid", "partially_paid", "hold", "cancelled"] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];
export const COMMISSION_STATUS_LABEL: Record<CommissionStatus, { label: string; tone: CrmTone }> = {
  calculated: { label: "Тооцоолсон", tone: "neutral" },
  reviewed: { label: "Хянасан", tone: "blue" },
  approved: { label: "Баталгаажсан", tone: "green" },
  paid: { label: "Олгосон", tone: "green" },
  partially_paid: { label: "Хэсэгчлэн олгосон", tone: "amber" },
  hold: { label: "Түдгэлзүүлсэн", tone: "rose" },
  cancelled: { label: "Цуцалсан", tone: "rose" },
};

export const COMMISSION_ROLES = [
  "sourcing",
  "listing",
  "photo",
  "contract",
  "selling",
  "seller_side",
  "buyer_side",
  "intl_lead_gen",
  "deal_manager",
  "pm_team",
] as const;
export type CommissionRole = (typeof COMMISSION_ROLES)[number];
export const COMMISSION_ROLE_LABEL: Record<CommissionRole, string> = {
  sourcing: "Эх сурвалжийн үүрэг",
  listing: "Листингийн үүрэг",
  photo: "Зураг авалтын үүрэг",
  contract: "Гэрээний үүрэг",
  selling: "Борлуулалтын үүрэг",
  seller_side: "Худалдагч талын үүрэг",
  buyer_side: "Худалдан авагч талын үүрэг",
  intl_lead_gen: "Олон улсын сэжим татагч",
  deal_manager: "Хэлцлийн менежер",
  pm_team: "Менежментийн баг",
};

// ── Баримт ────────────────────────────────────────────────
export const DOC_CATEGORIES = ["contract", "payment_proof", "ownership", "identity", "photo", "act", "aml", "other"] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];
export const DOC_CATEGORY_LABEL: Record<DocCategory, string> = {
  contract: "Гэрээ",
  payment_proof: "Төлбөрийн баримт",
  ownership: "Өмчлөлийн баримт",
  identity: "Иргэний баримт",
  photo: "Зураг",
  act: "Акт",
  aml: "МУТСТ (хязгаарлагдмал)",
  other: "Бусад",
};

/** Хязгаарлагдмал ангилал — үзэлт бүр аудитад бүртгэгдэнэ (F-709). */
export const RESTRICTED_DOC_CATEGORIES: DocCategory[] = ["aml", "ownership", "identity"];

// ── Урсгалын кодууд (seed-тэй таарна; DB — эх үнэн) ───────
export const PL_CODES = ["PL-1", "PL-2", "PL-3", "PL-4", "PL-5", "PL-6"] as const;
export type PlCode = (typeof PL_CODES)[number];
export const PL_LABEL: Record<PlCode, string> = {
  "PL-1": "Худалдан авалт",
  "PL-2": "Листинг авах",
  "PL-3": "Энгийн түрээс",
  "PL-4": "Менежменттэй түрээс",
  "PL-5": "Олон улсын худалдаа",
  "PL-6": "Горилогч (хязгаарлагдмал)",
};

// ── Гейт шалгагчийн примитивүүд (crm_gate_requirements.checker_kind) ──
export const GATE_CHECKER_KINDS = [
  "need_profile_complete",
  "owner_set",
  "next_step_set",
  "kyc_verified",
  "docs_complete",
  "role_evidence",
  "payment_proof",
  "handover_done",
  "listing_agreement",
  "offer_recorded",
  "aml_not_held",
  "post_sale_tasks",
] as const;
export type GateCheckerKind = (typeof GATE_CHECKER_KINDS)[number];
export const GATE_CHECKER_LABEL: Record<GateCheckerKind, string> = {
  need_profile_complete: "Хэрэгцээний профайл бүрэн",
  owner_set: "Эзэмшигч оноогдсон",
  next_step_set: "Дараагийн алхам огноотой",
  kyc_verified: "KYC баталгаажсан",
  docs_complete: "Баримтын бүрдэл 100%",
  role_evidence: "Үүргийн нотолгоо бүртгэгдсэн",
  payment_proof: "Төлбөрийн баримт баталгаажсан",
  handover_done: "Хүлээлцэх дууссан",
  listing_agreement: "Идэвхтэй листингийн гэрээ",
  offer_recorded: "Санал бүртгэгдсэн",
  aml_not_held: "МУТСТ түгжээгүй",
  post_sale_tasks: "Хэлцлийн дараах даалгавар үүссэн",
};

// ── Лавлахын төрлүүд (crm_lookups.kind) ───────────────────
export const LOOKUP_KINDS = [
  "lead_source",
  "lost_reason",
  "objection",
  "maintenance_category",
  "tag",
  "goal",
  "blocker",
  "decision_maker",
  "condition",
] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];
export const LOOKUP_KIND_LABEL: Record<LookupKind, string> = {
  lead_source: "Эх сурвалж",
  lost_reason: "Алдсан шалтгаан",
  objection: "Эсэргүүцлийн төрөл",
  maintenance_category: "Засварын ангилал",
  tag: "Сегментийн шошго",
  goal: "Зорилго",
  blocker: "Саад",
  decision_maker: "Шийдвэр гаргагч",
  condition: "Нөхцөл",
};

// ── Мэдэгдлийн event кодууд (crm_notification_matrix seed-тэй таарна) ──
export const CRM_EVENT_CODES = [
  "lead_assigned",
  "lead_sla_breach",
  "next_step_overdue",
  "match_found",
  "showing_feedback_due",
  "offer_recorded",
  "stage_moved",
  "gate_blocked",
  "txn_status_changed",
  "arrears_step",
  "invoice_due",
  "lease_renewal_due",
  "maintenance_sla",
  "commission_status",
  "monthly_record_due",
  "owner_statement_due",
  "offboarding_started",
  "rule_error",
] as const;
export type CrmEventCode = (typeof CRM_EVENT_CODES)[number];
export const CRM_EVENT_LABEL: Record<CrmEventCode, string> = {
  lead_assigned: "Сэжим оноогдсон",
  lead_sla_breach: "Эхний холболтын SLA хэтэрсэн",
  next_step_overdue: "Дараагийн алхам хэтэрсэн",
  match_found: "Тохируулга олдсон",
  showing_feedback_due: "Үзлэгийн 24ц санал хүлээгдэж буй",
  offer_recorded: "Санал бүртгэгдсэн",
  stage_moved: "Шат шилжсэн",
  gate_blocked: "Гейт хаагдсан",
  txn_status_changed: "Хэлцлийн төлөв өөрчлөгдсөн",
  arrears_step: "Хоцролтын шатлал",
  invoice_due: "Нэхэмжлэхийн хугацаа",
  lease_renewal_due: "Гэрээний сунгалт дөхсөн",
  maintenance_sla: "Засварын SLA",
  commission_status: "Шимтгэлийн төлөв",
  monthly_record_due: "Сарын бүртгэл дутуу",
  owner_statement_due: "Өмчлөгчийн тайлан",
  offboarding_started: "Гарах ажилтны хүлээлцэх",
  rule_error: "Автомат дүрмийн алдаа",
};

// ── Автомат дүрмийн кодууд (Д-01…Д-30 — seed) ─────────────
export const CRM_RULE_CODES = [
  "D-01", "D-02", "D-03", "D-04", "D-05", "D-06", "D-07", "D-08", "D-09", "D-10",
  "D-11", "D-12", "D-13", "D-14", "D-15", "D-16", "D-17", "D-18", "D-19", "D-20",
  "D-21", "D-22", "D-23", "D-24", "D-25", "D-26", "D-27", "D-28", "D-29", "D-30",
] as const;
export type CrmRuleCode = (typeof CRM_RULE_CODES)[number];

// ── Дугаарлалтын төрлүүд (crm_sequences.kind — seed-тэй таарна) ──
export const SEQUENCE_KINDS = [
  "contact",
  "property",
  "txn_sale",
  "txn_standard_rental",
  "txn_managed_rental",
  "txn_international_sale",
  "txn_replacement",
  "invoice",
  "lease",
  "mgmt_agreement",
] as const;
export type SequenceKind = (typeof SEQUENCE_KINDS)[number];
