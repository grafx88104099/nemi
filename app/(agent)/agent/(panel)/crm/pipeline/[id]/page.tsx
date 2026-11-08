import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getOpportunityPageData } from "@/lib/queries-crm-pipeline";
import { CrmNav } from "@/components/crm/CrmNav";
import { OpportunityDetailShell } from "@/components/crm/OpportunityDetailShell";

export const metadata = { title: "Боломжийн карт — CRM" };

/** Агент талын боломжийн карт (оффисын картын ижил shell). */
export default async function AgentDealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");

  const { id } = await params;
  const data = await getOpportunityPageData(id);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>
      <OpportunityDetailShell
        opp={data.opp}
        activities={data.activities}
        gateLabels={data.gateLabels}
        lostReasons={data.lostReasons}
        objections={data.objections}
        agents={data.agents}
        roles={ctx.roles}
        currentProfileId={ctx.profileId}
        basePath="/agent/crm"
        dealFlow={data.dealFlow}
        feedbackHours={data.feedbackHours}
      />
    </div>
  );
}
