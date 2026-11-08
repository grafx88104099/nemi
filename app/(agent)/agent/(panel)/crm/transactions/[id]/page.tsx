import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getTransactionPageData } from "@/lib/queries-crm-transactions";
import { CrmNav } from "@/components/crm/CrmNav";
import { TransactionDetailShell } from "@/components/crm/TransactionDetailShell";

export const metadata = { title: "Хэлцлийн хавтас — CRM" };

/** Агентын хэлцлийн хавтас (оффисын хавтасны ижил shell; RLS боломжийн эрхээр). */
export default async function AgentTransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");

  const { id } = await params;
  const data = await getTransactionPageData(id);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>
      <TransactionDetailShell
        txn={data.txn}
        completeness={data.completeness}
        docs={data.docs}
        audit={data.audit}
        agents={data.agents}
        contactOptions={data.contactOptions}
        roles={ctx.roles}
        basePath="/agent/crm"
        closingChecks={data.closingChecks}
        contractTemplates={data.contractTemplates}
        dealFlow={data.dealFlow}
      />
    </div>
  );
}
