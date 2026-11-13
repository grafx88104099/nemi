"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/**
 * CRM-ийн салбарын лавлах (баг бүр салбартай тул шинэ баг үүсгэхэд хэрэгтэй).
 * Бичих эрх: sysadmin, ops_qc (crm_branches RLS давхар шалгана).
 */

const SAVE_ERR = "Салбар хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const RIGHTS_ERR = "Танд салбар засах эрх алга.";
const BRANCH_ROLES = ["sysadmin", "ops_qc"];

const branchSchema = z
  .object({
    id: z.string().uuid().optional(),
    code: z.string().trim().min(1, "Код оруулна уу").max(40).regex(/^[a-z0-9_-]+$/, "Код зөвхөн латин жижиг үсэг/тоо"),
    name: z.string().trim().min(1, "Нэр оруулна уу").max(120),
    isActive: z.boolean(),
  })
  .strict();

function firstIssue(err: z.ZodError, fallback: string): string {
  const msg = err.issues[0]?.message;
  return msg && !msg.startsWith("Invalid") && !msg.startsWith("Expected") ? msg : fallback;
}

export async function saveBranch(raw: {
  id?: string;
  code: string;
  name: string;
  isActive: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Нэвтэрнэ үү." };
  const { data: staff } = await supabase
    .from("crm_staff")
    .select("office_id, roles")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!staff) return { ok: false, error: "Та CRM-д бүртгэгдээгүй байна." };
  if (!(staff.roles ?? []).some((r) => BRANCH_ROLES.includes(r))) return { ok: false, error: RIGHTS_ERR };

  const parsed = branchSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, "Оролт буруу байна.") };
  const input = parsed.data;

  const { error } = input.id
    ? await supabase
        .from("crm_branches")
        .update({ code: input.code, name: input.name, is_active: input.isActive })
        .eq("id", input.id)
        .eq("office_id", staff.office_id)
    : await supabase
        .from("crm_branches")
        .insert({ office_id: staff.office_id, code: input.code, name: input.name, is_active: input.isActive });
  if (error) {
    console.error("saveBranch:", error.message);
    return { ok: false, error: error.code === "23505" ? "Ийм кодтой салбар аль хэдийн байна." : SAVE_ERR };
  }
  revalidatePath("/office/crm/settings/branches");
  revalidatePath("/office/crm/teams");
  return { ok: true };
}
