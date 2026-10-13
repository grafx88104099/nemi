import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getCommissionSheet } from "@/lib/queries-crm-commissions";
import { PrintSheet } from "./PrintSheet";

export const metadata = { title: "Тооцооны хуудас — CRM" };

/** F-472: тооцооны хуудсыг журмын талбарын бүтцээр PDF (хөтчийн print-to-PDF, D11). */
export default async function CommissionPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const { id } = await params;
  const sheet = await getCommissionSheet(id);
  if (!sheet) notFound();

  return (
    <div className="p-8 print:p-0">
      <PrintSheet sheet={sheet} />
    </div>
  );
}
