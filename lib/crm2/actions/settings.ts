"use server";

import { crm2Session, revalidateCrm2 } from "@/lib/crm2/server";
import { AUTH_ERROR, dbFail, fail, ok, zodErrorText } from "@/lib/crm2/result";
import { setSettingSchema, settingKeySchema } from "@/lib/crm2/schemas";
import type { Crm2Result, Json } from "@/lib/crm2/types";

/**
 * CRM тохиргоо (S11). Эрх: sysadmin, ceo, оффисын админ; roles.* ба approvals.*
 * зөвхөн CEO. Утгын төрөл/хязгаарыг DB шалгаж, өөрчлөлтийг түүхэнд бичнэ.
 */

/** Тохиргооны утгыг хадгалах. Хариу: хадгалсан утга. */
export async function setCrm2Setting(key: string, value: unknown): Promise<Crm2Result<Json>> {
  const parsed = setSettingSchema.safeParse({ key, value });
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_set_setting", {
    p_key: parsed.data.key,
    p_value: parsed.data.value as Json,
  });
  if (error) return dbFail("setCrm2Setting", error);
  revalidateCrm2();
  return ok((data ?? null) as Json);
}

/** Анхдагч утга руу буцаах. Хариу: анхдагч утга. */
export async function resetCrm2Setting(key: string): Promise<Crm2Result<Json>> {
  const parsed = settingKeySchema.safeParse(key);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_reset_setting", { p_key: parsed.data });
  if (error) return dbFail("resetCrm2Setting", error);
  revalidateCrm2();
  return ok((data ?? null) as Json);
}
