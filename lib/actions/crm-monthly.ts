"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getCrmStaffContext, type CrmStaffContext } from "@/lib/queries-crm-core";
import type { Json } from "@/types/database";

/**
 * Сарын менежментийн бүртгэл (F-555–559) ба өмчлөгчийн тайлан (F-560–564).
 *  • saveMonthlyRecord: completeness/hold-ыг DB trigger тооцно (F-558/559) —
 *    бүрэн бус бол тухайн сарын урамшууллын hold автоматаар дамжина (F-461 → U7).
 *  • buildOwnerStatement: орлого − зардал − менежментийн хөлс = цэвэр олголт
 *    (F-561), задаргаа detail jsonb-д; PMC-ээр дамжаагүй хяналтын бүртгэлийг
 *    мэдээллийн чанартай тусад нь харуулна (F-526а).
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";

function revalidateMonthlyPaths() {
  revalidatePath("/office/crm/rentals/monthly");
  revalidatePath("/office/crm/rentals/statements");
  revalidatePath("/office/crm/rentals");
}

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

function friendlyMonthlyError(message: string): string {
  for (const prefix of ["CRM_STATEMENT:", "CRM_LEASE:"]) {
    const idx = message.indexOf(prefix);
    if (idx !== -1) return message.slice(idx + prefix.length).trim() || SAVE_ERR;
  }
  if (message.includes("row-level security") || message.includes("оффисын эрхгүй")) {
    return "Танд энэ үйлдлийг хийх эрх алга.";
  }
  return SAVE_ERR;
}

// ── Сарын бүртгэл хадгалах (F-555/557/559) ────────────────

/** Журмын 9.2 маягтын 17 түлхүүр — DB-ийн crm_monthly_completeness-тэй ЯГ ижил. */
const MONTHLY_KEYS = [
  "unit",
  "owner_name",
  "tenant_name",
  "monthly_rent",
  "service_fee",
  "payment_day",
  "rent_paid",
  "rent_paid_date",
  "utility_status",
  "usage_issues",
  "complaints_repairs",
  "actions_taken",
  "agent_issues",
  "owner_notified",
  "crm_updated",
  "net_income",
  "bonus_approved",
] as const;

const monthlyDataSchema = z
  .object(Object.fromEntries(MONTHLY_KEYS.map((k) => [k, z.unknown().optional()])))
  .strict();

export async function saveMonthlyRecord(
  id: string,
  rawData: Record<string, unknown>
): Promise<{ ok: boolean; error?: string; completeness?: number; hold?: boolean }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const parsed = monthlyDataSchema.safeParse(rawData);
  if (!parsed.success) {
    return { ok: false, error: "Маягтын талбарын бүтэц буруу байна (журмын 9.2 — 17 талбар)." };
  }

  const { data: row, error } = await supabase
    .from("crm_monthly_records")
    .update({ data: parsed.data as Json })
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .select("completeness_pct, commission_hold")
    .maybeSingle();
  if (error) {
    console.error("saveMonthlyRecord:", error.message);
    return { ok: false, error: friendlyMonthlyError(error.message) };
  }
  if (!row) return { ok: false, error: "Бүртгэл олдсонгүй эсвэл танд эрх алга." };

  revalidateMonthlyPaths();
  return { ok: true, completeness: Number(row.completeness_pct), hold: row.commission_hold };
}

// ── Өмчлөгчийн тайлан угсрах (F-560/561) ──────────────────

const buildSchema = z
  .object({
    agreementId: z.uuid("Менежментийн гэрээ сонгоно уу"),
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Эхлэх огноо буруу"),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дуусах огноо буруу"),
  })
  .strict();

export type BuildStatementInput = z.infer<typeof buildSchema>;

export async function buildOwnerStatement(
  raw: BuildStatementInput
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = buildSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const input = parsed.data;
  if (input.periodStart > input.periodEnd) return { error: "Тайлант үеийн огноо буруу." };

  const { data: agreement } = await supabase
    .from("crm_management_agreements")
    .select("id, owner_contact_id, fee_pct, number")
    .eq("id", input.agreementId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!agreement) return { error: "Менежментийн гэрээ олдсонгүй эсвэл танд эрх алга." };

  // Гэрээний объектууд + тэдгээрийн lease-үүд.
  const { data: props } = await supabase
    .from("crm_management_agreement_properties")
    .select("property_id")
    .eq("agreement_id", agreement.id);
  const propertyIds = (props ?? []).map((p) => p.property_id);
  if (!propertyIds.length) return { error: "Гэрээнд холбогдсон объект алга (F-511)." };

  const { data: leases } = await supabase
    .from("crm_leases")
    .select("id, number, property_id")
    .in("property_id", propertyIds)
    .eq("management_agreement_id", agreement.id);
  const leaseIds = (leases ?? []).map((l) => l.id);

  // Орлого: тайлант үеийн ОРЛОГЫН төлбөрүүд (F-526б); хяналтынх мэдээллийн чанартай.
  let income = 0;
  let controlTotal = 0;
  const incomeRows: Array<{ paid_on: string; amount_mnt: number; method: string; lease: string | null }> = [];
  const controlRows: Array<{ paid_on: string; amount_mnt: number; lease: string | null }> = [];
  if (leaseIds.length) {
    const { data: pays } = await supabase
      .from("crm_payments")
      .select("paid_on, amount_mnt, method, kind, lease_id")
      .in("lease_id", leaseIds)
      .gte("paid_on", input.periodStart)
      .lte("paid_on", input.periodEnd);
    for (const p of pays ?? []) {
      const leaseNo = (leases ?? []).find((l) => l.id === p.lease_id)?.number ?? null;
      if (p.kind === "income") {
        income += Number(p.amount_mnt);
        incomeRows.push({ paid_on: p.paid_on, amount_mnt: Number(p.amount_mnt), method: p.method, lease: leaseNo });
      } else {
        controlTotal += Number(p.amount_mnt);
        controlRows.push({ paid_on: p.paid_on, amount_mnt: Number(p.amount_mnt), lease: leaseNo });
      }
    }
  }

  // Зардал: тайлант үед хаагдсан, өмчлөгчийн хариуцах засварын гүйцсэн дүн (F-560).
  const { data: repairs } = await supabase
    .from("crm_maintenance_requests")
    .select("id, description, actual_amount, cost_bearer, completed_on, status")
    .in("property_id", propertyIds)
    .eq("status", "closed")
    .gte("completed_on", input.periodStart)
    .lte("completed_on", input.periodEnd);
  let expenses = 0;
  const repairRows: Array<{ description: string; amount: number; completed_on: string | null }> = [];
  for (const r of repairs ?? []) {
    if (r.cost_bearer === "landlord" && r.actual_amount != null) {
      expenses += Number(r.actual_amount);
      repairRows.push({
        description: r.description.slice(0, 120),
        amount: Number(r.actual_amount),
        completed_on: r.completed_on,
      });
    }
  }

  // Менежментийн хөлс: тайлант үеийн mgmt_fee нэхэмжлэхүүд (цуцлагдсанаас бусад).
  let mgmtFee = 0;
  const feeRows: Array<{ number: string; period_month: string | null; amount: number }> = [];
  if (leaseIds.length) {
    const { data: feeInvoices } = await supabase
      .from("crm_invoices")
      .select("number, period_month, amount, status")
      .in("lease_id", leaseIds)
      .eq("type", "mgmt_fee")
      .neq("status", "cancelled")
      .gte("issued_on", input.periodStart)
      .lte("issued_on", input.periodEnd);
    for (const inv of feeInvoices ?? []) {
      mgmtFee += Number(inv.amount);
      feeRows.push({ number: inv.number, period_month: inv.period_month, amount: Number(inv.amount) });
    }
  }

  const detail = {
    income_payments: incomeRows,
    control_payments: controlRows, // F-526а — PMC-ээр дамжаагүй (мэдээллийн чанартай)
    control_total: controlTotal,
    repairs: repairRows,
    mgmt_fee_invoices: feeRows,
    fee_pct: agreement.fee_pct,
    built_at: new Date().toISOString(),
  };

  // Байгаа (илгээгээгүй) тайланг шинэчилнэ, үгүй бол шинээр үүсгэнэ.
  const { data: existing } = await supabase
    .from("crm_owner_statements")
    .select("id, sent_at")
    .eq("agreement_id", agreement.id)
    .eq("period_start", input.periodStart)
    .maybeSingle();

  if (existing) {
    if (existing.sent_at) {
      return { error: "Энэ тайлант үеийн тайлан аль хэдийн илгээгдсэн — шинэ үе сонгоно уу (F-562)." };
    }
    const { error } = await supabase
      .from("crm_owner_statements")
      .update({
        period_end: input.periodEnd,
        income,
        expenses,
        mgmt_fee: mgmtFee,
        detail: detail as unknown as Json,
      })
      .eq("id", existing.id)
      .eq("office_id", ctx.officeId);
    if (error) {
      console.error("buildOwnerStatement update:", error.message);
      return { error: friendlyMonthlyError(error.message) };
    }
    revalidateMonthlyPaths();
    return { id: existing.id };
  }

  const { data: row, error } = await supabase
    .from("crm_owner_statements")
    .insert({
      office_id: ctx.officeId,
      agreement_id: agreement.id,
      owner_contact_id: agreement.owner_contact_id,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      income,
      expenses,
      mgmt_fee: mgmtFee,
      detail: detail as unknown as Json,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("buildOwnerStatement:", error?.message);
    return { error: friendlyMonthlyError(error?.message ?? "") };
  }
  revalidateMonthlyPaths();
  return { id: row.id };
}

// ── Илгээлт, хүлээн авалт (F-562) ─────────────────────────

export async function markStatementSent(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const { error, count } = await supabase
    .from("crm_owner_statements")
    .update({ sent_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .is("sent_at", null);
  if (error) {
    console.error("markStatementSent:", error.message);
    return { ok: false, error: friendlyMonthlyError(error.message) };
  }
  if (!count) return { ok: false, error: "Тайлан олдсонгүй эсвэл аль хэдийн илгээгдсэн." };

  // Аудит (F-562 илгээлтийн бүртгэл).
  try {
    const supa = await createClient();
    await supa.rpc("crm_write_audit", {
      p_office: ctx.officeId,
      p_entity: "crm_owner_statements",
      p_entity_id: id,
      p_action: "statement_sent",
    });
  } catch {
    /* audit best-effort */
  }
  revalidateMonthlyPaths();
  return { ok: true };
}

export async function markStatementAcknowledged(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const { error, count } = await supabase
    .from("crm_owner_statements")
    .update({ acknowledged_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .not("sent_at", "is", null)
    .is("acknowledged_at", null);
  if (error) {
    console.error("markStatementAcknowledged:", error.message);
    return { ok: false, error: friendlyMonthlyError(error.message) };
  }
  if (!count) return { ok: false, error: "Тайлан олдсонгүй, илгээгдээгүй, эсвэл аль хэдийн хүлээн авсан." };
  revalidateMonthlyPaths();
  return { ok: true };
}
