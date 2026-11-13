import { crm2Client } from "@/lib/crm2/server";
import type { Json } from "@/lib/crm2/types";

/**
 * S08 харилцагчийн картын нэмэлт уншилт (хэрэглэгчийн client, RLS): тухайн
 * харилцагчийн бүх шаардлагын өмнөх хувилбарууд нэг query-ээр.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RequirementVersionItem = {
  id: number;
  requirement_id: string;
  version: number;
  snapshot: Json;
  replaced_by: string | null;
  replaced_at: string;
};

/** requirement_id → хувилбарууд (шинэ нь эхэнд). */
export async function listContactRequirementVersions(contactId: string): Promise<Record<string, RequirementVersionItem[]>> {
  if (!UUID_RE.test(contactId)) return {};
  const supabase = await crm2Client();
  const { data, error } = await supabase
    .from("crm2_requirement_versions")
    .select("id, requirement_id, version, snapshot, replaced_by, replaced_at")
    .eq("contact_id", contactId)
    .order("requirement_id", { ascending: true })
    .order("version", { ascending: false })
    .limit(300);
  if (error) {
    console.error("crm2 listContactRequirementVersions:", error.message);
    return {};
  }
  const out: Record<string, RequirementVersionItem[]> = {};
  for (const row of data ?? []) (out[row.requirement_id] ??= []).push(row);
  return out;
}
