import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { CrmShell } from "@/components/crm2/shell/CrmShell";

/**
 * Агентын CRM: идэвхтэй crm_staff мөргүй хэрэглэгчийг /agent руу буцаана;
 * цэсийг эрхээр (crm2_my_context) шүүнэ. Хуудас бүр өөрийн эрхийг серверт давхар шалгана.
 */
export default async function AgentCrmLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");

  return (
    <CrmShell panel="agent" staff={ctx} canOpenTeam={ctx.roles.includes("team_lead") && !!ctx.teamId}>
      {children}
    </CrmShell>
  );
}
