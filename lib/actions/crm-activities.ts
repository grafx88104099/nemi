"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, getSettingValue, type CrmStaffContext } from "@/lib/queries-crm-core";
import { ACTIVITY_CHANNELS, ACTIVITY_OUTCOMES } from "@/lib/constants-crm";
import {
  activityRuleError,
  INTERESTED_NEXT_STEPS,
  MEETING_PARTIES,
  NEXT_STEP_CODES,
  SHOWING_INTERESTS,
  ubToday,
  type NextStepCode,
} from "@/lib/crm/agent-core";
import { ubTime } from "@/lib/crm/calendar";
import { normalizeAutomationThresholds } from "@/lib/crm/rules";
import { notifyCrm } from "@/lib/crm/notify";
import type { Database, Json } from "@/types/database";

type ActivityUpdate = Database["public"]["Tables"]["crm_activities"]["Update"];

/**
 * Үйл ажиллагааны бүртгэл (PRO-001 v2.1 §6.4, §6.11, §6.15, §6.26):
 *  • «Холбогдож чадаагүй» (reached=false) нь эхний холболтын хугацааг
 *    зогсоохгүй, сүүлийн холболтыг шинэчлэхгүй — DB trigger тооцно.
 *  • Амжилттай/алдсан үр дүнгээс бусад бүх бүртгэлд дараагийн үйлдэл
 *    (хаалттай жагсаалт) ба огноо заавал; өнгөрсөн огноо, ирээдүйн
 *    «болсон» огноо хориотой.
 *  • Харилцагчийн картаас бүртгэхэд нээлттэй сэжимд автоматаар холбогдоно.
 *  • Шинэ мэдээлэл орвол тухайн өдрийн «Профайл шинэчлэх» даалгавар.
 *  • Үзлэг бүртгэгдмэгц эргэх холбоо авах даалгавар (Д-05).
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const AUTH_ERR = "Нэвтэрнэ үү.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";
const NEXT_STEP_ERR = "Идэвхтэй сэжимд дараагийн үйлдэл ба огноо заавал.";

/** DB CHECK-тэй ЯГ таарна. */
const ACTIVITY_PURPOSES = ["screening", "follow_up", "offer", "negotiation", "service", "other"] as const;
const ACTIVITY_ATTITUDES = ["positive", "neutral", "objection", "not_ready"] as const;
const FEEDBACK_CATEGORIES = ["price", "location", "layout", "condition", "financing", "other"] as const;
const NEW_INFO_KINDS = ["budget", "timeline", "needs"] as const;
const NEW_INFO_LABEL: Record<(typeof NEW_INFO_KINDS)[number], string> = {
  budget: "Төсөв",
  timeline: "Хугацаа",
  needs: "Хэрэгцээ",
};

type ActivityRulesSetting = { summary_min_chars?: number; future_tolerance_min?: number };

function revalidateActivityPaths(opportunityId?: string | null, leadId?: string | null, contactId?: string | null) {
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
  if (contactId) {
    revalidatePath(`/office/crm/contacts/${contactId}`);
    revalidatePath(`/agent/crm/contacts/${contactId}`);
  }
}

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
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
  if (message.includes("дараагийн алхам") || message.includes("дараагийн үйлдэл")) return NEXT_STEP_ERR;
  if (message.includes("ирээдүйд")) return "Болсон огноо ирээдүйд байж болохгүй.";
  if (message.includes("crm_activities_purpose")) return "Зорилгын утга буруу байна.";
  if (message.includes("crm_activities_attitude")) return "Хандлагын утга буруу байна.";
  if (message.includes("crm_activities_feedback")) return "Эргэх холбооны ангилал буруу байна.";
  if (message.includes("crm_activities_next_step_code")) return "Дараагийн үйлдлийн утга буруу байна.";
  if (message.includes("эрх алга") || message.includes("row-level security")) {
    return "Танд энэ үйлдлийг хийх эрх алга.";
  }
  return SAVE_ERR;
}

async function activityRules(): Promise<{ summaryMinChars: number; futureToleranceMin: number }> {
  const s = (await getSettingValue<ActivityRulesSetting>("activity_rules")) ?? {};
  const pos = (v: unknown, fb: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fb);
  return { summaryMinChars: pos(s.summary_min_chars, 20), futureToleranceMin: pos(s.future_tolerance_min, 5) };
}

/** УБ-ын өдрийн төгсгөл (даалгаврын хугацаа). */
function endOfUbDay(iso: string): string {
  return new Date(ubTime(iso, 23, 59).getTime()).toISOString();
}

// ── Бүртгэх ───────────────────────────────────────────────

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Огноо буруу байна");

const logActivitySchema = z
  .object({
    contactId: z.uuid("Харилцагч заавал"),
    opportunityId: z.uuid().optional().nullable(),
    leadId: z.uuid().optional().nullable(),
    propertyId: z.uuid().optional().nullable(),
    /** Ярилцсан үл хөдлөх (олон). */
    propertyIds: z.array(z.uuid()).max(10, "Үл хөдлөх хэт олон").optional(),
    channel: z.enum(ACTIVITY_CHANNELS, "Суваг сонгоно уу"),
    purpose: z.enum(ACTIVITY_PURPOSES, "Зорилго сонгоно уу"),
    summary: z.string().trim().min(1, "Хураангуй бичнэ үү").max(4000, "Хураангуй хэт урт байна"),
    attitude: z.enum(ACTIVITY_ATTITUDES).optional().nullable(),
    newInfo: z.string().trim().max(2000).optional().nullable(),
    newInfoKinds: z.array(z.enum(NEW_INFO_KINDS)).max(3).optional(),
    objectionId: z.uuid().optional().nullable(),
    outcome: z.enum(ACTIVITY_OUTCOMES),
    /** Холбогдсон эсэх — false = «Холбогдож чадаагүй». */
    reached: z.boolean().optional(),
    nextStepCode: z.enum(NEXT_STEP_CODES).optional().nullable(),
    nextStep: z.string().trim().max(500).optional().nullable(),
    nextStepDate: isoDate.optional().nullable(),
    /** «HH:MM» — товлосон цаг (заавал биш). */
    nextStepTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Цаг буруу байна")
      .optional()
      .nullable(),
    occurredAt: isoDate.optional().nullable(),
    feedbackCategory: z.enum(FEEDBACK_CATEGORIES).optional().nullable(),
    showingInterest: z.enum(SHOWING_INTERESTS).optional().nullable(),
    meetingParty: z.enum(MEETING_PARTIES).optional().nullable(),
    /** Түргэн бүртгэл (бэлэн загвар) — хураангуйн уртын шаардлагагүй. */
    quickLog: z.boolean().optional(),
  })
  .strict();

export type LogActivityInput = z.infer<typeof logActivitySchema>;

export type LogActivityResult = {
  id?: string;
  error?: string;
  /** Шинэ мэдээлэл орсон / тохироогүй — профайл шинэчлэх сануулга. */
  profileHint?: boolean;
  /** Бүртгэл холбогдсон сэжим (харилцагчийн картаас автоматаар олдсон бол). */
  leadId?: string | null;
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
  const reached = input.channel === "task" ? true : input.reached !== false;

  const rules = await activityRules();
  const ruleErr = activityRuleError(
    {
      channel: input.channel,
      reached,
      summary: input.summary,
      attitude: input.attitude ?? null,
      outcome: input.outcome,
      nextStepCode: input.nextStepCode ?? null,
      nextStep: input.nextStep ?? null,
      nextStepDate: input.nextStepDate ?? null,
      occurredAt: input.occurredAt ?? null,
      showingInterest: input.showingInterest ?? null,
      quickLog: input.quickLog,
    },
    { summaryMinChars: rules.summaryMinChars, futureToleranceMin: rules.futureToleranceMin }
  );
  if (ruleErr) return { error: ruleErr };
  if (input.feedbackCategory && input.channel !== "showing") {
    return { error: "Эргэх холбооны ангилал зөвхөн үзлэгийн бүртгэлд хамаарна." };
  }
  if (input.meetingParty && input.channel !== "meeting" && input.channel !== "showing") {
    return { error: "Уулзсан тал зөвхөн уулзалт, үзлэгийн бүртгэлд хамаарна." };
  }

  // Сэжим: заасан бол шалгана; харилцагчийн картаас бол нээлттэй сэжмийг олно.
  let leadId = input.leadId ?? null;
  let leadStatus: string | null = null;
  if (leadId) {
    const { data: lead } = await supabase
      .from("crm_leads")
      .select("id, status, contact_id")
      .eq("id", leadId)
      .eq("office_id", ctx.officeId)
      .maybeSingle();
    if (!lead) return { error: "Сэжим олдсонгүй эсвэл танд эрх алга." };
    if (lead.contact_id !== input.contactId) return { error: "Сэжим энэ харилцагчийнх биш байна." };
    leadStatus = lead.status;
  } else if (!input.opportunityId) {
    const { data: open } = await supabase
      .from("crm_leads")
      .select("id, status")
      .eq("contact_id", input.contactId)
      .eq("office_id", ctx.officeId)
      .in("status", ["new", "active"])
      .limit(1)
      .maybeSingle();
    if (open) {
      leadId = open.id;
      leadStatus = open.status;
    }
  }
  if (leadStatus === "active" && (!input.nextStep?.trim() || !input.nextStepDate)) {
    return { error: NEXT_STEP_ERR };
  }

  const occurredAt = input.occurredAt ? new Date(input.occurredAt).toISOString() : new Date().toISOString();
  const nextStepAt =
    input.nextStepDate && input.nextStepTime
      ? ubTime(input.nextStepDate.slice(0, 10), Number(input.nextStepTime.slice(0, 2)), Number(input.nextStepTime.slice(3, 5))).toISOString()
      : null;
  const kinds = input.newInfoKinds ?? [];
  const newInfo =
    kinds.length || input.newInfo?.trim()
      ? [kinds.length ? kinds.map((k) => NEW_INFO_LABEL[k]).join(", ") + " өөрчлөгдсөн" : null, input.newInfo?.trim() || null]
          .filter(Boolean)
          .join(": ")
      : null;
  const propertyIds = [...new Set([...(input.propertyIds ?? []), ...(input.propertyId ? [input.propertyId] : [])])];

  const { data: row, error } = await supabase
    .from("crm_activities")
    .insert({
      office_id: ctx.officeId,
      contact_id: input.contactId,
      opportunity_id: input.opportunityId ?? null,
      lead_id: leadId,
      property_id: propertyIds[0] ?? null,
      channel: input.channel,
      purpose: input.purpose,
      summary: input.summary,
      attitude: reached ? (input.attitude ?? null) : null,
      new_info: newInfo,
      objection_id: input.objectionId ?? null,
      outcome: input.outcome,
      reached,
      next_step_code: input.nextStepCode ?? null,
      next_step: input.nextStep?.trim() || null,
      next_step_date: input.nextStepDate ? input.nextStepDate.slice(0, 10) : null,
      next_step_at: nextStepAt,
      occurred_at: occurredAt,
      feedback_category: input.feedbackCategory ?? null,
      showing_interest: input.channel === "showing" ? (input.showingInterest ?? null) : null,
      meeting_party: input.meetingParty ?? null,
      quick_log: input.quickLog ?? false,
      owner_id: user.id,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("logActivity:", error?.message);
    return { error: friendlyDbError(error?.message ?? "") };
  }

  if (propertyIds.length) {
    const { error: pErr } = await supabase.from("crm_activity_properties").insert(
      propertyIds.map((pid) => ({
        activity_id: row.id,
        property_id: pid,
        office_id: ctx.officeId,
        created_by: user.id,
      }))
    );
    if (pErr) console.error("logActivity properties:", pErr.message);
  }

  const admin = createAdminClient();

  // §6.1/§6.4: материаллаг шаардлага өөрчлөгдвөл тухайн өдөрт нь профайл шинэчлэх даалгавар.
  const profileHint = Boolean(newInfo) || input.showingInterest === "not_fit";
  if (profileHint) {
    try {
      const { data: task } = await admin
        .from("tasks")
        .insert({
          office_id: ctx.officeId,
          created_by: user.id,
          responsible_id: user.id,
          title: "Хэрэгцээний профайл шинэчлэх",
          description: newInfo
            ? `Шинэ мэдээлэл: ${newInfo}`.slice(0, 500)
            : "Үзлэгийн дараа тохироогүй гэсэн — хэрэгцээний профайлыг шинэчилж тохируулгыг сайжруулна уу.",
          priority: "high",
          deadline: endOfUbDay(ubToday()),
        })
        .select("id")
        .single();
      if (task?.id) {
        await admin.from("crm_task_links").insert({
          task_id: task.id,
          entity: "contact",
          entity_id: input.contactId,
          rule_code: "profile_update",
        });
      }
    } catch (e) {
      console.error("logActivity profile task:", e instanceof Error ? e.message : e);
    }
  }

  // Д-05: үзлэг бүртгэгдмэгц эргэх холбоо авах даалгавар (хугацаа тохиргооноос).
  if (input.channel === "showing" && !input.feedbackCategory) {
    try {
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
        const thresholds = normalizeAutomationThresholds(await getSettingValue("automation_thresholds"));
        const deadline = new Date(
          new Date(occurredAt).getTime() + thresholds.showing_feedback_hours * 3600000
        ).toISOString();
        const { data: task } = await admin
          .from("tasks")
          .insert({
            office_id: ctx.officeId,
            created_by: user.id,
            responsible_id: user.id,
            title: "Үзлэгийн эргэх холбоо авах",
            description:
              "Үзлэгийн дараах эргэх холбоог үнэ / байршил / зохион байгуулалт / нөхцөл байдал / санхүүжилт / бусад гэж ангилж бүртгэнэ үү.",
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
        await notifyCrm({
          officeId: ctx.officeId,
          event: "showing_feedback_due",
          recipients: [user.id],
          title: "Үзлэгийн эргэх холбоо хүлээгдэж байна",
          body: `${thresholds.showing_feedback_hours} цагийн дотор эргэх холбоог бүртгэнэ үү.`,
          link: leadId ? `/agent/crm/leads/${leadId}` : `/agent/crm/contacts/${input.contactId}`,
          admin,
        });
      }
    } catch (e) {
      await logRuleRun(ctx.officeId, "D-05", "crm_activities", row.id, "error", undefined, e instanceof Error ? e.message : String(e));
    }
  }

  revalidateActivityPaths(input.opportunityId, leadId, input.contactId);
  return { id: row.id, profileHint, leadId };
}

// ── Засах (тохиргоот цонхонд) ─────────────────────────────

const updateActivitySchema = z
  .object({
    id: z.uuid(),
    summary: z.string().trim().min(5, "Хураангуй хэт богино байна").max(4000).optional(),
    attitude: z.enum(ACTIVITY_ATTITUDES).optional().nullable(),
    newInfo: z.string().trim().max(2000).optional().nullable(),
    objectionId: z.uuid().optional().nullable(),
    outcome: z.enum(ACTIVITY_OUTCOMES).optional(),
    nextStepCode: z.enum(NEXT_STEP_CODES).optional().nullable(),
    nextStep: z.string().trim().max(500).optional().nullable(),
    nextStepDate: isoDate.optional().nullable(),
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
  if (input.nextStepDate && input.nextStepDate.slice(0, 10) < ubToday()) {
    return { ok: false, error: "Дараагийн үйлдлийн огноо өнгөрсөн байж болохгүй." };
  }

  const { data: before } = await supabase
    .from("crm_activities")
    .select("id, owner_id, created_at, lead_id, opportunity_id, contact_id")
    .eq("id", input.id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!before) return { ok: false, error: "Бүртгэл олдсонгүй эсвэл танд эрх алга." };

  const isOpsQc = ctx.roles.includes("ops_qc");
  if (!isOpsQc) {
    if (before.owner_id !== ctx.profileId) {
      return { ok: false, error: "Зөвхөн бүртгэсэн хүн (засварын хугацаанд) эсвэл Үйл ажиллагаа-ЧМТ засна." };
    }
    const windowHours = (await getSettingValue<number>("activity_edit_window_hours")) ?? 24;
    const ageMs = Date.now() - new Date(before.created_at).getTime();
    if (ageMs > windowHours * 3600000) {
      return { ok: false, error: `Засварын ${windowHours} цагийн хугацаа хэтэрсэн — Үйл ажиллагаа-ЧМТ-д хандана уу.` };
    }
  }

  const patch: ActivityUpdate = {};
  if (input.summary !== undefined) patch.summary = input.summary;
  if (input.attitude !== undefined) patch.attitude = input.attitude;
  if (input.newInfo !== undefined) patch.new_info = input.newInfo?.trim() || null;
  if (input.objectionId !== undefined) patch.objection_id = input.objectionId;
  if (input.outcome !== undefined) patch.outcome = input.outcome;
  if (input.nextStepCode !== undefined) patch.next_step_code = input.nextStepCode;
  if (input.nextStep !== undefined) patch.next_step = input.nextStep?.trim() || null;
  if (input.nextStepDate !== undefined) {
    patch.next_step_date = input.nextStepDate ? input.nextStepDate.slice(0, 10) : null;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  // Эрхийг дээр шалгасан — тохиргоот цонх 24 цагаас урт байж болох тул admin-аар.
  const admin = createAdminClient();
  const { error } = await admin.from("crm_activities").update(patch).eq("id", input.id).eq("office_id", ctx.officeId);
  if (error) {
    console.error("updateActivity:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  await writeAudit(ctx.officeId, "crm_activities", input.id, "update", {
    reason: isOpsQc && before.owner_id !== ctx.profileId ? "ops_qc_edit" : "author_edit",
  });
  revalidateActivityPaths(before.opportunity_id, before.lead_id, before.contact_id);
  return { ok: true };
}

// ── Үзлэгийн эргэх холбоо (§6.15) ─────────────────────────

export type ShowingFeedbackInput = {
  activityId: string;
  category: string;
  note?: string;
  interest?: string | null;
  nextStepCode?: string | null;
  nextStepDate?: string | null;
};

/**
 * Эргэх холбоог ангиллаар (+сонирхол) бүртгэнэ. Сонирхсон бол дараагийн
 * үйлдэл нь давтан үзлэг / үнийн санал / баримт бичиг, огноотой заавал;
 * тохироогүй бол профайл шинэчлэх сануулга буцаана.
 */
export async function recordShowingFeedback(
  activityIdOrInput: string | ShowingFeedbackInput,
  categoryArg?: string,
  noteArg?: string
): Promise<{ ok: boolean; error?: string; profileHint?: boolean }> {
  const input: ShowingFeedbackInput =
    typeof activityIdOrInput === "string"
      ? { activityId: activityIdOrInput, category: categoryArg ?? "", note: noteArg }
      : activityIdOrInput;
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!(FEEDBACK_CATEGORIES as readonly string[]).includes(input.category)) {
    return { ok: false, error: "Эргэх холбооны ангиллыг сонгоно уу." };
  }
  const interest = input.interest ?? null;
  if (interest && !(SHOWING_INTERESTS as readonly string[]).includes(interest)) {
    return { ok: false, error: "Сонирхлын утга буруу байна." };
  }
  if (interest === "interested") {
    if (!input.nextStepCode || !INTERESTED_NEXT_STEPS.includes(input.nextStepCode as NextStepCode)) {
      return {
        ok: false,
        error: "Сонирхсон бол дараагийн үйлдэл нь давтан үзлэг, үнийн санал эсвэл баримт бичиг байна.",
      };
    }
    if (!input.nextStepDate) return { ok: false, error: "Дараагийн үйлдлийн огноо заавал." };
  }
  if (input.nextStepDate && input.nextStepDate.slice(0, 10) < ubToday()) {
    return { ok: false, error: "Дараагийн үйлдлийн огноо өнгөрсөн байж болохгүй." };
  }

  const { data: act } = await supabase
    .from("crm_activities")
    .select("id, channel, feedback_category, new_info, lead_id, opportunity_id, owner_id, contact_id")
    .eq("id", input.activityId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!act) return { ok: false, error: "Бүртгэл олдсонгүй эсвэл танд эрх алга." };
  if (act.channel !== "showing") return { ok: false, error: "Эргэх холбоо зөвхөн үзлэгийн бүртгэлд хамаарна." };

  const canRecord =
    act.owner_id === ctx.profileId ||
    ctx.roles.some((r) => ["team_lead", "sales_director", "ops_qc"].includes(r));
  if (!canRecord) return { ok: false, error: "Эргэх холбоог бүртгэсэн агент эсвэл ахлах ажилтан бүртгэнэ." };

  const NEXT_LABEL: Record<string, string> = { repeat_showing: "Давтан үзлэг", offer: "Үнийн санал", documents: "Баримт бичиг" };
  const patch: ActivityUpdate = { feedback_category: input.category, showing_interest: interest };
  if (input.note?.trim()) {
    patch.new_info = [act.new_info, `Эргэх холбоо: ${input.note.trim()}`].filter(Boolean).join("\n");
  }
  if (input.nextStepCode && input.nextStepDate) {
    patch.next_step_code = input.nextStepCode;
    patch.next_step = NEXT_LABEL[input.nextStepCode] ?? input.nextStepCode;
    patch.next_step_date = input.nextStepDate.slice(0, 10);
  }
  const admin = createAdminClient();
  const { error } = await admin.from("crm_activities").update(patch).eq("id", input.activityId).eq("office_id", ctx.officeId);
  if (error) {
    console.error("recordShowingFeedback:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }

  // Дараагийн үйлдлийг нээлттэй сэжим, боломжид дамжуулна.
  if (patch.next_step && patch.next_step_date) {
    if (act.lead_id) {
      await admin
        .from("crm_leads")
        .update({ next_step: patch.next_step, next_step_date: patch.next_step_date })
        .eq("id", act.lead_id)
        .in("status", ["new", "active"]);
    }
    if (act.opportunity_id) {
      await admin
        .from("crm_opportunities")
        .update({ next_step: patch.next_step, next_step_date: patch.next_step_date })
        .eq("id", act.opportunity_id)
        .eq("state", "open");
    }
  }

  // Д-05 даалгаврыг хаана.
  try {
    const { data: links } = await admin
      .from("crm_task_links")
      .select("task_id")
      .eq("entity", "activity")
      .eq("entity_id", input.activityId)
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

  await writeAudit(ctx.officeId, "crm_activities", input.activityId, "update", {
    field: "feedback_category",
    newValue: input.category,
  });
  revalidateActivityPaths(act.opportunity_id, act.lead_id, act.contact_id);
  return { ok: true, profileHint: interest === "not_fit" };
}

// ── Дараагийн үйлдлийг хийгдсэнд тооцох ───────────────────

/** Сэжимийн холбоотой даалгаврыг хаана; шинэ үйлдлийг бүртгэлээр товлоно. */
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
