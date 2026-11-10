import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { CrmNav } from "@/components/crm/CrmNav";
import { TeamMonitor } from "@/components/crm/teams/TeamMonitor";

export const metadata = { title: "Гишүүдийн явц — CRM" };

const BASE = "/agent/crm";

/** Багийн ахлагч зөвхөн өөрийн багийн гишүүдийн сэжим, явцыг хянана (crm_is_team_of-той ижил нөхцөл). */
export default async function AgentTeamMonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");
  if (!ctx.roles.includes("team_lead") || !ctx.teamId) redirect(`${BASE}/week`);
  const { member } = await searchParams;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath={BASE} />
      </div>
      <TeamMonitor
        teamId={ctx.teamId}
        memberId={member}
        basePath={BASE}
        monitorPath={`${BASE}/team/monitor`}
        backHref={`${BASE}/team`}
        backLabel="Миний баг"
        emptyHint="Оффисын админ агентуудыг багт хуваарилсны дараа гишүүд энд харагдана."
      />
    </div>
  );
}
