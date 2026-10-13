import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext, getLookups, getGateRequirements } from "@/lib/queries-crm-core";
import { getOpportunity, getActivityTimeline } from "@/lib/queries-crm-pipeline";
import { getAgentOptions } from "@/lib/queries-crm-leads";
import { OpportunityDetailShell } from "@/components/crm/OpportunityDetailShell";
import { GATE_CHECKER_LABEL, type GateCheckerKind, type GateCode } from "@/lib/constants-crm";

export const metadata = { title: "Боломжийн карт — CRM" };

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const { id } = await params;
  const opp = await getOpportunity(id);
  if (!opp) notFound();

  const [activities, lostReasons, objections, agents, gateReqs] = await Promise.all([
    getActivityTimeline({ opportunityId: id }),
    getLookups("lost_reason"),
    getLookups("objection"),
    getAgentOptions(),
    getGateRequirements(),
  ]);

  // Гейт код → идэвхтэй шаардлагуудын монгол нэрс (GateChecklist-д).
  const gateLabels: Partial<Record<GateCode, string[]>> = {};
  for (const r of gateReqs) {
    if (!r.is_active) continue;
    if (r.pipeline_id && r.pipeline_id !== opp.pipeline.id) continue;
    const label = GATE_CHECKER_LABEL[r.checker_kind as GateCheckerKind] ?? r.checker_kind;
    const list = (gateLabels[r.gate_code] ??= []);
    if (!list.includes(label)) list.push(label);
  }

  return (
    <div className="p-8">
      <OpportunityDetailShell
        opp={opp}
        activities={activities}
        gateLabels={gateLabels}
        lostReasons={lostReasons}
        objections={objections}
        agents={agents}
        roles={ctx.roles}
        currentProfileId={ctx.profileId}
        basePath="/office/crm"
      />
    </div>
  );
}
