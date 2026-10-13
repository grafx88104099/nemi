import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import {
  getTransaction,
  getCompleteness,
  getContactOptions,
  getAuditTrail,
} from "@/lib/queries-crm-transactions";
import { getDocsForEntity } from "@/lib/queries-crm-docs";
import { getAgentOptions } from "@/lib/queries-crm-leads";
import { TransactionDetailShell } from "@/components/crm/TransactionDetailShell";

export const metadata = { title: "Хэлцлийн хавтас — CRM" };

/** Хавтас: талууд, үүрэг, гэрээ, хуваарь, handover, бүрэн байдал, approvals (§4.1). */
export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const { id } = await params;
  const txn = await getTransaction(id);
  if (!txn) notFound();

  const [completeness, docs, audit, agents, contactOptions] = await Promise.all([
    getCompleteness(id),
    getDocsForEntity("transaction", id),
    getAuditTrail("crm_transactions", id),
    getAgentOptions(),
    getContactOptions(),
  ]);

  return (
    <div className="p-8">
      <TransactionDetailShell
        txn={txn}
        completeness={completeness}
        docs={docs}
        audit={audit}
        agents={agents}
        contactOptions={contactOptions}
        roles={ctx.roles}
      />
    </div>
  );
}
