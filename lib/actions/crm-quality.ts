"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, getSettingValue } from "@/lib/queries-crm-core";
import { notifyCrm } from "@/lib/crm/notify";
import {
  QUALITY_CRITERION_LABEL,
  addDaysIso,
  isQualityCriterion,
  normalizeQualitySettings,
  qualityEntityHref,
  ubTodayIso,
} from "@/lib/crm/quality";

/**
 * CRM-ийн чанарын аудитын үйлдлүүд (U6 — PRO-001 v2.1 §6.29, RACI: ҮАМ R/A).
 * Дүрэм ба эрхийн эцсийн шалгалт DB-ийн RPC-д (crm_quality_audit_*); энд
 * оролт шалгаж, засах даалгавар үүсгэж, мэдэгдэнэ.
 */

const AUTH_ERR = "Нэвтэрнэ үү.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";
const RIGHTS_ERR = "Чанарын аудитыг Үйл ажиллагаа-ЧМТ хийнэ.";
const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";

function friendly(message: string | undefined): string {
  if (!message) return SAVE_ERR;
  const idx = message.indexOf("CRM_QA:");
  if (idx !== -1) return message.slice(idx + "CRM_QA:".length).trim() || SAVE_ERR;
  if (/does not exist|Could not find/i.test(message)) return "Чанарын аудит хараахан идэвхжээгүй байна. Системийн админд хандана уу.";
  if (message.includes("row-level security")) return RIGHTS_ERR;
  return SAVE_ERR;
}

async function auditor() {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR } as const;
  if (!ctx.roles.some((r) => r === "ops_qc" || r === "sysadmin")) return { error: RIGHTS_ERR } as const;
  return { ctx } as const;
}

function revalidateQuality(id?: string) {
  revalidatePath("/office/crm/quality");
  if (id) revalidatePath(`/office/crm/quality/${id}`);
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Огноо буруу");

const startSchema = z
  .object({
    periodStart: isoDate,
    periodEnd: isoDate,
    scope: z.enum(["office", "branch", "agent"], "Аудитын хүрээг сонгоно уу"),
    branchId: z.uuid().nullable().optional(),
    agentId: z.uuid().nullable().optional(),
    sample: z.number().int().min(1).max(200).nullable().optional(),
  })
  .strict()
  .refine((v) => v.periodEnd >= v.periodStart, { message: "Дуусах огноо эхлэхээс өмнө байна" })
  .refine((v) => v.scope !== "branch" || Boolean(v.branchId), { message: "Салбар сонгоно уу" })
  .refine((v) => v.scope !== "agent" || Boolean(v.agentId), { message: "Агент сонгоно уу" });

export async function startQualityAudit(raw: z.input<typeof startSchema>): Promise<{ id?: string; error?: string }> {
  const a = await auditor();
  if ("error" in a) return { error: a.error };
  const parsed = startSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_quality_audit_start", {
    p_period_start: v.periodStart,
    p_period_end: v.periodEnd,
    p_scope: v.scope,
    p_branch: v.scope === "branch" ? (v.branchId ?? null) : null,
    p_agent: v.scope === "agent" ? (v.agentId ?? null) : null,
    p_sample: v.sample ?? null,
  });
  if (error) {
    console.error("startQualityAudit:", error.message);
    return { error: friendly(error.message) };
  }
  revalidateQuality();
  return { id: data as string };
}

const reviewSchema = z
  .object({
    itemId: z.uuid(),
    result: z.enum(["pass", "fail", "na"], "Дүнг сонгоно уу"),
    note: z.string().max(1000).optional(),
  })
  .strict();

export async function reviewQualityItem(raw: z.input<typeof reviewSchema>): Promise<{ ok: boolean; error?: string }> {
  const a = await auditor();
  if ("error" in a) return { ok: false, error: a.error };
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_quality_audit_review", {
    p_item: parsed.data.itemId,
    p_result: parsed.data.result,
    p_note: parsed.data.note?.trim() || null,
  });
  if (error) {
    console.error("reviewQualityItem:", error.message);
    return { ok: false, error: friendly(error.message) };
  }
  revalidateQuality();
  return { ok: true };
}

const completeSchema = z
  .object({
    auditId: z.uuid(),
    summary: z.string().trim().min(10, "Аудитын дүгнэлтийг 10-аас дээш тэмдэгтээр бичнэ үү").max(4000),
    acceptRest: z.boolean().optional(),
  })
  .strict();

export async function completeQualityAudit(
  raw: z.input<typeof completeSchema>
): Promise<{ ok: boolean; score?: number | null; error?: string }> {
  const a = await auditor();
  if ("error" in a) return { ok: false, error: a.error };
  const parsed = completeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_quality_audit_complete", {
    p_audit: parsed.data.auditId,
    p_summary: parsed.data.summary,
    p_accept_rest: parsed.data.acceptRest ?? false,
  });
  if (error) {
    console.error("completeQualityAudit:", error.message);
    return { ok: false, error: friendly(error.message) };
  }
  revalidateQuality(parsed.data.auditId);
  return { ok: true, score: data == null ? null : Number(data) };
}

const cancelSchema = z
  .object({ auditId: z.uuid(), reason: z.string().trim().min(5, "Цуцлах шалтгааныг бичнэ үү").max(1000) })
  .strict();

export async function cancelQualityAudit(raw: z.input<typeof cancelSchema>): Promise<{ ok: boolean; error?: string }> {
  const a = await auditor();
  if ("error" in a) return { ok: false, error: a.error };
  const parsed = cancelSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_quality_audit_cancel", {
    p_audit: parsed.data.auditId,
    p_reason: parsed.data.reason,
  });
  if (error) {
    console.error("cancelQualityAudit:", error.message);
    return { ok: false, error: friendly(error.message) };
  }
  revalidateQuality(parsed.data.auditId);
  return { ok: true };
}

const TASK_ENTITY: Record<string, string> = {
  crm_leads: "lead",
  crm_contacts: "contact",
  crm_opportunities: "opportunity",
  crm_transactions: "transaction",
};

/**
 * Тэнцээгүй мөрт засах даалгавар: хариуцагч агент (эзэмшигчгүй бол аудитор
 * өөрөө хуваарилна), хугацаа тохиргооны fix_due_days. Агент ба түүний багийн
 * ахлагчид мэдэгдэнэ (матриц quality_fix_assigned).
 */
export async function assignQualityFix(raw: {
  itemId: string;
  assigneeId?: string | null;
  note?: string;
}): Promise<{ ok: boolean; taskId?: string; error?: string }> {
  const parsed = z
    .object({ itemId: z.uuid(), assigneeId: z.uuid().nullable().optional(), note: z.string().max(1000).optional() })
    .strict()
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const a = await auditor();
  if ("error" in a) return { ok: false, error: a.error };
  const { ctx } = a;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };

  // RLS-ээр уншина: аудитор оффисын мөрийг харна.
  const { data: item, error: iErr } = await supabase
    .from("crm_quality_audit_items")
    .select("id, audit_id, criterion, entity, entity_id, agent_id, label, auto_reason, result, auto_result, note, fix_task_id")
    .eq("id", parsed.data.itemId)
    .maybeSingle();
  if (iErr) {
    console.error("assignQualityFix item:", iErr.message);
    return { ok: false, error: friendly(iErr.message) };
  }
  if (!item) return { ok: false, error: "Аудитын мөр олдсонгүй." };
  const effective = item.result ?? item.auto_result;
  if (effective !== "fail") return { ok: false, error: "Засах даалгаврыг зөвхөн тэнцээгүй мөрт ононо." };
  if (item.fix_task_id) return { ok: false, error: "Энэ мөрт засах даалгавар аль хэдийн оноогдсон." };

  const assignee = parsed.data.assigneeId ?? item.agent_id;
  if (!assignee) return { ok: false, error: "Хариуцах агентыг сонгоно уу." };
  const admin = createAdminClient();
  const { data: staff } = await admin
    .from("crm_staff")
    .select("profile_id")
    .eq("office_id", ctx.officeId)
    .eq("profile_id", assignee)
    .eq("is_active", true)
    .maybeSingle();
  if (!staff) return { ok: false, error: "Хариуцагч энэ оффисын идэвхтэй ажилтан биш байна." };

  const settings = normalizeQualitySettings(await getSettingValue("quality_audit"));
  const deadline = `${addDaysIso(ubTodayIso(), settings.fix_due_days)}T18:00:00+08:00`;
  const criterionLabel = isQualityCriterion(item.criterion) ? QUALITY_CRITERION_LABEL[item.criterion].label : "Чанарын шалгуур";
  const reason = item.note || item.auto_reason || "Шалгуур хангаагүй";
  const description = [
    `Бүртгэл: ${item.label ?? "—"}`,
    `Дутагдал: ${reason}`,
    parsed.data.note?.trim() ? `Аудиторын тэмдэглэл: ${parsed.data.note.trim()}` : null,
    "Бүртгэлийг засаад даалгаврыг дуусгасан болгоно уу.",
  ]
    .filter(Boolean)
    .join("\n");

  const { data: task, error: tErr } = await admin
    .from("tasks")
    .insert({
      office_id: ctx.officeId,
      created_by: user.id,
      responsible_id: assignee,
      title: `CRM-ийн чанарын аудит: ${criterionLabel} засах`,
      description,
      priority: "high",
      deadline: new Date(deadline).toISOString(),
    })
    .select("id")
    .single();
  if (tErr || !task) {
    console.error("assignQualityFix task:", tErr?.message);
    return { ok: false, error: SAVE_ERR };
  }
  const linkEntity = TASK_ENTITY[item.entity];
  if (linkEntity) {
    const { error: lErr } = await admin.from("crm_task_links").insert({
      task_id: task.id,
      entity: linkEntity,
      entity_id: item.entity_id,
      rule_code: "quality_fix",
    });
    if (lErr) console.error("assignQualityFix link:", lErr.message);
  }
  const { error: uErr } = await admin
    .from("crm_quality_audit_items")
    .update({ fix_task_id: task.id })
    .eq("id", item.id)
    .eq("office_id", ctx.officeId);
  if (uErr) console.error("assignQualityFix item update:", uErr.message);

  await notifyCrm({
    officeId: ctx.officeId,
    event: "quality_fix_assigned",
    recipients: [assignee],
    title: "Чанарын аудитын засах даалгавар",
    body: `${criterionLabel}: ${item.label ?? ""} — ${reason}`,
    link: qualityEntityHref(item.entity, item.entity_id, "/agent/crm") ?? "/agent/crm",
    entity: "crm_quality_audit_items",
    entityId: item.id,
    admin,
  });
  revalidateQuality(item.audit_id);
  return { ok: true, taskId: task.id };
}
