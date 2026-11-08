import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getOpportunityPageData } from "@/lib/queries-crm-pipeline";
import { OpportunityDetailShell } from "@/components/crm/OpportunityDetailShell";

export const metadata = { title: "Боломжийн карт — CRM" };

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const { id } = await params;
  const data = await getOpportunityPageData(id);
  if (!data) notFound();

  return (
    <div className="p-4 sm:p-8">
      <OpportunityDetailShell
        opp={data.opp}
        activities={data.activities}
        gateLabels={data.gateLabels}
        lostReasons={data.lostReasons}
        objections={data.objections}
        agents={data.agents}
        roles={ctx.roles}
        currentProfileId={ctx.profileId}
        basePath="/office/crm"
        dealFlow={data.dealFlow}
        feedbackHours={data.feedbackHours}
      />
    </div>
  );
}
