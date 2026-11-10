import { redirect } from "next/navigation";
import { UsersRound } from "lucide-react";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { canLeadWeekly } from "@/lib/queries-crm-weekly";
import { normalizeWeekParam } from "@/lib/crm/week";
import { ButtonLink } from "@/components/ui/button";
import { CrmNav } from "@/components/crm/CrmNav";
import { WeekCycleView, weekTab } from "@/components/crm/weekly/WeekCycleView";

export const metadata = { title: "Миний баг — долоо хоногийн мөчлөг" };

const BASE = "/agent/crm";

/**
 * Борлуулдаг багийн ахлагчийн дэлгэц (Ш9: агентын панельд). Багийн карт,
 * батлалт (§5 RACI A), Даваагийн хурал (§6.30, §9.5), Баасан гарагийн дүн
 * шинжилгээ (§6.24, §9.6), үнэлгээ (§6.25). Хүрээг DB тодорхойлно: ахлагч өөрийн баг.
 */
export default async function AgentTeamWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; tab?: string }>;
}) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");
  if (!canLeadWeekly(ctx.roles)) redirect(`${BASE}/week`);
  const sp = await searchParams;
  const week = normalizeWeekParam(sp.week);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath={BASE} />
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="mb-1 text-2xl font-extrabold text-ink">Миний баг</h1>
          <p className="text-sm text-muted">
            Багийн долоо хоногийн карт, хурал, дүн шинжилгээ. Бүх тоо CRM-ийн бүртгэлээс — гараар засагдахгүй.
          </p>
        </div>
        {ctx.roles.includes("team_lead") && ctx.teamId ? (
          <ButtonLink href={`${BASE}/team/monitor`} size="sm">
            <UsersRound className="size-4" aria-hidden /> Гишүүдийн сэжим, явц
          </ButtonLink>
        ) : null}
      </div>
      <WeekCycleView
        basePath={`${BASE}/team`}
        week={week}
        tab={weekTab(sp.tab)}
        filters={{}}
        roles={ctx.roles}
        showFilters={false}
        meetingTeamId={ctx.teamId}
      />
    </div>
  );
}
