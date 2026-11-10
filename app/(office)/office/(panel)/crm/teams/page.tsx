import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { canManageTeams, getTeamsOverview, hasTeamProgressRole } from "@/lib/queries-crm-teams";
import { TeamsManager } from "@/components/crm/teams/TeamsManager";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Багууд — CRM" };

export default async function TeamsPage() {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  if (!(await canManageTeams())) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <EmptyState
          title="Багийн удирдлага оффисын админ, удирдлагад зориулагдсан"
          description="Танд баг удирдах эрх алга."
          action={{ label: "CRM самбар", href: "/office/crm" }}
        />
      </div>
    );
  }

  const overview = await getTeamsOverview();

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Багууд</h1>
      <p className="text-sm text-muted">
        Оффисын агентуудыг багт хуваарилж, ахлагч томилно. Ахлагч гишүүдийнхээ бүртгэсэн сэжим, явцыг хянана.
      </p>
      <TeamsManager {...overview} canViewProgress={hasTeamProgressRole(ctx.roles)} />
    </div>
  );
}
