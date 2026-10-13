import { z } from "zod";

import {
  CONTACT_KINDS,
  CONTACT_TYPES,
  CONSENT_STATUSES,
  LEAD_GRADES,
  PROFILE_STATUSES,
} from "@/lib/constants-crm";
import { normalizePhone, normalizeEmail } from "@/lib/crm/normalize";

/**
 * Харилцагч, сэжим, профайлын серверийн оролтын баталгаажуулалт (U2).
 * lib/validation/task.ts загвар: Zod v4 .strict(), монгол мессеж,
 * wrapper нь { data } | { error } буцаана (шидэхгүй).
 * Тэмдэглэл: эзэмшлийн хуваарьт validation нэг файлд (crm.ts) нэгтгэгдсэн.
 */

function firstError(error: z.ZodError): string {
  const issue = error.issues[0];
  const msg = issue?.message;
  return msg && !msg.startsWith("Invalid") && !msg.startsWith("Expected") ? msg : "Оролт буруу байна.";
}

// ── Харилцагч (F-100–106) ─────────────────────────────────

const phoneSchema = z
  .string()
  .trim()
  .min(1, "Утасны дугаар оруулна уу")
  .refine((v) => normalizePhone(v) !== "", "Утасны дугаар буруу байна");

const emailSchema = z
  .string()
  .trim()
  .min(1, "И-мэйл оруулна уу")
  .refine((v) => normalizeEmail(v) !== "", "И-мэйлийн формат буруу байна");

const contactSchema = z
  .object({
    id: z.string().uuid().optional(),
    kind: z.enum(CONTACT_KINDS),
    lastName: z.string().trim().max(255, "Овог хэт урт байна").nullable(),
    firstName: z.string().trim().max(255, "Нэр хэт урт байна").nullable(),
    orgName: z.string().trim().max(255, "Байгууллагын нэр хэт урт байна").nullable(),
    contactTypes: z.array(z.enum(CONTACT_TYPES)).min(1, "Харилцагчийн төрөл сонгоно уу"),
    sourceId: z.string().uuid("Эх сурвалж сонгоно уу"),
    sourceDetail: z.string().trim().max(500, "Эх сурвалжийн дэлгэрэнгүй хэт урт байна").nullable(),
    branchId: z.string().uuid().nullable(),
    phones: z.array(phoneSchema).max(10, "Утас хэт олон байна"),
    emails: z.array(emailSchema).max(10, "И-мэйл хэт олон байна"),
    consent: z.enum(CONSENT_STATUSES),
    consentChannel: z.string().trim().max(100).nullable(),
    /** Давхардлын анхааруулгыг үл хэрэгссэн тэмдэг (F-107 — аудитад бүртгэгдэнэ). */
    duplicateOverride: z.boolean().optional(),
  })
  .strict();

export type ContactInput = z.infer<typeof contactSchema>;

export function validateContactInput(input: unknown): { data: ContactInput } | { error: string } {
  const r = contactSchema.safeParse(input);
  if (!r.success) return { error: firstError(r.error) };
  const d = r.data;
  if (d.kind === "person" && !d.firstName) return { error: "Хувь хүнд нэр заавал." };
  if (d.kind === "company" && !d.orgName) return { error: "Хуулийн этгээдэд байгууллагын нэр заавал." };
  if (d.phones.length === 0 && d.emails.length === 0) {
    return { error: "Утас эсвэл и-мэйлийн дор хаяж нэг нь заавал." };
  }
  return { data: d };
}

// ── Сэжим (F-100–128) ─────────────────────────────────────

const leadSchema = z
  .object({
    id: z.string().uuid().optional(),
    /** Байгаа харилцагч сонгосон бол id; шинээр бол newContact бөглөнө. */
    contactId: z.string().uuid().nullable(),
    newContact: contactSchema.omit({ id: true, duplicateOverride: true }).nullable(),
    sourceId: z.string().uuid("Эх сурвалж сонгоно уу").nullable(),
    campaignCode: z.string().trim().max(100).nullable(),
    channelRef: z.string().trim().max(200).nullable(),
    branchId: z.string().uuid().nullable(),
    grade: z.enum(LEAD_GRADES).nullable(),
    gradeOverrideReason: z.string().trim().max(500).nullable(),
    nextStep: z.string().trim().max(300, "Дараагийн алхам хэт урт байна").nullable(),
    nextStepDate: z.string().nullable(),
    duplicateOverride: z.boolean().optional(),
  })
  .strict();

export type LeadInput = z.infer<typeof leadSchema>;

export function validateLeadInput(input: unknown): { data: LeadInput } | { error: string } {
  const r = leadSchema.safeParse(input);
  if (!r.success) return { error: firstError(r.error) };
  const d = r.data;
  if (!d.contactId && !d.newContact) return { error: "Харилцагч сонгох эсвэл шинээр бүртгэнэ үү." };
  if (d.newContact) {
    const c = validateContactInput({ ...d.newContact, duplicateOverride: d.duplicateOverride });
    if ("error" in c) return { error: c.error };
  }
  if (d.nextStepDate != null && Number.isNaN(Date.parse(d.nextStepDate))) {
    return { error: "Дараагийн алхмын огноо буруу байна." };
  }
  return { data: d };
}

/** Идэвхжүүлэлт — алтан дүрмийн 5 бүрдэл (F-125). */
const activateLeadSchema = z
  .object({
    grade: z.enum(LEAD_GRADES, "Ангилал сонгоно уу"),
    gradeOverrideReason: z.string().trim().max(500).nullable(),
    nextStep: z.string().trim().min(1, "Дараагийн алхам заавал").max(300),
    nextStepDate: z.string().min(1, "Дараагийн алхмын огноо заавал"),
  })
  .strict();

export type ActivateLeadInput = z.infer<typeof activateLeadSchema>;

export function validateActivateLead(input: unknown): { data: ActivateLeadInput } | { error: string } {
  const r = activateLeadSchema.safeParse(input);
  if (!r.success) return { error: firstError(r.error) };
  if (Number.isNaN(Date.parse(r.data.nextStepDate))) return { error: "Дараагийн алхмын огноо буруу байна." };
  return { data: r.data };
}

// ── Хэрэгцээний профайл (F-150–152, 4.2.1) ────────────────

export const NEED_PROFILE_TYPES = ["buyer", "tenant", "investor", "intl_buyer"] as const;
export type NeedProfileType = (typeof NEED_PROFILE_TYPES)[number];
export const NEED_PROFILE_TYPE_LABEL: Record<NeedProfileType, string> = {
  buyer: "Худалдан авагч",
  tenant: "Түрээслэгч",
  investor: "Хөрөнгө оруулагч",
  intl_buyer: "Олон улсын худалдан авагч",
};

export const FINANCING_OPTIONS = ["cash", "loan", "mixed", "not_ready"] as const;
export const FINANCING_LABEL: Record<(typeof FINANCING_OPTIONS)[number], string> = {
  cash: "Бэлэн мөнгө",
  loan: "Зээл",
  mixed: "Хосолсон",
  not_ready: "Бэлэн биш",
};

export const TIMELINE_OPTIONS = ["0_30", "1_3m", "3_12m", "12m_plus"] as const;
export const TIMELINE_LABEL: Record<(typeof TIMELINE_OPTIONS)[number], string> = {
  "0_30": "0–30 хоног",
  "1_3m": "1–3 сар",
  "3_12m": "3–12 сар",
  "12m_plus": "12+ сар",
};

const structuredListItem = z.string().trim().min(1, "Хоосон мөр байна").max(200, "Мөр хэт урт байна");

const needProfileSchema = z
  .object({
    id: z.string().uuid().optional(),
    contactId: z.string().uuid("Харилцагч сонгоно уу"),
    profileType: z.enum(NEED_PROFILE_TYPES),
    goalId: z.string().uuid().nullable(),
    locations: z.array(z.string().trim().min(1)).min(1, "Сонирхсон байршил сонгоно уу").max(20),
    propertyTypes: z.array(z.string().trim().min(1)).min(1, "Үл хөдлөхийн төрөл сонгоно уу").max(10),
    budgetMin: z.number().nonnegative("Төсөв сөрөг байж болохгүй").nullable(),
    budgetTarget: z.number().nonnegative().nullable(),
    budgetMax: z.number().positive("Төсвийн дээд хязгаар заавал"),
    financing: z.enum(FINANCING_OPTIONS),
    roomsMin: z.number().int().nonnegative().nullable(),
    areaMin: z.number().nonnegative().nullable(),
    conditions: z.array(z.string().trim().min(1)).max(20),
    timeline: z.enum(TIMELINE_OPTIONS),
    moveInDate: z.string().nullable(),
    mustHaves: z.array(structuredListItem).min(1, "Заавал байх 3–5 шаардлага бүртгэнэ үү").max(5, "Заавал шаардлага дээд тал нь 5"),
    niceToHaves: z.array(structuredListItem).max(10, "Байвал сайн нөхцөл хэт олон байна"),
    dealBreakers: z.array(structuredListItem).max(10, "Таслах нөхцөл хэт олон байна"),
    decisionMaker: z.string().trim().max(100).nullable(),
    blocker: z.string().trim().max(200).nullable(),
  })
  .strict();

export type NeedProfileInput = z.infer<typeof needProfileSchema>;

export function validateNeedProfile(input: unknown): { data: NeedProfileInput } | { error: string } {
  const r = needProfileSchema.safeParse(input);
  if (!r.success) return { error: firstError(r.error) };
  const d = r.data;
  if (d.budgetMin != null && d.budgetMin > d.budgetMax) {
    return { error: "Төсвийн доод хязгаар дээдээс их байж болохгүй." };
  }
  if (d.budgetTarget != null && d.budgetTarget > d.budgetMax) {
    return { error: "Зорилтот төсөв дээд хязгаараас их байж болохгүй." };
  }
  if (d.profileType === "tenant") {
    if (!d.moveInDate) return { error: "Түрээслэгчийн профайлд орох огноо заавал." };
    if (Number.isNaN(Date.parse(d.moveInDate))) return { error: "Орох огноо буруу байна." };
  }
  return { data: d };
}

// ── Өмчлөгчийн профайл (F-153, 4.2.2) ─────────────────────

export const OWNER_GOALS = ["sell", "rent_out", "manage"] as const;
export const OWNER_GOAL_LABEL: Record<(typeof OWNER_GOALS)[number], string> = {
  sell: "Худалдах",
  rent_out: "Түрээслүүлэх",
  manage: "Менежментэд өгөх",
};

export const DECISION_AUTHORITIES = ["sole", "co_owner", "poa"] as const;
export const DECISION_AUTHORITY_LABEL: Record<(typeof DECISION_AUTHORITIES)[number], string> = {
  sole: "Дангаараа",
  co_owner: "Хамтран өмчлөгчтэй",
  poa: "Итгэмжлэлтэй",
};

export const LISTING_STATES = ["none", "negotiating", "agreed"] as const;
export const LISTING_STATE_LABEL: Record<(typeof LISTING_STATES)[number], string> = {
  none: "Листинггүй",
  negotiating: "Хэлэлцээр",
  agreed: "Гэрээтэй",
};

const ownerProfileSchema = z
  .object({
    id: z.string().uuid().optional(),
    contactId: z.string().uuid("Харилцагч сонгоно уу"),
    propertyId: z.string().uuid().nullable(),
    goal: z.enum(OWNER_GOALS),
    askingPrice: z.number().positive("Хүсэж буй үнэ заавал"),
    terms: z.string().trim().max(1000).nullable(),
    urgency: z.string().trim().max(100).nullable(),
    urgencyNote: z.string().trim().max(500).nullable(),
    decisionAuthority: z.enum(DECISION_AUTHORITIES),
    listingState: z.enum(LISTING_STATES),
  })
  .strict();

export type OwnerProfileInput = z.infer<typeof ownerProfileSchema>;

export function validateOwnerProfile(input: unknown): { data: OwnerProfileInput } | { error: string } {
  const r = ownerProfileSchema.safeParse(input);
  return r.success ? { data: r.data } : { error: firstError(r.error) };
}

// ── Профайлын төлөв (F-155/156) ───────────────────────────

const profileStatusSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(PROFILE_STATUSES),
    /** paused: дахин идэвхжүүлэх огноо заавал. */
    pausedUntil: z.string().nullable(),
    /** lost: алдсан шалтгаан заавал (лавлахаас). */
    lostReasonId: z.string().uuid().nullable(),
    /** fulfilled: амжилттай хаагдсан хэлцлийн холбоос заавал. */
    fulfilledTxnId: z.string().uuid().nullable(),
    nextStep: z.string().trim().max(300).nullable(),
  })
  .strict();

export type ProfileStatusInput = z.infer<typeof profileStatusSchema>;

export function validateProfileStatus(input: unknown): { data: ProfileStatusInput } | { error: string } {
  const r = profileStatusSchema.safeParse(input);
  if (!r.success) return { error: firstError(r.error) };
  const d = r.data;
  if (d.status === "paused" && !d.pausedUntil) return { error: "Түр зогсооход дахин идэвхжүүлэх огноо заавал." };
  if (d.status === "paused" && d.pausedUntil && Number.isNaN(Date.parse(d.pausedUntil))) {
    return { error: "Дахин идэвхжүүлэх огноо буруу байна." };
  }
  if (d.status === "lost" && !d.lostReasonId) return { error: "Алдагдсанд шалтгаан заавал (F-156)." };
  if (d.status === "fulfilled" && !d.fulfilledTxnId) {
    return { error: "Хангагдсанд амжилттай хаагдсан хэлцлийн холбоос заавал (F-156)." };
  }
  return { data: d };
}

// ── Merge (F-108) ─────────────────────────────────────────

export const MERGE_FIELDS = [
  "last_name",
  "first_name",
  "org_name",
  "display_name",
  "source_id",
  "source_detail",
  "branch_id",
  "consent",
] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];
export const MERGE_FIELD_LABEL: Record<MergeField, string> = {
  last_name: "Овог",
  first_name: "Нэр",
  org_name: "Байгууллагын нэр",
  display_name: "Дэлгэцийн нэр",
  source_id: "Эх сурвалж",
  source_detail: "Эх сурвалжийн дэлгэрэнгүй",
  branch_id: "Салбар",
  consent: "Зөвшөөрлийн төлөв",
};

const mergeSchema = z
  .object({
    primaryId: z.string().uuid(),
    mergedId: z.string().uuid(),
    // Zod v4-д enum түлхүүртэй record бүрэн байхыг шаарддаг тул string түлхүүр —
    // доорх wrapper-т MERGE_FIELDS-ээр шүүнэ.
    choices: z.record(z.string(), z.enum(["primary", "merged"])),
    amlApprovalNote: z.string().trim().max(500).nullable(),
  })
  .strict();

export type MergeInput = z.infer<typeof mergeSchema>;

export function validateMergeInput(input: unknown): { data: MergeInput } | { error: string } {
  const r = mergeSchema.safeParse(input);
  if (!r.success) return { error: firstError(r.error) };
  if (r.data.primaryId === r.data.mergedId) return { error: "Ижил бүртгэлийг нэгтгэх боломжгүй." };
  // Зөвхөн зөвшөөрөгдсөн талбарын сонголтыг үлдээнэ.
  const choices: Partial<Record<MergeField, "primary" | "merged">> = {};
  for (const f of MERGE_FIELDS) {
    const v = r.data.choices[f];
    if (v) choices[f] = v;
  }
  return { data: { ...r.data, choices } };
}

// ── Хадгалсан харагдац (F-121) ────────────────────────────

const savedViewSchema = z
  .object({
    page: z.string().trim().min(1).max(50),
    name: z.string().trim().min(1, "Харагдацын нэр оруулна уу").max(80, "Нэр хэт урт байна"),
    params: z.record(z.string(), z.string()),
  })
  .strict();

export type SavedViewInput = z.infer<typeof savedViewSchema>;

export function validateSavedView(input: unknown): { data: SavedViewInput } | { error: string } {
  const r = savedViewSchema.safeParse(input);
  return r.success ? { data: r.data } : { error: firstError(r.error) };
}

// ── Шилжүүлэлт (зарчим 6) ─────────────────────────────────

export const REASSIGN_REASONS = [
  "sla_breach",
  "inactivity",
  "client_request",
  "zoning",
  "offboarding",
] as const;
export type ReassignReason = (typeof REASSIGN_REASONS)[number];
export const REASSIGN_REASON_LABEL: Record<ReassignReason, string> = {
  sla_breach: "SLA хэтэрсэн",
  inactivity: "Идэвхгүй байдал",
  client_request: "Харилцагчийн хүсэлт",
  zoning: "Бүсийн чиглүүлэлт",
  offboarding: "Гарах ажилтан",
};

const reassignSchema = z
  .object({
    leadId: z.string().uuid(),
    newOwnerId: z.string().uuid("Шинэ эзэмшигч сонгоно уу"),
    reasonCode: z.enum(REASSIGN_REASONS, "Шилжүүлэлтийн шалтгаан сонгоно уу"),
    note: z.string().trim().max(500).nullable(),
  })
  .strict();

export type ReassignInput = z.infer<typeof reassignSchema>;

export function validateReassign(input: unknown): { data: ReassignInput } | { error: string } {
  const r = reassignSchema.safeParse(input);
  return r.success ? { data: r.data } : { error: firstError(r.error) };
}
