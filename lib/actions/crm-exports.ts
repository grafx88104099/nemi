"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCrmStaffContext, getSettingValue } from "@/lib/queries-crm-core";
import { notifyCrm } from "@/lib/crm/notify";
import {
  dbErrorMessage,
  exportDecideSchema,
  exportNeedsApproval,
  exportRequestSchema,
  parseWith,
  type ExportScope,
} from "@/lib/validation/crm-ownership";
import type { Json } from "@/types/database";

/**
 * Экспортын хүсэлт, зөвшөөрөл (PRO-001 v2.1 §6.32, §7 «Харилцагчийн мэдээлэл
 * задрах»). Агент, Багийн ахлагч зөвшөөрөлгүй татахгүй; удирдлага тохиргооны
 * дээд мөрөөс их бол мөн зөвшөөрөл хүснэ. Шийдвэр — Үйл ажиллагаа-ЧМТ эсвэл
 * Борлуулалт хариуцсан захирал (өөрийн хүсэлтийг өөрөө биш).
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const DEFAULT_DIRECT_MAX = 500;

async function directMaxRows(): Promise<number> {
  const v = await getSettingValue<{ direct_max_rows?: number }>("export_limits");
  const n = v && typeof v === "object" ? Number(v.direct_max_rows) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DIRECT_MAX;
}

function revalidateExports() {
  revalidatePath("/office/crm/disputes");
  revalidatePath("/office/crm/contacts");
  revalidatePath("/office/crm/transactions");
}

export async function requestExport(raw: unknown): Promise<{ id?: string; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: "Та CRM-д бүртгэгдээгүй байна." };
  const parsed = parseWith(exportRequestSchema, raw);
  if ("error" in parsed) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_export_requests")
    .insert({
      office_id: ctx.officeId,
      requested_by: ctx.profileId,
      scope: parsed.data.scope,
      filters: parsed.data.filters as unknown as Json,
      reason: parsed.data.reason,
      row_estimate: parsed.data.rowEstimate,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("requestExport:", error?.message);
    return { error: dbErrorMessage(error?.message, SAVE_ERR) };
  }
  await notifyCrm({
    officeId: ctx.officeId,
    event: "export_requested",
    recipients: [],
    includeRoles: ["ops_qc"],
    title: "Өгөгдөл экспортлох хүсэлт",
    body: `Зорилго: ${parsed.data.reason}`.slice(0, 120),
    link: "/office/crm/disputes?tab=exports",
    entity: "crm_export_requests",
    entityId: data.id,
  });
  revalidateExports();
  return { id: data.id };
}

export async function decideExport(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: "Та CRM-д бүртгэгдээгүй байна." };
  const parsed = parseWith(exportDecideSchema, raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const supabase = await createClient();
  const { data: req } = await supabase
    .from("crm_export_requests")
    .select("requested_by")
    .eq("id", parsed.data.requestId)
    .maybeSingle();
  const { error } = await supabase.rpc("crm_decide_export_request", {
    p_request: parsed.data.requestId,
    p_approve: parsed.data.approve,
    p_note: parsed.data.note || null,
    p_max_rows: parsed.data.maxRows,
  });
  if (error) {
    console.error("decideExport:", error.message);
    return { ok: false, error: dbErrorMessage(error.message, SAVE_ERR) };
  }
  if (req?.requested_by) {
    await notifyCrm({
      officeId: ctx.officeId,
      // Матрицгүй event — шууд хүлээн авагчид (хүсэлт гаргагч) очно.
      event: "export_decided",
      recipients: [req.requested_by],
      title: parsed.data.approve ? "Экспортын хүсэлт зөвшөөрөгдлөө" : "Экспортын хүсэлт татгалзагдлаа",
      body: parsed.data.approve
        ? "Зөвшөөрлийн хугацаанд жагсаалтаас татаж авна уу."
        : `Шалтгаан: ${parsed.data.note ?? ""}`.slice(0, 120),
    });
  }
  revalidateExports();
  return { ok: true };
}

/**
 * Экспорт хийхийн өмнө бусад нэгжийн action дуудна (crm-contacts, crm-transactions):
 *  • удирдлага + мөр ≤ дээд хэмжээ → шууд (ok, requestId = null);
 *  • бусад тохиолдолд тухайн хамрах хүрээнд зөвшөөрөгдсөн, хугацаа дуусаагүй,
 *    хангалттай мөртэй хүсэлтийг «ашигласан» болгоно;
 *  • байхгүй бол needsRequest = true (UI хүсэлтийн маягт нээнэ).
 */
export async function authorizeExport(
  scope: ExportScope,
  rows: number
): Promise<{ ok: boolean; needsRequest?: boolean; requestId?: string | null; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: "Та CRM-д бүртгэгдээгүй байна." };
  const max = await directMaxRows();
  if (!exportNeedsApproval(ctx.roles, rows, max)) return { ok: true, requestId: null };

  const supabase = await createClient();
  const { data: approved } = await supabase
    .from("crm_export_requests")
    .select("id, max_rows, expires_at")
    .eq("requested_by", ctx.profileId)
    .eq("scope", scope)
    .eq("status", "approved")
    .gt("expires_at", new Date().toISOString())
    .order("decided_at", { ascending: false })
    .limit(5);
  const usable = (approved ?? []).find((r) => r.max_rows == null || r.max_rows >= rows);
  if (!usable) {
    return {
      ok: false,
      needsRequest: true,
      error: "Экспортлох зөвшөөрөл шаардлагатай — зорилгоо бичиж хүсэлт илгээнэ үү.",
    };
  }
  const { error } = await supabase.rpc("crm_consume_export_request", { p_request: usable.id, p_rows: rows });
  if (error) {
    console.error("authorizeExport:", error.message);
    return { ok: false, error: dbErrorMessage(error.message, SAVE_ERR) };
  }
  revalidateExports();
  return { ok: true, requestId: usable.id };
}
