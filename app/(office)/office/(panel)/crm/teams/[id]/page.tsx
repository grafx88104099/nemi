import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { canManageTeams } from "@/lib/queries-crm-teams";
import { TeamMonitor } from "@/components/crm/teams/TeamMonitor";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Багийн явц — CRM" };

const TEAMS_PATH = "/office/crm/teams";

// crm_is_manager(): office_admin, sysadmin баг удирдаж чадах ч сэжим уншихгүй тул тэгээр харуулахгүй.
const LEAD_VIEW_ROLES = ["sales_director", "ops_qc", "ceo"];

export default async function OfficeTeamMonitorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ member?: string }>;
}) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const allowed = (await canManageTeams()) && ctx.roles.some((r) => LEAD_VIEW_ROLES.includes(r));
  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <EmptyState
          title="Багийн явцыг харах эрх алга"
          description="Гишүүдийн сэжим харахад CRM-д «Борлуулалт хариуцсан захирал», «Үйл ажиллагаа-ЧМТ» эсвэл «CEO» дүр шаардлагатай."
          action={{ label: "Багууд", href: TEAMS_PATH }}
        />
      </div>
    );
  }

  const [{ id }, { member }] = await Promise.all([params, searchParams]);

  return (
    <div className="p-4 sm:p-8">
      <TeamMonitor
        teamId={id}
        memberId={member}
        basePath="/office/crm"
        monitorPath={`${TEAMS_PATH}/${id}`}
        backHref={TEAMS_PATH}
        backLabel="Багууд"
        emptyHint="Багт ороогүй агентуудаас «Багууд» хуудсанд нэмнэ үү."
      />
    </div>
  );
}
