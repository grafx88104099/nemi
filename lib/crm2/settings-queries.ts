import { crm2Client } from "@/lib/crm2/server";
import { isCrm2SettingKey, type Crm2SettingKey } from "@/lib/crm2/settings";

/**
 * Тохиргооны дэлгэцийн серверийн уншилт (хэрэглэгчийн client, RLS): аль түлхүүрийг
 * оффис өөрчилсөн (crm2_settings мөртэй) — хэн, хэзээ. Мөргүй түлхүүр анхдагчаар ажиллана.
 */

export type SettingOverride = { updatedAt: string; updatedBy: string | null };

export async function listSettingOverrides(): Promise<Partial<Record<Crm2SettingKey, SettingOverride>>> {
  const supabase = await crm2Client();
  const { data, error } = await supabase.from("crm2_settings").select("key, updated_by, updated_at").limit(200);
  if (error) {
    console.error("crm2 listSettingOverrides:", error.message);
    return {};
  }
  const out: Partial<Record<Crm2SettingKey, SettingOverride>> = {};
  for (const row of data ?? []) {
    if (isCrm2SettingKey(row.key)) out[row.key] = { updatedAt: row.updated_at, updatedBy: row.updated_by };
  }
  return out;
}
