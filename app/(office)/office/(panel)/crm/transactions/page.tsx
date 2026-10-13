import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getTransactions, getOpenOppOptions, type TxnFilters } from "@/lib/queries-crm-transactions";
import { getAgentOptions } from "@/lib/queries-crm-leads";
import { TransactionsPageShell } from "@/components/crm/TransactionsPageShell";
import { TXN_TYPES, TXN_STATUSES, type TxnType, type TxnStatus } from "@/lib/constants-crm";

export const metadata = { title: "Хэлцэл — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

/** Хэлцлийн жагсаалт: шүүлт + экспорт (F-418), шинэ хэлцэл боломжоос (§4.1). */
export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const sp = await searchParams;
  const filters: TxnFilters = {
    type: sp.type && (TXN_TYPES as readonly string[]).includes(sp.type) ? (sp.type as TxnType) : undefined,
    status:
      sp.status && (TXN_STATUSES as readonly string[]).includes(sp.status) ? (sp.status as TxnStatus) : undefined,
    agentId: sp.agent || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
    q: sp.q || undefined,
  };

  const [rows, agents, oppOptions] = await Promise.all([
    getTransactions(filters),
    getAgentOptions(),
    getOpenOppOptions(),
  ]);

  return (
    <div className="p-8">
      <TransactionsPageShell
        rows={rows}
        agents={agents}
        oppOptions={oppOptions}
        filters={filters}
        roles={ctx.roles}
      />
    </div>
  );
}
