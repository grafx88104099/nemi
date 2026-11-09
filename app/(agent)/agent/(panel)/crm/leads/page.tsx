import { getCrmStaffContext, getBranches, getLookups, getSettingValue } from "@/lib/queries-crm-core";
import { getLeads, getAgentOptions, getLeadCardSettings, type LeadFilters } from "@/lib/queries-crm-leads";
import { getSavedViews } from "@/lib/queries-crm-contacts";
import { CrmNav } from "@/components/crm/CrmNav";
import { LeadsPageShell } from "@/components/crm/LeadsPageShell";
import { EmptyState } from "@/components/ui/empty-state";
import { CRM_LIFECYCLES, LEAD_GRADES, type CrmLifecycle, type LeadGrade } from "@/lib/constants-crm";

export const metadata = { title: "Миний сэжим — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

/** Агентын сэжим — RLS өөрөө зөвхөн өөрийн/багийн сэжимийг харуулна. */
export default async function AgentLeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title="Та CRM-д бүртгэгдээгүй байна"
          description="Сэжим, харилцагчийн албан бүртгэлийг ашиглахын тулд оффисын админ таныг CRM-ийн ажилтнаар нэмнэ."
          action={{ label: "Агентын самбар", href: "/agent" }}
        />
      </div>
    );
  }

  const sp = await searchParams;
  const settings = await getLeadCardSettings();
  const filters: LeadFilters = {
    status: CRM_LIFECYCLES.includes(sp.status as CrmLifecycle) ? (sp.status as CrmLifecycle) : undefined,
    grade: LEAD_GRADES.includes(sp.grade as LeadGrade) ? (sp.grade as LeadGrade) : undefined,
    ownerId: sp.owner || undefined,
    branchId: sp.branch || undefined,
    sourceId: sp.source || undefined,
    listingId: sp.listing || undefined,
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
        noContactHours={settings.noContactHours}
        registrarSources={Array.isArray(assignment?.registrar_sources) ? assignment.registrar_sources : undefined}
      />
    </div>
  );
}
