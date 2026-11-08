import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { canLeadWeekly } from "@/lib/queries-crm-weekly";
import { CrmNav } from "@/components/crm/CrmNav";
import { PlanDetailView } from "@/components/crm/weekly/PlanDetailView";

export const metadata = { title: "Агентын долоо хоногийн карт — CRM" };

const BASE = "/agent/crm";

/** Багийн ахлагч агентын карт, дүн шинжилгээг хянаж батална (§5 RACI). */
export default async function AgentTeamPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");
  if (!canLeadWeekly(ctx.roles)) redirect(`${BASE}/week`);
  const { planId } = await params;
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath={BASE} />
      </div>
      <PlanDetailView planId={planId} crmBase={BASE} backHref={`${BASE}/team`} />
    </div>
  );
}
