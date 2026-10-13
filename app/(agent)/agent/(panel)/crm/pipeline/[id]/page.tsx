import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext, getLookups, getGateRequirements } from "@/lib/queries-crm-core";
import { getOpportunity, getActivityTimeline } from "@/lib/queries-crm-pipeline";
import { getAgentOptions } from "@/lib/queries-crm-leads";
import { CrmNav } from "@/components/crm/CrmNav";
import { OpportunityDetailShell } from "@/components/crm/OpportunityDetailShell";
import { GATE_CHECKER_LABEL, type GateCheckerKind, type GateCode } from "@/lib/constants-crm";

export const metadata = { title: "Боломжийн карт — CRM" };

/** Агент талын боломжийн карт (dual-mount — DESIGN §4.2). */
export default async function AgentDealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");

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

  const gateLabels: Partial<Record<GateCode, string[]>> = {};
  for (const r of gateReqs) {
    if (!r.is_active) continue;
    if (r.pipeline_id && r.pipeline_id !== opp.pipeline.id) continue;
    const label = GATE_CHECKER_LABEL[r.checker_kind as GateCheckerKind] ?? r.checker_kind;
    const list = (gateLabels[r.gate_code] ??= []);
    if (!list.includes(label)) list.push(label);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>
      <OpportunityDetailShell
        opp={opp}
        activities={activities}
        gateLabels={gateLabels}
        lostReasons={lostReasons}
        objections={objections}
        agents={agents}
        roles={ctx.roles}
        currentProfileId={ctx.profileId}
        basePath="/agent/crm"
      />
    </div>
  );
}
