"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, type CrmStaffContext } from "@/lib/queries-crm-core";
import type { Json } from "@/types/database";

/**
 * Нэхэмжлэх, төлбөрийн бичилтүүд (U6 — F-515–534).
 *  • Төлөв төлбөрөөс автомат (F-519/528) — DB trigger; энд гараар оролдохгүй.
 *  • recordPayment: Д-25 босго илрүүлэлт, hold түгжээ №3, хуваарийн тулгалт
 *    (F-406) бүгд DB trigger — энд зөвхөн fx автомат (F-419 хэв) + validation.
 *  • verifyPayment (F-527): зөвхөн finance; менежменттэй гэрээнд F-466 PM
 *    тооцооны rule_run dараалалд ордог (U7 хэрэгжүүлнэ, crm-monthly давхар сканнердана).
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const AUTH_ERR = "Нэвтэрнэ үү.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";

function revalidateInvoicePaths(leaseId?: string) {
  revalidatePath("/office/crm/rentals/invoices");
  revalidatePath("/office/crm/rentals");
  if (leaseId) revalidatePath(`/office/crm/rentals/leases/${leaseId}`);
}

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

function friendlyInvoiceError(message: string): string {
  for (const prefix of ["CRM_INVOICE:", "CRM_PAYMENT:", "CRM_LEASE:", "CRM_TXN:"]) {
    const idx = message.indexOf(prefix);
    if (idx !== -1) return message.slice(idx + prefix.length).trim() || SAVE_ERR;
  }
  if (message.includes("crm_invoices_lease_id_type_period_month_key")) {
    return "Энэ гэрээний тухайн сарын нэхэмжлэх аль хэдийн үүссэн байна (Д-13 — сар бүр нэг).";
  }
  if (message.includes("crm_sequences")) {
    return "Дугаарлалтын тохиргоо (crm_sequences) хийгдээгүй байна — сисадминд хандана уу.";
  }
  if (message.includes("row-level security") || message.includes("оффисын эрхгүй")) {
    return "Танд энэ үйлдлийг хийх эрх алга.";
  }
  return SAVE_ERR;
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

/** F-419 хэв: тухайн өдрийн ханш settings 'fx_rates'-аас ({огноо: {USD: 3450}}). */
async function resolveFxRate(officeId: string, currency: string): Promise<{ rate?: number; error?: string }> {
  if (!currency || currency === "MNT") return { rate: 1 };
  const supabase = await createClient();
  const { data } = await supabase.rpc("crm_setting_at", { p_office: officeId, p_key: "fx_rates" });
  const today = new Date().toISOString().slice(0, 10);
  const table = (data ?? {}) as Record<string, Record<string, number>>;
  const rate = table?.[today]?.[currency];
  if (typeof rate !== "number" || rate <= 0) {
    return { error: `Өнөөдрийн (${today}) ${currency} ханш тохируулагдаагүй байна — Санхүү 'fx_rates'-д нэмнэ үү (F-419).` };
  }
  return { rate };
}

// ── Нэмэлт үйлчилгээний нэхэмжлэх (F-516в/523) ────────────

const extraInvoiceSchema = z
  .object({
    leaseId: z.uuid().optional().nullable(),
    transactionId: z.uuid().optional().nullable(),
    recipientContactId: z.uuid("Хүлээн авагч сонгоно уу"),
    amount: z.number().positive("Дүн 0-ээс их байна"),
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Эцсийн хугацаа буруу"),
    approvalDocId: z.uuid("Бичгэн зөвшөөрлийн баримт заавал (F-523)"),
  })
  .strict();

export type ExtraInvoiceInput = z.infer<typeof extraInvoiceSchema>;

export async function createExtraServiceInvoice(
  raw: ExtraInvoiceInput
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = extraInvoiceSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const input = parsed.data;

  const { data: row, error } = await supabase
    .from("crm_invoices")
    .insert({
      office_id: ctx.officeId,
      type: "extra_service",
      lease_id: input.leaseId ?? null,
      transaction_id: input.transactionId ?? null,
      recipient_contact_id: input.recipientContactId,
      due_on: input.dueOn,
      amount: input.amount,
      approval_doc_id: input.approvalDocId,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("createExtraServiceInvoice:", error?.message);
    return { error: friendlyInvoiceError(error?.message ?? "") };
  }
  revalidateInvoicePaths(input.leaseId ?? undefined);
  return { id: row.id };
}

// ── Энгийн түрээсийн зуучлалын хөлс (F-516б/465, F-411) ───

type FeeTier = { code: string; min_months: number; fee_pct: number };

/** F-502/465: гэрээний сараар шатлал сонгож санал болгох дүн. */
function suggestBrokerageFee(monthlyRent: number, startOn: string, endOn: string, tiers: FeeTier[]) {
  const s = new Date(`${startOn}T00:00:00Z`);
  const e = new Date(`${endOn}T00:00:00Z`);
  const months =
    (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()) - (e.getUTCDate() < s.getUTCDate() ? 1 : 0);
  let best: FeeTier | null = null;
  for (const t of tiers) {
    if (months >= t.min_months && (!best || t.min_months > best.min_months)) best = t;
  }
  if (!best) return null;
  return { tier: best, amount: Math.round(monthlyRent * (best.fee_pct / 100) * 100) / 100 };
}

const brokerageSchema = z
  .object({
    leaseId: z.uuid("Гэрээ сонгоно уу"),
    /** Хоосон бол шатлалын санал болгосон дүнгээр (F-465). */
    amount: z.number().positive().optional().nullable(),
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Эцсийн хугацаа буруу"),
  })
  .strict();

export type BrokerageInvoiceInput = z.infer<typeof brokerageSchema>;

export async function createBrokerageInvoice(
  raw: BrokerageInvoiceInput
): Promise<{ id?: string; error?: string; suggested?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = brokerageSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const input = parsed.data;

  const { data: lease } = await supabase
    .from("crm_leases")
    .select("id, monthly_rent, start_on, end_on, landlord_contact_id, transaction_id, is_managed")
    .eq("id", input.leaseId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!lease) return { error: "Гэрээ олдсонгүй эсвэл танд эрх алга." };
  if (lease.is_managed) {
    return { error: "Зуучлалын нэг удаагийн хөлс зөвхөн ЭНГИЙН түрээст (F-516б); менежменттэйд сарын хөлс автомат (Д-13)." };
  }

  // Давхардлын хамгаалалт: нэг гэрээнд нэг зуучлалын нэхэмжлэх.
  const { data: existing } = await supabase
    .from("crm_invoices")
    .select("id")
    .eq("lease_id", lease.id)
    .eq("type", "brokerage_fee")
    .neq("status", "cancelled")
    .limit(1);
  if (existing?.length) return { error: "Энэ гэрээний зуучлалын хөлсний нэхэмжлэх аль хэдийн бий (F-572)." };

  const { data: tiersCfg } = await supabase.rpc("crm_setting_at", {
    p_office: ctx.officeId,
    p_key: "rental_fee_tiers",
  });
  const tiers = ((tiersCfg as { tiers?: FeeTier[] } | null)?.tiers ?? []) as FeeTier[];
  const suggestion = suggestBrokerageFee(Number(lease.monthly_rent), lease.start_on, lease.end_on, tiers);
  if (!suggestion) return { error: "Хөлсний шатлалын тохиргоо (rental_fee_tiers) олдсонгүй — сисадминд хандана уу." };

  const amount = input.amount ?? suggestion.amount;

  // F-411: стандартаас зөрсөн дүнд батлагдсан Transaction Approval заавал.
  if (Math.abs(amount - suggestion.amount) > 0.01) {
    if (!lease.transaction_id) {
      return {
        error: `Стандарт хөлс ${suggestion.amount.toLocaleString()}₮ (${suggestion.tier.code}) — зөрсөн дүнг зөвшөөрлийн бүртгэлгүйгээр хүлээж авахгүй (F-411); гэрээ хэлцэлтэй холбогдоогүй тул зөвшөөрөл бүртгэх боломжгүй.`,
        suggested: suggestion.amount,
      };
    }
    const { data: approval } = await supabase
      .from("crm_transaction_approvals")
      .select("id")
      .eq("transaction_id", lease.transaction_id)
      .not("approved_at", "is", null)
      .limit(1);
    if (!approval?.length) {
      return {
        error: `Стандарт хөлс ${suggestion.amount.toLocaleString()}₮ (шатлал ${suggestion.tier.code}) — зөрүүтэй дүнд батлагдсан зөвшөөрлийн бүртгэл (Transaction Approval) заавал (F-411).`,
        suggested: suggestion.amount,
      };
    }
  }

  const { data: row, error } = await supabase
    .from("crm_invoices")
    .insert({
      office_id: ctx.officeId,
      type: "brokerage_fee",
      lease_id: lease.id,
      transaction_id: lease.transaction_id,
      recipient_contact_id: lease.landlord_contact_id,
      due_on: input.dueOn,
      amount,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("createBrokerageInvoice:", error?.message);
    return { error: friendlyInvoiceError(error?.message ?? "") };
  }
  revalidateInvoicePaths(lease.id);
  return { id: row.id, suggested: suggestion.amount };
}

// ── Илгээх / хүчингүй / залруулга (F-519/521/522) ─────────

export async function sendInvoice(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const { error, count } = await supabase
    .from("crm_invoices")
    .update({ status: "sent" }, { count: "exact" })
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .eq("status", "planned");
  if (error) {
    console.error("sendInvoice:", error.message);
    return { ok: false, error: friendlyInvoiceError(error.message) };
  }
  if (!count) return { ok: false, error: "Нэхэмжлэх олдсонгүй эсвэл аль хэдийн илгээгдсэн." };
  revalidateInvoicePaths();
  return { ok: true };
}

export async function cancelInvoice(id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!reason?.trim()) return { ok: false, error: "Хүчингүй болгоход үндэслэл заавал (F-522)." };

  const { error, count } = await supabase
    .from("crm_invoices")
    .update({ status: "cancelled", cancel_reason: reason.trim() }, { count: "exact" })
    .eq("id", id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("cancelInvoice:", error.message);
    return { ok: false, error: friendlyInvoiceError(error.message) };
  }
  if (!count) return { ok: false, error: "Нэхэмжлэх олдсонгүй эсвэл танд эрх алга." };
  revalidateInvoicePaths();
  return { ok: true };
}

const correctionSchema = z
  .object({
    amount: z.number().positive("Залруулгын дүн 0-ээс их байна"),
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Эцсийн хугацаа буруу"),
  })
  .strict();

/** F-522: төлөгдсөн нэхэмжлэхийг хүчингүй болгохгүй — залруулгын гинжээр. */
export async function createCorrectionInvoice(
  id: string,
  raw: z.infer<typeof correctionSchema>
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;
  const parsed = correctionSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу." };

  const { data: original } = await supabase
    .from("crm_invoices")
    .select("id, type, lease_id, transaction_id, recipient_contact_id")
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!original) return { error: "Нэхэмжлэх олдсонгүй эсвэл танд эрх алга." };

  const { data: row, error } = await supabase
    .from("crm_invoices")
    .insert({
      office_id: ctx.officeId,
      type: original.type,
      lease_id: original.lease_id,
      transaction_id: original.transaction_id,
      recipient_contact_id: original.recipient_contact_id,
      due_on: parsed.data.dueOn,
      amount: parsed.data.amount,
      corrected_invoice_id: original.id,
      // period_month зориуд null — unique(lease,type,period) давхардахгүй.
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("createCorrectionInvoice:", error?.message);
    return { error: friendlyInvoiceError(error?.message ?? "") };
  }
  revalidateInvoicePaths(original.lease_id ?? undefined);
  return { id: row.id };
}

// ── Төлбөр бүртгэх (F-525–531) ────────────────────────────

const paymentSchema = z
  .object({
    invoiceId: z.uuid().optional().nullable(),
    scheduleLineId: z.uuid().optional().nullable(),
    transactionId: z.uuid().optional().nullable(),
    leaseId: z.uuid().optional().nullable(),
    kind: z.enum(["income", "control"], "Төлбөрийн төрөл буруу (F-526)"),
    paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Огноо буруу"),
    amount: z.number("Дүн оруулна уу").refine((n) => n !== 0, "Дүн 0 байж болохгүй"),
    currency: z.string().trim().max(8).optional(),
    method: z.enum(["bank", "cash", "foreign", "virtual", "other"], "Төлбөрийн хэлбэр буруу"),
    docId: z.uuid().optional().nullable(),
    correctionOfId: z.uuid().optional().nullable(),
    refundNote: z.string().trim().optional().nullable(),
  })
  .strict();

export type RecordPaymentInput = z.infer<typeof paymentSchema>;

export async function recordPayment(raw: RecordPaymentInput): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = paymentSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const input = parsed.data;

  if (!input.invoiceId && !input.scheduleLineId && !input.transactionId && !input.leaseId) {
    return { error: "Төлбөр нэхэмжлэх, хуваарийн мөр, хэлцэл эсвэл гэрээтэй заавал холбогдоно (F-525)." };
  }
  // F-530: сөрөг дүн = залруулга; эх бүртгэлийн холбоос + тэмдэглэл заавал.
  if (input.amount < 0 && (!input.correctionOfId || !input.refundNote?.trim())) {
    return { error: "Буцаан олголт/залруулгад эх төлбөрийн холбоос + тэмдэглэл заавал (F-530)." };
  }

  const currency = input.currency || "MNT";
  const fx = await resolveFxRate(ctx.officeId, currency);
  if (fx.error) return { error: fx.error };

  const { data: row, error } = await supabase
    .from("crm_payments")
    .insert({
      office_id: ctx.officeId,
      kind: input.kind,
      invoice_id: input.invoiceId ?? null,
      schedule_line_id: input.scheduleLineId ?? null,
      transaction_id: input.transactionId ?? null,
      lease_id: input.leaseId ?? null,
      paid_on: input.paidOn,
      amount: input.amount,
      currency,
      fx_rate: fx.rate ?? 1,
      method: input.method,
      doc_id: input.docId ?? null,
      correction_of_id: input.correctionOfId ?? null,
      refund_note: input.refundNote ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("recordPayment:", error?.message);
    return { error: friendlyInvoiceError(error?.message ?? "") };
  }
  revalidateInvoicePaths(input.leaseId ?? undefined);
  revalidatePath("/office/crm/transactions");
  return { id: row.id };
}

// ── Санхүүгийн баталгаажуулалт (F-527, F-466) ─────────────

export async function verifyPayment(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  if (!ctx.roles.includes("finance")) {
    return { ok: false, error: "Орлогын баталгаажуулалтыг зөвхөн Санхүү хийнэ (F-527)." };
  }

  const { data: payment } = await supabase
    .from("crm_payments")
    .select("id, kind, lease_id, invoice_id, finance_verified_at, paid_on, amount_mnt")
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!payment) return { ok: false, error: "Төлбөр олдсонгүй эсвэл танд эрх алга." };
  if (payment.kind !== "income") return { ok: false, error: "Зөвхөн орлогын бүртгэлийг баталгаажуулна (F-526)." };
  if (payment.finance_verified_at) return { ok: false, error: "Аль хэдийн баталгаажсан." };

  const { error } = await supabase
    .from("crm_payments")
    .update({ finance_verified_by: user.id, finance_verified_at: new Date().toISOString() })
    .eq("id", id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("verifyPayment:", error.message);
    return { ok: false, error: friendlyInvoiceError(error.message) };
  }

  // F-466: менежменттэй гэрээний баталгаажсан орлого → PM тооцооны дараалал
  // (U7 commission engine + crm-monthly cron давхар сканнердана — гээгдэл хамгаалалт).
  let leaseId = payment.lease_id as string | null;
  if (!leaseId && payment.invoice_id) {
    const { data: inv } = await supabase
      .from("crm_invoices")
      .select("lease_id")
      .eq("id", payment.invoice_id)
      .maybeSingle();
    leaseId = inv?.lease_id ?? null;
  }
  if (leaseId) {
    const { data: lease } = await supabase
      .from("crm_leases")
      .select("id, is_managed")
      .eq("id", leaseId)
      .maybeSingle();
    if (lease?.is_managed) {
      await logRuleRun(ctx.officeId, "F-466", "crm_payments", id, "pending", {
        lease_id: leaseId,
        month: `${String(payment.paid_on).slice(0, 7)}-01`,
        amount_mnt: payment.amount_mnt,
      });
    }
  }

  revalidateInvoicePaths(leaseId ?? undefined);
  return { ok: true };
}
