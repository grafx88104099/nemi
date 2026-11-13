"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { leaveSchema } from "@/lib/crm2/offboarding";

/**
 * Ажилтны чөлөө (crm_staff-ийн чөлөөний баганууд). Хуучин CRM-ийн бичлэгийг
 * шилжүүлэхгүй — Staff хэлцлийг шилжүүлэх нь тусдаа урсгал.
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";

type Result = { ok: boolean; error?: string };

const LEAVE_ROLES = ["sales_director", "sysadmin"] as const;

/** DB-ийн «CRM: …» алдааг дэлгэцийн мессеж болгоно (дотоод кодыг гаргахгүй). */
function dbError(fn: string, message: string): string {
  console.error(`${fn}:`, message);
  const m = message.match(/CRM[_A-Z0-9]*:\s*([\s\S]+)$/);
  return m ? m[1].trim() : SAVE_ERR;
}

export async function setStaffLeave(raw: unknown): Promise<Result> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  if (!ctx.roles.some((r) => (LEAVE_ROLES as readonly string[]).includes(r))) {
    return { ok: false, error: "Чөлөө бүртгэх эрх Борлуулалт хариуцсан захиралд бий." };
  }
  const parsed = leaveSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message;
    return { ok: false, error: msg && !msg.startsWith("Invalid") ? msg : "Оролт буруу байна." };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("crm_staff")
    .select("profile_id")
    .eq("id", input.staffId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!staff) return { ok: false, error: "Ажилтан олдсонгүй." };
  if (input.substituteId && input.substituteId === staff.profile_id) {
    return { ok: false, error: "Орлон ажиллагч нь өөр ажилтан байна." };
  }
  const { error, count } = await supabase
    .from("crm_staff")
    .update(
      {
        on_leave_from: input.from,
        on_leave_to: input.to,
        leave_substitute_id: input.from ? input.substituteId : null,
        leave_note: input.from ? input.note || null : null,
      },
      { count: "exact" }
    )
    .eq("id", input.staffId)
    .eq("office_id", ctx.officeId);
  if (error) return { ok: false, error: dbError("setStaffLeave", error.message) };
  if (!count) return { ok: false, error: "Бүртгэл олдсонгүй эсвэл танд эрх алга." };
  revalidatePath("/office/crm/settings/staff");
  return { ok: true };
}

/** Чөлөөнөөс буцсан ажилтны чөлөөний бүртгэлийг цэвэрлэнэ. */
export async function returnFromLeave(staffId: string): Promise<{ ok: boolean; done?: number; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  if (!ctx.roles.some((r) => (LEAVE_ROLES as readonly string[]).includes(r))) {
    return { ok: false, error: "Чөлөөг дуусгах эрх Борлуулалт хариуцсан захиралд бий." };
  }
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("crm_staff")
    .update(
      { on_leave_from: null, on_leave_to: null, leave_substitute_id: null, leave_note: null },
      { count: "exact" }
    )
    .eq("id", staffId)
    .eq("office_id", ctx.officeId);
  if (error) return { ok: false, error: dbError("returnFromLeave", error.message) };
  if (!count) return { ok: false, error: "Ажилтан олдсонгүй." };
  revalidatePath("/office/crm/settings/staff");
  return { ok: true, done: 0 };
}
