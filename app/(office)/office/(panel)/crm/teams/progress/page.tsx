import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { canManageTeams, hasTeamProgressRole } from "@/lib/queries-crm-teams";
import { TeamProgressNoAccess } from "@/components/crm/teams/TeamMonitor";
import { TeamsProgress } from "@/components/crm/teams/TeamsProgress";

export const metadata = { title: "Бүх багийн явц — CRM" };

const TEAMS_PATH = "/office/crm/teams";

/** Сэжмийн RLS-ийг дагана: оффисын бүх сэжмийг уншдаг дүр хэрэгтэй, баг удирдах эрх шаардахгүй. */
export default async function OfficeTeamsProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  if (!hasTeamProgressRole(ctx.roles)) return <TeamProgressNoAccess backHref={TEAMS_PATH} backLabel="Багууд" />;

  const [{ member }, canManage] = await Promise.all([searchParams, canManageTeams()]);

  return (
    <div className="p-4 sm:p-8">
      <TeamsProgress
        officeId={ctx.officeId}
        memberId={member}
        basePath="/office/crm"
        teamsPath={TEAMS_PATH}
        progressPath={`${TEAMS_PATH}/progress`}
        canManage={canManage}
      />
    </div>
  );
}
