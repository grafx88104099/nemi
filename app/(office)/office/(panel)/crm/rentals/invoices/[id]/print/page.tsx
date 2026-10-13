import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getInvoice } from "@/lib/queries-crm-rentals";
import { InvoicePrint } from "@/components/crm/InvoicePrint";

export const metadata = { title: "Нэхэмжлэх хэвлэх — CRM" };

/** Нэхэмжлэхийн print хуудас (D11 — F-521 «PDF татах» = хөтчийн print-to-PDF). */
export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  return (
    <div className="p-8 print:p-0">
      <InvoicePrint invoice={invoice} />
    </div>
  );
}
