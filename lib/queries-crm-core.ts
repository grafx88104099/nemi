import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { CrmRole } from "@/lib/constants-crm";

/**
 * CRM суурь уншилтууд. RLS = эрхийн давхарга — эндээс дахин шүүхгүй;
 * бүх мөр office_id-аар RLS-д аль хэдийн хязгаарлагдсан.
 */

export type CrmStaffContext = {
  staffId: string;
  profileId: string;
  officeId: string;
  roles: CrmRole[];
  branchId: string | null;
  teamId: string | null;
  panelAdmin: boolean;
  offboarding: boolean;
};

/**
 * Дуудагчийн CRM контекст — идэвхтэй crm_staff мөр (байхгүй бол null →
 * «CRM-д бүртгэгдээгүй», layout guard redirect хийнэ).
 */
export async function getCrmStaffContext(): Promise<CrmStaffContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("crm_staff")
    .select("id, office_id, roles, branch_id, team_id, panel_admin, offboarding")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    console.error("getCrmStaffContext:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    staffId: data.id,
    profileId: user.id,
    officeId: data.office_id,
    roles: (data.roles ?? []) as CrmRole[],
    branchId: data.branch_id,
    teamId: data.team_id,
    panelAdmin: data.panel_admin,
    offboarding: data.offboarding,
  };
}

// ── Салбар, баг ───────────────────────────────────────────

export type BranchRow = { id: string; code: string; name: string; is_active: boolean };

export async function getBranches(): Promise<BranchRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_branches")
    .select("id, code, name, is_active")
    .order("name");
  if (error) console.error("getBranches:", error.message);
  return (data ?? []) as BranchRow[];
}

export type TeamRow = {
  id: string;
  branch_id: string;
  name: string;
  lead_profile_id: string | null;
};

export async function getTeams(): Promise<TeamRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_teams")
    .select("id, branch_id, name, lead_profile_id")
    .order("name");
  if (error) console.error("getTeams:", error.message);
  return (data ?? []) as TeamRow[];
}

// ── Хувилбартай тохиргоо (crm_settings) ─────────────────

/**
 * Тухайн мөчид хүчинтэй тохиргооны утга — definer RPC (crm_setting_at):
 * RLS-ийн select policy сысадмин/менежерт л нээлттэй ч RPC бүх staff-д
 * өөрийн оффисын утгыг буцаана (программын уншилтын нэг зам).
 */
export async function getSettingValue<T = Json>(key: string): Promise<T | null> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_setting_at", {
    p_office: ctx.officeId,
    p_key: key,
  });
  if (error) {
    console.error("getSettingValue:", error.message);
    return null;
  }
  return (data ?? null) as T | null;
}

// ── Ажилтан ───────────────────────────────────────────────

export type StaffRow = {
  id: string;
  profile_id: string;
  branch_id: string | null;
  team_id: string | null;
  roles: CrmRole[];
  is_active: boolean;
  offboarding: boolean;
  panel_admin: boolean;
  /** Чөлөө (§6.27) — U4. */
  on_leave_from: string | null;
  on_leave_to: string | null;
  leave_substitute_id: string | null;
  leave_note: string | null;
  full_name: string | null;
  email: string | null;
};

export async function getStaffList(): Promise<StaffRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_staff")
    .select(
      "id, profile_id, branch_id, team_id, roles, is_active, offboarding, panel_admin, " +
        "on_leave_from, on_leave_to, leave_substitute_id, leave_note, " +
        "profile:profiles!crm_staff_profile_id_fkey(full_name, email)"
    )
    .order("created_at");
  if (error) console.error("getStaffList:", error.message);
  type Raw = Omit<StaffRow, "full_name" | "email"> & {
    profile: { full_name: string | null; email: string | null } | null;
  };
  return ((data ?? []) as unknown as Raw[]).map(({ profile, ...rest }) => ({
    ...rest,
    full_name: profile?.full_name ?? null,
    email: profile?.email ?? null,
  }));
}

// ── Нэр (profiles) ────────────────────────────────────────

/** profile id → бүтэн нэр (олдохгүй бол «?»). */
export async function getNameMap(profileIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  if (error) console.error("getNameMap:", error.message);
  const map = new Map<string, string>();
  for (const p of data ?? []) map.set(p.id, p.full_name ?? "?");
  return map;
}
