import { z } from "zod";

import type { CrmRole } from "@/lib/constants-crm";

/**
 * Эзэмшил, эрх, хүлээлцэх (PRO-001 v2.1 §5, §6.26, §6.27, §6.32) —
 * оролтын схем, дэлгэцийн шошго, цэвэр дүрмүүд. DB (001100–001350) ижил
 * дүрмийг давхар сахина; энд UI-д урьдчилан тайлбарлах, тестлэхэд.
 */

// ── Ерөнхий ──────────────────────────────────────────────

export type Parsed<T> = { data: T } | { error: string };

function firstIssue(err: z.ZodError, fallback = "Оролт буруу байна."): string {
  const msg = err.issues[0]?.message;
  return msg && !msg.startsWith("Invalid") && !msg.startsWith("Expected") ? msg : fallback;
}

export function parseWith<T>(schema: z.ZodType<T>, raw: unknown): Parsed<T> {
  const r = schema.safeParse(raw);
  return r.success ? { data: r.data } : { error: firstIssue(r.error) };
}

/** DB-ийн «CRM: …» алдааг дэлгэцийн мессеж болгоно (дотоод кодыг гаргахгүй). */
export function dbErrorMessage(message: string | null | undefined, fallback: string): string {
  if (!message) return fallback;
  const m = message.match(/CRM[_A-Z]*:\s*([\s\S]+)$/);
  if (!m) return fallback;
  return m[1]
    .replace(/\s*\((party|routed|approved_shares|involved|coi|not_found)\)\s*$/, (_, code: string) =>
      CONFLICT_REASON_LABEL[code as ConflictReason] ? ` — ${CONFLICT_REASON_LABEL[code as ConflictReason]}` : ""
    )
    .replace(/\s*\((F|Д|D)-\d+[^)]*\)/g, "")
    .trim();
}

// ── Дахин хуваарилалт (§6.27) ─────────────────────────────

export const REASSIGN_REASONS = [
  "sla_breach",
  "inactivity",
  "client_request",
  "zoning",
  "offboarding",
  "on_leave",
  "leave_return",
] as const;
export type ReassignReason = (typeof REASSIGN_REASONS)[number];

export const REASSIGN_REASON_LABEL: Record<ReassignReason, { label: string; hint: string }> = {
  sla_breach: {
    label: "Эхний холболтын SLA хоцорсон",
    hint: "Эхний холболт хугацаандаа хийгдээгүй нь системд бүртгэгдсэн байх ёстой.",
  },
  inactivity: {
    label: "Бодит үйл ажиллагаагүй, босго хэтэрсэн",
    hint: "Сүүлийн холболтоос хойш тогтоосон босго хоног өнгөрсөн байх ёстой.",
  },
  client_request: {
    label: "Харилцагч өөр агент хүссэн",
    hint: "Борлуулалтын хяналтаар баримтжуулна: хэзээ, ямар сувгаар хүссэнийг бичнэ үү.",
  },
  zoning: {
    label: "Бүсчлэлийн шаардлага",
    hint: "Салбар хоорондын хүлээлцэх — үл хөдлөх, харилцагчийн бүсийг бичнэ үү.",
  },
  offboarding: {
    label: "Агент ажлаас гарч байгаа",
    hint: "Эзэмшигч гарах урсгалд орсон байх ёстой (хүлээлцэх акт).",
  },
  on_leave: {
    label: "Агент чөлөө авсан (түр хүлээлцэх)",
    hint: "Эзэмшигчийн чөлөөний хугацаа бүртгэгдсэн байх ёстой.",
  },
  leave_return: {
    label: "Чөлөөнөөс буцсан агентад буцаах",
    hint: "Чөлөөний хугацаанд түр шилжүүлсэн сэжмийг анхны агентад нь буцаана.",
  },
};

/** Багийн ахлагч дангаараа зөвхөн нотолгоот шалтгаанаар (DB мөн шалгана). */
const TEAM_LEAD_REASONS: ReassignReason[] = ["sla_breach", "inactivity", "offboarding", "on_leave", "leave_return"];

export function reassignReasonsFor(roles: readonly CrmRole[]): ReassignReason[] {
  if (roles.includes("sales_director") || roles.includes("ops_qc")) return [...REASSIGN_REASONS];
  if (roles.includes("team_lead")) return [...TEAM_LEAD_REASONS];
  return [];
}

export function canReassign(roles: readonly CrmRole[]): boolean {
  return reassignReasonsFor(roles).length > 0;
}

/** Эзэмшлийн түүхийн шалтгааны шошго (дотоод кодыг дэлгэцэд гаргахгүй). */
export const OWNERSHIP_REASON_LABEL: Record<string, string> = {
  initial: "Анхны оноолт",
  sla_breach: "SLA хоцорсон тул шилжүүлсэн",
  inactivity: "Идэвхгүйн босго хэтэрсэн",
  client_request: "Харилцагчийн хүсэлтээр",
  zoning: "Бүсчлэлийн шаардлагаар",
  offboarding: "Ажлаас гарах хүлээлцэх",
  on_leave: "Чөлөөний түр хүлээлцэх",
  leave_return: "Чөлөөнөөс буцсан",
  dispute: "Эзэмшлийн маргааны шийдвэр",
  pool_claim: "Эргэлтийн сангаас зөвшөөрлөөр авсан",
  recycle: "Эргэлтийн санд буцаасан",
  not_accepted: "Хугацаандаа хүлээн аваагүй — дахин хуваарилсан",
};

export function ownershipReasonLabel(code: string | null | undefined): string {
  if (!code) return "Тодорхойгүй";
  return OWNERSHIP_REASON_LABEL[code] ?? "Бусад шилжүүлэлт";
}

const noteText = z.string().trim().max(1000, "Тэмдэглэл хэт урт байна");

export const reassignSchema = z
  .object({
    leadId: z.string().uuid("Сэжим буруу"),
    newOwnerId: z.string().uuid("Шинэ эзэмшигчийг сонгоно уу"),
    reason: z.enum(REASSIGN_REASONS, { message: "Шилжүүлэх шалтгааныг сонгоно уу" }),
    note: noteText.min(5, "Шилжүүлэх үндэслэлийг тэмдэглэлд бичнэ үү"),
  })
  .strict()
  .refine((v) => !["client_request", "zoning"].includes(v.reason) || v.note.length >= 10, {
    message: "Харилцагчийн хүсэлт / бүсчлэлийн үндэслэлийг дэлгэрэнгүй бичнэ үү (10+ тэмдэгт)",
    path: ["note"],
  });
export type ReassignInput = z.infer<typeof reassignSchema>;

// ── Эргэлт (§6.27) ────────────────────────────────────────

export const RECYCLE_REASONS = ["inactivity", "unreachable", "not_ready", "other"] as const;
export type RecycleReason = (typeof RECYCLE_REASONS)[number];
export const RECYCLE_REASON_LABEL: Record<RecycleReason, string> = {
  inactivity: "Бодит үйл ажиллагаагүй, босго хэтэрсэн",
  unreachable: "Харилцагчтай холбогдож чадахгүй байгаа",
  not_ready: "Харилцагч одоогоор бэлэн биш",
  other: "Бусад",
};

export const recycleSchema = z
  .object({
    leadId: z.string().uuid("Сэжим буруу"),
    reason: z.enum(RECYCLE_REASONS, { message: "Шалтгааныг сонгоно уу" }),
    note: noteText.min(10, "Хянан үзсэн дүгнэлтээ дэлгэрэнгүй бичнэ үү (10+ тэмдэгт)"),
    release: z.boolean(),
  })
  .strict();
export type RecycleInput = z.infer<typeof recycleSchema>;

export function canRecycle(roles: readonly CrmRole[]): boolean {
  return roles.includes("team_lead") || roles.includes("sales_director");
}

// ── Эргэлтийн сан (R3) ────────────────────────────────────

export const POOL_CLAIM_STATUS_LABEL: Record<string, { label: string; tone: "amber" | "green" | "rose" | "neutral" }> = {
  requested: { label: "Хүлээгдэж буй", tone: "amber" },
  approved: { label: "Зөвшөөрсөн", tone: "green" },
  rejected: { label: "Татгалзсан", tone: "rose" },
  cancelled: { label: "Цуцалсан", tone: "neutral" },
};

export const poolClaimSchema = z
  .object({
    leadId: z.string().uuid("Сэжим буруу"),
    note: noteText.min(5, "Юу хийхээ товч бичнэ үү"),
  })
  .strict();

export const poolDecideSchema = z
  .object({
    claimId: z.string().uuid("Хүсэлт буруу"),
    approve: z.boolean(),
    note: noteText.optional(),
  })
  .strict()
  .refine((v) => v.approve || (v.note ?? "").length >= 5, {
    message: "Татгалзсан шалтгаанаа бичнэ үү",
    path: ["note"],
  });

export function canDecidePoolClaim(roles: readonly CrmRole[]): boolean {
  return roles.includes("team_lead") || roles.includes("sales_director");
}

// ── Хүлээн авах хугацаа (R2) ──────────────────────────────

/** Хүлээн авах хүртэл үлдсэн минут (сөрөг = хэтэрсэн). */
export function acceptMinutesLeft(acceptDueAt: string | null, now: Date = new Date()): number | null {
  if (!acceptDueAt) return null;
  return Math.floor((new Date(acceptDueAt).getTime() - now.getTime()) / 60000);
}

// ── Эзэмшлийн маргаан (§5, §6.26, §7) ─────────────────────

export const DISPUTE_KINDS = ["ownership", "client_request", "cross_branch"] as const;
export type DisputeKind = (typeof DISPUTE_KINDS)[number];
export const DISPUTE_KIND_LABEL: Record<DisputeKind, string> = {
  ownership: "Харилцагч надтай өөрөө холбогдсон / би түрүүлж бүртгэсэн",
  client_request: "Харилцагч намайг хариуцуулахыг хүссэн",
  cross_branch: "Салбар хоорондын эзэмшил",
};

export const DISPUTE_STATUSES = ["open", "under_review", "escalated", "decided", "appealed", "closed", "withdrawn"] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];
export const DISPUTE_STATUS_LABEL: Record<DisputeStatus, { label: string; tone: "amber" | "blue" | "rose" | "green" | "neutral" | "brand" }> = {
  open: { label: "Нээлттэй", tone: "amber" },
  under_review: { label: "Хянагдаж буй", tone: "blue" },
  escalated: { label: "CEO-д шилжсэн", tone: "rose" },
  decided: { label: "Шийдвэрлэсэн", tone: "green" },
  appealed: { label: "Давж заалдсан", tone: "brand" },
  closed: { label: "Хаагдсан", tone: "neutral" },
  withdrawn: { label: "Татсан", tone: "neutral" },
};
export const ACTIVE_DISPUTE_STATUSES: DisputeStatus[] = ["open", "under_review", "escalated", "appealed"];

export const DISPUTE_DECISIONS = ["claimant", "respondent"] as const;
export type DisputeDecision = (typeof DISPUTE_DECISIONS)[number];
export const DISPUTE_DECISION_LABEL: Record<DisputeDecision, string> = {
  claimant: "Маргаан гаргагчийн талд — эзэмшил шилжинэ",
  respondent: "Одоогийн эзэмшигчийн талд — эзэмшил хэвээр",
};

export const APPEAL_OUTCOMES = ["upheld", "overturned"] as const;
export type AppealOutcome = (typeof APPEAL_OUTCOMES)[number];
export const APPEAL_OUTCOME_LABEL: Record<AppealOutcome, string> = {
  upheld: "Эхний шатны шийдвэрийг хэвээр үлдээх",
  overturned: "Эхний шатны шийдвэрийг өөрчлөх (эзэмшил нөгөө талд)",
};

export const CONFLICT_REASONS = ["party", "routed", "approved_shares", "involved", "coi", "not_found"] as const;
export type ConflictReason = (typeof CONFLICT_REASONS)[number];
export const CONFLICT_REASON_LABEL: Record<ConflictReason, string> = {
  party: "та маргааны тал",
  routed: "энэ сэжмийг та өөрөө бүртгэсэн эсвэл эзэмшигчийг нь оноосон",
  approved_shares: "талуудын үүрэг, хувийг та баталсан",
  involved: "та энэ харилцагчтай өөрөө ажилласан",
  coi: "та талуудтай эсвэл харилцагчтай хамааралтай гэж мэдүүлсэн",
  not_found: "маргаан олдсонгүй",
};

export function conflictLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return CONFLICT_REASON_LABEL[code as ConflictReason] ?? "ашиг сонирхлын зөрчилтэй";
}

export const EVIDENCE_KINDS = ["first_contact", "activity", "message", "document", "client_statement", "other"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  first_contact: "Анхны холболт (огноо, суваг)",
  activity: "Үйл ажиллагааны бүртгэл",
  message: "Зурвас, дуудлагын түүх",
  document: "Баримт бичиг",
  client_statement: "Харилцагчийн илэрхийлэл",
  other: "Бусад",
};

const evidenceItem = z
  .object({
    kind: z.enum(EVIDENCE_KINDS, { message: "Нотолгооны төрлийг сонгоно уу" }),
    text: z.string().trim().min(3, "Нотолгооны тайлбарыг бичнэ үү").max(1000, "Тайлбар хэт урт"),
    at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}/, "Огноо буруу")
      .optional()
      .or(z.literal("").transform(() => undefined)),
  })
  .strict();
export type EvidenceItem = z.infer<typeof evidenceItem>;

const evidenceList = z.array(evidenceItem).max(20, "Нотолгоо дээд тал нь 20 мөр");

export const disputeOpenSchema = z
  .object({
    contactId: z.string().uuid("Харилцагч буруу"),
    kind: z.enum(DISPUTE_KINDS, { message: "Маргааны төрлийг сонгоно уу" }),
    claim: z.string().trim().min(10, "Үндэслэлээ дэлгэрэнгүй бичнэ үү (10+ тэмдэгт)").max(2000, "Хэт урт"),
    evidence: evidenceList.min(1, "Дор хаяж нэг нотолгоо оруулна уу"),
  })
  .strict();
export type DisputeOpenInput = z.infer<typeof disputeOpenSchema>;

export const disputeEvidenceSchema = z
  .object({
    disputeId: z.string().uuid(),
    note: noteText.optional(),
    evidence: evidenceList,
  })
  .strict();

export const disputeReviewSchema = z
  .object({
    disputeId: z.string().uuid(),
    note: z.string().trim().min(10, "Хяналтын дүгнэлтийг дэлгэрэнгүй бичнэ үү").max(2000),
    recommendation: z.enum(DISPUTE_DECISIONS).nullable(),
  })
  .strict();

export const disputeDecideSchema = z
  .object({
    disputeId: z.string().uuid(),
    decision: z.enum(DISPUTE_DECISIONS, { message: "Шийдвэрээ сонгоно уу" }),
    rationale: z.string().trim().min(10, "Шийдвэрийн үндэслэлийг дэлгэрэнгүй бичнэ үү").max(2000),
  })
  .strict();

export const disputeEscalateSchema = z
  .object({
    disputeId: z.string().uuid(),
    reason: z.string().trim().min(5, "Шилжүүлэх шалтгаанаа бичнэ үү").max(1000),
  })
  .strict();

export const disputeAppealSchema = z
  .object({
    disputeId: z.string().uuid(),
    text: z.string().trim().min(10, "Давж заалдах үндэслэлийг дэлгэрэнгүй бичнэ үү").max(2000),
  })
  .strict();

export const appealDecideSchema = z
  .object({
    disputeId: z.string().uuid(),
    outcome: z.enum(APPEAL_OUTCOMES, { message: "Шийдвэрээ сонгоно уу" }),
    rationale: z.string().trim().min(10, "Шийдвэрийн үндэслэлийг дэлгэрэнгүй бичнэ үү").max(2000),
  })
  .strict();

export type DisputeActor = {
  me: string;
  roles: readonly CrmRole[];
  /** Талуудын багийн ахлагч мөн эсэх (сервер тооцно). */
  isTeamLeadOfParty: boolean;
  /** crm_lead_dispute_conflict()-ийн хариу (null = зөрчилгүй). */
  conflict: string | null;
};

export type DisputeLite = {
  status: DisputeStatus;
  claimant_id: string;
  respondent_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
};

/** Дуудагч энэ маргаан дээр юу хийж болохыг (DB-ийн дүрмийн толь) тооцно. */
export function disputeAbilities(
  d: DisputeLite,
  a: DisputeActor,
  opts: { appealDays: number; now?: Date } = { appealDays: 5 }
): {
  addEvidence: boolean;
  review: boolean;
  escalate: boolean;
  decide: boolean;
  decideBlockedReason: string | null;
  appeal: boolean;
  decideAppeal: boolean;
  withdraw: boolean;
} {
  const isParty = a.me === d.claimant_id || a.me === d.respondent_id;
  const activeFirst = d.status === "open" || d.status === "under_review" || d.status === "escalated";
  const decideRole = d.status === "escalated" ? a.roles.includes("ceo") : a.roles.includes("sales_director");
  let decideBlockedReason: string | null = null;
  if (activeFirst && decideRole && a.conflict) {
    decideBlockedReason = conflictLabel(a.conflict);
  }
  const now = opts.now ?? new Date();
  const withinAppeal =
    d.status === "decided" &&
    !!d.decided_at &&
    now.getTime() - new Date(d.decided_at).getTime() <= opts.appealDays * 86400000;
  return {
    addEvidence: isParty && activeFirst,
    review:
      !isParty && activeFirst && (a.roles.includes("ops_qc") || (a.roles.includes("team_lead") && a.isTeamLeadOfParty)),
    escalate:
      (d.status === "open" || d.status === "under_review") &&
      (a.roles.includes("sales_director") || a.roles.includes("ops_qc") || a.roles.includes("team_lead")),
    decide: activeFirst && decideRole && !a.conflict,
    decideBlockedReason,
    appeal: isParty && withinAppeal,
    decideAppeal: d.status === "appealed" && a.roles.includes("ceo") && !a.conflict && a.me !== d.decided_by,
    withdraw: a.me === d.claimant_id && activeFirst,
  };
}

// ── Ашиг сонирхлын мэдүүлэг ──────────────────────────────

export const COI_RELATIONS = ["family", "business", "personal", "self", "other"] as const;
export type CoiRelation = (typeof COI_RELATIONS)[number];
export const COI_RELATION_LABEL: Record<CoiRelation, string> = {
  family: "Гэр бүл, садан",
  business: "Бизнесийн холбоо",
  personal: "Хувийн танил",
  self: "Өөрөө оролцогч тал",
  other: "Бусад",
};

export const coiSchema = z
  .object({
    contactId: z.string().uuid().nullable(),
    relatedProfileId: z.string().uuid().nullable(),
    relation: z.enum(COI_RELATIONS, { message: "Хамаарлын төрлийг сонгоно уу" }),
    note: noteText.optional(),
  })
  .strict()
  .refine((v) => !!v.contactId || !!v.relatedProfileId, {
    message: "Харилцагч эсвэл ажилтныг сонгоно уу",
  })
  .refine((v) => v.relation !== "other" || (v.note ?? "").length >= 5, {
    message: "«Бусад» хамаарлыг тайлбарлана уу",
    path: ["note"],
  });

// ── Харилцагч шалгах (давхардал) ──────────────────────────

export const duplicateSearchSchema = z
  .object({
    phone: z.string().trim().max(40).optional(),
    email: z.string().trim().max(200).optional(),
    name: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine(
    (v) =>
      (v.phone ?? "").replace(/\D/g, "").length >= 6 ||
      (v.email ?? "").includes("@") ||
      (v.name ?? "").length >= 3,
    { message: "Утас (6+ орон), и-мэйл эсвэл нэр (3+ үсэг) оруулна уу" }
  );

export const DUPLICATE_MATCH_LABEL: Record<string, string> = {
  phone: "Утас таарсан",
  email: "И-мэйл таарсан",
  name: "Нэр ойролцоо",
};

// ── Чөлөө ────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Огноо буруу");

export const leaveSchema = z
  .object({
    staffId: z.string().uuid(),
    from: isoDate.nullable(),
    to: isoDate.nullable(),
    substituteId: z.string().uuid().nullable(),
    note: noteText.optional(),
  })
  .strict()
  .refine((v) => !v.to || !!v.from, { message: "Эхлэх огноог оруулна уу", path: ["from"] })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "Дуусах огноо эхлэхээс өмнө байна", path: ["to"] });

/** Тухайн өдөр (YYYY-MM-DD) чөлөөтэй эсэх — DB crm_staff_on_leave()-тэй ижил. */
export function isOnLeave(from: string | null, to: string | null, day: string): boolean {
  if (!from) return false;
  return from <= day && (!to || to >= day);
}

// ── Тохиргооны эрх (DB crm_setting_writable/crm_lookup_writable-тэй ижил) ──

export const SALES_DIRECTOR_SETTING_KEYS = [
  "lead_score_weights",
  "lead_score_factors",
  "lead_grade_thresholds",
  "inactivity_thresholds",
  "recycle_thresholds",
  "recontact_frequency",
  "recontact_ranges",
  "automation_thresholds",
  "sla_policy",
  "sla_first_contact_min",
  "lead_assignment",
  "lead_accept",
  "pool_settings",
  "lead_dispute",
  "match_weights",
  "match_thresholds",
  "weekly_targets",
  "agent_score_weights",
  "kpi_targets",
  "kpi_scope",
  "weekly_cycle",
  "today_queue",
  "daily_rhythm",
  "daily_norms",
  "worklists",
  "leaderboard",
  "tracks",
  "push_defaults",
  "public_links",
] as const;

export const MARKETING_SETTING_KEYS = ["marketing_costs", "campaign_costs"] as const;
export const MARKETING_LOOKUP_KINDS = ["lead_source"] as const;

export function canWriteSetting(roles: readonly CrmRole[], key: string): boolean {
  if (roles.includes("sysadmin") || roles.includes("ops_qc")) return true;
  if (roles.includes("sales_director") && (SALES_DIRECTOR_SETTING_KEYS as readonly string[]).includes(key)) return true;
  if (roles.includes("marketing") && (MARKETING_SETTING_KEYS as readonly string[]).includes(key)) return true;
  return false;
}

export function canWriteLookup(roles: readonly CrmRole[], kind: string): boolean {
  if (roles.includes("sysadmin") || roles.includes("ops_qc")) return true;
  return roles.includes("marketing") && (MARKETING_LOOKUP_KINDS as readonly string[]).includes(kind);
}

// ── Бүтэцтэй тохиргооны маягт (UX-11) ────────────────────

export type SettingField = {
  name: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
};

export type SettingFormSpec =
  | {
      kind: "map";
      fields: SettingField[];
      /** Нийлбэр яг энэ утгатай тэнцэх ёстой (жин). */
      sumTo?: number;
      /** Утгууд талбарын дарааллаар буурах ёстой (ангиллын босго). */
      descending?: boolean;
      /** Утгууд талбарын дарааллаар өсөх ёстой (хоногийн босго). */
      ascending?: boolean;
      /** Маягтад байхгүй түлхүүрүүдийг хуучин утгаас хадгална. */
      keepUnknown?: boolean;
    }
  | { kind: "scalar"; field: SettingField }
  | { kind: "toggle_map"; toggle: { name: string; label: string }; fields: SettingField[] };

export type SettingValues = Record<string, number | boolean | null>;

/** Маягтын утгыг шалгаж JSON утга буцаана. */
export function buildSettingValue(
  spec: SettingFormSpec,
  values: SettingValues,
  previous?: unknown
): { value: unknown } | { error: string } {
  const num = (f: SettingField): number | { error: string } => {
    const v = values[f.name];
    if (typeof v !== "number" || !Number.isFinite(v)) return { error: `«${f.label}» утгыг оруулна уу` };
    if (v < f.min || v > f.max) return { error: `«${f.label}» ${f.min}–${f.max} хооронд байна` };
    return v;
  };

  if (spec.kind === "scalar") {
    const v = num(spec.field);
    return typeof v === "number" ? { value: v } : v;
  }

  const out: Record<string, unknown> =
    spec.kind === "map" && spec.keepUnknown && previous && typeof previous === "object" && !Array.isArray(previous)
      ? { ...(previous as Record<string, unknown>) }
      : {};
  const nums: number[] = [];
  for (const f of spec.fields) {
    const v = num(f);
    if (typeof v !== "number") return v;
    out[f.name] = v;
    nums.push(v);
  }
  if (spec.kind === "toggle_map") {
    out[spec.toggle.name] = values[spec.toggle.name] === true;
    return { value: out };
  }
  if (spec.sumTo != null) {
    const sum = Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
    if (sum !== spec.sumTo) return { error: `Жингийн нийлбэр ${spec.sumTo} байх ёстой (одоо ${sum})` };
  }
  if (spec.descending) {
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] >= nums[i - 1]) return { error: "Босго дээд ангиллаас доод руу буурах ёстой" };
    }
  }
  if (spec.ascending) {
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] < nums[i - 1]) return { error: "Хоногийн босго ангиллаар өсөх ёстой" };
    }
  }
  return { value: out };
}

/** Одоогийн JSON утгаас маягтын анхны утгыг гаргана. */
export function settingValuesFrom(spec: SettingFormSpec, current: unknown): SettingValues {
  const obj = current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>) : {};
  const pick = (name: string): number | null => (typeof obj[name] === "number" ? (obj[name] as number) : null);
  if (spec.kind === "scalar") {
    return { [spec.field.name]: typeof current === "number" ? current : null };
  }
  const out: SettingValues = {};
  for (const f of spec.fields) out[f.name] = pick(f.name);
  if (spec.kind === "toggle_map") out[spec.toggle.name] = obj[spec.toggle.name] !== false;
  return out;
}

// ── Экспорт (§6.32) ──────────────────────────────────────

export const EXPORT_SCOPES = ["contacts", "leads", "transactions"] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];
export const EXPORT_SCOPE_LABEL: Record<ExportScope, string> = {
  contacts: "Харилцагчийн жагсаалт",
  leads: "Сэжимийн жагсаалт",
  transactions: "Хэлцлийн жагсаалт",
};
export const EXPORT_STATUS_LABEL: Record<string, { label: string; tone: "amber" | "green" | "rose" | "neutral" | "blue" }> = {
  requested: { label: "Хүлээгдэж буй", tone: "amber" },
  approved: { label: "Зөвшөөрсөн", tone: "green" },
  rejected: { label: "Татгалзсан", tone: "rose" },
  completed: { label: "Татсан", tone: "blue" },
  expired: { label: "Хугацаа дууссан", tone: "neutral" },
  cancelled: { label: "Цуцалсан", tone: "neutral" },
};

/** Шууд экспорт хийж болох дүр (бусад нь зөвшөөрөл хүснэ). */
export const DIRECT_EXPORT_ROLES: CrmRole[] = ["ops_qc", "sales_director", "ceo"];

export function exportNeedsApproval(roles: readonly CrmRole[], rows: number, directMaxRows: number): boolean {
  const direct = roles.some((r) => DIRECT_EXPORT_ROLES.includes(r));
  if (!direct) return true;
  return rows > directMaxRows;
}

export const exportRequestSchema = z
  .object({
    scope: z.enum(EXPORT_SCOPES, { message: "Юуг экспортлохоо сонгоно уу" }),
    reason: z.string().trim().min(10, "Ямар зорилгоор хэрэгтэйг дэлгэрэнгүй бичнэ үү (10+ тэмдэгт)").max(1000),
    rowEstimate: z.number().int().min(1).max(100000).nullable(),
    filters: z.record(z.string(), z.string()).default({}),
  })
  .strict();

export const exportDecideSchema = z
  .object({
    requestId: z.string().uuid(),
    approve: z.boolean(),
    note: noteText.optional(),
    maxRows: z.number().int().min(1).max(100000).nullable(),
  })
  .strict()
  .refine((v) => v.approve || (v.note ?? "").length >= 5, { message: "Татгалзсан шалтгаанаа бичнэ үү", path: ["note"] });

// ── Хувь хүний мэдээллийн хүсэлт (§6.32) ──────────────────

export const DATA_REQUEST_KINDS = ["access", "rectify", "erase"] as const;
export type DataRequestKind = (typeof DATA_REQUEST_KINDS)[number];
export const DATA_REQUEST_KIND_LABEL: Record<DataRequestKind, string> = {
  access: "Мэдээлэлтэйгээ танилцах",
  rectify: "Мэдээллээ засуулах",
  erase: "Мэдээллээ устгуулах",
};
export const DATA_REQUEST_STATUS_LABEL: Record<string, { label: string; tone: "amber" | "green" | "rose" | "blue" }> = {
  received: { label: "Хүлээн авсан", tone: "amber" },
  approved: { label: "Зөвшөөрсөн", tone: "blue" },
  rejected: { label: "Татгалзсан", tone: "rose" },
  completed: { label: "Гүйцэтгэсэн", tone: "green" },
};
export const ANONYMIZE_BLOCKER_LABEL: Record<string, string> = {
  open_lead: "нээлттэй сэжимтэй",
  open_opportunity: "нээлттэй боломжтой",
  active_lease: "хүчинтэй түрээсийн гэрээтэй",
  aml_case: "МУТСТ-ийн нээлттэй кейстэй",
  retention: "хэлцлийн баримтын хадгалах хугацаа дуусаагүй",
  not_found: "харилцагч олдсонгүй",
};

export const dataRequestSchema = z
  .object({
    contactId: z.string().uuid("Харилцагчийг сонгоно уу"),
    kind: z.enum(DATA_REQUEST_KINDS, { message: "Хүсэлтийн төрлийг сонгоно уу" }),
    channel: z.string().trim().max(100).optional(),
    note: noteText.optional(),
  })
  .strict();

export const dataDecideSchema = z
  .object({
    requestId: z.string().uuid(),
    approve: z.boolean(),
    note: z.string().trim().min(5, "Шийдвэрийн тайлбар бичнэ үү").max(1000),
  })
  .strict();

// ── Гарах ажилтны нэгдсэн шалгалт (CRM-ээс гадуурх замд) ──

/** crm_offboarding_blockers() RPC-ийн хариу. */
export type OffboardingBlockers = {
  has_staff: boolean;
  staff_id?: string;
  office_id?: string;
  is_active?: boolean;
  offboarding?: boolean;
  leads?: number;
  opportunities?: number;
  property_roles?: number;
  had_ownership?: boolean;
  approved_act?: boolean;
};

/** Нэвтрэлт хаах / идэвхгүй болгох / устгахаас өмнөх хориг (null = болно). */
export function offboardingBlockMessage(b: OffboardingBlockers, action: "disable" | "delete"): string | null {
  if (!b.has_staff) return null;
  if (action === "delete") {
    return "Энэ ажилтан CRM-д бүртгэлтэй — CRM-ийн бүртгэл, нотолгоо хадгалагдах ёстой тул бүрэн устгахгүй. Хүлээлцэх актаар шилжүүлж, CRM-ээс идэвхгүй болгоод нэвтрэлтийг хаана уу.";
  }
  const open = (b.leads ?? 0) + (b.opportunities ?? 0) + (b.property_roles ?? 0);
  if (open > 0) {
    return `Хүлээлцэх дуусаагүй — CRM-д ${open} нээлттэй бичлэг (сэжим ${b.leads ?? 0}, боломж ${b.opportunities ?? 0}, үл хөдлөхийн үүрэг ${b.property_roles ?? 0}) байна. CRM тохиргоо → Ажилтан хэсэгт гарах урсгал эхлүүлж шилжүүлнэ үү.`;
  }
  if (b.is_active && b.had_ownership && !b.approved_act) {
    return "Батлагдсан хүлээлцэх акт шаардлагатай — CRM тохиргоо → Ажилтан хэсэгт гарах урсгалаа дуусгана уу.";
  }
  return null;
}
