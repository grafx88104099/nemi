import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getLeadListings } from "@/lib/queries-crm-lead-listings";
import { getAgentOptions } from "@/lib/queries-crm-leads";
import { LeadListingsShell } from "@/components/crm/LeadListingsShell";

export const metadata = { title: "Сэжимтэй зар — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function LeadListingsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const sp = await searchParams;
  const [groups, agents] = await Promise.all([
    getLeadListings({ q: sp.q || undefined, ownerId: sp.owner || undefined }),
    getAgentOptions(),
  ]);

  return (
    <div className="p-4 md:p-8">
      <LeadListingsShell groups={groups} agents={agents} basePath="/office/crm" />
    </div>
  );
}
