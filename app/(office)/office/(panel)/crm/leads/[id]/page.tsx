import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getLead, getAgentOptions } from "@/lib/queries-crm-leads";
import { findDuplicates } from "@/lib/queries-crm-contacts";
import { LeadDetailShell } from "@/components/crm/LeadDetailShell";

export const metadata = { title: "Сэжимийн карт — CRM" };

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

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
    <div className="p-8">
      <LeadDetailShell lead={lead} agents={agents} roles={ctx.roles} basePath="/office/crm" duplicates={duplicates} />
    </div>
  );
}
