"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, getSettingValue, type CrmStaffContext } from "@/lib/queries-crm-core";
import { createLead } from "@/lib/actions/crm-leads";
import { runRule, logRuleRun } from "@/lib/crm/rules";
import { notifyCrm } from "@/lib/crm/notify";
import type { Json } from "@/types/database";

/**
 * Борлуулалтын дараах үйлчилгээ (P-09, F-750–756) + гарах ажилтны хүлээлцэх
 * акт (P-10, Д-11) — U8. Гол дүрмүүд:
 *  • NPS (F-751): илгээлт голдуу crm-daily cron-оос автомат; энд гар илгээлт
 *    + хариу бүртгэл; доогуур оноо → гомдол автомат (P-09 алхам 4);
 *  • Реферал (F-752/753): шинэ сэжим P-01-ийн стандарт урсгалаар (createLead),
 *    эх сурвалж «Санал болголт», санал болгогчтой хоёр чиглэлийн холбоос;
 *  • Хүлээлцэх акт (Д-11): багцын жагсаалт автомат, шилжүүлэлт зөвхөн
 *    reassign RPC-үүдээр (түүх+аудиттай), актгүй/дутуу шилжүүлэлттэй бол
 *    батлахгүй — deactivateStaff-ийн DB guard-тай (000100) уялдана.
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";

const NPS_LOW_DEFAULT = 6; // ≤6 → гомдлын бүртгэл (settings 'nps_low_threshold')
const NPS_SERIOUS_DEFAULT = 3; // ≤3 → ноцтой гомдол (F-461 hold нөхцөл)

function revalidatePostSalePaths() {
  revalidatePath("/office/crm");
  revalidatePath("/agent/crm");
  revalidatePath("/office/crm/contacts");
  revalidatePath("/office/crm/transactions");
  revalidatePath("/office/crm/settings/staff");
}

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

function firstZodError(error: z.ZodError): string {
  const msg = error.issues[0]?.message;
  return msg && !msg.startsWith("Invalid") && !msg.startsWith("Expected") ? msg : "Оролт буруу байна.";
}

/** Аудит — definer RPC; алдаа залгина. */
async function writeAudit(
  officeId: string,
  entity: string,
  entityId: string,
  action: string,
  extra?: { reason?: string; newValue?: unknown }
) {
  try {
    const supabase = await createClient();
    await supabase.rpc("crm_write_audit", {
      p_office: officeId,
      p_entity: entity,
      p_entity_id: entityId,
      p_action: action,
      p_field: null,
      p_old: null,
      p_new: extra?.newValue != null ? (JSON.parse(JSON.stringify(extra.newValue)) as Json) : null,
      p_reason: extra?.reason ?? null,
    });
  } catch (e) {
    console.error("crm-post-sale writeAudit:", e instanceof Error ? e.message : e);
  }
}

// ════════════════════════════════════════════════════════════
// NPS (F-751)
// ════════════════════════════════════════════════════════════

/**
 * Хаагдсан хэлцлийн худалдан авагч/түрээслэгч талуудад NPS асуулга нээнэ
 * (гар илгээлт — автомат нь crm-daily cron). Гадаад SMS/и-мэйл INT- заглушка
 * тул илгээлт = бүртгэл + rule_runs 'skipped:no_integration'.
 */
export async function sendNps(txnId: string): Promise<{ ok: boolean; error?: string; created?: number }> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const supabase = await createClient();

  const { data: txn } = await supabase
    .from("crm_transactions")
    .select("id, status, number")
    .eq("id", txnId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!txn) return { ok: false, error: "Хэлцэл олдсонгүй эсвэл танд эрх алга." };
  if (txn.status !== "closed") {
    return { ok: false, error: "NPS асуулга зөвхөн амжилттай хаагдсан хэлцэлд илгээгдэнэ (F-751)." };
  }

  const { data: parties } = await supabase
    .from("crm_transaction_parties")
    .select("contact_id, role")
    .eq("transaction_id", txnId)
    .in("role", ["buyer", "lessee"]);
  const contactIds = [...new Set((parties ?? []).map((p) => p.contact_id))];
  if (!contactIds.length) return { ok: false, error: "Хэлцэлд худалдан авагч/түрээслэгч тал бүртгэгдээгүй байна." };

  const admin = createAdminClient();
  const res = await runRule(admin, {
    officeId: ctx.officeId,
    code: "F-751",
    entity: "crm_transactions",
    entityId: txnId,
    execute: async () => {
      let created = 0;
      for (const contactId of contactIds) {
        const { error } = await supabase.from("crm_nps_surveys").insert({
          office_id: ctx.officeId,
          transaction_id: txnId,
          contact_id: contactId,
          sent_at: new Date().toISOString(),
        });
        if (!error) created += 1;
        else if (error.code !== "23505") throw new Error(error.message); // unique → аль хэдийн илгээсэн
      }
      return { created, manual: true };
    },
    dryRunResult: { would_create: contactIds.length },
  });
  if (res.status === "error") return { ok: false, error: SAVE_ERR };
  if (res.status === "skipped") return { ok: false, error: "F-751 дүрэм идэвхгүй байна (тохиргоо)." };
  if (res.status === "dry_run") return { ok: true, created: 0 };

  const created = (res.result?.created as number) ?? 0;
  if (created === 0) return { ok: false, error: "Энэ хэлцэлд NPS аль хэдийн илгээгдсэн байна." };
  revalidatePostSalePaths();
  return { ok: true, created };
}

const npsAnswerSchema = z
  .object({
    surveyId: z.string().uuid(),
    score: z.number().int().min(0, "Оноо 0–10").max(10, "Оноо 0–10"),
    comment: z.string().trim().max(2000, "Сэтгэгдэл хэт урт байна").nullable(),
  })
  .strict();

export type NpsAnswerInput = z.infer<typeof npsAnswerSchema>;

/**
 * NPS хариу бүртгэх: оноо+сэтгэгдэл+огноо харилцагчийн бүртгэлд;
 * доогуур оноо → гомдол автомат (≤3 ноцтой — F-461 hold нөхцөл),
 * өндөр оноо (≥9) → санал болголт хүсэх даалгавар (P-09 алхам 4/5).
 */
export async function recordNpsAnswer(raw: NpsAnswerInput): Promise<{ ok: boolean; error?: string }> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const parsed = npsAnswerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
  const input = parsed.data;
  const supabase = await createClient();

  const { data: survey } = await supabase
    .from("crm_nps_surveys")
    .select("id, contact_id, transaction_id, answered_at")
    .eq("id", input.surveyId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!survey) return { ok: false, error: "Асуулга олдсонгүй эсвэл танд эрх алга." };
  if (survey.answered_at) return { ok: false, error: "Энэ асуулгад хариу аль хэдийн бүртгэгдсэн." };

  const { error, count } = await supabase
    .from("crm_nps_surveys")
    .update(
      { score: input.score, comment: input.comment, answered_at: new Date().toISOString() },
      { count: "exact" }
    )
    .eq("id", input.surveyId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("recordNpsAnswer:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  if (!count) return { ok: false, error: "Бүртгэл олдсонгүй эсвэл танд эрх алга." };

  await writeAudit(ctx.officeId, "crm_nps_surveys", input.surveyId, "nps_answer", {
    newValue: { score: input.score },
  });

  const admin = createAdminClient();
  // Хэлцлийн хариуцагч агент (мэдэгдэл/даалгаврын хүлээн авагч).
  const { data: txn } = await admin
    .from("crm_transactions")
    .select("id, number, created_by")
    .eq("id", survey.transaction_id)
    .maybeSingle();
  const agentId = txn?.created_by ?? ctx.profileId;

  const lowThreshold = (await getSettingValue<number>("nps_low_threshold")) ?? NPS_LOW_DEFAULT;
  if (input.score <= lowThreshold) {
    // Доогуур үнэлгээ → гомдлын бүртгэл автомат, шийдвэрлэлтийн төлөвөөр хянагдана.
    const severity = input.score <= NPS_SERIOUS_DEFAULT ? "serious" : "normal";
    const { data: complaint, error: cErr } = await supabase
      .from("crm_complaints")
      .insert({
        office_id: ctx.officeId,
        contact_id: survey.contact_id,
        transaction_id: survey.transaction_id,
        source: "nps",
        severity,
        description: `NPS ${input.score}/10${input.comment ? ` — «${input.comment.slice(0, 500)}»` : ""} (хэлцэл ${txn?.number ?? survey.transaction_id}).`,
        created_by: ctx.profileId,
      })
      .select("id")
      .single();
    if (cErr) console.error("recordNpsAnswer complaint:", cErr.message);
    else if (complaint) {
      await logRuleRun(admin, {
        officeId: ctx.officeId,
        ruleCode: "F-751",
        entity: "crm_complaints",
        entityId: complaint.id,
        status: "ok",
        result: { from: "nps_low", score: input.score, severity },
      });
      await notifyCrm({
        officeId: ctx.officeId,
        event: "complaint_created",
        recipients: [agentId],
        includeRoles: severity === "serious" ? ["ops_qc", "sales_director"] : ["ops_qc"],
        title: "Доогуур NPS — гомдлын бүртгэл",
        body: `NPS ${input.score}/10 — гомдол автоматаар нээгдэв${severity === "serious" ? " (ноцтой)" : ""}.`,
        link: "/office/crm/contacts/" + survey.contact_id,
        entity: "crm_complaints",
        entityId: complaint.id,
        admin,
      });
    }
  } else if (input.score >= 9) {
    // Промоутер → санал болголт хүсэх даалгавар (F-752 урьдач).
    try {
      const { data: task } = await admin
        .from("tasks")
        .insert({
          office_id: ctx.officeId,
          created_by: agentId,
          responsible_id: agentId,
          title: `Санал болголт хүсэх — NPS ${input.score}/10 (F-752)`,
          description: "Өндөр үнэлгээ өгсөн харилцагчаас реферал хүсч, ирсэн нэрийг шинэ сэжим болгон бүртгэнэ.",
          priority: "normal",
          deadline: new Date(Date.now() + 3 * 86400000).toISOString(),
        })
        .select("id")
        .single();
      if (task?.id) {
        await admin.from("crm_task_links").insert({
          task_id: task.id,
          entity: "contact",
          entity_id: survey.contact_id,
          rule_code: "F-752",
        });
      }
    } catch (e) {
      console.error("recordNpsAnswer referral task:", e instanceof Error ? e.message : e);
    }
  }

  // Матриц: «NPS хариу ирсэн» → агент + маркетинг.
  await notifyCrm({
    officeId: ctx.officeId,
    event: "nps_answered",
    recipients: [agentId],
    includeRoles: ["marketing"],
    title: "NPS хариу ирлээ",
    body: `Хэлцэл ${txn?.number ?? ""}: оноо ${input.score}/10.`,
    link: "/office/crm/contacts/" + survey.contact_id,
    admin,
  });

  revalidatePostSalePaths();
  return { ok: true };
}

// ════════════════════════════════════════════════════════════
// Реферал (F-752/753)
// ════════════════════════════════════════════════════════════

const referralSchema = z
  .object({
    referrerContactId: z.string().uuid("Санал болгогч сонгоно уу"),
    /** Шинэ сэжимийн харилцагч — P-01 стандарт оролт. */
    firstName: z.string().trim().min(1, "Нэр оруулна уу").max(255),
    lastName: z.string().trim().max(255).nullable(),
    phone: z.string().trim().min(1, "Утасны дугаар оруулна уу").max(30),
    note: z.string().trim().max(500).nullable(),
  })
  .strict();

export type ReferralInput = z.infer<typeof referralSchema>;

/**
 * Реферал: ирсэн нэр шинэ сэжим болж P-01-ийн стандарт урсгалаар (createLead —
 * давхардлын хаалт, Д-01 хуваарилалт, SLA бүгд ажиллана); эх сурвалж
 * «Санал болголт», санал болгогчтой хоёр чиглэлийн холбоос (crm_referrals).
 * Рефералын хөлс тусдаа бодлогоор — систем зөвхөн бүртгэл + холбоос (F-753).
 */
export async function createReferral(
  raw: ReferralInput
): Promise<{ id?: string; leadId?: string; error?: string }> {
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;
  const parsed = referralSchema.safeParse(raw);
  if (!parsed.success) return { error: firstZodError(parsed.error) };
  const input = parsed.data;
  const supabase = await createClient();

  const { data: referrer } = await supabase
    .from("crm_contacts")
    .select("id, display_name, merged_into_id")
    .eq("id", input.referrerContactId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!referrer) return { error: "Санал болгогч харилцагч олдсонгүй эсвэл танд эрх алга." };
  if (referrer.merged_into_id) return { error: "Санал болгогчийн бүртгэл нэгтгэгдсэн — үндсэн бүртгэлийг сонгоно уу." };

  // Эх сурвалж = «Санал болголт» лавлах (F-753 эх сурвалжийн тэмдэглэгээ).
  const { data: source } = await supabase
    .from("crm_lookups")
    .select("id")
    .eq("kind", "lead_source")
    .eq("code", "referral")
    .eq("is_active", true)
    .maybeSingle();
  if (!source) return { error: "«Санал болголт» эх сурвалжийн лавлах тохируулагдаагүй байна." };

  const created = await createLead({
    contactId: null,
    newContact: {
      kind: "person",
      firstName: input.firstName,
      lastName: input.lastName,
      orgName: null,
      contactTypes: ["buyer"],
      sourceId: source.id,
      sourceDetail: `Реферал: ${referrer.display_name}${input.note ? ` — ${input.note}` : ""}`,
      branchId: ctx.branchId,
      phones: [input.phone],
      emails: [],
      consent: "not_asked",
      consentChannel: null,
    },
    sourceId: source.id,
    campaignCode: null,
    channelRef: null,
    branchId: ctx.branchId,
    grade: null,
    gradeOverrideReason: null,
    nextStep: null,
    nextStepDate: null,
  });
  if (created.error || !created.id) {
    return { error: created.error ?? SAVE_ERR };
  }

  const { data: referral, error } = await supabase
    .from("crm_referrals")
    .insert({
      office_id: ctx.officeId,
      referrer_contact_id: input.referrerContactId,
      lead_id: created.id,
    })
    .select("id")
    .single();
  if (error || !referral) {
    console.error("createReferral:", error?.message);
    return { leadId: created.id, error: "Сэжим үүссэн ч рефералын холбоос хадгалагдсангүй." };
  }

  const admin = createAdminClient();
  await logRuleRun(admin, {
    officeId: ctx.officeId,
    ruleCode: "F-752",
    entity: "crm_referrals",
    entityId: referral.id,
    status: "ok",
    result: { lead_id: created.id, referrer_contact_id: input.referrerContactId },
  });
  await writeAudit(ctx.officeId, "crm_referrals", referral.id, "insert", {
    newValue: { lead_id: created.id, referrer: input.referrerContactId },
  });

  revalidatePostSalePaths();
  return { id: referral.id, leadId: created.id };
}

// ════════════════════════════════════════════════════════════
// Гомдол
// ════════════════════════════════════════════════════════════

const complaintSchema = z
  .object({
    contactId: z.string().uuid("Харилцагч сонгоно уу"),
    transactionId: z.string().uuid().nullable(),
    source: z.enum(["nps", "manual", "maintenance"]),
    severity: z.enum(["normal", "serious"]),
    description: z.string().trim().min(1, "Гомдлын агуулга оруулна уу").max(4000),
  })
  .strict();

export type ComplaintInput = z.infer<typeof complaintSchema>;

export async function createComplaint(raw: ComplaintInput): Promise<{ id?: string; error?: string }> {
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;
  const parsed = complaintSchema.safeParse(raw);
  if (!parsed.success) return { error: firstZodError(parsed.error) };
  const input = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("crm_complaints")
    .insert({
      office_id: ctx.officeId,
      contact_id: input.contactId,
      transaction_id: input.transactionId,
      source: input.source,
      severity: input.severity,
      description: input.description,
      created_by: ctx.profileId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createComplaint:", error?.message);
    return { error: SAVE_ERR };
  }

  // Ноцтой гомдол → удирдлагад мэдэгдэл (шимтгэлийн hold нөхцөл — F-461).
  await notifyCrm({
    officeId: ctx.officeId,
    event: "complaint_created",
    recipients: [],
    includeRoles: input.severity === "serious" ? ["ops_qc", "sales_director"] : ["ops_qc"],
    title: input.severity === "serious" ? "Ноцтой гомдол бүртгэгдлээ" : "Шинэ гомдол бүртгэгдлээ",
    body: input.description,
    link: "/office/crm/contacts/" + input.contactId,
    entity: "crm_complaints",
    entityId: data.id,
  });

  revalidatePostSalePaths();
  return { id: data.id };
}

const complaintStatusSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["open", "in_progress", "resolved"]),
    resolution: z.string().trim().max(2000).nullable(),
  })
  .strict();

export type ComplaintStatusInput = z.infer<typeof complaintStatusSchema>;

/** Гомдлын төлөв: шийдвэрлэхэд resolution заавал (DB guard давхар шалгана). */
export async function resolveComplaint(raw: ComplaintStatusInput): Promise<{ ok: boolean; error?: string }> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const parsed = complaintStatusSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
  const input = parsed.data;
  if (input.status === "resolved" && !input.resolution?.trim()) {
    return { ok: false, error: "Гомдлыг шийдвэрлэхэд шийдвэрлэлтийн тайлбар заавал." };
  }
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("crm_complaints")
    .update(
      { status: input.status, resolution: input.status === "resolved" ? input.resolution : input.resolution ?? null },
      { count: "exact" }
    )
    .eq("id", input.id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("resolveComplaint:", error.message);
    if (error.message.includes("шийдвэрлэлтийн тайлбар")) {
      return { ok: false, error: "Гомдлыг шийдвэрлэхэд шийдвэрлэлтийн тайлбар заавал." };
    }
    return { ok: false, error: SAVE_ERR };
  }
  if (!count) return { ok: false, error: "Бүртгэл олдсонгүй эсвэл танд эрх алга." };

  await writeAudit(ctx.officeId, "crm_complaints", input.id, "status", {
    newValue: { status: input.status },
    reason: input.resolution ?? undefined,
  });
  revalidatePostSalePaths();
  return { ok: true };
}

// ════════════════════════════════════════════════════════════
// Гарах ажилтны хүлээлцэх акт (P-10, Д-11)
// ════════════════════════════════════════════════════════════

export type HandoverItem = {
  entity: "lead" | "opportunity" | "property_role" | "task";
  entity_id: string;
  title: string;
  /** property_role-д: sourcing|photo|contract. */
  role?: string;
  transferred_to?: string | null;
  transferred_at?: string | null;
};

/** Гарч буй ажилтны нээлттэй бичлэгийн багцын жагсаалт (Д-11 алхам 1). */
async function collectOpenItems(officeId: string, profileId: string): Promise<HandoverItem[]> {
  const admin = createAdminClient();
  const items: HandoverItem[] = [];

  const { data: leads } = await admin
    .from("crm_leads")
    .select("id, contact:crm_contacts!crm_leads_contact_id_fkey(display_name)")
    .eq("office_id", officeId)
    .eq("owner_id", profileId)
    .in("status", ["new", "active"]);
  for (const l of (leads ?? []) as unknown as { id: string; contact: { display_name: string } | null }[]) {
    items.push({ entity: "lead", entity_id: l.id, title: `Сэжим: ${l.contact?.display_name ?? l.id}` });
  }

  const { data: opps } = await admin
    .from("crm_opportunities")
    .select("id, contact:crm_contacts!crm_opportunities_contact_id_fkey(display_name)")
    .eq("office_id", officeId)
    .eq("owner_id", profileId)
    .eq("state", "open");
  for (const o of (opps ?? []) as unknown as { id: string; contact: { display_name: string } | null }[]) {
    items.push({ entity: "opportunity", entity_id: o.id, title: `Боломж: ${o.contact?.display_name ?? o.id}` });
  }

  const { data: roles } = await admin
    .from("crm_property_roles")
    .select("property_id, role, property:crm_properties!crm_property_roles_property_id_fkey(number, name, status)")
    .eq("office_id", officeId)
    .eq("agent_profile_id", profileId);
  for (const r of (roles ?? []) as unknown as {
    property_id: string;
    role: string;
    property: { number: string; name: string; status: string } | null;
  }[]) {
    if (r.property && ["sold", "withdrawn"].includes(r.property.status)) continue;
    items.push({
      entity: "property_role",
      entity_id: r.property_id,
      role: r.role,
      title: `Объект (${r.role}): ${r.property?.number ?? ""} ${r.property?.name ?? ""}`.trim(),
    });
  }

  const { data: tasks } = await admin
    .from("tasks")
    .select("id, title")
    .eq("office_id", officeId)
    .eq("responsible_id", profileId)
    .in("status", ["pending", "in_progress"]);
  for (const t of tasks ?? []) {
    items.push({ entity: "task", entity_id: t.id, title: `Даалгавар: ${t.title}` });
  }

  return items;
}

/**
 * Хүлээлцэх акт үүсгэх — гарах төлөвт орсон ажилтны багцын жагсаалт автомат
 * (Д-11). Нэг ажилтанд нэг л батлагдаагүй акт байна.
 */
export async function createHandoverAct(staffId: string): Promise<{ id?: string; error?: string }> {
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;
  if (!ctx.roles.includes("sales_director") && !ctx.roles.includes("sysadmin")) {
    return { error: "Хүлээлцэх акт үүсгэх эрх зөвхөн Борлуулалтын захирал/сисадминд бий." };
  }
  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("crm_staff")
    .select("id, profile_id, offboarding, is_active")
    .eq("id", staffId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!staff) return { error: "Ажилтан олдсонгүй." };
  if (!staff.offboarding) return { error: "Эхлээд гарах урсгал эхлүүлнэ (P-10) — offboarding төлөвгүй байна." };

  const { data: existing } = await supabase
    .from("crm_handover_acts")
    .select("id")
    .eq("staff_id", staffId)
    .eq("office_id", ctx.officeId)
    .is("approved_at", null)
    .maybeSingle();
  if (existing) return { error: "Батлагдаагүй акт аль хэдийн үүссэн байна.", id: existing.id };

  const items = await collectOpenItems(ctx.officeId, staff.profile_id);

  const admin = createAdminClient();
  const res = await runRule(admin, {
    officeId: ctx.officeId,
    code: "D-11",
    entity: "crm_staff",
    entityId: staffId,
    execute: async () => {
      const { data, error } = await supabase
        .from("crm_handover_acts")
        .insert({
          office_id: ctx.officeId,
          staff_id: staffId,
          items: items as unknown as Json,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "insert failed");
      return { act_id: data.id, items: items.length };
    },
    dryRunResult: { would_create_items: items.length },
  });
  if (res.status === "error") return { error: SAVE_ERR };
  if (res.status === "skipped") return { error: "Д-11 дүрэм идэвхгүй байна (тохиргоо)." };
  if (res.status === "dry_run") return { error: "Д-11 туршилтын горимд — акт үүсгээгүй, лог бичигдлээ." };

  const actId = res.result?.act_id as string;
  await notifyCrm({
    officeId: ctx.officeId,
    event: "offboarding_started",
    recipients: [staff.profile_id],
    includeRoles: ["sales_director", "ops_qc", "sysadmin"],
    title: "Хүлээлцэх акт үүслээ",
    body: `Гарах ажилтны багцад ${items.length} нээлттэй бичлэг байна — шилжүүлэлт хийнэ үү.`,
    link: "/office/crm/settings/staff",
    entity: "crm_handover_acts",
    entityId: actId,
  });

  revalidatePostSalePaths();
  return { id: actId };
}

const transferSchema = z
  .object({
    actId: z.string().uuid(),
    entity: z.enum(["lead", "opportunity", "property_role", "task"]),
    entityId: z.string().uuid(),
    /** property_role шилжүүлэлтэд аль роль. */
    role: z.enum(["sourcing", "photo", "contract"]).nullable(),
    toProfileId: z.string().uuid("Шинэ эзэмшигч сонгоно уу"),
  })
  .strict();

export type HandoverTransferInput = z.infer<typeof transferSchema>;

/**
 * Актын нэг бичлэгийг шилжүүлэх — зөвхөн reassign RPC-үүд (түүх+аудит,
 * дур мэдэн шилжүүлэлтийн хориг P-10-ыг DB талд сахина); шинэ эзэмшигчид
 * танилцах + эхний холболтын даалгавар (Д-11 алхам 4).
 */
export async function transferHandoverItem(
  raw: HandoverTransferInput
): Promise<{ ok: boolean; error?: string }> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!ctx.roles.includes("sales_director") && !ctx.roles.includes("sysadmin")) {
    return { ok: false, error: "Шилжүүлэлт батлах эрх зөвхөн Борлуулалтын захирал/сисадминд бий." };
  }
  const parsed = transferSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
  const input = parsed.data;
  const supabase = await createClient();

  const { data: act } = await supabase
    .from("crm_handover_acts")
    .select("id, items, approved_at, staff_id")
    .eq("id", input.actId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!act) return { ok: false, error: "Акт олдсонгүй." };
  if (act.approved_at) return { ok: false, error: "Батлагдсан акт өөрчлөгдөхгүй." };

  // Шилжүүлэлт — төрлөөр нь зохих зам (RPC = definer, эрх/түүх/аудит дотроо).
  try {
    if (input.entity === "lead") {
      const { error } = await supabase.rpc("crm_reassign_lead", {
        p_lead: input.entityId,
        p_new_owner: input.toProfileId,
        p_reason: "offboarding",
        p_note: "Гарах ажилтны хүлээлцэх (Д-11)",
      });
      if (error) throw new Error(error.message);
    } else if (input.entity === "opportunity") {
      const { error } = await supabase.rpc("crm_reassign_opportunity", {
        p_opp: input.entityId,
        p_new_owner: input.toProfileId,
        p_reason: "offboarding",
        p_note: "Гарах ажилтны хүлээлцэх (Д-11)",
      });
      if (error) throw new Error(error.message);
    } else if (input.entity === "property_role") {
      if (!input.role) return { ok: false, error: "Объектын аль ролийг шилжүүлэхээ сонгоно уу." };
      const { error } = await supabase.rpc("crm_reassign_property_role", {
        p_property: input.entityId,
        p_role: input.role,
        p_new_agent: input.toProfileId,
        p_reason: "Гарах ажилтны хүлээлцэх (Д-11)",
      });
      if (error) throw new Error(error.message);
    } else {
      // tasks — CRM RPC байхгүй: SD эрхийг апп талд шалгасан тул admin-аар.
      const admin = createAdminClient();
      const { error } = await admin
        .from("tasks")
        .update({ responsible_id: input.toProfileId })
        .eq("id", input.entityId)
        .eq("office_id", ctx.officeId);
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("transferHandoverItem:", msg);
    return { ok: false, error: msg.includes("CRM") ? msg : SAVE_ERR };
  }

  // Актын items снапшотод шилжүүлэлтийн тэмдэглэгээ.
  const items = (Array.isArray(act.items) ? act.items : []) as unknown as HandoverItem[];
  const updated = items.map((it) =>
    it.entity === input.entity && it.entity_id === input.entityId && (input.entity !== "property_role" || it.role === input.role)
      ? { ...it, transferred_to: input.toProfileId, transferred_at: new Date().toISOString() }
      : it
  );
  await supabase
    .from("crm_handover_acts")
    .update({ items: updated as unknown as Json })
    .eq("id", input.actId)
    .eq("office_id", ctx.officeId);

  // Шинэ эзэмшигчид танилцах даалгавар (сэжим/боломжид).
  if (input.entity === "lead" || input.entity === "opportunity") {
    try {
      const admin = createAdminClient();
      const { data: task } = await admin
        .from("tasks")
        .insert({
          office_id: ctx.officeId,
          created_by: ctx.profileId,
          responsible_id: input.toProfileId,
          title: "Шилжүүлсэн бичлэгтэй танилцаж эхний холболт хийх (Д-11)",
          description: "Гарах ажилтнаас шилжсэн бичлэг — түүх, нотолгоотой танилцаад харилцагчтай холбогдоно.",
          priority: "high",
          deadline: new Date(Date.now() + 2 * 86400000).toISOString(),
        })
        .select("id")
        .single();
      if (task?.id) {
        await admin.from("crm_task_links").insert({
          task_id: task.id,
          entity: input.entity,
          entity_id: input.entityId,
          rule_code: "D-11",
        });
      }
      await notifyCrm({
        officeId: ctx.officeId,
        event: "lead_assigned",
        recipients: [input.toProfileId],
        title: "Танд бичлэг шилжлээ",
        body: "Гарах ажилтны хүлээлцэхээр танд бичлэг шилжив — танилцаад эхний холболт хийнэ үү.",
        admin,
      });
    } catch (e) {
      console.error("transferHandoverItem task:", e instanceof Error ? e.message : e);
    }
  }

  revalidatePostSalePaths();
  return { ok: true };
}

const approveActSchema = z
  .object({
    actId: z.string().uuid(),
    clientsNotified: z.boolean(),
  })
  .strict();

export type ApproveHandoverInput = z.infer<typeof approveActSchema>;

/**
 * Актыг батлах (Борлуулалтын захирал) — амьд өгөгдлөөр дахин шалгана:
 * ажилтанд нээлттэй эзэмшилтэй бичлэг үлдсэн бол батлахгүй (Д-11 алхам 6-гийн
 * DB guard-тай нийцнэ). Батлагдсаны дараа deactivateStaff (crm-staff.ts) чөлөөтэй.
 */
export async function approveHandoverAct(raw: ApproveHandoverInput): Promise<{ ok: boolean; error?: string }> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!ctx.roles.includes("sales_director") && !ctx.roles.includes("sysadmin")) {
    return { ok: false, error: "Акт батлах эрх зөвхөн Борлуулалтын захирал/сисадминд бий." };
  }
  const parsed = approveActSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
  const input = parsed.data;
  const supabase = await createClient();

  const { data: act } = await supabase
    .from("crm_handover_acts")
    .select("id, staff_id, approved_at, staff:crm_staff!crm_handover_acts_staff_id_fkey(profile_id)")
    .eq("id", input.actId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!act) return { ok: false, error: "Акт олдсонгүй." };
  if (act.approved_at) return { ok: false, error: "Акт аль хэдийн батлагдсан." };
  const staffProfile = (act.staff as unknown as { profile_id: string } | null)?.profile_id;
  if (!staffProfile) return { ok: false, error: "Ажилтны бүртгэл олдсонгүй." };

  // Амьд шалгалт: нээлттэй эзэмшил үлдсэн үү.
  const remaining = await collectOpenItems(ctx.officeId, staffProfile);
  const blocking = remaining.filter((r) => r.entity !== "task");
  if (blocking.length > 0) {
    return {
      ok: false,
      error: `Шилжүүлэлт дутуу — ${blocking.length} нээлттэй бичлэг үлдсэн: ${blocking
        .slice(0, 3)
        .map((b) => b.title)
        .join("; ")}${blocking.length > 3 ? "…" : ""}`,
    };
  }

  const { error, count } = await supabase
    .from("crm_handover_acts")
    .update(
      {
        approved_by: ctx.profileId,
        approved_at: new Date().toISOString(),
        clients_notified: input.clientsNotified,
      },
      { count: "exact" }
    )
    .eq("id", input.actId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("approveHandoverAct:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  if (!count) return { ok: false, error: "Бүртгэл олдсонгүй эсвэл танд эрх алга." };

  const admin = createAdminClient();
  await logRuleRun(admin, {
    officeId: ctx.officeId,
    ruleCode: "D-11",
    entity: "crm_handover_acts",
    entityId: input.actId,
    status: "ok",
    result: { approved: true, clients_notified: input.clientsNotified },
  });
  await notifyCrm({
    officeId: ctx.officeId,
    event: "offboarding_started",
    recipients: [staffProfile],
    includeRoles: ["sysadmin"],
    title: "Хүлээлцэх акт батлагдлаа",
    body: "Багцын шилжүүлэлт бүрэн — ажилтны бүртгэлийг идэвхгүй болгож болно.",
    link: "/office/crm/settings/staff",
    admin,
  });

  revalidatePostSalePaths();
  return { ok: true };
}
