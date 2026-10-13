import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { CrmRole, GateCode, OppState } from "@/lib/constants-crm";

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

// ── Лавлах ────────────────────────────────────────────────

export type LookupRow = {
  id: string;
  kind: string;
  code: string;
  label: string;
  requires_note: boolean;
  sort_order: number;
  is_active: boolean;
};

const LOOKUP_SELECT = "id, kind, code, label, requires_note, sort_order, is_active";

export async function getLookups(kind: string): Promise<LookupRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_lookups")
    .select(LOOKUP_SELECT)
    .eq("kind", kind)
    .eq("is_active", true)
    .order("sort_order");
  if (error) console.error("getLookups:", error.message);
  return (data ?? []) as LookupRow[];
}

/** Бүх лавлах (тохиргооны хуудсанд — идэвхгүйг оролцуулаад). */
export async function getAllLookups(): Promise<LookupRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_lookups")
    .select(LOOKUP_SELECT)
    .order("kind")
    .order("sort_order");
  if (error) console.error("getAllLookups:", error.message);
  return (data ?? []) as LookupRow[];
}

// ── Тохиргоо ──────────────────────────────────────────────

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

export type SettingVersionRow = {
  id: string;
  key: string;
  value: Json;
  valid_from: string;
  valid_to: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
};

/** Нэг түлхүүрийн хувилбарын түүх (тохиргооны хуудсанд — RLS менежер+). */
export async function getSettingHistory(key: string, limit = 20): Promise<SettingVersionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_settings")
    .select("id, key, value, valid_from, valid_to, note, created_by, created_at")
    .eq("key", key)
    .order("valid_from", { ascending: false })
    .limit(limit);
  if (error) console.error("getSettingHistory:", error.message);
  return (data ?? []) as SettingVersionRow[];
}

// ── Урсгал, шат ───────────────────────────────────────────

export type StageRow = {
  id: string;
  pipeline_id: string;
  code: string;
  name: string;
  sort_order: number;
  probability: number;
  gate_code: GateCode | null;
  is_terminal: boolean;
  terminal_state: OppState | null;
  is_closing_direction: boolean;
};

export type PipelineWithStages = {
  id: string;
  code: string;
  name: string;
  restricted: boolean;
  sort_order: number;
  is_active: boolean;
  stages: StageRow[];
};

export async function getPipelinesWithStages(): Promise<PipelineWithStages[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_pipelines")
    .select(
      "id, code, name, restricted, sort_order, is_active, " +
        "stages:crm_stages(id, pipeline_id, code, name, sort_order, probability, gate_code, is_terminal, terminal_state, is_closing_direction)"
    )
    .order("sort_order");
  if (error) console.error("getPipelinesWithStages:", error.message);
  const rows = (data ?? []) as unknown as PipelineWithStages[];
  for (const p of rows) p.stages.sort((a, b) => a.sort_order - b.sort_order);
  return rows;
}

export type StageTransitionRow = {
  id: string;
  pipeline_id: string;
  from_stage_id: string;
  to_stage_id: string;
  kind: string;
  allowed_roles: CrmRole[];
  requires_reason: boolean;
};

export async function getStageTransitions(pipelineId: string): Promise<StageTransitionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_stage_transitions")
    .select("id, pipeline_id, from_stage_id, to_stage_id, kind, allowed_roles, requires_reason")
    .eq("pipeline_id", pipelineId);
  if (error) console.error("getStageTransitions:", error.message);
  return (data ?? []) as unknown as StageTransitionRow[];
}

export type GateRequirementRow = {
  id: string;
  gate_code: GateCode;
  pipeline_id: string | null;
  checker_kind: string;
  params: Json;
  is_active: boolean;
};

export async function getGateRequirements(): Promise<GateRequirementRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_gate_requirements")
    .select("id, gate_code, pipeline_id, checker_kind, params, is_active")
    .order("gate_code");
  if (error) console.error("getGateRequirements:", error.message);
  return (data ?? []) as unknown as GateRequirementRow[];
}

// ── Ажилтан (тохиргооны хуудсанд) ─────────────────────────

export type StaffRow = {
  id: string;
  profile_id: string;
  branch_id: string | null;
  team_id: string | null;
  roles: CrmRole[];
  is_active: boolean;
  offboarding: boolean;
  panel_admin: boolean;
  full_name: string | null;
  email: string | null;
};

export async function getStaffList(): Promise<StaffRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_staff")
    .select(
      "id, profile_id, branch_id, team_id, roles, is_active, offboarding, panel_admin, " +
        "profile:profiles(full_name, email)"
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

// ── Бусад тохиргооны уншилтууд ────────────────────────────

export type ZoneRow = {
  id: string;
  district: string;
  khoroo: string | null;
  complex: string | null;
  branch_id: string;
  is_active: boolean;
  rationale: string | null;
};

export async function getZones(): Promise<ZoneRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_zone_directory")
    .select("id, district, khoroo, complex, branch_id, is_active, rationale")
    .order("district")
    .order("khoroo");
  if (error) console.error("getZones:", error.message);
  return (data ?? []) as ZoneRow[];
}

export type AutomationRuleRow = {
  id: string;
  code: string;
  name: string;
  trigger_kind: string;
  condition: Json;
  actions: Json;
  is_active: boolean;
  dry_run: boolean;
};

export async function getAutomationRules(): Promise<AutomationRuleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_automation_rules")
    .select("id, code, name, trigger_kind, condition, actions, is_active, dry_run")
    .order("code");
  if (error) console.error("getAutomationRules:", error.message);
  return (data ?? []) as AutomationRuleRow[];
}

export type NotificationMatrixRow = {
  id: string;
  event_code: string;
  recipient_roles: CrmRole[];
  channels: string[];
  mandatory: boolean;
  quiet_hours_exempt: boolean;
};

export async function getNotificationMatrix(): Promise<NotificationMatrixRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_notification_matrix")
    .select("id, event_code, recipient_roles, channels, mandatory, quiet_hours_exempt")
    .order("event_code");
  if (error) console.error("getNotificationMatrix:", error.message);
  return (data ?? []) as unknown as NotificationMatrixRow[];
}

export type CalendarDayRow = { day: string; is_workday: boolean; note: string | null };

/** Сарын онцгой өдрүүд (гараар тэмдэглэсэн амралт/ажлын өдөр). */
export async function getCalendarDays(fromIso: string, toIso: string): Promise<CalendarDayRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_calendar_days")
    .select("day, is_workday, note")
    .gte("day", fromIso)
    .lte("day", toIso)
    .order("day");
  if (error) console.error("getCalendarDays:", error.message);
  return (data ?? []) as CalendarDayRow[];
}
