import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getLead, getAgentOptions } from "@/lib/queries-crm-leads";
import { findDuplicates } from "@/lib/queries-crm-contacts";
import { CrmNav } from "@/components/crm/CrmNav";
import { LeadDetailShell } from "@/components/crm/LeadDetailShell";

export const metadata = { title: "Сэжимийн карт — CRM" };

export default async function AgentLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");

  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const primaryPhone = lead.contact.phones.find((p) => p.is_primary) ?? lead.contact.phones[0];
  const [agents, duplicates] = await Promise.all([
    getAgentOptions(),
    findDuplicates({
      phone: primaryPhone?.raw,
      email: lead.contact.emails[0]?.email,
      name: lead.contact.display_name,
      excludeContactId: lead.contact.id,
    }),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>
      <LeadDetailShell lead={lead} agents={agents} roles={ctx.roles} basePath="/agent/crm" duplicates={duplicates} />
    </div>
  );
}
