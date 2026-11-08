import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getLeadCardData } from "@/lib/queries-crm-lead-card";
import { getTrackTemplates } from "@/lib/queries-crm-worklists";
import { CrmNav } from "@/components/crm/CrmNav";
import { LeadDetailShell } from "@/components/crm/LeadDetailShell";

export const metadata = { title: "Сэжимийн карт — CRM" };

export default async function AgentLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent/crm/leads");

  const { id } = await params;
  const [data, tracks] = await Promise.all([getLeadCardData(id, ctx), getTrackTemplates()]);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>
      <LeadDetailShell data={data} me={ctx.profileId} roles={ctx.roles} basePath="/agent/crm" trackTemplates={tracks.templates} />
    </div>
  );
}
