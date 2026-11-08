import { redirect } from "next/navigation";

import { getCrmStaffContext, type CrmStaffContext } from "@/lib/queries-crm-core";
import { MARKETING_LOOKUP_KINDS, canWriteLookup, canWriteSetting } from "@/lib/validation/crm-ownership";

/**
 * Тохиргооны хуудсуудын серверийн давхар guard:
 * харах — Борлуулалт хариуцсан захирал / Үйл ажиллагаа-ЧМТ / CEO / Системийн админ;
 * бичих — Системийн админ, Үйл ажиллагаа-ЧМТ бүгдийг; Борлуулалт хариуцсан
 * захирал босго, оноо, SLA, хуваарилалтын түлхүүрүүдийг (§5, §6.26).
 * Action + RLS (crm_setting_writable) давхар шалгана.
 */
export async function requireSettingsAccess(): Promise<
  CrmStaffContext & { canEdit: boolean; canEditSetting: (key: string) => boolean }
> {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  const canView = ctx.roles.some((r) => r === "sysadmin" || r === "ops_qc" || r === "sales_director" || r === "ceo");
  if (!canView) redirect("/office/crm");
  const canEdit = ctx.roles.some((r) => r === "sysadmin" || r === "ops_qc");
  return { ...ctx, canEdit, canEditSetting: (key: string) => canWriteSetting(ctx.roles, key) };
}

/**
 * Лавлахын хуудас: дээрх дүрүүдээс гадна Маркетинг эх сурвалжийн лавлахыг
 * засна (§5 «сэжимийн эх сурвалжийн тодорхойлолт»).
 */
export async function requireLookupsAccess(): Promise<CrmStaffContext & { editableKinds: string[] | "all" }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  const canView = ctx.roles.some(
    (r) => r === "sysadmin" || r === "ops_qc" || r === "sales_director" || r === "ceo" || r === "marketing"
  );
  if (!canView) redirect("/office/crm");
  const all = ctx.roles.includes("sysadmin") || ctx.roles.includes("ops_qc");
  const editableKinds = all ? "all" : MARKETING_LOOKUP_KINDS.filter((k) => canWriteLookup(ctx.roles, k));
  return { ...ctx, editableKinds };
}
