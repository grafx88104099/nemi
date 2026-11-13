import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { TeamMonitor } from "@/components/crm/teams/TeamMonitor";

export const metadata = { title: "Гишүүдийн явц — CRM" };

const BASE = "/agent/crm";

/** Багийн ахлагч зөвхөн өөрийн багийн гишүүдийн Staff ажлыг хянана (crm_is_team_of-той ижил нөхцөл). */
export default async function AgentTeamMonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");
  if (!ctx.roles.includes("team_lead") || !ctx.teamId) redirect(`${BASE}/staff`);
  const { member } = await searchParams;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <TeamMonitor
        teamId={ctx.teamId}
        memberId={member}
        basePath={BASE}
        monitorPath={`${BASE}/team/monitor`}
        backHref={`${BASE}/staff`}
        backLabel="Staff"
        emptyHint="Оффисын админ агентуудыг багт хуваарилсны дараа гишүүд энд харагдана."
      />
    </div>
  );
}
