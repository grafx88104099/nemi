import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getCommission } from "@/lib/queries-crm-commissions";
import { getAuditTrail } from "@/lib/queries-crm-transactions";
import { CommissionDetailShell } from "@/components/crm/CommissionDetailShell";

export const metadata = { title: "Шимтгэлийн тооцоо — CRM" };

/** Задаргаа, нотолгоо, түүх; урсгалын үйлдэл дүрээр (§4.1, F-460–474). */
export default async function CommissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const { id } = await params;
  const detail = await getCommission(id);
  if (!detail) notFound();

  const audit = await getAuditTrail("crm_commission_records", id);

  return (
    <div className="p-8">
      <CommissionDetailShell detail={detail} roles={ctx.roles} basePath="/office/crm" audit={audit} />
    </div>
  );
}
