import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import {
  getClosedTxnsWithoutCommission,
  getCommissions,
  getPendingPmRunCount,
  getPendingRollbackTxns,
  summarize,
  type CommissionFilters,
} from "@/lib/queries-crm-commissions";
import { getAgentOptions } from "@/lib/queries-crm-leads";
import { CommissionsPageShell } from "@/components/crm/CommissionsPageShell";
import {
  COMMISSION_STATUSES,
  type CommissionStatus,
} from "@/lib/constants-crm";

export const metadata = { title: "Шимтгэл — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

/** Тооцооны жагсаалт (төлөвөөр), хянах/батлах/олгох үйлдэл дүрээр (§4.1, F-450–471). */
export default async function CommissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const sp = await searchParams;
  const filters: CommissionFilters = {
    status:
      sp.status && (COMMISSION_STATUSES as readonly string[]).includes(sp.status)
        ? (sp.status as CommissionStatus)
        : undefined,
    source: sp.source === "transaction" || sp.source === "lease_monthly" ? sp.source : undefined,
    recipientId: sp.recipient || undefined,
    month: sp.month || undefined,
    q: sp.q || undefined,
  };

  const isManager = ctx.roles.some((r) => ["finance", "sales_director", "ops_qc", "ceo"].includes(r));
  const [rows, agents, pendingTxns, pendingPmCount, rollbackTxns] = await Promise.all([
    getCommissions(filters),
    getAgentOptions(),
    isManager ? getClosedTxnsWithoutCommission() : Promise.resolve([]),
    isManager ? getPendingPmRunCount() : Promise.resolve(0),
    isManager ? getPendingRollbackTxns() : Promise.resolve([]),
  ]);

  return (
    <div className="p-8">
      <CommissionsPageShell
        rows={rows}
        summary={summarize(rows)}
        filters={filters}
        roles={ctx.roles}
        basePath="/office/crm"
        agents={agents}
        pendingTxns={pendingTxns}
        pendingPmCount={pendingPmCount}
        rollbackTxns={rollbackTxns}
      />
    </div>
  );
}
