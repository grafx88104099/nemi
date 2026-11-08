import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getPaymentsToVerify, getDealsAwaitingFeeInvoice } from "@/lib/queries-crm-transactions";
import { FinanceVerifyList } from "@/components/crm/FinanceVerifyList";

export const metadata = { title: "Санхүүгийн баталгаажуулалт — CRM" };

/** Санхүү: хэлцлийн төлбөрийг баталгаажуулах, хөлсний нэхэмжлэх үүсгэх (§6.17). */
export default async function FinancePage() {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  const allowed = ctx.roles.some((r) => ["finance", "property_manager", "sales_director", "ops_qc", "ceo"].includes(r));
  if (!allowed) redirect("/office/crm");

  const [payments, feePending] = await Promise.all([getPaymentsToVerify(), getDealsAwaitingFeeInvoice()]);

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-ink">Санхүүгийн баталгаажуулалт</h1>
        <p className="mt-1 text-sm text-muted">
          Баримттай төлбөрийг шалгаж баталгаажуулснаар хэлцлийн «Төлбөр», «Санхүү» босго хангагдана.
        </p>
      </div>
      <FinanceVerifyList
        payments={payments}
        feePending={feePending}
        canVerify={ctx.roles.includes("finance")}
      />
    </div>
  );
}
