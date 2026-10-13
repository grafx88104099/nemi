import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import {
  getManagementAgreements,
  getOwnerStatements,
  type StatementFilters,
} from "@/lib/queries-crm-rentals";
import { OwnerStatementsShell } from "@/components/crm/OwnerStatementsShell";

export const metadata = { title: "Өмчлөгчийн тайлан — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

/** Өмчлөгчийн тайлан (F-560–564): угсралт, илгээлт, print (§4.1). */
export default async function OwnerStatementsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const sp = await searchParams;
  const filters: StatementFilters = {
    agreementId: sp.agreement || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
  };

  const [rows, agreements] = await Promise.all([getOwnerStatements(filters), getManagementAgreements()]);

  return (
    <div className="p-8">
      <OwnerStatementsShell rows={rows} agreements={agreements} roles={ctx.roles} />
    </div>
  );
}
