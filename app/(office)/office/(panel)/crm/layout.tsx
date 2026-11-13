import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { canManageTeams, hasTeamProgressRole } from "@/lib/queries-crm-teams";
import { CrmShell } from "@/components/crm2/shell/CrmShell";

/**
 * Оффисын CRM: идэвхтэй crm_staff мөргүй хэрэглэгчийг /office руу буцаана;
 * цэсийг эрхээр (crm2_my_context) шүүнэ. Хуудас бүр өөрийн эрхийг серверт давхар шалгана.
 */
export default async function OfficeCrmLayout({ children }: { children: React.ReactNode }) {
  const [ctx, canManage] = await Promise.all([getCrmStaffContext(), canManageTeams()]);
  if (!ctx) redirect("/office");

  return (
    <CrmShell panel="office" staff={ctx} canOpenTeam={canManage || hasTeamProgressRole(ctx.roles)}>
      {children}
    </CrmShell>
  );
}
