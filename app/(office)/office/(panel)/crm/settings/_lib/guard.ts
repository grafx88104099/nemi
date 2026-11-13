import { redirect } from "next/navigation";

import { getCrmStaffContext, type CrmStaffContext } from "@/lib/queries-crm-core";

/** CRM тохиргооны хуудсыг харах дүрүүд. */
export const SETTINGS_VIEW_ROLES = ["sysadmin", "sales_director", "ceo", "ops_qc"] as const;

/**
 * Тохиргооны хуудсуудын серверийн guard: харах — Системийн админ, Борлуулалт
 * хариуцсан захирал, CEO, Үйл ажиллагаа-ЧМТ; салбар засах — Системийн админ,
 * Үйл ажиллагаа-ЧМТ (RLS давхар шалгана).
 */
export async function requireSettingsAccess(): Promise<CrmStaffContext & { canEdit: boolean }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  const canView = ctx.roles.some((r) => (SETTINGS_VIEW_ROLES as readonly string[]).includes(r));
  if (!canView) redirect("/office/crm/settings");
  const canEdit = ctx.roles.some((r) => r === "sysadmin" || r === "ops_qc");
  return { ...ctx, canEdit };
}
