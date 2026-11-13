import { cache } from "react";

import { crm2Client } from "@/lib/crm2/server";
import type { Crm2LocationSuggestion, Crm2ProjectSuggestion, Crm2StaffMember } from "@/lib/crm2/types";

/**
 * Сонгогч, санал болгогчийн уншилт (хэрэглэгчийн эрхээр). Агент crm_staff-ийг
 * шууд уншиж чадахгүй тул агент сонгогчид crm2_staff_directory()-г ашиглана.
 */

/** Оффисын идэвхтэй CRM ажилтнууд (нэрээр эрэмбэлсэн) — агент сонгогч. */
export const getStaffDirectory = cache(async (): Promise<Crm2StaffMember[]> => {
  const supabase = await crm2Client();
  const { data, error } = await supabase.rpc("crm2_staff_directory");
  if (error) console.error("crm2_staff_directory:", error.message);
  return data ?? [];
});

/** profile_id → нэр (crm2_staff_directory-оос). Түүх, хүсэлтэд нэр харуулах. */
export const getStaffNameMap = cache(async (): Promise<Record<string, string>> => {
  const list = await getStaffDirectory();
  return Object.fromEntries(list.map((s) => [s.profile_id, s.name]));
});

/** Ажлын эрхтэй (roles.work) ажилтан — хэлцэл/ажил оноох сонгогчид. */
export async function getWorkStaff(workRoles: string[]): Promise<Crm2StaffMember[]> {
  const list = await getStaffDirectory();
  const allowed = new Set(workRoles);
  return list.filter((s) => (s.roles ?? []).some((r) => allowed.has(r)));
}

/** Төслийн нэрийн санал (өмнө бичсэн нэрс). */
export async function suggestProjects(query: string, limit = 10): Promise<Crm2ProjectSuggestion[]> {
  const supabase = await crm2Client();
  const { data, error } = await supabase.rpc("crm2_suggest_projects", { p_query: query.trim(), p_limit: limit });
  if (error) console.error("crm2_suggest_projects:", error.message);
  return data ?? [];
}

/** Байршлын санал (ноорог бус хөрөнгийн байршил, харагдацын дагуу). */
export async function suggestLocations(query: string, limit = 15): Promise<Crm2LocationSuggestion[]> {
  const supabase = await crm2Client();
  const { data, error } = await supabase.rpc("crm2_suggest_locations", { p_query: query.trim(), p_limit: limit });
  if (error) console.error("crm2_suggest_locations:", error.message);
  return data ?? [];
}

export type Crm2ProjectOption = { id: string; name: string };

/** Шүүлтүүрийн төслийн жагсаалт (идэвхтэй төслүүд, нэрээр). */
export const listProjects = cache(async (): Promise<Crm2ProjectOption[]> => {
  const supabase = await crm2Client();
  const { data, error } = await supabase
    .from("crm2_projects")
    .select("id, name")
    .eq("is_active", true)
    .order("name")
    .limit(500);
  if (error) console.error("crm2 listProjects:", error.message);
  return data ?? [];
});
