import { redirect } from "next/navigation";

import { getCrmStaffContext, getSettingValue } from "@/lib/queries-crm-core";
import { getTransactions, getOpenOppOptions, type TxnFilters } from "@/lib/queries-crm-transactions";
import { getAgentOptions } from "@/lib/queries-crm-leads";
import { TransactionsPageShell } from "@/components/crm/TransactionsPageShell";
import { canExportDeals, normalizeDealFlow } from "@/lib/crm/deal-flow";
import { TXN_TYPES, TXN_STATUSES, type TxnType, type TxnStatus } from "@/lib/constants-crm";

export const metadata = { title: "Хэлцэл — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

/** Хэлцлийн жагсаалт: шүүлт, экспорт (зөвхөн эрхтэй дүр), шинэ хэлцэл боломжоос. */
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

  const [rows, agents, oppOptions, dealFlowRaw] = await Promise.all([
    getTransactions(filters),
    getAgentOptions(),
    getOpenOppOptions(),
    getSettingValue("deal_flow"),
  ]);

  return (
    <div className="p-4 sm:p-8">
      <TransactionsPageShell
        rows={rows}
        agents={agents}
        oppOptions={oppOptions}
        filters={filters}
        roles={ctx.roles}
        basePath="/office/crm"
        canExport={canExportDeals(ctx.roles, normalizeDealFlow(dealFlowRaw))}
      />
    </div>
  );
}
