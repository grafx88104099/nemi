"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, getSettingValue, type CrmStaffContext } from "@/lib/queries-crm-core";
import { ACTIVITY_CHANNELS, ACTIVITY_OUTCOMES } from "@/lib/constants-crm";
import type { Database, Json } from "@/types/database";

type LeadUpdate = Database["public"]["Tables"]["crm_leads"]["Update"];
type ActivityUpdate = Database["public"]["Tables"]["crm_activities"]["Update"];

/**
 * Үйл ажиллагааны бичилтүүд (U4 — F-300–312, P-02 §2.3). Гол дүрмүүд:
 *  • Идэвхтэй сэжимд дараагийн алхам + огноогүй хадгалалт ХОРИОТОЙ (F-302 —
 *    DB trigger эцсийн үнэн, энд алдааг ойлгомжтой буулгана).
 *  • Үзлэг бүртгэгдмэгц Д-05: 24 цагийн саналын даалгавар автомат (F-303).
 *  • Backdated тугийг DB trigger тавина (F-307).
 *  • Шинэ мэдээлэл орвол профайл шинэчлэх сануулга буцаана (F-311).
 *  • Засвар — зохиогч тохиргоот цонхонд (activity_edit_window_hours), дараа нь ops_qc.
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const AUTH_ERR = "Нэвтэрнэ үү.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";
const NEXT_STEP_ERR = "Идэвхтэй сэжимд дараагийн алхам + огноо заавал (F-302).";

/** 4.5.1 толийн хаалттай жагсаалтууд (DB CHECK-тэй ЯГ таарна). */
const ACTIVITY_PURPOSES = ["screening", "follow_up", "offer", "negotiation", "service", "other"] as const;
const ACTIVITY_ATTITUDES = ["positive", "neutral", "objection", "not_ready"] as const;
const FEEDBACK_CATEGORIES = ["price", "location", "layout", "condition", "financing", "other"] as const;

function revalidateActivityPaths(opportunityId?: string | null, leadId?: string | null) {
  revalidatePath("/office/crm");
  revalidatePath("/agent/crm");
  revalidatePath("/office/crm/leads");
  revalidatePath("/agent/crm/leads");
  if (opportunityId) {
    revalidatePath(`/office/crm/deals/${opportunityId}`);
    revalidatePath(`/agent/crm/pipeline/${opportunityId}`);
  }
  if (leadId) {
    revalidatePath(`/office/crm/leads/${leadId}`);
    revalidatePath(`/agent/crm/leads/${leadId}`);
  }
}

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

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
        link ?? (p.role === "office_admin" || p.role === "admin" ? "/office/crm" : "/agent/crm"),
    }));
    if (rows.length) await admin.from("notifications").insert(rows);
  } catch {
    // мэдэгдэл амжилтгүй ч үндсэн үйлдэл хэвээр
  }
}

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

function friendlyDbError(message: string): string {
  if (message.includes("F-302") || message.includes("дараагийн алхам")) return NEXT_STEP_ERR;
  if (message.includes("crm_activities_purpose")) return "Зорилгын утга буруу байна.";
  if (message.includes("crm_activities_attitude")) return "Хандлагын утга буруу байна.";
  if (message.includes("crm_activities_feedback")) return "Саналын ангилал буруу байна.";
  if (message.includes("эрх алга") || message.includes("row-level security")) {
    return "Танд энэ үйлдлийг хийх эрх алга.";
  }
  return SAVE_ERR;
}

// ── Бүртгэх (F-300–312) ───────────────────────────────────

const logActivitySchema = z
  .object({
    contactId: z.uuid("Харилцагч заавал"),
    opportunityId: z.uuid().optional().nullable(),
    leadId: z.uuid().optional().nullable(),
    propertyId: z.uuid().optional().nullable(),
    channel: z.enum(ACTIVITY_CHANNELS, "Суваг сонгоно уу"),
    purpose: z.enum(ACTIVITY_PURPOSES, "Зорилго сонгоно уу"),
    summary: z.string().trim().min(5, "Хураангуй 2–5 өгүүлбэр бичнэ үү").max(4000, "Хураангуй хэт урт байна"),
    attitude: z.enum(ACTIVITY_ATTITUDES).optional().nullable(),
    newInfo: z.string().trim().max(2000).optional().nullable(),
    objectionId: z.uuid().optional().nullable(),
    outcome: z.enum(ACTIVITY_OUTCOMES),
    nextStep: z.string().trim().max(500).optional().nullable(),
    nextStepDate: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), "Дараагийн алхмын огноо буруу байна")
      .optional()
      .nullable(),
    occurredAt: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), "Болсон огноо буруу байна")
      .optional()
      .nullable(),
    feedbackCategory: z.enum(FEEDBACK_CATEGORIES).optional().nullable(),
  })
  .strict();

export type LogActivityInput = z.infer<typeof logActivitySchema>;

export type LogActivityResult = {
  id?: string;
  error?: string;
  /** F-311: шинэ мэдээлэл орсон — профайл шинэчлэх сануулга үзүүлнэ. */
  profileHint?: boolean;
};

export async function logActivity(raw: LogActivityInput): Promise<LogActivityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = logActivitySchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу байна." };
  const input = parsed.data;

  // F-302-ыг серверт урьдчилан шалгаж ойлгомжтой алдаа өгнө (DB trigger эцсийн үнэн).
  let leadStatus: string | null = null;
  if (input.leadId) {
    const { data: lead } = await supabase
      .from("crm_leads")
      .select("id, status")
      .eq("id", input.leadId)
      .eq("office_id", ctx.officeId)
      .maybeSingle();
    if (!lead) return { error: "Сэжим олдсонгүй эсвэл танд эрх алга." };
    leadStatus = lead.status;
    if (lead.status === "active" && (!input.nextStep?.trim() || !input.nextStepDate)) {
      return { error: NEXT_STEP_ERR };
    }
  }
  if (input.feedbackCategory && input.channel !== "showing") {
    return { error: "Саналын ангилал зөвхөн үзлэгийн бүртгэлд хамаарна (F-310)." };
  }

  const occurredAt = input.occurredAt ? new Date(input.occurredAt).toISOString() : new Date().toISOString();

  const { data: row, error } = await supabase
    .from("crm_activities")
    .insert({
      office_id: ctx.officeId,
      contact_id: input.contactId,
      opportunity_id: input.opportunityId ?? null,
      lead_id: input.leadId ?? null,
      property_id: input.propertyId ?? null,
      channel: input.channel,
      purpose: input.purpose,
      summary: input.summary,
      attitude: input.attitude ?? null,
      new_info: input.newInfo?.trim() || null,
      objection_id: input.objectionId ?? null,
      outcome: input.outcome,
      next_step: input.nextStep?.trim() || null,
      next_step_date: input.nextStepDate ? input.nextStepDate.slice(0, 10) : null,
      occurred_at: occurredAt,
      feedback_category: input.feedbackCategory ?? null,
      owner_id: user.id,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("logActivity:", error?.message);
    return { error: friendlyDbError(error?.message ?? "") };
  }

  // Сэжимийн сүүлийн холболт + дараагийн алхмыг шинэчилнэ (алтан дүрэм тэжээгдэнэ).
  if (input.leadId) {
    const patch: LeadUpdate = { last_contact_at: occurredAt };
    if (input.nextStep?.trim()) patch.next_step = input.nextStep.trim();
    if (input.nextStepDate) patch.next_step_date = input.nextStepDate.slice(0, 10);
    const { error: leadErr } = await supabase
      .from("crm_leads")
      .update(patch)
      .eq("id", input.leadId)
      .eq("office_id", ctx.officeId);
    if (leadErr) console.error("logActivity lead:", leadErr.message);
  }

  // Д-05 (F-303): үзлэг бүртгэгдмэгц 24 цагийн саналын даалгавар.
  if (input.channel === "showing" && !input.feedbackCategory) {
    try {
      const admin = createAdminClient();
      const { data: rule } = await admin
        .from("crm_automation_rules")
        .select("is_active, dry_run")
        .eq("office_id", ctx.officeId)
        .eq("code", "D-05")
        .maybeSingle();
      if (rule && !rule.is_active) {
        await logRuleRun(ctx.officeId, "D-05", "crm_activities", row.id, "skipped", { reason: "inactive" });
      } else if (rule?.dry_run) {
        await logRuleRun(ctx.officeId, "D-05", "crm_activities", row.id, "dry_run", { would_create_task: true });
      } else {
        const deadline = new Date(new Date(occurredAt).getTime() + 24 * 3600000).toISOString();
        const { data: task } = await admin
          .from("tasks")
          .insert({
            office_id: ctx.officeId,
            created_by: user.id,
            responsible_id: user.id,
            title: "Үзлэгийн 24 цагийн санал авах (Д-05)",
            description: "Үзлэгийн дараах саналыг үнэ/байршил/зохион байгуулалт/нөхцөл/санхүүжилт/бусад ангиллаар бүртгэнэ (F-310).",
            priority: "high",
            deadline,
          })
          .select("id")
          .single();
        if (task?.id) {
          await admin.from("crm_task_links").insert({
            task_id: task.id,
            entity: "activity",
            entity_id: row.id,
            rule_code: "D-05",
          });
        }
        await logRuleRun(ctx.officeId, "D-05", "crm_activities", row.id, "ok", { task_id: task?.id ?? null });
        await notify(
          [user.id],
          "crm_showing_feedback",
          "Үзлэгийн санал хүлээгдэж байна",
          "24 цагийн дотор үзлэгийн саналыг бүртгэнэ үү (Д-05)."
        );
      }
    } catch (e) {
      await logRuleRun(
        ctx.officeId,
        "D-05",
        "crm_activities",
        row.id,
        "error",
        undefined,
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  revalidateActivityPaths(input.opportunityId, input.leadId);
  // F-311: шинэ мэдээлэл тэмдэглэгдсэн бол профайл шинэчлэх сануулга.
  const profileHint = Boolean(input.newInfo?.trim()) || leadStatus === "active" && input.attitude === "objection";
  return { id: row.id, profileHint };
}

// ── Засах (тохиргоот цонхонд — F-301) ─────────────────────

const updateActivitySchema = z
  .object({
    id: z.uuid(),
    summary: z.string().trim().min(5, "Хураангуй хэт богино байна").max(4000).optional(),
    attitude: z.enum(ACTIVITY_ATTITUDES).optional().nullable(),
    newInfo: z.string().trim().max(2000).optional().nullable(),
    objectionId: z.uuid().optional().nullable(),
    outcome: z.enum(ACTIVITY_OUTCOMES).optional(),
    nextStep: z.string().trim().max(500).optional().nullable(),
    nextStepDate: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), "Огноо буруу байна")
      .optional()
      .nullable(),
  })
  .strict();

export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

export async function updateActivity(raw: UpdateActivityInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const parsed = updateActivitySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу байна." };
  const input = parsed.data;

  const { data: before } = await supabase
    .from("crm_activities")
    .select("id, owner_id, created_at, lead_id, opportunity_id")
    .eq("id", input.id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!before) return { ok: false, error: "Бүртгэл олдсонгүй эсвэл танд эрх алга." };

  // Засварын цонх: тохиргооны activity_edit_window_hours (анхдагч 24) —
  // ops_qc цонхноос үл хамааран засна. DB policy 24ц-ийн доод хамгаалалттай.
  const isOpsQc = ctx.roles.includes("ops_qc");
  if (!isOpsQc) {
    if (before.owner_id !== ctx.profileId) {
      return { ok: false, error: "Зөвхөн зохиогч (цонхон дотор) эсвэл ЧМТ засна." };
    }
    const windowHours = (await getSettingValue<number>("activity_edit_window_hours")) ?? 24;
    const ageMs = Date.now() - new Date(before.created_at).getTime();
    if (ageMs > windowHours * 3600000) {
      return { ok: false, error: `Засварын ${windowHours} цагийн цонх хэтэрсэн — ЧМТ-д хандана уу.` };
    }
  }

  const patch: ActivityUpdate = {};
  if (input.summary !== undefined) patch.summary = input.summary;
  if (input.attitude !== undefined) patch.attitude = input.attitude;
  if (input.newInfo !== undefined) patch.new_info = input.newInfo?.trim() || null;
  if (input.objectionId !== undefined) patch.objection_id = input.objectionId;
  if (input.outcome !== undefined) patch.outcome = input.outcome;
  if (input.nextStep !== undefined) patch.next_step = input.nextStep?.trim() || null;
  if (input.nextStepDate !== undefined) {
    patch.next_step_date = input.nextStepDate ? input.nextStepDate.slice(0, 10) : null;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  // Эрхийг дээр бүрэн шалгасан (зохиогч цонхон дотор / ЧМТ) — тохиргоот цонх
  // 24 цагаас урт байж болох тул admin client-ээр бичнэ (DB policy-ийн 24ц
  // хатуу доод хязгаар шууд API хандалтад л үйлчилнэ).
  const admin = createAdminClient();
  const { error } = await admin
    .from("crm_activities")
    .update(patch)
    .eq("id", input.id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("updateActivity:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  await writeAudit(ctx.officeId, "crm_activities", input.id, "update", {
    reason: isOpsQc && before.owner_id !== ctx.profileId ? "ops_qc_edit" : "author_edit",
  });
  revalidateActivityPaths(before.opportunity_id, before.lead_id);
  return { ok: true };
}

// ── Үзлэгийн санал бүртгэх (F-310, Д-05 хаана) ────────────

export async function recordShowingFeedback(
  activityId: string,
  category: string,
  note?: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!(FEEDBACK_CATEGORIES as readonly string[]).includes(category)) {
    return { ok: false, error: "Саналын ангилал буруу байна (F-310)." };
  }

  const { data: act } = await supabase
    .from("crm_activities")
    .select("id, channel, feedback_category, new_info, lead_id, opportunity_id, owner_id")
    .eq("id", activityId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!act) return { ok: false, error: "Бүртгэл олдсонгүй эсвэл танд эрх алга." };
  if (act.channel !== "showing") return { ok: false, error: "Санал зөвхөн үзлэгийн бүртгэлд хамаарна." };

  // Санал 24 цагийн цонхноос ХОЖУУ ч бүртгэгдэх ёстой (F-303 «хэтэрвэл
  // анхааруулга») — эрхийг энд шалгаад admin client-ээр бичнэ (RLS-ийн
  // засварын цонх зөвхөн ерөнхий засварт хамаарна).
  const canRecord =
    act.owner_id === ctx.profileId ||
    ctx.roles.some((r) => ["team_lead", "sales_director", "ops_qc", "sysadmin"].includes(r));
  if (!canRecord) return { ok: false, error: "Үзлэгийн саналыг зохиогч эсвэл ахлах бүртгэнэ." };

  const patch: ActivityUpdate = { feedback_category: category };
  if (note?.trim()) {
    patch.new_info = [act.new_info, `Үзлэгийн санал: ${note.trim()}`].filter(Boolean).join("\n");
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("crm_activities")
    .update(patch)
    .eq("id", activityId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("recordShowingFeedback:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }

  // Д-05 даалгаврыг хаана (task_links → tasks.completed).
  try {
    const { data: links } = await admin
      .from("crm_task_links")
      .select("task_id")
      .eq("entity", "activity")
      .eq("entity_id", activityId)
      .eq("rule_code", "D-05");
    const taskIds = (links ?? []).map((l) => l.task_id);
    if (taskIds.length) {
      await admin
        .from("tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .in("id", taskIds)
        .eq("office_id", ctx.officeId);
    }
  } catch (e) {
    console.error("recordShowingFeedback task:", e instanceof Error ? e.message : e);
  }

  await writeAudit(ctx.officeId, "crm_activities", activityId, "update", {
    field: "feedback_category",
    newValue: category,
  });
  revalidateActivityPaths(act.opportunity_id, act.lead_id);
  return { ok: true };
}

// ── Дараагийн алхмыг хийгдсэнд тооцох ─────────────────────

/** Сэжимийн холбоотой даалгаврыг хаана; шинэ алхмыг activity-гаар бүртгэнэ. */
export async function completeNextStep(leadId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const { data: lead } = await supabase
    .from("crm_leads")
    .select("id, next_step_task_id")
    .eq("id", leadId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!lead) return { ok: false, error: "Сэжим олдсонгүй эсвэл танд эрх алга." };
  if (!lead.next_step_task_id) return { ok: true };

  const { error } = await supabase
    .from("tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", lead.next_step_task_id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("completeNextStep:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  revalidateActivityPaths(null, leadId);
  return { ok: true };
}
