"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, type CrmStaffContext } from "@/lib/queries-crm-core";
import { EXPENSE_BEARERS, URGENCIES } from "@/lib/constants-crm";

/**
 * Засварын хүсэлтийн бичилтүүд (U6 — F-545–554).
 * Статусын машин (F-547), өмчлөгчийн зөвшөөрлийн босго (F-548), яаралтай
 * bypass (F-549), хаалтын нотолгоо (F-553), SLA (F-552) — бүгд DB trigger;
 * энд validation + exception задаргаа + мэдэгдэл.
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const AUTH_ERR = "Нэвтэрнэ үү.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";

function revalidateMaintenancePaths() {
  revalidatePath("/office/crm/rentals/maintenance");
  revalidatePath("/office/crm/rentals");
}

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

function friendlyMaintError(message: string): string {
  const idx = message.indexOf("CRM_MAINT:");
  if (idx !== -1) return message.slice(idx + "CRM_MAINT:".length).trim() || SAVE_ERR;
  if (message.includes("row-level security") || message.includes("оффисын эрхгүй")) {
    return "Танд энэ үйлдлийг хийх эрх алга.";
  }
  return SAVE_ERR;
}

async function notifyPm(officeId: string, title: string, body: string, link: string) {
  try {
    const admin = createAdminClient();
    const { data: staff } = await admin
      .from("crm_staff")
      .select("profile_id, roles")
      .eq("office_id", officeId)
      .eq("is_active", true);
    const targets = (staff ?? [])
      .filter((s) => (s.roles as string[]).includes("property_manager"))
      .map((s) => s.profile_id);
    if (!targets.length) return;
    await admin.from("notifications").insert(
      targets.map((id) => ({ user_id: id, type: "crm_maintenance", title, body: body.slice(0, 120), link }))
    );
  } catch {
    // мэдэгдэл амжилтгүй ч үндсэн үйлдэл хэвээр
  }
}

// ── Хүсэлт үүсгэх (F-545/546) ─────────────────────────────

const createRequestSchema = z
  .object({
    propertyId: z.uuid("Объект сонгоно уу"),
    leaseId: z.uuid().optional().nullable(),
    source: z.enum(["tenant", "inspection", "owner", "pm_team"], "Эх сурвалж буруу"),
    categoryId: z.uuid().optional().nullable(),
    urgency: z.enum(URGENCIES).default("normal"),
    description: z.string().trim().min(5, "Тайлбар дор хаяж 5 тэмдэгт"),
    estimateAmount: z.number().min(0).optional().nullable(),
    costBearer: z.enum(EXPENSE_BEARERS).optional().nullable(),
  })
  .strict();

export type CreateMaintenanceInput = z.infer<typeof createRequestSchema>;

export async function createRequest(raw: CreateMaintenanceInput): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = createRequestSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const input = parsed.data;

  const { data: row, error } = await supabase
    .from("crm_maintenance_requests")
    .insert({
      office_id: ctx.officeId,
      property_id: input.propertyId,
      lease_id: input.leaseId ?? null,
      source: input.source,
      category_id: input.categoryId ?? null,
      urgency: input.urgency,
      description: input.description,
      estimate_amount: input.estimateAmount ?? null,
      cost_bearer: input.costBearer ?? null,
      created_by: user.id,
    })
    .select("id, owner_approval_needed")
    .single();
  if (error || !row) {
    console.error("createRequest:", error?.message);
    return { error: friendlyMaintError(error?.message ?? "") };
  }

  await notifyPm(
    ctx.officeId,
    "Шинэ засварын хүсэлт",
    input.urgency === "urgent" ? "ЯАРАЛТАЙ засварын хүсэлт бүртгэгдлээ." : "Засварын хүсэлт бүртгэгдлээ.",
    "/office/crm/rentals/maintenance"
  );
  revalidateMaintenancePaths();
  return { id: row.id };
}

// ── Зөвшөөрөл (F-548) ─────────────────────────────────────

export async function approveByOwner(id: string, docId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!z.uuid().safeParse(docId).success) {
    return { ok: false, error: "Өмчлөгчийн зөвшөөрлийн баримтын ID буруу (F-548)." };
  }

  const { error, count } = await supabase
    .from("crm_maintenance_requests")
    .update(
      { owner_approved_at: new Date().toISOString(), owner_approval_doc_id: docId },
      { count: "exact" }
    )
    .eq("id", id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("approveByOwner:", error.message);
    return { ok: false, error: friendlyMaintError(error.message) };
  }
  if (!count) return { ok: false, error: "Хүсэлт олдсонгүй эсвэл танд эрх алга." };
  revalidateMaintenancePaths();
  return { ok: true };
}

/** Зөвшөөрөл хүлээх төлөвт шилжүүлэх (F-547: new → pending_approval). */
export async function sendToApproval(id: string): Promise<{ ok: boolean; error?: string }> {
  return setMaintStatus(id, { status: "pending_approval" });
}

// ── Оноолт, явц, хаалт (F-547/549/550/553) ────────────────

const assignSchema = z
  .object({
    vendorId: z.uuid().optional().nullable(),
    assignedTo: z.uuid().optional().nullable(),
    emergencyBypass: z.boolean().default(false),
  })
  .strict();

export async function assignVendor(
  id: string,
  raw: z.infer<typeof assignSchema>
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const parsed = assignSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  if (!parsed.data.vendorId && !parsed.data.assignedTo) {
    return { ok: false, error: "Гүйцэтгэгч эсвэл хариуцагч ажилтан сонгоно уу (F-550)." };
  }

  const { error, count } = await supabase
    .from("crm_maintenance_requests")
    .update(
      {
        vendor_id: parsed.data.vendorId ?? null,
        assigned_to: parsed.data.assignedTo ?? null,
        emergency_bypass: parsed.data.emergencyBypass,
        status: "assigned",
      },
      { count: "exact" }
    )
    .eq("id", id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("assignVendor:", error.message);
    return { ok: false, error: friendlyMaintError(error.message) };
  }
  if (!count) return { ok: false, error: "Хүсэлт олдсонгүй эсвэл танд эрх алга." };
  revalidateMaintenancePaths();
  return { ok: true };
}

export async function startWork(id: string): Promise<{ ok: boolean; error?: string }> {
  return setMaintStatus(id, { status: "in_progress" });
}

const closeSchema = z
  .object({
    completionDocId: z.uuid("Гүйцэтгэлийн нотолгооны баримт заавал (F-553)"),
    actualAmount: z.number().min(0).optional().nullable(),
    costBearer: z.enum(EXPENSE_BEARERS).optional().nullable(),
  })
  .strict();

export async function closeRequest(
  id: string,
  raw: z.infer<typeof closeSchema>
): Promise<{ ok: boolean; error?: string }> {
  const parsed = closeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  return setMaintStatus(id, {
    status: "closed",
    completion_doc_id: parsed.data.completionDocId,
    actual_amount: parsed.data.actualAmount ?? null,
    cost_bearer: parsed.data.costBearer ?? null,
    completed_on: new Date().toISOString().slice(0, 10),
  });
}

export async function rejectRequest(id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  if (!reason?.trim()) return { ok: false, error: "Татгалзахад шалтгаан заавал." };
  return setMaintStatus(id, { status: "rejected", reject_reason: reason.trim() });
}

async function setMaintStatus(
  id: string,
  patch: import("@/types/database").Database["public"]["Tables"]["crm_maintenance_requests"]["Update"]
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const { error, count } = await supabase
    .from("crm_maintenance_requests")
    .update(patch, { count: "exact" })
    .eq("id", id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("setMaintStatus:", error.message);
    return { ok: false, error: friendlyMaintError(error.message) };
  }
  if (!count) return { ok: false, error: "Хүсэлт олдсонгүй эсвэл танд эрх алга." };
  revalidateMaintenancePaths();
  return { ok: true };
}

// ── Гүйцэтгэгчийн лавлах (F-550) ──────────────────────────

const vendorSchema = z
  .object({
    name: z.string().trim().min(2, "Нэр дор хаяж 2 тэмдэгт"),
    phone: z.string().trim().optional().nullable(),
    specialty: z.string().trim().optional().nullable(),
  })
  .strict();

export async function createVendor(raw: z.infer<typeof vendorSchema>): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;
  const parsed = vendorSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу." };

  const { data: row, error } = await supabase
    .from("crm_vendors")
    .insert({
      office_id: ctx.officeId,
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      specialty: parsed.data.specialty ?? null,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("createVendor:", error?.message);
    return { error: friendlyMaintError(error?.message ?? "") };
  }
  revalidateMaintenancePaths();
  return { id: row.id };
}
