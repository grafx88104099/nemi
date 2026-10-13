import { redirect } from "next/navigation";

import { getCrmStaffContext, type CrmStaffContext } from "@/lib/queries-crm-core";

/**
 * Тохиргооны хуудсуудын серверийн давхар guard (ToR §7.1 «Тохиргоо»):
 * харах — sales_director/ops_qc/ceo/sysadmin; бичих — sysadmin/ops_qc
 * (бичихийг action + RLS давхар шалгана; UI canEdit-ээр товчоо идэвхгүйжүүлнэ).
 */
export async function requireSettingsAccess(): Promise<CrmStaffContext & { canEdit: boolean }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  const canView = ctx.roles.some((r) => r === "sysadmin" || r === "ops_qc" || r === "sales_director" || r === "ceo");
  if (!canView) redirect("/office/crm");
  const canEdit = ctx.roles.some((r) => r === "sysadmin" || r === "ops_qc");
  return { ...ctx, canEdit };
}
