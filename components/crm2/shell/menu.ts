import { crm2MenuItems, crm2Paths, type Crm2MenuKey, type Crm2Panel } from "@/lib/crm2/paths";
import type { Crm2Context } from "@/lib/crm2/types";

/**
 * CRM-ийн цэсний угсралт — цэвэр функц (сервер эрхээр шийдэж CrmNav-д өгнө).
 * Үндсэн 7 хэсгийн дараалал, эрх нь lib/crm2/paths-ийн crm2MenuItems-д.
 */

export type CrmNavIcon = Crm2MenuKey | "calendar" | "team" | "approvals";

export type CrmNavItem = {
  href: string;
  label: string;
  icon: CrmNavIcon;
  /** Идэвхтэй эсэхийг энэ замын угтвараар шалгана (анхдагч — href). */
  matchPrefix?: string;
  badge?: string;
};

/** Хуучин crm_staff-ийн дүрээс (crm2_my_context уншигдаагүй үед) цэсний хамгийн бага эрх. */
export function fallbackCrm2Context(staff: {
  profileId: string;
  officeId: string;
  staffId: string;
  roles: readonly string[];
  teamId: string | null;
}): Crm2Context {
  const has = (...r: string[]) => staff.roles.some((x) => r.includes(x));
  return {
    profileId: staff.profileId,
    officeId: staff.officeId,
    staffId: staff.staffId,
    roles: [...staff.roles] as Crm2Context["roles"],
    teamId: staff.teamId,
    isMember: true,
    isManager: has("sales_director", "ops_qc", "ceo"),
    isTeamLead: has("team_lead") && !!staff.teamId,
    isOfficeAdmin: false,
    canWork: has("agent", "team_lead", "sales_director", "ops_qc", "ceo", "property_manager"),
    // Батлах эрхийг DB-гүйгээр таахгүй.
    canApprove: false,
    hasFinance: has("finance"),
    canManageSettings: has("sysadmin", "ceo"),
    canManageAccessSettings: false,
  };
}

export function crmNavItems(
  panel: Crm2Panel,
  ctx: Crm2Context,
  opts: {
    canOpenTeam: boolean;
    /** crm2_my_context-оор гишүүн нь батлагдсан (нөөц дүрээр биш) — батлах эрхгүй ч өөрийн хүсэлтээ харна. */
    canOpenRequests?: boolean;
  }
): { primary: CrmNavItem[]; secondary: CrmNavItem[] } {
  const p = crm2Paths(panel);
  const primary: CrmNavItem[] = crm2MenuItems(panel, ctx).map((it) => ({
    href: it.href,
    label: it.label,
    icon: it.key,
  }));
  const secondary: CrmNavItem[] = [{ href: p.calendar(), label: "Календарь", icon: "calendar" }];
  if (opts.canOpenTeam) {
    secondary.push(
      panel === "office"
        ? { href: `${p.base}/teams`, label: "Миний баг", icon: "team" }
        : { href: `${p.base}/team/monitor`, label: "Миний баг", icon: "team", matchPrefix: `${p.base}/team` }
    );
  }
  if (ctx.canApprove) secondary.push({ href: p.approvals(), label: "Батлах", icon: "approvals" });
  else if (opts.canOpenRequests) secondary.push({ href: p.approvals(), label: "Миний хүсэлт", icon: "approvals" });
  return { primary, secondary };
}
