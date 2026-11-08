import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { canLeadWeekly } from "@/lib/queries-crm-weekly";
import { normalizeWeekParam } from "@/lib/crm/week";
import { WeekCycleView, weekTab } from "@/components/crm/weekly/WeekCycleView";

export const metadata = { title: "Долоо хоногийн мөчлөг — CRM" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Оффисын долоо хоногийн мөчлөг (§5, §6.19–§6.25, §6.30, §9.5, §9.6): агент,
 * баг, салбараар шүүнэ. Багийн ахлагч өөрийн багийг, БХЗ/ҮАМ/CEO оффисыг харна.
 */
export default async function OfficeWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; tab?: string; team?: string; branch?: string; agent?: string }>;
}) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  if (!canLeadWeekly(ctx.roles)) redirect("/office/crm");
  const sp = await searchParams;
  const week = normalizeWeekParam(sp.week);
  const filters = {
    teamId: sp.team && UUID_RE.test(sp.team) ? sp.team : null,
    branchId: sp.branch && UUID_RE.test(sp.branch) ? sp.branch : null,
    agentId: sp.agent && UUID_RE.test(sp.agent) ? sp.agent : null,
  };
  const isManager = ctx.roles.some((r) => ["sales_director", "ceo", "sysadmin", "ops_qc"].includes(r));
  const meetingTeamId = filters.teamId ?? (isManager ? null : ctx.teamId);

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Долоо хоногийн мөчлөг</h1>
      <p className="mb-4 text-sm text-muted">
        Даваагийн төлөвлөгөө, хурал, Баасан гарагийн дүн шинжилгээ, үнэлгээ — бүх тоо CRM-ийн бүртгэлээс.
      </p>
      <WeekCycleView
        basePath="/office/crm/week"
        week={week}
        tab={weekTab(sp.tab)}
        filters={filters}
        roles={ctx.roles}
        showFilters={isManager}
        meetingTeamId={meetingTeamId}
      />
    </div>
  );
}
