import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { parseCrm2Settings, type Crm2Settings } from "@/lib/crm2/settings";
import type { Crm2Context, CrmRole } from "@/lib/crm2/types";

export { panelBase, crm2Paths, crm2MenuItems, panelFromPathname, type Crm2Panel } from "@/lib/crm2/paths";

/**
 * CRM v2 серверийн контекст: хэрэглэгчийн эрх (crm2_my_context) ба оффисын
 * тохиргоо (crm2_settings_effective). React cache — нэг хүсэлтэд нэг удаа.
 * Зөвхөн Server Component / Server Action-оос; клиентэд prop-оор дамжуулна
 * (холбоос угсрах бол @/lib/crm2/paths-ийг шууд импортлоно).
 */

type RawContext = {
  profile_id?: string | null;
  office_id?: string | null;
  staff_id?: string | null;
  roles?: CrmRole[] | null;
  team_id?: string | null;
  is_member?: boolean;
  is_manager?: boolean;
  is_team_lead?: boolean;
  is_office_admin?: boolean;
  can_work?: boolean;
  can_approve?: boolean;
  has_finance?: boolean;
  can_manage_settings?: boolean;
  can_manage_access_settings?: boolean;
};

export function toCrm2Context(raw: unknown): Crm2Context | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as RawContext;
  if (!r.profile_id) return null;
  return {
    profileId: r.profile_id,
    officeId: r.office_id ?? null,
    staffId: r.staff_id ?? null,
    roles: Array.isArray(r.roles) ? r.roles : [],
    teamId: r.team_id ?? null,
    isMember: !!r.is_member,
    isManager: !!r.is_manager,
    isTeamLead: !!r.is_team_lead,
    isOfficeAdmin: !!r.is_office_admin,
    canWork: !!r.can_work,
    canApprove: !!r.can_approve,
    hasFinance: !!r.has_finance,
    canManageSettings: !!r.can_manage_settings,
    canManageAccessSettings: !!r.can_manage_access_settings,
  };
}

/** Нэвтрээгүй эсвэл алдаа бол null. CRM-ийн гишүүн эсэхийг `isMember`-ээр шалгана. */
export const getCrm2Context = cache(async (): Promise<Crm2Context | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm2_my_context");
  if (error) {
    console.error("crm2_my_context:", error.message);
    return null;
  }
  return toCrm2Context(data);
});

/** Оффисын хүчинтэй тохиргоо; алдаа гарвал анхдагч утга. */
export const getCrm2Settings = cache(async (): Promise<Crm2Settings> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm2_settings_effective");
  if (error) console.error("crm2_settings_effective:", error.message);
  return parseCrm2Settings(data ?? null);
});
