import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { getBranches, type BranchRow } from "@/lib/queries-crm-core";
import { personAvatar } from "@/lib/avatar";
import { resolvePendingLead, type PendingLead } from "@/lib/crm/team-lead";
import { isAgentStaff } from "@/lib/crm/team-monitor";
import type { CrmRole } from "@/lib/constants-crm";

/** Багийн удирдлагын уншилт — хэрэглэгчийн өөрийн эрхээр (RLS, definer RPC-ийн эрхийн шалгалт). */

export type TeamPerson = {
  profileId: string;
  name: string;
  avatarSrc: string | null;
  initials: string;
  phone: string | null;
  /** null = CRM-д бүртгэлгүй; багт нэмэхэд бүртгэгдэнэ. */
  staffId: string | null;
  roles: CrmRole[];
};

export type ManagedTeam = {
  id: string;
  name: string;
  branchId: string;
  branchName: string;
  members: TeamPerson[];
  lead: TeamPerson | null;
  /** Ахлагчаар бичигдсэн ч багийн гишүүн биш эсвэл ахлагчийн дүргүй тул гишүүдийг харж чадахгүй хүн. */
  brokenLead: { profileId: string; name: string; isMember: boolean } | null;
  /** Оффисын админы батлалт хүлээж буй ахлагчийн санал; батлагдах хүртэл эрх идэвхжихгүй. */
  pendingLead: PendingLead | null;
};

export type TeamsOverview = {
  teams: ManagedTeam[];
  unassigned: TeamPerson[];
  branches: BranchRow[];
  /** Оффисын админ: ахлагчийг шууд томилж, саналыг батална (crm_can_approve_team_lead). */
  canApproveLead: boolean;
};

// Саналын баганууд profiles руу FK-гүй — нэрийг roster-оос шийднэ, embed хийхгүй.
const TEAM_SELECT = "id, branch_id, name, lead_profile_id, pending_lead_profile_id, lead_proposed_by, lead_proposed_at";

type RawTeam = {
  id: string;
  branch_id: string;
  name: string;
  lead_profile_id: string | null;
  pending_lead_profile_id: string | null;
  lead_proposed_by: string | null;
  lead_proposed_at: string | null;
};

// crm_is_manager(): office_admin, sysadmin баг удирдаж чадах ч гишүүдийн Staff ажлыг уншихгүй тул багийн явцыг харахгүй.
const TEAM_PROGRESS_ROLES: CrmRole[] = ["sales_director", "ops_qc", "ceo"];

/**
 * Багийн явцын хуудсууд (бүх багийн явц, нэг багийн явц) — сэжмийн RLS-ийг дагана, баг
 * удирдах эрхээс (canManageTeams) хамаарахгүй.
 */
export function hasTeamProgressRole(roles: CrmRole[]): boolean {
  return roles.some((r) => TEAM_PROGRESS_ROLES.includes(r));
}

/** Layout ба хуудас нэг хүсэлтэд дуудна — React cache давхар RPC-ээс сэргийлнэ. */
export const canManageTeams = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_can_manage_teams");
  if (error) console.error("canManageTeams:", error.message);
  return data === true;
});

/** viewerId: үзэж буй хэрэглэгч — өөрийн саналаа цуцлах эсэхийг шийднэ. */
export async function getTeamsOverview(viewerId: string): Promise<TeamsOverview> {
  const supabase = await createClient();
  const [teamsRes, branches, { data, error }, approveRes] = await Promise.all([
    supabase.from("crm_teams").select(TEAM_SELECT).order("name"),
    getBranches(),
    supabase.rpc("crm_team_roster"),
    supabase.rpc("crm_can_approve_team_lead"),
  ]);
  if (teamsRes.error) console.error("getTeamsOverview teams:", teamsRes.error.message);
  if (error) console.error("getTeamsOverview:", error.message);
  if (approveRes.error) console.error("getTeamsOverview approve:", approveRes.error.message);

  const teams = (teamsRes.data ?? []) as RawTeam[];
  const roster = data ?? [];
  const nameById = new Map(roster.map((r) => [r.profile_id, r.name]));
  const byName = (a: TeamPerson, b: TeamPerson) => a.name.localeCompare(b.name, "mn");
  const toPerson = (r: (typeof roster)[number]): TeamPerson => {
    const { src, initials } = personAvatar(r.avatar_url, r.name);
    return {
      profileId: r.profile_id,
      name: r.name,
      avatarSrc: src,
      initials,
      phone: r.phone,
      staffId: r.staff_id,
      roles: (r.roles ?? []) as CrmRole[],
    };
  };
  // Идэвхгүй ажилтныг RPC багт оруулахгүй; staff_id байхгүй нь идэвхтэй агент.
  const assignable = roster.filter((r) => r.is_active !== false);

  return {
    branches,
    canApproveLead: approveRes.data === true,
    teams: teams.map((t) => {
      const members = assignable.filter((r) => r.team_id === t.id).map(toPerson).sort(byName);
      const leadMember = members.find((m) => m.profileId === t.lead_profile_id) ?? null;
      const lead = leadMember?.roles.includes("team_lead") ? leadMember : null;
      const recordedLead = t.lead_profile_id ? roster.find((r) => r.profile_id === t.lead_profile_id) : null;
      return {
        id: t.id,
        name: t.name,
        branchId: t.branch_id,
        branchName: branches.find((b) => b.id === t.branch_id)?.name ?? "—",
        members: lead ? [lead, ...members.filter((m) => m !== lead)] : members,
        lead,
        brokenLead:
          t.lead_profile_id && !lead
            ? { profileId: t.lead_profile_id, name: recordedLead?.name ?? "Хэрэглэгч", isMember: leadMember !== null }
            : null,
        pendingLead: resolvePendingLead(t, (id) => nameById.get(id), viewerId),
      };
    }),
    // Удирдлага, санхүүгийн ажилтан агент биш тул хуваарилах жагсаалтад орохгүй.
    unassigned: assignable
      .filter((r) => !r.team_id && (r.staff_id === null || isAgentStaff(r.roles, r.user_role)))
      .map(toPerson)
      .sort(byName),
  };
}
