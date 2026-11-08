import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getTransactionPageData } from "@/lib/queries-crm-transactions";
import { TransactionDetailShell } from "@/components/crm/TransactionDetailShell";

export const metadata = { title: "Хэлцлийн хавтас — CRM" };

/** Хэлцлийн хавтас: хаах босго, оролцогч, үүрэг, гэрээ, төлбөр, хүлээлцэх, баримт. */
export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const { id } = await params;
  const data = await getTransactionPageData(id);
  if (!data) notFound();

  return (
    <div className="p-4 sm:p-8">
      <TransactionDetailShell
        txn={data.txn}
        completeness={data.completeness}
        docs={data.docs}
        audit={data.audit}
        agents={data.agents}
        contactOptions={data.contactOptions}
        roles={ctx.roles}
        basePath="/office/crm"
        closingChecks={data.closingChecks}
        contractTemplates={data.contractTemplates}
        dealFlow={data.dealFlow}
      />
    </div>
  );
}
