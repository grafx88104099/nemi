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
  assignLead,
  computeLeadScore,
  gradeFromScore,
  needProfileCompleteness,
  DEFAULT_GRADE_THRESHOLDS,
  DEFAULT_SCORE_WEIGHTS,
  SOURCE_QUALITY,
  type AssignMode,
  type AssignRule,
  type GradeThresholds,
  type ScoreWeights,
  type LeadScoreInput,
} from "@/lib/crm/scoring";
import { slaDeadline, isWorkday, DEFAULT_WORK_HOURS } from "@/lib/crm/calendar";
import { LEAD_GRADES, type LeadGrade, type CrmLifecycle } from "@/lib/constants-crm";
import type { Json } from "@/types/database";

/**
 * Сэжимийн бичилтүүд (U2 — F-100–128, P-01). Гол дүрмүүд:
 *  • Алтан дүрэм (F-125) DB CHECK-т — энд алдааг ойлгомжтой буулгана.
 *  • Эзэмшигч солих ЗӨВХӨН crm_reassign_lead RPC (зарчим 6, түүхтэй).
 *  • Хуваарилалт Д-01 — lib/crm/scoring.assignLead цэвэр логик + тохиргоо.
 *  • Merge зөвхөн ops_qc, crm_merge_contacts RPC (F-108/109).
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const AUTH_ERR = "Нэвтэрнэ үү.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";

const GOLDEN_RULE_ERR =
  "Алтан дүрэм: идэвхтэй сэжимд эзэмшигч, ангилал, сүүлийн холболт, дараагийн алхам, алхмын огноо 5-уул заавал (F-125).";

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

/** Мэдэгдэл — admin client, алдаа үндсэн үйлдлийг унагахгүй (crm-staff загвар). */
async function notify(recipientIds: string[], type: string, title: string, body: string, link?: string) {
  try {
    const targets = [...new Set(recipientIds)].filter(Boolean);
    if (!targets.length) return;
    const admin = createAdminClient();
    const { data: profiles } = await admin.from("profiles").select("id, role").in("id", targets);
    const rows = (profiles ?? []).map((p) => ({
      user_id: p.id,
      type,
      title,
      body: body.slice(0, 120),
      link:
        link ??
        (p.role === "office_admin" || p.role === "admin" ? "/office/crm/leads" : "/agent/crm/leads"),
    }));
    if (rows.length) await admin.from("notifications").insert(rows);
  } catch {
    // мэдэгдэл амжилтгүй ч үндсэн үйлдэл хэвээр
  }
}

/** Д-дүрмийн гүйцэтгэлийн лог (F-602) — admin client (rule_runs бичилт RLS-гүй). */
async function logRuleRun(
  officeId: string,
  ruleCode: string,
  entity: string,
  entityId: string | null,
  status: "ok" | "error" | "skipped" | "dry_run",
  result?: Record<string, unknown>,
  error?: string
) {
  try {
    const admin = createAdminClient();
    await admin.from("crm_rule_runs").insert({
      office_id: officeId,
      rule_code: ruleCode,
      entity,
      entity_id: entityId,
      status,
      result: (result ?? null) as Json,
      error: error ?? null,
    });
  } catch (e) {
    console.error("logRuleRun:", e instanceof Error ? e.message : e);
  }
}

/** Аудит — definer RPC; алдаа залгихгүй унагахгүй. */
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

/** DB-ийн CHECK/trigger алдааг хэрэглэгчид ойлгомжтой болгоно. */
function friendlyDbError(message: string): string {
  if (message.includes("crm_leads_golden_rule")) return GOLDEN_RULE_ERR;
  if (message.includes("шилжилт зөвшөөрөгдөөгүй")) {
    return "Энэ төлөвийн шилжилт зөвшөөрөгдөөгүй (F-110) эсвэл танд эрх алга.";
  }
  if (message.includes("эзэмшигчийг зөвхөн шилжүүлэлтийн")) {
    return "Эзэмшигчийг зөвхөн «Шилжүүлэх» үйлдлээр (шалтгаантай) солино.";
  }
  return SAVE_ERR;
}

// ── Д-01: хуваарилалт ─────────────────────────────────────

type LeadAssignmentSetting = {
  mode?: AssignMode;
  load_cap?: number;
  rules?: AssignRule[];
  after_hours?: "queue" | "assign";
};

/**
 * Шинэ сэжимийг тохиргоот горимоор хуваарилна (F-126, Д-01).
 * Ажлын бус цагт queue-д (crm_assignment_state) — crm-sla cron (U8) хуваарилна.
 * Уншилт/бичилт admin client-ээр: бусад агентын ачаалал RLS-д харагдахгүй.
 */
async function assignNewLead(
  ctx: CrmStaffContext,
  leadId: string,
  lead: { sourceCode?: string | null; branchId?: string | null; grade?: string | null }
): Promise<{ ownerId: string | null; queued: boolean }> {
  const admin = createAdminClient();

  // Дүрэм идэвхтэй юу (F-601).
  const { data: rule } = await admin
    .from("crm_automation_rules")
    .select("is_active, dry_run")
    .eq("office_id", ctx.officeId)
    .eq("code", "D-01")
    .maybeSingle();
  if (rule && !rule.is_active) {
    await logRuleRun(ctx.officeId, "D-01", "crm_leads", leadId, "skipped", { reason: "inactive" });
    return { ownerId: null, queued: false };
  }

  const setting =
    ((await getSettingValue<LeadAssignmentSetting>("lead_assignment")) as LeadAssignmentSetting | null) ?? {};
  const mode: AssignMode = setting.mode ?? "round_robin";

  // Кандидатууд: идэвхтэй, гарах төлөвгүй agent дүртэй ажилтнууд (тогтмол эрэмбэ).
  const { data: staff } = await admin
    .from("crm_staff")
    .select("profile_id, branch_id")
    .eq("office_id", ctx.officeId)
    .eq("is_active", true)
    .eq("offboarding", false)
    .contains("roles", ["agent"])
    .order("created_at");
  const candidates = (staff ?? []).map((s) => s.profile_id);
  if (candidates.length === 0) {
    await logRuleRun(ctx.officeId, "D-01", "crm_leads", leadId, "skipped", { reason: "no_candidates" });
    return { ownerId: null, queued: false };
  }

  // Ачаалал: нээлттэй (new|active) сэжимийн тоо.
  const loads: Record<string, number> = {};
  const { data: openLeads } = await admin
    .from("crm_leads")
    .select("owner_id")
    .eq("office_id", ctx.officeId)
    .in("status", ["new", "active"])
    .not("owner_id", "is", null);
  for (const l of openLeads ?? []) {
    if (l.owner_id) loads[l.owner_id] = (loads[l.owner_id] ?? 0) + 1;
  }

  // Жижүүр (duty_shift горимд).
  const nowIso = new Date().toISOString();
  const { data: duty } = await admin
    .from("crm_duty_shifts")
    .select("profile_id")
    .eq("office_id", ctx.officeId)
    .lte("starts_at", nowIso)
    .gte("ends_at", nowIso);
  const dutyNow = (duty ?? []).map((d) => d.profile_id);

  // Round-robin cursor + queue.
  const { data: state } = await admin
    .from("crm_assignment_state")
    .select("last_assigned_profile_id, queue")
    .eq("office_id", ctx.officeId)
    .eq("scope", "default")
    .maybeSingle();

  const now = new Date();
  const hour = now.getUTCHours() + 8; // Улаанбаатар UTC+8 — ажлын цагийн ойролцоо тооцоо
  const localHour = hour >= 24 ? hour - 24 : hour;
  const isWorkHours =
    isWorkday(now) && localHour >= DEFAULT_WORK_HOURS.startHour && localHour < DEFAULT_WORK_HOURS.endHour;

  const decision = assignLead({
    mode,
    candidates,
    dutyNow,
    cursor: state?.last_assigned_profile_id ?? null,
    loads,
    loadCap: setting.load_cap,
    rules: setting.rules ?? [],
    lead,
    isWorkHours,
    afterHours: setting.after_hours ?? "queue",
  });

  if (rule?.dry_run) {
    await logRuleRun(ctx.officeId, "D-01", "crm_leads", leadId, "dry_run", {
      would_assign: decision.ownerId,
      would_queue: decision.queued ?? false,
    });
    return { ownerId: null, queued: false };
  }

  if (decision.queued) {
    const queue = Array.isArray(state?.queue) ? (state.queue as string[]) : [];
    await admin.from("crm_assignment_state").upsert(
      {
        office_id: ctx.officeId,
        scope: "default",
        last_assigned_profile_id: state?.last_assigned_profile_id ?? null,
        queue: [...queue, leadId] as unknown as Json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "office_id,scope" }
    );
    await logRuleRun(ctx.officeId, "D-01", "crm_leads", leadId, "ok", { queued: true });
    return { ownerId: null, queued: true };
  }

  if (decision.ownerId) {
    await admin.from("crm_assignment_state").upsert(
      {
        office_id: ctx.officeId,
        scope: "default",
        last_assigned_profile_id: decision.ownerId,
        queue: (Array.isArray(state?.queue) ? state.queue : []) as unknown as Json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "office_id,scope" }
    );
    await logRuleRun(ctx.officeId, "D-01", "crm_leads", leadId, "ok", { owner_id: decision.ownerId });
    return { ownerId: decision.ownerId, queued: false };
  }

  await logRuleRun(ctx.officeId, "D-01", "crm_leads", leadId, "skipped", { reason: "no_pick" });
  return { ownerId: null, queued: false };
}

// ── Оноо (F-112) ──────────────────────────────────────────

async function scoreSettings(): Promise<{ weights: ScoreWeights; thresholds: GradeThresholds }> {
  const [weights, thresholds] = await Promise.all([
    getSettingValue<ScoreWeights>("lead_score_weights"),
    getSettingValue<GradeThresholds>("lead_grade_thresholds"),
  ]);
  return {
    weights: weights ?? DEFAULT_SCORE_WEIGHTS,
    thresholds: thresholds ?? DEFAULT_GRADE_THRESHOLDS,
  };
}

/** Лавлахын кодоос эх сурвалжийн чанарын коэффициент. */
async function sourceQualityOf(sourceId: string | null): Promise<number | null> {
  if (!sourceId) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("crm_lookups").select("code").eq("id", sourceId).maybeSingle();
  if (!data) return null;
  return SOURCE_QUALITY[data.code] ?? SOURCE_QUALITY.other;
}

/** Сэжимийн онооны оролтыг DB-ээс цуглуулна (профайл, идэвх, эх сурвалж). */
async function collectScoreInput(lead: {
  id: string;
  contact_id: string;
  source_id: string | null;
  last_contact_at: string | null;
}): Promise<LeadScoreInput> {
  const supabase = await createClient();

  // Хамгийн бүрэн идэвхтэй хэрэгцээний профайл (000400-аас өмнө хүснэгтгүй байж болно).
  let budgetMax: number | null = null;
  let budgetTarget: number | null = null;
  let financing: string | null = null;
  let timeline: string | null = null;
  let completeness: number | null = null;
  try {
    const { data: profiles } = await supabase
      .from("crm_need_profiles")
      .select("*")
      .eq("contact_id", lead.contact_id)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    const best = (profiles ?? [])[0];
    if (best) {
      budgetMax = best.budget_max;
      budgetTarget = best.budget_target;
      financing = best.financing;
      timeline = best.timeline;
      completeness =
        best.completeness_pct ??
        needProfileCompleteness({
          goalId: best.goal_id,
          locations: Array.isArray(best.locations) ? (best.locations as unknown[]) : [],
          propertyTypes: best.property_types,
          budgetMax: best.budget_max,
          budgetTarget: best.budget_target,
          financing: best.financing,
          roomsMin: best.rooms_min,
          areaMin: best.area_min,
          timeline: best.timeline,
          moveInDate: best.move_in_date,
          profileType: best.profile_type,
          mustHaves: Array.isArray(best.must_haves) ? (best.must_haves as unknown[]) : [],
          niceToHaves: Array.isArray(best.nice_to_haves) ? (best.nice_to_haves as unknown[]) : [],
          dealBreakers: Array.isArray(best.deal_breakers) ? (best.deal_breakers as unknown[]) : [],
          decisionMaker: best.decision_maker,
          blocker: best.blocker,
        });
    }
  } catch {
    // профайлын хүснэгт хараахан байхгүй — оноонд 0-оор орно
  }

  // Идэвх: сүүлийн 30 хоногийн үйл ажиллагаа (000400-аас өмнө 0).
  let activityCount30d = 0;
  try {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { count } = await supabase
      .from("crm_activities")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", lead.id)
      .gte("created_at", since);
    activityCount30d = count ?? 0;
  } catch {
    activityCount30d = 0;
  }

  const lastContactDays = lead.last_contact_at
    ? Math.floor((Date.now() - new Date(lead.last_contact_at).getTime()) / 86400000)
    : null;

  return {
    budgetMax,
    budgetTarget,
    financing,
    timeline,
    activityCount30d,
    lastContactDays,
    sourceQuality: await sourceQualityOf(lead.source_id),
    completenessPct: completeness,
  };
}

/**
 * F-112: оноог дахин тооцож хадгална; ангиллын САНАЛ буцаана (гараар
 * өөрчлөхгүй — F-113: агент өөр сонговол шалтгаантай setLeadGrade).
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
    .select("id, contact_id, source_id, last_contact_at")
    .eq("id", leadId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!lead) return { ok: false, error: "Сэжим олдсонгүй эсвэл танд эрх алга." };

  const input = await collectScoreInput(lead);
  const { weights, thresholds } = await scoreSettings();
  const { score, breakdown } = computeLeadScore(input, weights);
  const suggestedGrade = gradeFromScore(score, thresholds);

  const { error } = await supabase
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

// ── Үүсгэх (P-01 алхам 1–5, G0) ───────────────────────────

export type CreateLeadResult = {
  id?: string;
  error?: string;
  /** Давхардал илэрсэн — UI DuplicateHint үзүүлж баталгаажуулна (F-107). */
  duplicates?: import("@/lib/queries-crm-contacts").DuplicateHit[];
  queued?: boolean;
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

  // Харилцагч: байгаа нь эсвэл шинэ (createContact дотроо F-107 давхардлын хаалттай).
  let contactId = input.contactId;
  let contactSourceId: string | null = null;
  if (!contactId && input.newContact) {
    const created = await createContact({
      ...input.newContact,
      duplicateOverride: input.duplicateOverride,
    });
    if (created.error || !created.id) {
      return { error: created.error ?? SAVE_ERR, duplicates: created.duplicates };
    }
    contactId = created.id;
    contactSourceId = input.newContact.sourceId;
  } else if (contactId) {
    const { data: contact } = await supabase
      .from("crm_contacts")
      .select("id, source_id, merged_into_id")
      .eq("id", contactId)
      .eq("office_id", ctx.officeId)
      .maybeSingle();
    if (!contact) return { error: "Харилцагч олдсонгүй эсвэл танд эрх алга." };
    if (contact.merged_into_id) {
      return { error: "Энэ бүртгэл нэгтгэгдсэн — үндсэн бүртгэл дээр сэжим үүсгэнэ үү." };
    }
    contactSourceId = contact.source_id;
  }
  if (!contactId) return { error: "Харилцагч сонгоно уу." };

  // Эх сурвалжгүй сэжим үүсгэхийг хориглоно (P-01 алхам 1, F-101).
  const sourceId = input.sourceId ?? contactSourceId;
  if (!sourceId) return { error: "Эх сурвалжгүй сэжим үүсгэхийг хориглоно — эх сурвалж сонгоно уу." };

  // Анхны оноо (эх сурвалжийн чанар дээр суурилсан — профайл хожим нэмэгдэнэ).
  const { weights, thresholds } = await scoreSettings();
  const scoreInput: LeadScoreInput = {
    sourceQuality: await sourceQualityOf(sourceId),
    lastContactDays: null,
    activityCount30d: 0,
  };
  const { score, breakdown } = computeLeadScore(scoreInput, weights);
  const suggestedGrade = gradeFromScore(score, thresholds);

  // F-113: системийн саналаас өөр ангилалд шалтгаан заавал.
  if (input.grade && input.grade !== suggestedGrade && !input.gradeOverrideReason) {
    return {
      error: `Систем «${suggestedGrade.toUpperCase()}» ангилал санал болгож байна — өөр ангилал сонгоход шалтгаан заавал (F-113).`,
    };
  }

  // SLA: эхний холболтын хугацаа — ажлын цагийн тоололтой (F-605/Д-02).
  const slaMin = (await getSettingValue<number>("sla_first_contact_min")) ?? 15;
  const firstContactDue = slaDeadline(new Date(), slaMin);

  const { data: leadRow, error } = await supabase
    .from("crm_leads")
    .insert({
      office_id: ctx.officeId,
      contact_id: contactId,
      branch_id: input.branchId ?? ctx.branchId,
      source_id: sourceId,
      campaign_code: input.campaignCode,
      channel_ref: input.channelRef,
      status: "new",
      grade: input.grade,
      grade_override_reason: input.grade ? input.gradeOverrideReason : null,
      score,
      score_breakdown: breakdown as unknown as Json,
      next_step: input.nextStep,
      next_step_date: input.nextStepDate ? input.nextStepDate.slice(0, 10) : null,
      first_contact_due_at: firstContactDue.toISOString(),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !leadRow) {
    console.error("createLead:", error?.message);
    return { error: friendlyDbError(error?.message ?? "") };
  }

  // Д-01: хуваарилалт + эхний холболтын даалгавар + мэдэгдэл.
  const assigned = await assignNewLead(ctx, leadRow.id, {
    sourceCode: null,
    branchId: input.branchId ?? ctx.branchId,
    grade: input.grade,
  });

  if (assigned.ownerId) {
    // owner_id null → утга: trigger 'initial' гэж түүхэлнэ.
    const { error: ownErr } = await supabase
      .from("crm_leads")
      .update({ owner_id: assigned.ownerId })
      .eq("id", leadRow.id)
      .eq("office_id", ctx.officeId);
    if (ownErr) console.error("createLead owner:", ownErr.message);

    // Эхний холболтын даалгавар (Д-01; created_by конвенц §4.4 — үүсгэгч нь одоогийн хэрэглэгч).
    try {
      const { data: task } = await supabase
        .from("tasks")
        .insert({
          office_id: ctx.officeId,
          created_by: user.id,
          responsible_id: assigned.ownerId,
          title: "Шинэ сэжимтэй эхний холболт хийх (Д-01)",
          description: `Эхний холболтын SLA: ${slaMin} мин (ажлын цагаар).`,
          priority: "high",
          deadline: firstContactDue.toISOString(),
        })
        .select("id")
        .single();
      if (task?.id) {
        await supabase
          .from("crm_leads")
          .update({
            next_step_task_id: task.id,
            next_step: input.nextStep ?? "Эхний холболт",
            next_step_date: input.nextStepDate?.slice(0, 10) ?? firstContactDue.toISOString().slice(0, 10),
          })
          .eq("id", leadRow.id)
          .eq("office_id", ctx.officeId);
      }
    } catch (e) {
      console.error("createLead task:", e instanceof Error ? e.message : e);
    }

    if (assigned.ownerId !== user.id) {
      await notify([assigned.ownerId], "crm_lead_assigned", "Шинэ сэжим оноогдлоо", "Танд шинэ сэжим хуваарилагдлаа — эхний холболтын SLA тоолол эхэлсэн.");
    }
  }

  revalidateLeadPaths();
  return { id: leadRow.id, queued: assigned.queued };
}

// ── Засах ─────────────────────────────────────────────────

export type UpdateLeadInput = {
  id: string;
  sourceId?: string | null;
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
  if (raw.nextStepDate && Number.isNaN(Date.parse(raw.nextStepDate))) {
    return { ok: false, error: "Дараагийн алхмын огноо буруу байна." };
  }

  const patch: {
    source_id?: string | null;
    campaign_code?: string | null;
    channel_ref?: string | null;
    branch_id?: string | null;
    next_step?: string | null;
    next_step_date?: string | null;
  } = {};
  if (raw.sourceId !== undefined) patch.source_id = raw.sourceId;
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

/** F-111/113: ангилал — системийн саналаас зөрвөл шалтгаан заавал; audit trigger түүхэлнэ. */
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
  if (!lead) return { ok: false, error: "Сэжим олдсонгүй эсвэл танд эрх алга." };

  const { thresholds } = await scoreSettings();
  const suggested = lead.score != null ? gradeFromScore(Number(lead.score), thresholds) : null;
  const isOverride = suggested != null && grade !== suggested;
  if (isOverride && !reason?.trim()) {
    return {
      ok: false,
      error: `Систем «${suggested.toUpperCase()}» санал болгож байна — өөр ангилалд шалтгаан заавал (F-113).`,
    };
  }

  const { error, count } = await supabase
    .from("crm_leads")
    .update(
      { grade, grade_override_reason: isOverride ? reason?.trim() : null },
      { count: "exact" }
    )
    .eq("id", leadId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("setLeadGrade:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  if (!count) return { ok: false, error: "Сэжим олдсонгүй эсвэл танд эрх алга." };
  revalidateLeadPaths(leadId);
  return { ok: true };
}

/** P-01 алхам 6: утга бүхий эхний холболт — last_contact_at шинэчилж, Д-01 даалгаврыг хаана. */
export async function logFirstContact(leadId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const { data: lead } = await supabase
    .from("crm_leads")
    .select("id, next_step_task_id, last_contact_at")
    .eq("id", leadId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!lead) return { ok: false, error: "Сэжим олдсонгүй эсвэл танд эрх алга." };

  const { error, count } = await supabase
    .from("crm_leads")
    .update({ last_contact_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", leadId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("logFirstContact:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  if (!count) return { ok: false, error: "Сэжим олдсонгүй эсвэл танд эрх алга." };

  // Эхний холболтын даалгаврыг гүйцэтгэсэн болгоно (анх удаагийн холболтод).
  if (!lead.last_contact_at && lead.next_step_task_id) {
    try {
      await supabase
        .from("tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", lead.next_step_task_id);
    } catch {
      // даалгаврын статус хаагдаагүй ч холболт бүртгэгдсэн
    }
  }
  revalidateLeadPaths(leadId);
  return { ok: true };
}

/**
 * Шинэ → Идэвхтэй (P-01 алхам 9–10): алтан дүрмийн 5 бүрдэл бүрэн үед л.
 * Мөн Эргэлтэд/Идэвхгүй → Идэвхтэй (дахин идэвхжүүлэлт — trigger дүр шалгана).
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

  const { data: lead } = await supabase
    .from("crm_leads")
    .select("id, status, owner_id, last_contact_at, score")
    .eq("id", leadId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!lead) return { ok: false, error: "Сэжим олдсонгүй эсвэл танд эрх алга." };

  const missing: string[] = [];
  if (!lead.owner_id) missing.push("Эзэмшигч (эхлээд хуваарилна/шилжүүлнэ)");
  if (!lead.last_contact_at) missing.push("Утга бүхий эхний холболт (F-110)");
  if (missing.length > 0) {
    return { ok: false, error: "Идэвхжүүлэхийн өмнө дутуу бүрдлүүдийг нөхнө үү.", missing };
  }

  // F-113: системийн саналаас зөрвөл шалтгаан.
  const { thresholds } = await scoreSettings();
  const suggested = lead.score != null ? gradeFromScore(Number(lead.score), thresholds) : null;
  if (suggested != null && input.grade !== suggested && !input.gradeOverrideReason?.trim()) {
    return {
      ok: false,
      error: `Систем «${suggested.toUpperCase()}» санал болгож байна — өөр ангилалд шалтгаан заавал (F-113).`,
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
  if (!count) return { ok: false, error: "Сэжим олдсонгүй эсвэл танд эрх алга." };
  revalidateLeadPaths(leadId);
  return { ok: true };
}

/**
 * Амьдралын мөчлөгийн бусад шилжилт (F-110) — trigger заагаагүй шилжилт,
 * эрхгүй дүрийг хориглоно; шилжилт бүр audit_log-т (trigger дотор).
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

  const { error, count } = await supabase
    .from("crm_leads")
    .update({ status }, { count: "exact" })
    .eq("id", leadId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("setLeadStatus:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  if (!count) return { ok: false, error: "Сэжим олдсонгүй эсвэл танд эрх алга." };
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

/** Идэвхтэй → Эргэлтэд (team_lead/sales_director — trigger шалгана). */
export async function recycleLead(leadId: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  return setLeadStatus(leadId, "recycled", note ?? null);
}

// ── Шилжүүлэлт (зарчим 6) ─────────────────────────────────

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
    if (error.message.includes("CRM:")) {
      return { ok: false, error: error.message.replace(/^.*CRM:\s*/, "") };
    }
    return { ok: false, error: SAVE_ERR };
  }

  // Шинэ эзэмшигчид эхний холболтын даалгавар (P-10) + мэдэгдэл.
  try {
    await supabase.from("tasks").insert({
      office_id: ctx.officeId,
      created_by: ctx.profileId,
      responsible_id: input.newOwnerId,
      title: "Шилжүүлсэн сэжимтэй холбогдох",
      description: "Танд сэжим шилжиж ирлээ — эхний холболтоо хийж дараагийн алхмаа товлоно уу.",
      priority: "high",
    });
  } catch {
    // даалгавар амжилтгүй ч шилжүүлэлт хийгдсэн
  }
  await notify([input.newOwnerId], "crm_lead_reassigned", "Сэжим шилжиж ирлээ", "Танд сэжим шилжүүлэгдлээ — шалтгааныг картаас харна уу.");
  revalidateLeadPaths(input.leadId);
  return { ok: true };
}

/** F-122: багц эзэмшигч солих — зөвхөн Багийн ахлагч ба дээш (RPC давхар шалгана). */
export async function bulkAssign(
  leadIds: string[],
  newOwnerId: string,
  reasonCode: ReassignInput["reasonCode"],
  note?: string | null
): Promise<{ ok: boolean; error?: string; done?: number }> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const allowed = ["team_lead", "sales_director", "ops_qc", "sysadmin"] as const;
  if (!ctx.roles.some((r) => (allowed as readonly string[]).includes(r))) {
    return { ok: false, error: "Багц эзэмшигч солих эрх зөвхөн Багийн ахлагч ба дээш (F-122)." };
  }
  if (leadIds.length === 0) return { ok: false, error: "Сэжим сонгоно уу." };
  if (leadIds.length > 100) return { ok: false, error: "Нэг удаад дээд тал нь 100 сэжим." };

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
    if (error) {
      lastError = error.message.includes("CRM:")
        ? error.message.replace(/^.*CRM:\s*/, "")
        : SAVE_ERR;
    } else {
      done += 1;
    }
  }
  await notify([newOwnerId], "crm_lead_reassigned", "Сэжим шилжиж ирлээ", `Танд ${done} сэжим багцаар шилжүүлэгдлээ.`);
  revalidateLeadPaths();
  if (done === 0) return { ok: false, error: lastError ?? SAVE_ERR };
  return { ok: true, done, error: lastError ?? undefined };
}

// ── Merge (F-108/109) ─────────────────────────────────────

export async function mergeContacts(raw: MergeInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!ctx.roles.includes("ops_qc")) {
    return { ok: false, error: "Merge хийх эрх зөвхөн Үйл ажиллагаа/ЧМТ-ийн зохицуулагчид бий (F-109)." };
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
    if (error.message.includes("CRM:")) {
      return { ok: false, error: error.message.replace(/^.*CRM:\s*/, "") };
    }
    return { ok: false, error: SAVE_ERR };
  }

  revalidatePath("/office/crm/contacts");
  revalidatePath("/agent/crm/contacts");
  revalidatePath(`/office/crm/contacts/${input.primaryId}`);
  revalidateLeadPaths();
  return { ok: true };
}
