import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getCommission } from "@/lib/queries-crm-commissions";
import { CrmNav } from "@/components/crm/CrmNav";
import { CommissionDetailShell } from "@/components/crm/CommissionDetailShell";

export const metadata = { title: "Шимтгэлийн тооцоо — CRM" };

/** F-471: агент өөрийн тооцооны задаргаа, нотолгоо, түүхийг бүрэн харна (RLS). */
export default async function AgentCommissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");

  const { id } = await params;
  const detail = await getCommission(id);
  if (!detail) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>
      <CommissionDetailShell detail={detail} roles={ctx.roles} basePath="/agent/crm" />
    </div>
  );
}
