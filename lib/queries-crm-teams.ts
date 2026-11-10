import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { getBranches, getTeams, type BranchRow } from "@/lib/queries-crm-core";
import { personAvatar } from "@/lib/crm/avatar";
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
};

export type TeamsOverview = {
  teams: ManagedTeam[];
  unassigned: TeamPerson[];
  branches: BranchRow[];
};

// crm_is_manager(): office_admin, sysadmin баг удирдаж чадах ч сэжим уншихгүй тул багийн явцыг харахгүй.
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

export async function getTeamsOverview(): Promise<TeamsOverview> {
  const supabase = await createClient();
  const [teams, branches, { data, error }] = await Promise.all([
    getTeams(),
    getBranches(),
    supabase.rpc("crm_team_roster"),
  ]);
  if (error) console.error("getTeamsOverview:", error.message);

  const roster = data ?? [];
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
      };
    }),
    // Удирдлага, санхүүгийн ажилтан агент биш тул хуваарилах жагсаалтад орохгүй.
    unassigned: assignable
      .filter((r) => !r.team_id && (r.staff_id === null || isAgentStaff(r.roles, r.user_role)))
      .map(toPerson)
      .sort(byName),
  };
}
