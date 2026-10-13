"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRM_ROLES, type CrmRole } from "@/lib/constants-crm";

/**
 * CRM ажилтны удирдлага (§1.1). Бичих эрх: sysadmin (RLS давхар шалгана;
 * sales_director засах эрхтэй — ToR §7.1 «Хэрэглэгч» ХЗ-к).
 * Bootstrap: CRM-гүй оффисын office_admin ЭХНИЙ мөрөө өөртөө үүсгэнэ (RLS policy).
 */

const SAVE_ERR = "Ажилтны бүртгэл хадгалахад алдаа гарлаа. Дахин оролдоно уу.";

type Ctx = { userId: string; officeId: string | null; roles: CrmRole[]; hasStaffRow: boolean; userRole: string };

async function staffContext(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Ctx | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, office_id")
    .eq("id", user.id)
    .maybeSingle();
  let officeId = profile?.office_id ?? null;
  if (!officeId) {
    const { data: agent } = await supabase
      .from("agents")
      .select("office_id")
      .eq("profile_id", user.id)
      .maybeSingle();
    officeId = agent?.office_id ?? null;
  }
  const { data: staff } = await supabase
    .from("crm_staff")
    .select("roles")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  return {
    userId: user.id,
    officeId,
    roles: (staff?.roles ?? []) as CrmRole[],
    hasStaffRow: !!staff,
    userRole: (profile?.role as string) ?? "buyer",
  };
}

function revalidateStaffPaths() {
  revalidatePath("/office/crm");
  revalidatePath("/office/crm/settings");
  revalidatePath("/office/crm/settings/staff");
}

/** Мэдэгдэл — admin client, алдаа үндсэн үйлдлийг унагахгүй. */
async function notify(recipientIds: string[], type: string, title: string, body: string) {
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
      link: p.role === "office_admin" || p.role === "admin" ? "/office/crm" : "/agent/crm",
    }));
    if (rows.length) await admin.from("notifications").insert(rows);
  } catch {
    // мэдэгдэл амжилтгүй ч үндсэн үйлдэл хэвээр
  }
}

const staffSchema = z
  .object({
    id: z.string().uuid().optional(),
    profileId: z.string().uuid("Хэрэглэгч сонгоно уу"),
    branchId: z.string().uuid().nullable(),
    teamId: z.string().uuid().nullable(),
    roles: z.array(z.enum(CRM_ROLES)).min(1, "Дор хаяж нэг дүр сонгоно уу"),
    panelAdmin: z.boolean(),
  })
  .strict();

export type StaffInput = z.infer<typeof staffSchema>;

/** Ажилтан нэмэх/засах (дүр, салбар, баг, panel_admin). Дүрийн өөрчлөлт audit trigger-т бүртгэгдэнэ (ACC-02). */
export async function upsertStaff(raw: StaffInput): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const ctx = await staffContext(supabase);
  if (!ctx) return { error: "Нэвтэрнэ үү." };
  if (!ctx.officeId) return { error: "Та оффист харьяалагдаагүй байна." };

  const parsed = staffSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message;
    return { error: msg && !msg.startsWith("Invalid") ? msg : "Оролт буруу байна." };
  }
  const input = parsed.data;

  // Bootstrap-аас бусад тохиолдолд зөвхөн sysadmin/sales_director (RLS давхар хамгаална).
  const canWrite =
    ctx.roles.includes("sysadmin") ||
    (input.id ? ctx.roles.includes("sales_director") : false) ||
    (!ctx.hasStaffRow && ctx.userRole === "office_admin" && input.profileId === ctx.userId);
  if (!canWrite) return { error: "Танд ажилтны бүртгэл өөрчлөх эрх алга." };

  if (input.id) {
    const { error, count } = await supabase
      .from("crm_staff")
      .update(
        {
          branch_id: input.branchId,
          team_id: input.teamId,
          roles: input.roles,
          panel_admin: input.panelAdmin,
        },
        { count: "exact" }
      )
      .eq("id", input.id)
      .eq("office_id", ctx.officeId);
    if (error) {
      console.error("upsertStaff:", error.message);
      return { error: SAVE_ERR };
    }
    if (!count) return { error: "Бүртгэл олдсонгүй эсвэл танд эрх алга." };
    revalidateStaffPaths();
    return { id: input.id };
  }

  const { data, error } = await supabase
    .from("crm_staff")
    .insert({
      office_id: ctx.officeId,
      profile_id: input.profileId,
      branch_id: input.branchId,
      team_id: input.teamId,
      roles: input.roles,
      panel_admin: input.panelAdmin,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("upsertStaff:", error?.message);
    return {
      error:
        error?.code === "23505" ? "Энэ хэрэглэгч аль хэдийн CRM-д бүртгэлтэй." : SAVE_ERR,
    };
  }

  if (input.profileId !== ctx.userId) {
    await notify([input.profileId], "crm_staff_added", "CRM бүртгэл", "Таныг CRM-д ажилтнаар бүртгэлээ.");
  }
  revalidateStaffPaths();
  return { id: data.id };
}

/**
 * P-10: гарах урсгал эхлүүлэх — offboarding=true + удирдлагад мэдэгдэл,
 * хүлээлцэх даалгавар (Д-11-ийн эхлэл; багцын бүрэн шилжүүлэлт U8-ийн урсгалаар).
 */
export async function startOffboarding(staffId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await staffContext(supabase);
  if (!ctx) return { ok: false, error: "Нэвтэрнэ үү." };
  if (!ctx.roles.includes("sysadmin") && !ctx.roles.includes("sales_director")) {
    return { ok: false, error: "Танд гарах урсгал эхлүүлэх эрх алга." };
  }
  if (!ctx.officeId) return { ok: false, error: "Та оффист харьяалагдаагүй байна." };

  const { data: staff } = await supabase
    .from("crm_staff")
    .select("id, profile_id, offboarding")
    .eq("id", staffId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!staff) return { ok: false, error: "Ажилтан олдсонгүй." };
  if (staff.offboarding) return { ok: false, error: "Гарах урсгал аль хэдийн эхэлсэн." };

  const { error } = await supabase
    .from("crm_staff")
    .update({ offboarding: true })
    .eq("id", staffId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("startOffboarding:", error.message);
    return { ok: false, error: SAVE_ERR };
  }

  // Хүлээлцэх даалгавар (Д-11 эхлэл) — tasks модулиар; rule_runs-д лог.
  try {
    const { data: task } = await supabase
      .from("tasks")
      .insert({
        office_id: ctx.officeId,
        created_by: ctx.userId,
        responsible_id: ctx.userId,
        title: "Гарах ажилтны хүлээлцэх (Д-11)",
        description: "Гарах төлөвт орсон ажилтны нээлттэй бичлэгүүдийг шилжүүлж, хүлээлцэх актыг бүрдүүлнэ.",
        priority: "high",
      })
      .select("id")
      .single();
    const admin = createAdminClient();
    await admin.from("crm_rule_runs").insert({
      office_id: ctx.officeId,
      rule_code: "D-11",
      entity: "crm_staff",
      entity_id: staffId,
      status: "ok",
      result: task?.id ? { task_id: task.id } : null,
    });
  } catch {
    // даалгавар/лог амжилтгүй ч offboarding төлөв хадгалагдсан
  }

  await notify([staff.profile_id], "crm_offboarding", "Гарах урсгал", "Таны CRM бүртгэлд гарах урсгал эхэллээ.");
  revalidateStaffPaths();
  return { ok: true };
}

/**
 * Ажилтныг идэвхгүй болгох — нээлттэй эзэмшилтэй бичлэгтэй бол DB trigger
 * (crm_staff_deactivate_guard) хориглоно; алдааг ойлгомжтой буцаана.
 */
export async function deactivateStaff(staffId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await staffContext(supabase);
  if (!ctx) return { ok: false, error: "Нэвтэрнэ үү." };
  if (!ctx.roles.includes("sysadmin") && !ctx.roles.includes("sales_director")) {
    return { ok: false, error: "Танд ажилтан идэвхгүй болгох эрх алга." };
  }
  if (!ctx.officeId) return { ok: false, error: "Та оффист харьяалагдаагүй байна." };

  const { error, count } = await supabase
    .from("crm_staff")
    .update({ is_active: false }, { count: "exact" })
    .eq("id", staffId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("deactivateStaff:", error.message);
    if (error.message.includes("хүлээлцэх дуусаагүй")) {
      return {
        ok: false,
        error: "Хүлээлцэх дуусаагүй — энэ ажилтанд нээлттэй эзэмшилтэй бичлэг байна. Эхлээд шилжүүлнэ үү.",
      };
    }
    return { ok: false, error: SAVE_ERR };
  }
  if (!count) return { ok: false, error: "Бүртгэл олдсонгүй эсвэл танд эрх алга." };
  revalidateStaffPaths();
  return { ok: true };
}

/** Идэвхгүй болсон ажилтныг сэргээх. */
export async function reactivateStaff(staffId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await staffContext(supabase);
  if (!ctx) return { ok: false, error: "Нэвтэрнэ үү." };
  if (!ctx.roles.includes("sysadmin")) return { ok: false, error: "Танд энэ үйлдлийн эрх алга." };
  if (!ctx.officeId) return { ok: false, error: "Та оффист харьяалагдаагүй байна." };

  const { error, count } = await supabase
    .from("crm_staff")
    .update({ is_active: true, offboarding: false }, { count: "exact" })
    .eq("id", staffId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("reactivateStaff:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  if (!count) return { ok: false, error: "Бүртгэл олдсонгүй эсвэл танд эрх алга." };
  revalidateStaffPaths();
  return { ok: true };
}
