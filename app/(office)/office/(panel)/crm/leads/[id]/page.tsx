import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getLeadCardData } from "@/lib/queries-crm-lead-card";
import { LeadDetailShell } from "@/components/crm/LeadDetailShell";

export const metadata = { title: "Сэжимийн карт — CRM" };

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const { id } = await params;
  const data = await getLeadCardData(id, ctx);
  if (!data) notFound();

  return (
    <div className="p-4 md:p-8">
      <LeadDetailShell data={data} me={ctx.profileId} roles={ctx.roles} basePath="/office/crm" />
    </div>
  );
}
