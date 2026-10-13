import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getOwnerStatement } from "@/lib/queries-crm-rentals";
import { StatementPrint } from "@/components/crm/StatementPrint";

export const metadata = { title: "Тайлан хэвлэх — CRM" };

/** Өмчлөгчийн тайлангийн print хуудас (D11 — F-562 «PDF татах» = хөтчийн print-to-PDF). */
export default async function StatementPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const { id } = await params;
  const statement = await getOwnerStatement(id);
  if (!statement) notFound();

  return (
    <div className="p-8 print:p-0">
      <StatementPrint statement={statement} />
    </div>
  );
}
