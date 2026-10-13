import { redirect } from "next/navigation";

import { getCrmStaffContext, getBranches, getLookups } from "@/lib/queries-crm-core";
import { getLeads, getAgentOptions, type LeadFilters } from "@/lib/queries-crm-leads";
import { getSavedViews } from "@/lib/queries-crm-contacts";
import { CrmNav } from "@/components/crm/CrmNav";
import { LeadsPageShell } from "@/components/crm/LeadsPageShell";
import { CRM_LIFECYCLES, LEAD_GRADES, type CrmLifecycle, type LeadGrade } from "@/lib/constants-crm";

export const metadata = { title: "Миний сэжим — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

/** Агентын сэжим — RLS өөрөө зөвхөн өөрийн/багийн сэжимийг харуулна (DESIGN §4.2). */
export default async function AgentLeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");

  const sp = await searchParams;
  const filters: LeadFilters = {
    status: CRM_LIFECYCLES.includes(sp.status as CrmLifecycle) ? (sp.status as CrmLifecycle) : undefined,
    grade: LEAD_GRADES.includes(sp.grade as LeadGrade) ? (sp.grade as LeadGrade) : undefined,
    ownerId: sp.owner || undefined,
    branchId: sp.branch || undefined,
    sourceId: sp.source || undefined,
    unprotected: sp.unprotected === "1",
    q: sp.q || undefined,
  };

  const [rows, branches, sources, agents, savedViews] = await Promise.all([
    getLeads(filters),
    getBranches(),
    getLookups("lead_source"),
    getAgentOptions(),
    getSavedViews("leads"),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>
      <LeadsPageShell
        rows={rows}
        sources={sources}
        branches={branches}
        agents={agents}
        savedViews={savedViews}
        roles={ctx.roles}
        basePath="/agent/crm"
      />
    </div>
  );
}
