import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { canManageTeams, getTeamsOverview, hasTeamProgressRole } from "@/lib/queries-crm-teams";
import { TeamsManager } from "@/components/crm/teams/TeamsManager";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Багууд — CRM" };

const PROGRESS_PATH = "/office/crm/teams/progress";

export default async function TeamsPage() {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  const canViewProgress = hasTeamProgressRole(ctx.roles);

  if (!(await canManageTeams())) {
    // Зөвхөн явц харах эрхтэй бол ашиглаж чадахгүй удирдлагын товчгүй тойм руу.
    if (canViewProgress) redirect(PROGRESS_PATH);
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <EmptyState
          title="Багийн удирдлага оффисын админ, удирдлагад зориулагдсан"
          description="Танд баг удирдах эрх алга."
          action={{ label: "Staff", href: "/office/crm/staff" }}
        />
      </div>
    );
  }

  const overview = await getTeamsOverview(ctx.profileId);

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-ink">Багууд</h1>
          <p className="text-sm text-muted">
            Оффисын агентуудыг багт хуваарилж, ахлагч томилно. Ахлагч гишүүдийнхээ Staff ажлын явцыг хянана.
          </p>
        </div>
        {canViewProgress ? (
          <ButtonLink href={PROGRESS_PATH} size="sm" variant="secondary" className="shrink-0">
            <BarChart3 className="size-4" aria-hidden /> Бүх багийн явц
          </ButtonLink>
        ) : null}
      </div>
      <TeamsManager {...overview} canViewProgress={canViewProgress} />
    </div>
  );
}
