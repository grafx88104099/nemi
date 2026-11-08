"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, getSettingValue, type CrmStaffContext } from "@/lib/queries-crm-core";
import { createContact } from "@/lib/actions/crm-contacts";
import {
  validateLeadInput,
  validateActivateLead,
  validateReassign,
  validateMergeInput,
  type LeadInput,
  type ActivateLeadInput,
  type ReassignInput,
  type MergeInput,
} from "@/lib/validation/crm";
import {
  computeLeadScore,
  gradeFromScore,
  needProfileCompleteness,
  normalizeScoreFactors,
  normalizeScoreWeights,
  DEFAULT_GRADE_THRESHOLDS,
  type GradeThresholds,
  type LeadScoreInput,
  type NeedProfileSnapshot,
  type ScoreFactors,
  type ScoreWeights,
} from "@/lib/crm/scoring";
import {
  commitLeadAssignment,
  createFirstContactTask,
  firstContactDue,
  leadAssignmentSetting,
  lookupById,
  officeSlaEnv,
  planLeadAssignment,
} from "@/lib/crm/lead-intake";
import { registrarOwnsLead, ubToday } from "@/lib/crm/agent-core";
import { notifyCrm } from "@/lib/crm/notify";
import { LEAD_GRADES, LEAD_GRADE_LABEL, type LeadGrade, type CrmLifecycle } from "@/lib/constants-crm";
import type { Json } from "@/types/database";

/**
 * Сэжимийн бичилтүүд (PRO-001 v2.1 §6.1, §6.3–§6.6, §6.26). Гол дүрмүүд:
 *  • Идэвхтэй сэжимд эзэмшигч, ангилал, сүүлийн холболт, дараагийн үйлдэл,
 *    огноо заавал — DB CHECK эцсийн хамгаалалт, энд ойлгомжтой мессеж.
 *  • Реферал, хувийн сүлжээ, идэвхтэй хайлт, листингийн лавлагаагаар
 *    агент бүртгэвэл эзэмшигч нь бүртгэгч (§6.26), бусад нь Д-01.
 *  • Эхний холболт ЗӨВХӨН үйл ажиллагааны бүртгэлээр (logActivity) —
 *    «товч дарж холбогдсон болгох» зам байхгүй.
 *  • Эзэмшигч солих, эргэлтэд оруулах нь нотолгоотой RPC-ээр (crm-ownership).
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const AUTH_ERR = "Нэвтэрнэ үү.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";
const NOT_FOUND_ERR = "Сэжим олдсонгүй эсвэл танд эрх алга.";

const GOLDEN_RULE_ERR =
  "Идэвхтэй сэжимд эзэмшигч, ангилал, сүүлийн холболт, дараагийн үйлдэл ба огноо заавал.";

function revalidateLeadPaths(id?: string) {
  revalidatePath("/office/crm/leads");
  revalidatePath("/agent/crm/leads");
  revalidatePath("/office/crm");
  revalidatePath("/agent/crm");
  if (id) {
    revalidatePath(`/office/crm/leads/${id}`);
    revalidatePath(`/agent/crm/leads/${id}`);
  }
}

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

/** Аудит — definer RPC; алдаа үндсэн үйлдлийг унагахгүй. */
async function writeAudit(
  officeId: string,
  entity: string,
  entityId: string,
  action: string,
  extra?: { field?: string; reason?: string; oldValue?: unknown; newValue?: unknown }
) {
  try {
    const supabase = await createClient();
    await supabase.rpc("crm_write_audit", {
      p_office: officeId,
      p_entity: entity,
      p_entity_id: entityId,
      p_action: action,
      p_field: extra?.field ?? null,
      p_old: extra?.oldValue != null ? (JSON.parse(JSON.stringify(extra.oldValue)) as Json) : null,
      p_new: extra?.newValue != null ? (JSON.parse(JSON.stringify(extra.newValue)) as Json) : null,
      p_reason: extra?.reason ?? null,
    });
  } catch (e) {
    console.error("writeAudit:", e instanceof Error ? e.message : e);
  }
}

/** DB-ийн CHECK/trigger алдааг хэрэглэгчид ойлгомжтой болгоно (дотоод кодгүй). */
function friendlyDbError(message: string): string {
  if (message.includes("crm_leads_golden_rule")) return GOLDEN_RULE_ERR;
  if (message.includes("crm_leads_source_req")) return "Эх сурвалжгүй сэжим бүртгэхгүй — эх сурвалж сонгоно уу.";
  if (message.includes("шилжилт зөвшөөрөгдөөгүй")) {
    return "Энэ төлөвийн шилжилт зөвшөөрөгдөөгүй эсвэл танд эрх алга.";
  }
  if (message.includes("CRM:")) {
    return message
      .replace(/^.*CRM:\s*/, "")
      .replace(/\s*\((?:F|Д|D)-\d+[^)]*\)/g, "")
      .trim();
  }
  return SAVE_ERR;
}

function gradeLetter(g: LeadGrade): string {
  return LEAD_GRADE_LABEL[g].label;
}

// ── Оноо (§6.6) ───────────────────────────────────────────

type ScoreSettings = { weights: ScoreWeights; factors: ScoreFactors; thresholds: GradeThresholds };

async function scoreSettings(): Promise<ScoreSettings> {
  const [weights, factors, thresholds] = await Promise.all([
    getSettingValue("lead_score_weights"),
    getSettingValue("lead_score_factors"),
    getSettingValue<GradeThresholds>("lead_grade_thresholds"),
  ]);
  return {
    weights: normalizeScoreWeights(weights),
    factors: normalizeScoreFactors(factors),
    thresholds: thresholds ?? DEFAULT_GRADE_THRESHOLDS,
  };
}

type NeedRow = {
  goal_id: string | null;
  locations: Json;
  property_types: string[] | null;
  budget_min: number | null;
  budget_target: number | null;
  budget_max: number | null;
  financing: string | null;
  rooms_min: number | null;
  area_min: number | null;
  timeline: string | null;
  move_in_date: string | null;
  profile_type: string | null;
  must_haves: Json;
  nice_to_haves: Json;
  deal_breakers: Json;
  decision_maker: string | null;
  decision_maker_id?: string | null;
  decision_maker_involved?: boolean | null;
  blocker: string | null;
  blocker_id?: string | null;
};

function snapshotOf(p: NeedRow): NeedProfileSnapshot {
  const arr = (v: Json) => (Array.isArray(v) ? (v as unknown[]) : []);
  return {
    goalId: p.goal_id,
    locations: arr(p.locations),
    propertyTypes: p.property_types,
    budgetMin: p.budget_min,
    budgetMax: p.budget_max,
    budgetTarget: p.budget_target,
    financing: p.financing,
    roomsMin: p.rooms_min,
    areaMin: p.area_min,
    timeline: p.timeline,
    moveInDate: p.move_in_date,
    profileType: p.profile_type,
    mustHaves: arr(p.must_haves),
    niceToHaves: arr(p.nice_to_haves),
    dealBreakers: arr(p.deal_breakers),
    decisionMaker: p.decision_maker,
    decisionMakerId: p.decision_maker_id ?? null,
    decisionMakerInvolved: p.decision_maker_involved ?? null,
    blocker: p.blocker,
    blockerId: p.blocker_id ?? null,
  };
}

/** Онооны оролт: хамгийн бүрэн идэвхтэй профайл + 30 хоногийн утга бүхий идэвх. */
async function collectScoreInput(
  lead: { id: string | null; contact_id: string; last_contact_at: string | null },
  factors: ScoreFactors
): Promise<LeadScoreInput> {
  const supabase = await createClient();
  let profile: NeedProfileSnapshot | null = null;
  let completeness: number | null = null;
  const { data: profiles } = await supabase
    .from("crm_need_profiles")
    .select("*")
    .eq("contact_id", lead.contact_id)
    .eq("status", "active")
    .order("completeness_pct", { ascending: false, nullsFirst: false });
  const best = (profiles ?? [])[0] as unknown as NeedRow | undefined;
  if (best) {
    profile = snapshotOf(best);
    completeness = needProfileCompleteness(profile, { mustHavesMin: factors.must_haves_min });
  }

  let activityCount30d = 0;
  if (lead.id) {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { count } = await supabase
      .from("crm_activities")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", lead.id)
      .neq("channel", "task")
      .gte("occurred_at", since);
    activityCount30d = count ?? 0;
  }
  const lastContactDays = lead.last_contact_at
    ? Math.floor((Date.now() - new Date(lead.last_contact_at).getTime()) / 86400000)
    : null;
  return { profile, completenessPct: completeness, activityCount30d, lastContactDays };
}

/**
 * Оноог дахин тооцож хадгална; ангиллын САНАЛ буцаана (агент өөр ангилал
 * сонговол шалтгаантай setLeadGrade).
 */
export async function refreshLeadScore(
  leadId: string
): Promise<{ ok: boolean; score?: number; suggestedGrade?: LeadGrade; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const { data: lead } = await supabase
    .from("crm_leads")
    .select("id, contact_id, last_contact_at")
    .eq("id", leadId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!lead) return { ok: false, error: NOT_FOUND_ERR };

  const settings = await scoreSettings();
  const input = await collectScoreInput(lead, settings.factors);
  const { score, breakdown } = computeLeadScore(input, settings.weights, settings.factors);
  const suggestedGrade = gradeFromScore(score, settings.thresholds);

  // Оноо бол системийн тооцоо — эзэмшигч өөр байсан ч admin-аар бичнэ (эрхийг дээр шалгасан).
  const admin = createAdminClient();
  const { error } = await admin
    .from("crm_leads")
    .update({ score, score_breakdown: breakdown as unknown as Json })
    .eq("id", leadId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("refreshLeadScore:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  revalidateLeadPaths(leadId);
  return { ok: true, score, suggestedGrade };
}

/** Харилцагчийн бүх нээлттэй сэжимийн оноог сэргээнэ (профайл өөрчлөгдөхөд). */
export async function refreshLeadScoresForContact(contactId: string): Promise<void> {
  const supabase = await createClient();
  const { data: leads } = await supabase
    .from("crm_leads")
    .select("id")
    .eq("contact_id", contactId)
    .in("status", ["new", "active"]);
  for (const l of leads ?? []) {
    await refreshLeadScore(l.id);
  }
}

// ── Үүсгэх (§6.3, §6.4, §6.26) ────────────────────────────

export type CreateLeadResult = {
  id?: string;
  error?: string;
  /** Давхардал илэрсэн — UI сануулга үзүүлж баталгаажуулна. */
  duplicates?: import("@/lib/queries-crm-contacts").DuplicateHit[];
  maskedDuplicates?: import("@/lib/actions/crm-ownership").MaskedDuplicate[];
  queued?: boolean;
  /** Бүртгэгч өөрөө эзэмшигч болсон (§6.26). */
  ownedByRegistrar?: boolean;
  suggestedGrade?: LeadGrade;
};

export async function createLead(raw: LeadInput): Promise<CreateLeadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = validateLeadInput(raw);
  if ("error" in parsed) return { error: parsed.error };
  const input = parsed.data;
  const now = new Date();
  const admin = createAdminClient();

  // Эх сурвалж (§6.3): «Бусад» зэрэг тайлбар шаардах эх сурвалжид тайлбар заавал.
  const sourceIdCandidate = input.sourceId ?? input.newContact?.sourceId ?? null;
  let sourceDetail = input.sourceDetail ?? input.newContact?.sourceDetail ?? null;

  // Харилцагч: байгаа нь эсвэл шинэ.
  let contactId = input.contactId;
  let contactSourceId: string | null = null;
  if (contactId) {
    const { data: contact } = await supabase
      .from("crm_contacts")
      .select("id, source_id, source_detail, merged_into_id")
      .eq("id", contactId)
      .eq("office_id", ctx.officeId)
      .maybeSingle();
    if (!contact) return { error: "Харилцагч олдсонгүй эсвэл танд эрх алга." };
    if (contact.merged_into_id) {
      return { error: "Энэ бүртгэл нэгтгэгдсэн — үндсэн бүртгэл дээр сэжим үүсгэнэ үү." };
    }
    contactSourceId = contact.source_id;
    sourceDetail = sourceDetail ?? (input.sourceId ? null : contact.source_detail);
  }
  const sourceId = sourceIdCandidate ?? contactSourceId;
  if (!sourceId) return { error: "Эх сурвалжгүй сэжим бүртгэхгүй — эх сурвалж сонгоно уу." };
  const source = await lookupById(admin, sourceId);
  if (!source || source.kind !== "lead_source") return { error: "Эх сурвалж буруу байна." };
  if (source.requires_note && !sourceDetail?.trim()) {
    return { error: "Энэ эх сурвалжид тайлбар заавал — дэлгэрэнгүйг бичнэ үү." };
  }

  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : now;
  if (receivedAt.getTime() > now.getTime() + 5 * 60000) {
    return { error: "Мэдээлэл авсан огноо ирээдүйд байж болохгүй." };
  }
  if (input.nextStepDate && input.nextStepDate.slice(0, 10) < ubToday(now)) {
    return { error: "Дараагийн үйлдлийн огноо өнгөрсөн байж болохгүй." };
  }

  // Анхны оноо — байгаа профайл (байвал) дээр.
  const settings = await scoreSettings();
  let suggestedGrade: LeadGrade = "d";
  let score = 0;
  let breakdown: Record<string, number> = {};
  if (contactId) {
    const si = await collectScoreInput({ id: null, contact_id: contactId, last_contact_at: null }, settings.factors);
    const r = computeLeadScore(si, settings.weights, settings.factors);
    score = r.score;
    breakdown = r.breakdown;
  } else {
    const r = computeLeadScore({ activityCount30d: 0, lastContactDays: null }, settings.weights, settings.factors);
    score = r.score;
    breakdown = r.breakdown;
  }
  suggestedGrade = gradeFromScore(score, settings.thresholds);
  const grade: LeadGrade = input.grade ?? suggestedGrade;
  if (input.grade && input.grade !== suggestedGrade && !input.gradeOverrideReason?.trim()) {
    return {
      error: `Систем «${gradeLetter(suggestedGrade)}» ангилал санал болгож байна — өөр ангилал сонгоход шалтгаан заавал.`,
    };
  }

  // Шинэ харилцагч — эх сурвалжийн шалгалтын дараа (дутуу маягтаар хоосон бүртгэл үүсгэхгүй).
  if (!contactId && input.newContact) {
    const created = await createContact({
      ...input.newContact,
      sourceId,
      sourceDetail,
      duplicateOverride: input.duplicateOverride,
    });
    if (!created.id) {
      return { error: created.error ?? SAVE_ERR, duplicates: created.duplicates, maskedDuplicates: created.maskedDuplicates };
    }
    contactId = created.id;
  }
  if (!contactId) return { error: "Харилцагч сонгоно уу." };

  // Эзэмшигч (§6.26): бүртгэгч эсвэл Д-01.
  const assignSetting = await leadAssignmentSetting(admin, ctx.officeId);
  const registrarOwned = registrarOwnsLead(source.code, assignSetting.registrar_sources, ctx.roles.includes("agent"));
  const plan = registrarOwned
    ? null
    : await planLeadAssignment(admin, ctx.officeId, {
        sourceCode: source.code,
        branchId: input.branchId ?? ctx.branchId,
        grade,
      }, now);
  const ownerId = registrarOwned ? user.id : (plan?.ownerId ?? null);

  const env = await officeSlaEnv(admin, ctx.officeId, now);
  const firstDue = firstContactDue(env, receivedAt, source.code);

  const { data: leadRow, error } = await supabase
    .from("crm_leads")
    .insert({
      office_id: ctx.officeId,
      contact_id: contactId,
      branch_id: input.branchId ?? ctx.branchId,
      owner_id: ownerId,
      source_id: sourceId,
      source_detail: sourceDetail?.trim() || null,
      campaign_code: input.campaignCode,
      channel_ref: input.channelRef,
      status: "new",
      grade,
      grade_override_reason: input.grade && input.grade !== suggestedGrade ? input.gradeOverrideReason : null,
      score,
      score_breakdown: breakdown as unknown as Json,
      next_step: input.nextStep,
      next_step_date: input.nextStepDate ? input.nextStepDate.slice(0, 10) : null,
      received_at: receivedAt.toISOString(),
      first_contact_due_at: firstDue.toISOString(),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !leadRow) {
    console.error("createLead:", error?.message);
    return { error: friendlyDbError(error?.message ?? "") };
  }

  await commitLeadAssignment(admin, ctx.officeId, leadRow.id, plan ?? {
    ownerId,
    queued: false,
    dryRun: false,
    skipped: null,
    cursor: null,
    queue: [],
    wouldAssign: null,
  }, registrarOwned);

  if (ownerId) {
    await createFirstContactTask(admin, {
      officeId: ctx.officeId,
      createdBy: user.id,
      ownerId,
      leadId: leadRow.id,
      dueAt: firstDue,
      nextStep: input.nextStep,
      nextStepDate: input.nextStepDate,
    });
    if (ownerId !== user.id) {
      await notifyCrm({
        officeId: ctx.officeId,
        event: "lead_assigned",
        recipients: [ownerId],
        title: "Шинэ сэжим оноогдлоо",
        body: "Танд шинэ сэжим хуваарилагдлаа — эхний холболтын хугацаа эхэлсэн.",
        link: `/agent/crm/leads/${leadRow.id}`,
        entity: "crm_leads",
        entityId: leadRow.id,
      });
    }
  }

  revalidateLeadPaths();
  return { id: leadRow.id, queued: plan?.queued ?? false, ownedByRegistrar: registrarOwned, suggestedGrade };
}

// ── Засах ─────────────────────────────────────────────────

export type UpdateLeadInput = {
  id: string;
  sourceId?: string | null;
  sourceDetail?: string | null;
  campaignCode?: string | null;
  channelRef?: string | null;
  branchId?: string | null;
  nextStep?: string | null;
  nextStepDate?: string | null;
};

export async function updateLead(raw: UpdateLeadInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!raw.id) return { ok: false, error: "Сэжимийн дугаар алга." };
  if (raw.nextStepDate) {
    if (Number.isNaN(Date.parse(raw.nextStepDate))) return { ok: false, error: "Дараагийн үйлдлийн огноо буруу байна." };
    if (raw.nextStepDate.slice(0, 10) < ubToday()) {
      return { ok: false, error: "Дараагийн үйлдлийн огноо өнгөрсөн байж болохгүй." };
    }
  }
  if (raw.sourceId === null) return { ok: false, error: "Эх сурвалжийг хоослох боломжгүй." };
  if (raw.sourceId) {
    const src = await lookupById(createAdminClient(), raw.sourceId);
    if (!src || src.kind !== "lead_source") return { ok: false, error: "Эх сурвалж буруу байна." };
    if (src.requires_note && !raw.sourceDetail?.trim()) {
      return { ok: false, error: "Энэ эх сурвалжид тайлбар заавал." };
    }
  }

  const patch: {
    source_id?: string;
    source_detail?: string | null;
    campaign_code?: string | null;
    channel_ref?: string | null;
    branch_id?: string | null;
    next_step?: string | null;
    next_step_date?: string | null;
  } = {};
  if (raw.sourceId) patch.source_id = raw.sourceId;
  if (raw.sourceDetail !== undefined) patch.source_detail = raw.sourceDetail?.trim() || null;
  if (raw.campaignCode !== undefined) patch.campaign_code = raw.campaignCode?.trim() || null;
  if (raw.channelRef !== undefined) patch.channel_ref = raw.channelRef?.trim() || null;
  if (raw.branchId !== undefined) patch.branch_id = raw.branchId;
  if (raw.nextStep !== undefined) patch.next_step = raw.nextStep?.trim() || null;
  if (raw.nextStepDate !== undefined) patch.next_step_date = raw.nextStepDate?.slice(0, 10) || null;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error, count } = await supabase
    .from("crm_leads")
    .update(patch, { count: "exact" })
    .eq("id", raw.id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("updateLead:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  if (!count) return { ok: false, error: "Сэжим олдсонгүй эсвэл танд засах эрх алга." };
  revalidateLeadPaths(raw.id);
  return { ok: true };
}

/** Ангилал — системийн саналаас зөрвөл шалтгаан заавал; аудит trigger түүхэлнэ. */
export async function setLeadGrade(
  leadId: string,
  grade: LeadGrade,
  reason?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!LEAD_GRADES.includes(grade)) return { ok: false, error: "Ангилал буруу." };

  const { data: lead } = await supabase
    .from("crm_leads")
    .select("id, score")
    .eq("id", leadId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!lead) return { ok: false, error: NOT_FOUND_ERR };

  const { thresholds } = await scoreSettings();
  const suggested = lead.score != null ? gradeFromScore(Number(lead.score), thresholds) : null;
  const isOverride = suggested != null && grade !== suggested;
  if (isOverride && !reason?.trim()) {
    return {
      ok: false,
      error: `Систем «${gradeLetter(suggested)}» санал болгож байна — өөр ангилалд шалтгаан заавал.`,
    };
  }

  const { error, count } = await supabase
    .from("crm_leads")
    .update({ grade, grade_override_reason: isOverride ? reason?.trim() : null }, { count: "exact" })
    .eq("id", leadId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("setLeadGrade:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  if (!count) return { ok: false, error: NOT_FOUND_ERR };
  revalidateLeadPaths(leadId);
  return { ok: true };
}

/**
 * Шинэ → Идэвхтэй: утга бүхий холболт бүртгэгдсэн, бүрдлүүд бүрэн үед.
 * Мөн Идэвхгүй → Идэвхтэй (дахин идэвхжүүлэлт — trigger дүр шалгана).
 */
export async function activateLead(
  leadId: string,
  raw: ActivateLeadInput
): Promise<{ ok: boolean; error?: string; missing?: string[] }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const parsed = validateActivateLead(raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const input = parsed.data;
  if (input.nextStepDate.slice(0, 10) < ubToday()) {
    return { ok: false, error: "Дараагийн үйлдлийн огноо өнгөрсөн байж болохгүй." };
  }

  const { data: lead } = await supabase
    .from("crm_leads")
    .select("id, status, owner_id, last_contact_at, score")
    .eq("id", leadId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!lead) return { ok: false, error: NOT_FOUND_ERR };

  const missing: string[] = [];
  if (!lead.owner_id) missing.push("Эзэмшигч (эхлээд хуваарилна)");
  if (!lead.last_contact_at) missing.push("Утга бүхий холболт (үр дүнгээ бүртгэнэ үү)");
  if (missing.length > 0) {
    return { ok: false, error: "Идэвхжүүлэхийн өмнө дутуу бүрдлүүдийг нөхнө үү.", missing };
  }

  const { thresholds } = await scoreSettings();
  const suggested = lead.score != null ? gradeFromScore(Number(lead.score), thresholds) : null;
  if (suggested != null && input.grade !== suggested && !input.gradeOverrideReason?.trim()) {
    return {
      ok: false,
      error: `Систем «${gradeLetter(suggested)}» санал болгож байна — өөр ангилалд шалтгаан заавал.`,
    };
  }

  const { error, count } = await supabase
    .from("crm_leads")
    .update(
      {
        status: "active",
        grade: input.grade,
        grade_override_reason:
          suggested != null && input.grade !== suggested ? input.gradeOverrideReason?.trim() : null,
        next_step: input.nextStep,
        next_step_date: input.nextStepDate.slice(0, 10),
      },
      { count: "exact" }
    )
    .eq("id", leadId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("activateLead:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  if (!count) return { ok: false, error: NOT_FOUND_ERR };
  revalidateLeadPaths(leadId);
  return { ok: true };
}

/**
 * Амьдралын мөчлөгийн бусад шилжилт — trigger заагаагүй шилжилт, эрхгүй
 * дүрийг хориглоно. Идэвхгүй болгоход шалтгаан заавал (§6.27).
 * Эргэлтэд оруулах нь crm-ownership.recycleLeadWithReview-ээр л.
 */
export async function setLeadStatus(
  leadId: string,
  status: CrmLifecycle,
  note?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (status === "recycled") {
    return { ok: false, error: "Эргэлтэд оруулахдаа «Эзэмшил» хэсгийн хянан үзэх маягтыг ашиглана уу." };
  }
  if (status === "inactive" && (note?.trim().length ?? 0) < 10) {
    return { ok: false, error: "Идэвхгүй болгох шалтгааныг тодорхой бичнэ үү (10+ тэмдэгт)." };
  }

  const { error, count } = await supabase
    .from("crm_leads")
    .update({ status }, { count: "exact" })
    .eq("id", leadId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("setLeadStatus:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  if (!count) return { ok: false, error: NOT_FOUND_ERR };
  if (note?.trim()) {
    await writeAudit(ctx.officeId, "crm_leads", leadId, "status_note", {
      field: "status",
      newValue: status,
      reason: note.trim(),
    });
  }
  revalidateLeadPaths(leadId);
  return { ok: true };
}

// ── Шилжүүлэлт (хуучин зам — багц шилжүүлэлтэд) ──────────

export async function reassignLead(raw: ReassignInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const parsed = validateReassign(raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const input = parsed.data;

  const { error } = await supabase.rpc("crm_reassign_lead", {
    p_lead: input.leadId,
    p_new_owner: input.newOwnerId,
    p_reason: input.reasonCode,
    p_note: input.note,
  });
  if (error) {
    console.error("reassignLead:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  await notifyCrm({
    officeId: ctx.officeId,
    event: "lead_assigned",
    recipients: [input.newOwnerId],
    title: "Сэжим шилжиж ирлээ",
    body: "Танд сэжим шилжүүлэгдлээ — шалтгааныг картын «Эзэмшил» хэсгээс харна уу.",
    link: `/agent/crm/leads/${input.leadId}`,
  });
  revalidateLeadPaths(input.leadId);
  return { ok: true };
}

/** Багц эзэмшигч солих — зөвхөн Багийн ахлагч ба дээш (RPC давхар шалгана). */
export async function bulkAssign(
  leadIds: string[],
  newOwnerId: string,
  reasonCode: ReassignInput["reasonCode"],
  note?: string | null
): Promise<{ ok: boolean; error?: string; done?: number }> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const allowed = ["team_lead", "sales_director", "ops_qc"] as const;
  if (!ctx.roles.some((r) => (allowed as readonly string[]).includes(r))) {
    return { ok: false, error: "Багц эзэмшигч солих эрх зөвхөн Багийн ахлагч ба дээш." };
  }
  if (leadIds.length === 0) return { ok: false, error: "Сэжим сонгоно уу." };
  if (leadIds.length > 100) return { ok: false, error: "Нэг удаад дээд тал нь 100 сэжим." };
  if (!note?.trim()) return { ok: false, error: "Шилжүүлэлтийн тайлбар заавал." };

  const supabase = await createClient();
  let done = 0;
  let lastError: string | null = null;
  for (const id of leadIds) {
    const { error } = await supabase.rpc("crm_reassign_lead", {
      p_lead: id,
      p_new_owner: newOwnerId,
      p_reason: reasonCode,
      p_note: note ?? null,
    });
    if (error) lastError = friendlyDbError(error.message);
    else done += 1;
  }
  if (done > 0) {
    await notifyCrm({
      officeId: ctx.officeId,
      event: "lead_assigned",
      recipients: [newOwnerId],
      title: "Сэжим шилжиж ирлээ",
      body: `Танд ${done} сэжим багцаар шилжүүлэгдлээ.`,
      link: "/agent/crm/leads",
    });
  }
  revalidateLeadPaths();
  if (done === 0) return { ok: false, error: lastError ?? SAVE_ERR };
  return { ok: true, done, error: lastError ?? undefined };
}

// ── Нэгтгэл (хуучин зам — crm-ownership.mergeContactsChecked-ийг илүүд үзнэ) ──

export async function mergeContacts(raw: MergeInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!ctx.roles.includes("ops_qc")) {
    return { ok: false, error: "Нэгтгэх эрх зөвхөн Үйл ажиллагаа-ЧМТ-д бий." };
  }

  const parsed = validateMergeInput(raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const input = parsed.data;

  const { error } = await supabase.rpc("crm_merge_contacts", {
    p_primary: input.primaryId,
    p_merged: input.mergedId,
    p_choices: input.choices as unknown as Json,
    p_aml_approval_note: input.amlApprovalNote,
  });
  if (error) {
    console.error("mergeContacts:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }

  revalidatePath("/office/crm/contacts");
  revalidatePath("/agent/crm/contacts");
  revalidatePath(`/office/crm/contacts/${input.primaryId}`);
  revalidateLeadPaths();
  return { ok: true };
}
