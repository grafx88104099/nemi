import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getLeadListings } from "@/lib/queries-crm-lead-listings";
import { CrmNav } from "@/components/crm/CrmNav";
import { LeadListingsShell } from "@/components/crm/LeadListingsShell";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Сэжимтэй зар — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

/** Агентын сэжимтэй зарууд — RLS өөрөө зөвхөн өөрийн/багийн сэжимийг үлдээнэ. */
export default async function AgentLeadListingsPage({ searchParams }: { searchParams: SearchParams }) {
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
  const groups = await getLeadListings({ q: sp.q || undefined });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>
      <LeadListingsShell groups={groups} basePath="/agent/crm" />
    </div>
  );
}
