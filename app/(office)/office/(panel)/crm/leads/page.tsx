import { redirect } from "next/navigation";

import { getCrmStaffContext, getBranches, getLookups, getSettingValue } from "@/lib/queries-crm-core";
import { getLeads, getAgentOptions, getLeadCardSettings, type LeadFilters } from "@/lib/queries-crm-leads";
import { getSavedViews } from "@/lib/queries-crm-contacts";
import { LeadsPageShell } from "@/components/crm/LeadsPageShell";
import { CRM_LIFECYCLES, LEAD_GRADES, type CrmLifecycle, type LeadGrade } from "@/lib/constants-crm";

export const metadata = { title: "Сэжим — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const sp = await searchParams;
  const settings = await getLeadCardSettings();
  const filters: LeadFilters = {
    status: CRM_LIFECYCLES.includes(sp.status as CrmLifecycle) ? (sp.status as CrmLifecycle) : undefined,
    grade: LEAD_GRADES.includes(sp.grade as LeadGrade) ? (sp.grade as LeadGrade) : undefined,
    ownerId: sp.owner || undefined,
    branchId: sp.branch || undefined,
    sourceId: sp.source || undefined,
    unprotected: sp.unprotected === "1",
    overdue: sp.overdue === "1",
    noContactHours: sp.nocontact === "1" ? settings.noContactHours : undefined,
    q: sp.q || undefined,
  };

  const [rows, branches, sources, agents, savedViews, assignment] = await Promise.all([
    getLeads(filters),
    getBranches(),
    getLookups("lead_source"),
    getAgentOptions(),
    getSavedViews("leads"),
    getSettingValue<{ registrar_sources?: string[] }>("lead_assignment"),
  ]);

  return (
    <div className="p-4 md:p-8">
      <LeadsPageShell
        rows={rows}
        sources={sources}
        branches={branches}
        agents={agents}
        savedViews={savedViews}
        roles={ctx.roles}
        basePath="/office/crm"
        noContactHours={settings.noContactHours}
        registrarSources={Array.isArray(assignment?.registrar_sources) ? assignment.registrar_sources : undefined}
      />
    </div>
  );
}
