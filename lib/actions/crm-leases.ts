"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, type CrmStaffContext } from "@/lib/queries-crm-core";
import { EXPENSE_BEARERS } from "@/lib/constants-crm";
import type { Database, Json } from "@/types/database";

type LeaseInsert = Database["public"]["Tables"]["crm_leases"]["Insert"];

/**
 * Түрээсийн гэрээний бичилтүүд (U6 — F-500–514, F-540–544, F-570–574).
 * Статусын машин (F-501), exclusion (нэг объект — нэг идэвхтэй гэрээ),
 * суутгалын нотолгоо (F-542), батламжийн түвшин (F-543) бүгд DB guard —
 * энд зөвхөн дүрсэлж, exception-ыг монгол мессеж болгон задална.
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const AUTH_ERR = "Нэвтэрнэ үү.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";

function revalidateRentalPaths(leaseId?: string) {
  revalidatePath("/office/crm/rentals");
  revalidatePath("/office/crm/rentals/invoices");
  revalidatePath("/office/crm");
  if (leaseId) revalidatePath(`/office/crm/rentals/leases/${leaseId}`);
}

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

/** DB exception → хэрэглэгчид ойлгомжтой монгол мессеж. */
function friendlyLeaseError(message: string): string {
  for (const prefix of ["CRM_LEASE:", "CRM_DEPOSIT:", "CRM_INVOICE:", "CRM_PAYMENT:"]) {
    const idx = message.indexOf(prefix);
    if (idx !== -1) return message.slice(idx + prefix.length).trim() || SAVE_ERR;
  }
  if (message.includes("crm_leases_one_active")) {
    return "Энэ объект дээр тухайн хугацаанд ИДЭВХТЭЙ түрээсийн гэрээ аль хэдийн бий — нэг объект дээр нэг мөчид нэг л идэвхтэй гэрээ байна (§2.2.3).";
  }
  if (message.includes("crm_sequences")) {
    return "Дугаарлалтын тохиргоо (crm_sequences) хийгдээгүй байна — сисадминд хандана уу.";
  }
  if (message.includes("crm_lease_dates")) return "Эхлэх огноо дуусах огнооноос өмнө байх ёстой.";
  if (message.includes("өөрчлөх хориотой талбар")) return "Өөрчлөх хориотой талбар байна.";
  if (message.includes("row-level security") || message.includes("оффисын эрхгүй")) {
    return "Танд энэ үйлдлийг хийх эрх алга.";
  }
  return SAVE_ERR;
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
        link ??
        (p.role === "office_admin" || p.role === "admin" ? "/office/crm/rentals" : "/agent/crm"),
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
  status: "ok" | "error" | "skipped" | "dry_run" | "pending",
  result?: Record<string, unknown>
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
    });
  } catch (e) {
    console.error("logRuleRun:", e instanceof Error ? e.message : e);
  }
}

/** Идэвхтэй property_manager дүртэй ажилтнуудын profile_id. */
async function pmProfiles(officeId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("crm_staff")
    .select("profile_id, roles")
    .eq("office_id", officeId)
    .eq("is_active", true);
  return (data ?? [])
    .filter((s) => (s.roles as string[]).includes("property_manager"))
    .map((s) => s.profile_id);
}

/** Автомат даалгавар (D2 конвенц: tasks + crm_task_links; created_by = хариуцагч). */
async function createRuleTask(
  officeId: string,
  ruleCode: string,
  entity: string,
  entityId: string,
  responsibleId: string,
  title: string,
  description: string,
  deadline?: string
) {
  try {
    const admin = createAdminClient();
    const { data: task } = await admin
      .from("tasks")
      .insert({
        office_id: officeId,
        created_by: responsibleId,
        responsible_id: responsibleId,
        title,
        description,
        priority: "high",
        deadline: deadline ?? null,
      })
      .select("id")
      .single();
    if (task?.id) {
      await admin.from("crm_task_links").insert({
        task_id: task.id,
        entity,
        entity_id: entityId,
        rule_code: ruleCode,
      });
    }
    return task?.id ?? null;
  } catch (e) {
    console.error("createRuleTask:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ── Гэрээ үүсгэх (F-500) ──────────────────────────────────

const expenseLineSchema = z
  .object({
    expenseType: z.enum(["electricity", "water", "heating", "hoa", "internet", "other"]),
    bearer: z.enum(EXPENSE_BEARERS),
  })
  .strict();

const createLeaseSchema = z
  .object({
    propertyId: z.uuid("Объект сонгоно уу"),
    tenantContactId: z.uuid("Түрээслэгч сонгоно уу"),
    landlordContactId: z.uuid("Түрээслүүлэгч сонгоно уу"),
    transactionId: z.uuid().optional().nullable(),
    startOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Эхлэх огноо буруу"),
    endOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дуусах огноо буруу"),
    monthlyRent: z.number("Сарын түрээсийн дүн оруулна уу").positive("Дүн 0-ээс их байна"),
    paymentDay: z.number().int().min(1, "Төлбөрийн өдөр 1–31").max(31, "Төлбөрийн өдөр 1–31"),
    graceDays: z.number().int().min(0).max(60).default(0),
    depositAmount: z.number().min(0, "Барьцааны дүн сөрөг байж болохгүй"),
    depositHolder: z.enum(EXPENSE_BEARERS).optional().nullable(),
    isManaged: z.boolean().default(false),
    managementAgreementId: z.uuid().optional().nullable(),
    expenseLines: z.array(expenseLineSchema).min(1, "Зардлын хариуцлагын хуваарь заавал (F-505)"),
    indexation: z.record(z.string(), z.unknown()).optional().nullable(),
    previousLeaseId: z.uuid().optional().nullable(),
  })
  .strict();

export type CreateLeaseInput = z.infer<typeof createLeaseSchema>;

export async function createLease(raw: CreateLeaseInput): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = createLeaseSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу байна." };
  const input = parsed.data;

  if (input.startOn >= input.endOn) return { error: "Эхлэх огноо дуусах огнооноос өмнө байх ёстой." };
  if (input.isManaged && !input.managementAgreementId) {
    return { error: "Менежменттэй гэрээнд менежментийн гэрээний холбоос заавал (F-510)." };
  }
  if (input.tenantContactId === input.landlordContactId) {
    return { error: "Түрээслэгч, түрээслүүлэгч нэг харилцагч байж болохгүй." };
  }

  const insert: LeaseInsert = {
    office_id: ctx.officeId,
    property_id: input.propertyId,
    tenant_contact_id: input.tenantContactId,
    landlord_contact_id: input.landlordContactId,
    transaction_id: input.transactionId ?? null,
    start_on: input.startOn,
    end_on: input.endOn,
    monthly_rent: input.monthlyRent,
    payment_day: input.paymentDay,
    grace_days: input.graceDays,
    deposit_amount: input.depositAmount,
    deposit_holder: input.depositHolder ?? null,
    is_managed: input.isManaged,
    management_agreement_id: input.managementAgreementId ?? null,
    indexation: (input.indexation ?? null) as Json,
    previous_lease_id: input.previousLeaseId ?? null,
    created_by: user.id,
  };

  const { data: row, error } = await supabase.from("crm_leases").insert(insert).select("id").single();
  if (error || !row) {
    console.error("createLease:", error?.message);
    return { error: friendlyLeaseError(error?.message ?? "") };
  }

  const { error: lineErr } = await supabase.from("crm_lease_expense_lines").insert(
    input.expenseLines.map((l) => ({
      lease_id: row.id,
      expense_type: l.expenseType,
      bearer: l.bearer,
    }))
  );
  if (lineErr) console.error("createLease lines:", lineErr.message);

  revalidateRentalPaths(row.id);
  return { id: row.id };
}

// ── Идэвхжүүлэлт (F-501/507) ──────────────────────────────

export async function activateLease(
  id: string,
  signedDocId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  if (!z.uuid().safeParse(signedDocId).success) {
    return { ok: false, error: "Гарын үсэгтэй хувийн баримтын ID буруу (F-507)." };
  }

  const { error } = await supabase
    .from("crm_leases")
    .update({ signed_doc_id: signedDocId, status: "active" })
    .eq("id", id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("activateLease:", error.message);
    return { ok: false, error: friendlyLeaseError(error.message) };
  }
  revalidateRentalPaths(id);
  return { ok: true };
}

// ── Сунгалт (F-504/571, Д-24) ─────────────────────────────

const renewLeaseSchema = z
  .object({
    startOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Эхлэх огноо буруу"),
    endOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дуусах огноо буруу"),
    monthlyRent: z.number().positive("Дүн 0-ээс их байна"),
    depositAmount: z.number().min(0),
    paymentDay: z.number().int().min(1).max(31).optional(),
    graceDays: z.number().int().min(0).max(60).optional(),
    signedDocId: z.uuid("Сунгалт бичгээр баталгаажсан байх ёстой (F-571)"),
  })
  .strict();

export type RenewLeaseInput = z.infer<typeof renewLeaseSchema>;

/**
 * Сунгалт: (1) шинэ гэрээг НООРОГ-оор гинжтэй үүсгэх → (2) хуучныг «Сунгагдсан»
 * болгох → (3) шинийг идэвхжүүлэх — exclusion constraint давхцал үүсгэхгүй дараалал.
 */
export async function renewLease(
  id: string,
  raw: RenewLeaseInput
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = renewLeaseSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу байна." };
  const input = parsed.data;

  const { data: old } = await supabase
    .from("crm_leases")
    .select("*")
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!old) return { error: "Гэрээ олдсонгүй эсвэл танд эрх алга." };
  if (old.status !== "active") return { error: "Зөвхөн идэвхтэй гэрээг сунгана (F-501)." };
  if (input.startOn < old.end_on) {
    // Шинэ гэрээ хуучны end_on-оос өмнө эхэлбэл '[)' семантикаар давхцана.
    return { error: `Сунгалтын гэрээ хуучны дуусах өдрөөс (${old.end_on}) өмнө эхэлж болохгүй.` };
  }

  // 1. Шинэ гэрээ — ноорог, гинжин холбоостой (F-504).
  const { data: fresh, error: insErr } = await supabase
    .from("crm_leases")
    .insert({
      office_id: ctx.officeId,
      property_id: old.property_id,
      tenant_contact_id: old.tenant_contact_id,
      landlord_contact_id: old.landlord_contact_id,
      transaction_id: old.transaction_id,
      start_on: input.startOn,
      end_on: input.endOn,
      monthly_rent: input.monthlyRent,
      payment_day: input.paymentDay ?? old.payment_day,
      grace_days: input.graceDays ?? old.grace_days,
      deposit_amount: input.depositAmount,
      deposit_holder: old.deposit_holder,
      // Барьцаа шинэ гэрээнд шинээр бүртгэгдэнэ (өөрчлөлт F-571-д бичгээр).
      deposit_received_on: null,
      is_managed: old.is_managed,
      management_agreement_id: old.management_agreement_id,
      previous_lease_id: old.id,
      signed_doc_id: input.signedDocId,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (insErr || !fresh) {
    console.error("renewLease insert:", insErr?.message);
    return { error: friendlyLeaseError(insErr?.message ?? "") };
  }

  // Зардлын хуваарь өвлөгдөнө (F-505).
  const { data: lines } = await supabase
    .from("crm_lease_expense_lines")
    .select("expense_type, bearer")
    .eq("lease_id", old.id);
  if (lines?.length) {
    await supabase.from("crm_lease_expense_lines").insert(
      lines.map((l) => ({ lease_id: fresh.id, expense_type: l.expense_type, bearer: l.bearer }))
    );
  }

  // 2. Хуучин → Сунгагдсан (F-501).
  const { error: oldErr } = await supabase
    .from("crm_leases")
    .update({ status: "renewed" })
    .eq("id", old.id)
    .eq("office_id", ctx.officeId);
  if (oldErr) {
    console.error("renewLease old:", oldErr.message);
    return { error: friendlyLeaseError(oldErr.message) };
  }

  // 3. Шинэ → Идэвхтэй.
  const { error: actErr } = await supabase
    .from("crm_leases")
    .update({ status: "active" })
    .eq("id", fresh.id)
    .eq("office_id", ctx.officeId);
  if (actErr) {
    console.error("renewLease activate:", actErr.message);
    return {
      id: fresh.id,
      error:
        "Хуучин гэрээ «Сунгагдсан» боллоо, гэхдээ шинэ гэрээг идэвхжүүлж чадсангүй: " +
        friendlyLeaseError(actErr.message),
    };
  }

  await logRuleRun(ctx.officeId, "D-24", "crm_leases", fresh.id, "ok", {
    previous_lease_id: old.id,
    new_rent: input.monthlyRent,
  });

  revalidateRentalPaths(id);
  revalidateRentalPaths(fresh.id);
  return { id: fresh.id };
}

// ── Цуцлалт (F-573, Д-23) ─────────────────────────────────

const terminateSchema = z
  .object({
    reason: z.string().trim().min(3, "Цуцлалтын шалтгаан заавал (F-573)"),
    docs: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .strict();

export async function terminateLease(
  id: string,
  raw: z.infer<typeof terminateSchema>
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const parsed = terminateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };

  const { data: lease } = await supabase
    .from("crm_leases")
    .select("id, deposit_amount, deposit_returned_on, property_id, created_by")
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!lease) return { ok: false, error: "Гэрээ олдсонгүй эсвэл танд эрх алга." };

  const { error } = await supabase
    .from("crm_leases")
    .update({
      status: "terminated",
      termination_reason: parsed.data.reason,
      termination_docs: (parsed.data.docs ?? null) as Json,
    })
    .eq("id", id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("terminateLease:", error.message);
    return { ok: false, error: friendlyLeaseError(error.message) };
  }

  // Д-23: гарах үзлэг + барьцааны тооцооны даалгаврууд ҮХХ багт.
  const pms = await pmProfiles(ctx.officeId);
  const responsible = pms[0] ?? lease.created_by;
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString();
  await createRuleTask(
    ctx.officeId,
    "D-23",
    "lease",
    id,
    responsible,
    "Гарах үзлэг хийх (Д-23)",
    "Гэрээ дуусгавар болсон — гарах үзлэг (move-out) хийж, орох үзлэгтэй зэрэгцүүлж зөрүүг тэмдэглэнэ (F-576).",
    deadline
  );
  await createRuleTask(
    ctx.officeId,
    "D-23",
    "lease",
    id,
    responsible,
    "Барьцааны тооцоо хийх (Д-23)",
    `Барьцаа ${Number(lease.deposit_amount).toLocaleString()}₮ — суутгалын задаргаа (нотолгоотой, F-542) гаргаж буцаан олголтыг бүртгэнэ (F-544).`,
    deadline
  );
  await logRuleRun(ctx.officeId, "D-23", "crm_leases", id, "ok", { tasks: 2 });
  await notify(pms, "crm_lease_terminated", "Гэрээ цуцлагдлаа", "Гарах үзлэг + барьцааны тооцооны даалгавар үүслээ.", `/office/crm/rentals/leases/${id}`);

  revalidateRentalPaths(id);
  return { ok: true };
}

// ── Гарах мэдэгдэл (F-568, Д-19) ──────────────────────────

export async function giveNotice(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const { data: lease } = await supabase
    .from("crm_leases")
    .select("id, status, property_id, created_by")
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!lease) return { ok: false, error: "Гэрээ олдсонгүй эсвэл танд эрх алга." };
  if (lease.status !== "active") return { ok: false, error: "Зөвхөн идэвхтэй гэрээнд гарах мэдэгдэл бүртгэнэ." };

  // F-568: ашиглалтын статус Notice Given (admin client — F-210 trigger дагана).
  const admin = createAdminClient();
  const { error } = await admin
    .from("crm_properties")
    .update({ occupancy: "notice_given" })
    .eq("id", lease.property_id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("giveNotice:", error.message);
    return { ok: false, error: SAVE_ERR };
  }

  // Д-19: объектыг түрээслэгч хайх урсгалд буцаах даалгавар.
  const pms = await pmProfiles(ctx.officeId);
  const responsible = pms[0] ?? lease.created_by;
  await createRuleTask(
    ctx.officeId,
    "D-19",
    "lease",
    id,
    responsible,
    "Түрээслэгч хайх урсгалд буцаах (Д-19)",
    "Түрээслэгч гарах мэдэгдэл өгсөн — объектыг идэвхтэй листинг болгож шинэ түрээслэгчийн хайлт эхлүүлнэ (F-568).",
    new Date(Date.now() + 3 * 86400000).toISOString()
  );
  await logRuleRun(ctx.officeId, "D-19", "crm_leases", id, "ok");
  await notify(pms, "crm_lease_notice", "Гарах мэдэгдэл бүртгэгдлээ", "Объект «Гарах мэдэгдэлтэй» боллоо.", `/office/crm/rentals/leases/${id}`);

  revalidateRentalPaths(id);
  return { ok: true };
}

// ── Барьцаа (F-540/544) ───────────────────────────────────

export async function recordDepositReceived(
  id: string,
  input: { receivedOn: string; holder: "landlord" | "pmc" }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.receivedOn)) return { ok: false, error: "Огноо буруу." };
  if (!["landlord", "pmc"].includes(input.holder)) return { ok: false, error: "Хадгалагч тал буруу (F-540)." };

  const { error } = await supabase
    .from("crm_leases")
    .update({ deposit_received_on: input.receivedOn, deposit_holder: input.holder })
    .eq("id", id)
    .eq("office_id", ctx.officeId);
  if (error) return { ok: false, error: friendlyLeaseError(error.message) };
  revalidateRentalPaths(id);
  return { ok: true };
}

export async function recordDepositReturn(
  id: string,
  input: { amount: number; returnedOn: string }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!(input.amount >= 0)) return { ok: false, error: "Буцаан олгох дүн буруу." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.returnedOn)) return { ok: false, error: "Огноо буруу." };

  const { data: leaseRaw } = await supabase
    .from("crm_leases")
    .select("id, deposit_amount, deductions:crm_deposit_deductions(amount, approved_at)")
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!leaseRaw) return { ok: false, error: "Гэрээ олдсонгүй эсвэл танд эрх алга." };

  type D = { amount: number; approved_at: string | null };
  const lease = leaseRaw as unknown as { id: string; deposit_amount: number; deductions: D[] };
  const deductions = lease.deductions ?? [];
  if (deductions.some((d) => !d.approved_at)) {
    return { ok: false, error: "Батлагдаагүй суутгал байна — эхлээд суутгалуудыг баталгаажуулна уу (F-543)." };
  }
  const totalDeducted = deductions.reduce((s, d) => s + Number(d.amount), 0);
  const expected = Math.max(0, Number(lease.deposit_amount) - totalDeducted);
  if (Math.abs(input.amount - expected) > 0.01) {
    return {
      ok: false,
      error: `Буцаан олгох дүн барьцаа − батлагдсан суутгалтай таарахгүй (байвал зохих: ${expected.toLocaleString()}₮, F-541).`,
    };
  }

  const { error } = await supabase
    .from("crm_leases")
    .update({ deposit_returned_on: input.returnedOn, deposit_returned_amount: input.amount })
    .eq("id", id)
    .eq("office_id", ctx.officeId);
  if (error) return { ok: false, error: friendlyLeaseError(error.message) };
  revalidateRentalPaths(id);
  return { ok: true };
}

const deductionSchema = z
  .object({
    category: z.enum(["damage", "unpaid_rent", "utility_debt"], "Суутгалын ангилал буруу"),
    amount: z.number().positive("Дүн 0-ээс их байна"),
    rationale: z.string().trim().min(3, "Үндэслэл заавал (F-541)"),
    evidenceItemId: z.uuid("Гарах үзлэгийн нотолгооны мөр заавал (F-542)"),
  })
  .strict();

export async function addDeduction(
  leaseId: string,
  raw: z.infer<typeof deductionSchema>
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const parsed = deductionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };

  const { error } = await supabase.from("crm_deposit_deductions").insert({
    office_id: ctx.officeId,
    lease_id: leaseId,
    category: parsed.data.category,
    amount: parsed.data.amount,
    rationale: parsed.data.rationale,
    evidence_inspection_item_id: parsed.data.evidenceItemId,
  });
  if (error) {
    console.error("addDeduction:", error.message);
    return { ok: false, error: friendlyLeaseError(error.message) };
  }
  revalidateRentalPaths(leaseId);
  return { ok: true };
}

export async function approveDeduction(
  id: string,
  leaseId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const { error, count } = await supabase
    .from("crm_deposit_deductions")
    .update({ approved_by: user.id }, { count: "exact" })
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .is("approved_by", null);
  if (error) {
    console.error("approveDeduction:", error.message);
    return { ok: false, error: friendlyLeaseError(error.message) };
  }
  if (!count) return { ok: false, error: "Суутгал олдсонгүй, аль хэдийн батлагдсан, эсвэл танд эрх алга (F-543)." };
  revalidateRentalPaths(leaseId);
  return { ok: true };
}

// ── Үзлэг (F-575–579) ─────────────────────────────────────

const inspectionSchema = z
  .object({
    leaseId: z.uuid(),
    kind: z.enum(["move_in", "move_out", "periodic"]),
    inspectedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Огноо буруу"),
    confirmedByTenant: z.boolean().default(false),
    items: z
      .array(
        z
          .object({
            room: z.string().trim().optional().nullable(),
            item: z.string().trim().min(1, "Эд хөрөнгийн нэр заавал"),
            condition: z.string().trim().min(1, "Нөхцөлийн үнэлгээ заавал"),
            note: z.string().trim().optional().nullable(),
            matchedItemId: z.uuid().optional().nullable(),
            discrepancy: z.boolean().default(false),
          })
          .strict()
      )
      .min(1, "Дор хаяж нэг мөр бүртгэнэ (F-575)"),
  })
  .strict();

export type CreateInspectionInput = z.infer<typeof inspectionSchema>;

export async function createInspection(
  raw: CreateInspectionInput
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = inspectionSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const input = parsed.data;

  const { data: lease } = await supabase
    .from("crm_leases")
    .select("id, property_id, created_by")
    .eq("id", input.leaseId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!lease) return { error: "Гэрээ олдсонгүй эсвэл танд эрх алга." };

  const { data: insp, error } = await supabase
    .from("crm_inspections")
    .insert({
      office_id: ctx.officeId,
      property_id: lease.property_id,
      lease_id: lease.id,
      kind: input.kind,
      inspected_on: input.inspectedOn,
      confirmed_by_tenant: input.confirmedByTenant,
      confirmed_by_staff: user.id,
    })
    .select("id")
    .single();
  if (error || !insp) {
    console.error("createInspection:", error?.message);
    return { error: friendlyLeaseError(error?.message ?? "") };
  }

  const { error: itemErr } = await supabase.from("crm_inspection_items").insert(
    input.items.map((it) => ({
      office_id: ctx.officeId,
      inspection_id: insp.id,
      room: it.room ?? null,
      item: it.item,
      condition: it.condition,
      note: it.note ?? null,
      matched_item_id: it.matchedItemId ?? null,
      discrepancy: it.discrepancy,
    }))
  );
  if (itemErr) console.error("createInspection items:", itemErr.message);

  // F-577: гарах үзлэгийн зөрүү → засварын хүсэлт автомат санал (runRule лог).
  const discrepancies = input.items.filter((it) => it.discrepancy);
  if (input.kind === "move_out" && discrepancies.length > 0) {
    const admin = createAdminClient();
    for (const d of discrepancies) {
      await admin.from("crm_maintenance_requests").insert({
        office_id: ctx.officeId,
        property_id: lease.property_id,
        lease_id: lease.id,
        source: "inspection",
        urgency: "normal",
        description: `Гарах үзлэгийн зөрүү: ${d.room ? d.room + " — " : ""}${d.item} (${d.condition})${d.note ? " · " + d.note : ""}`,
        created_by: user.id,
      });
    }
    await logRuleRun(ctx.officeId, "F-577", "crm_inspections", insp.id, "ok", {
      discrepancies: discrepancies.length,
    });
  }

  revalidateRentalPaths(input.leaseId);
  return { id: insp.id };
}

// ── Менежментийн гэрээ (F-510–514) ────────────────────────

const createAgreementSchema = z
  .object({
    ownerContactId: z.uuid("Өмчлөгч сонгоно уу"),
    startOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Эхлэх огноо буруу"),
    endOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    feePct: z.number().min(0, "Хувь буруу").max(100, "Хувь буруу"),
    reportingFrequency: z.enum(["monthly", "quarterly"]).default("monthly"),
    noticeDays: z.number().int().min(0).default(30),
    repairApprovalLimit: z.number().min(0, "Засварын зөвшөөрлийн босго заавал (F-513)"),
    renewalReminderDays: z.number().int().min(0).optional().nullable(),
    inspectionRights: z.string().trim().optional().nullable(),
    inspectionFrequency: z.string().trim().optional().nullable(),
    propertyIds: z.array(z.uuid()).min(1, "Дор хаяж нэг объект холбоно (F-511)"),
  })
  .strict();

export type CreateAgreementInput = z.infer<typeof createAgreementSchema>;

export async function createManagementAgreement(
  raw: CreateAgreementInput
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = createAgreementSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const input = parsed.data;

  const { data: agr, error } = await supabase
    .from("crm_management_agreements")
    .insert({
      office_id: ctx.officeId,
      owner_contact_id: input.ownerContactId,
      start_on: input.startOn,
      end_on: input.endOn ?? null,
      fee_pct: input.feePct,
      reporting_frequency: input.reportingFrequency,
      notice_days: input.noticeDays,
      repair_approval_limit: input.repairApprovalLimit,
      renewal_reminder_days: input.renewalReminderDays ?? null,
      inspection_rights: input.inspectionRights ?? null,
      inspection_frequency: input.inspectionFrequency ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !agr) {
    console.error("createManagementAgreement:", error?.message);
    return { error: friendlyLeaseError(error?.message ?? "") };
  }

  const { error: linkErr } = await supabase.from("crm_management_agreement_properties").insert(
    input.propertyIds.map((pid) => ({ agreement_id: agr.id, property_id: pid }))
  );
  if (linkErr) console.error("createManagementAgreement links:", linkErr.message);

  // Объектын менежментийн холбоос (F-511) — admin (properties update RLS PM-д нээлттэй ч давхар).
  const admin = createAdminClient();
  await admin
    .from("crm_properties")
    .update({ management_agreement_id: agr.id })
    .in("id", input.propertyIds)
    .eq("office_id", ctx.officeId);

  revalidateRentalPaths();
  return { id: agr.id };
}

/** F-514: менежментийн гэрээг дуусгавар болгох — эцсийн тооцооны даалгавартай. */
export async function terminateManagementAgreement(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const { error } = await supabase
    .from("crm_management_agreements")
    .update({ status: "terminated" })
    .eq("id", id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("terminateManagementAgreement:", error.message);
    return { ok: false, error: friendlyLeaseError(error.message) };
  }

  // Объектуудын холбоос цэвэрлэнэ; эцсийн тооцооны даалгавар (F-514а/б/в).
  const admin = createAdminClient();
  await admin
    .from("crm_properties")
    .update({ management_agreement_id: null })
    .eq("management_agreement_id", id)
    .eq("office_id", ctx.officeId);

  const pms = await pmProfiles(ctx.officeId);
  const responsible = pms[0] ?? user.id;
  await createRuleTask(
    ctx.officeId,
    "F-514",
    "management_agreement",
    id,
    responsible,
    "Менежментийн гэрээний эцсийн тооцоо",
    "Төлөгдөөгүй хөлс барагдуулах, өмчлөгчийн эцсийн тайлан гаргах, дуусах сарын нэхэмжлэхийг proration дүрмээр залруулах (F-514, F-585).",
    new Date(Date.now() + 7 * 86400000).toISOString()
  );
  await logRuleRun(ctx.officeId, "F-514", "crm_management_agreements", id, "ok");

  revalidateRentalPaths();
  return { ok: true };
}
