import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getMonthlyRecords } from "@/lib/queries-crm-rentals";
import { MonthlyRecordsShell } from "@/components/crm/MonthlyRecordsShell";

export const metadata = { title: "Сарын бүртгэл — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

/** R-07: сарын менежментийн бүртгэлүүд (?month=YYYY-MM) — журмын 9.2 маягт (F-555–559). */
export default async function MonthlyRecordsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const sp = await searchParams;
  const fallback = new Date().toISOString().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? (sp.month as string) : fallback;

  const records = await getMonthlyRecords(month);

  return (
    <div className="p-8">
      <MonthlyRecordsShell records={records} month={`${month}-01`} roles={ctx.roles} />
    </div>
  );
}
