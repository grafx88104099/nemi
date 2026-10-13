import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getCommissions, summarize, type CommissionFilters } from "@/lib/queries-crm-commissions";
import { CrmNav } from "@/components/crm/CrmNav";
import { CommissionsPageShell } from "@/components/crm/CommissionsPageShell";
import { COMMISSION_STATUSES, type CommissionStatus } from "@/lib/constants-crm";

export const metadata = { title: "Миний шимтгэл — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

/**
 * F-471: агент зөвхөн өөрийн тооцоог харна — задаргаа, төлөв, hold шалтгаан,
 * олголтын түүх, хүлээгдэж буй дүн (RLS өөрөө хязгаарлана, DESIGN §4.2).
 */
export default async function AgentCommissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");

  const sp = await searchParams;
  const filters: CommissionFilters = {
    status:
      sp.status && (COMMISSION_STATUSES as readonly string[]).includes(sp.status)
        ? (sp.status as CommissionStatus)
        : undefined,
    source: sp.source === "transaction" || sp.source === "lease_monthly" ? sp.source : undefined,
    month: sp.month || undefined,
    q: sp.q || undefined,
  };

  const rows = await getCommissions(filters);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>
      <CommissionsPageShell
        rows={rows}
        summary={summarize(rows)}
        filters={filters}
        roles={ctx.roles}
        basePath="/agent/crm"
      />
    </div>
  );
}
