"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCrmStaffContext } from "@/lib/queries-crm-core";

/**
 * Шатны зөвлөмж (карт дээрх «Энэ шатанд юу хийх вэ») — Үйл ажиллагаа-ЧМТ,
 * Системийн админ засна (crm_stages update RLS давхар сахина).
 */
export async function saveStageGuidance(stageId: string, guidance: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: "Та CRM-д бүртгэгдээгүй байна." };
  if (!ctx.roles.some((r) => r === "sysadmin" || r === "ops_qc")) {
    return { ok: false, error: "Шатны зөвлөмжийг засах эрх танд алга." };
  }
  const text = guidance.trim();
  if (text.length > 1000) return { ok: false, error: "Зөвлөмж хэт урт байна (1000 тэмдэгтээс бага)." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_stages")
    .update({ guidance: text || null })
    .eq("id", stageId)
    .eq("office_id", ctx.officeId)
    .select("id");
  if (error) {
    console.error("saveStageGuidance:", error.message);
    return { ok: false, error: "Хадгалахад алдаа гарлаа. Дахин оролдоно уу." };
  }
  if (!data?.length) return { ok: false, error: "Шат олдсонгүй эсвэл танд эрх алга." };
  revalidatePath("/office/crm/settings/pipelines");
  revalidatePath("/office/crm/deals", "layout");
  revalidatePath("/agent/crm/pipeline", "layout");
  return { ok: true };
}
