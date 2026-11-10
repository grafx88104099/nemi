import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { hasTeamProgressRole } from "@/lib/queries-crm-teams";
import { TeamMonitor, TeamProgressNoAccess } from "@/components/crm/teams/TeamMonitor";

export const metadata = { title: "Багийн явц — CRM" };

const TEAMS_PATH = "/office/crm/teams";

/** Сэжмийн RLS-ийг дагана: баг удирдах эрхгүй ч (жишээ нь CEO) явцын дүртэй бол харна. */
export default async function OfficeTeamMonitorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ member?: string }>;
}) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  if (!hasTeamProgressRole(ctx.roles)) return <TeamProgressNoAccess backHref={TEAMS_PATH} backLabel="Багууд" />;

  const [{ id }, { member }] = await Promise.all([params, searchParams]);

  return (
    <div className="p-4 sm:p-8">
      <TeamMonitor
        teamId={id}
        memberId={member}
        basePath="/office/crm"
        monitorPath={`${TEAMS_PATH}/${id}`}
        backHref={`${TEAMS_PATH}/progress`}
        backLabel="Бүх багийн явц"
        emptyHint="Багт ороогүй агентуудаас «Багууд» хуудсанд нэмнэ үү."
      />
    </div>
  );
}
