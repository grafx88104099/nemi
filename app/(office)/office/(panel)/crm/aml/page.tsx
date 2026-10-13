import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import {
  getAmlCases,
  getUnassignedAlerts,
  getActiveHolds,
  getAmlCounters,
} from "@/lib/queries-crm-aml";
import { AmlCaseShell } from "@/components/crm/AmlCaseShell";
import { AML_CASE_STATUSES, type AmlCaseStatus } from "@/lib/constants-crm";

export const metadata = { title: "МУТСТ — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

/**
 * R-13 МУТСТ нийцлийн самбар — ЗӨВХӨН aml_officer (+ceo унших); бусад дүр
 * серверт давхар шүүгдэж redirect (§4.1 — layout guard дээр нэмэлт).
 */
export default async function AmlPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  if (!ctx.roles.some((r) => r === "aml_officer" || r === "ceo")) redirect("/office/crm");

  const sp = await searchParams;
  const status =
    sp.status && (AML_CASE_STATUSES as readonly string[]).includes(sp.status)
      ? (sp.status as AmlCaseStatus)
      : undefined;

  const [cases, alerts, holds] = await Promise.all([
    getAmlCases(status),
    getUnassignedAlerts(),
    getActiveHolds(),
  ]);
  const counters = getAmlCounters(cases, holds);

  return (
    <div className="p-8">
      <AmlCaseShell cases={cases} alerts={alerts} holds={holds} counters={counters} statusFilter={status} />
    </div>
  );
}
