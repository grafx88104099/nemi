import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { CrmNav } from "@/components/crm/CrmNav";
import { CrmCalendarSection } from "@/components/crm/calendar/CrmCalendarSection";

export const metadata = { title: "Календарь — CRM" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Агентын календарь (?view=day|week|month|agenda&date=YYYY-MM-DD&people=…): өөрийн
 * үйл явдал, даалгавар, дараагийн үйлдэл, үзлэг, уулзалт. Багийн ахлагч багийнхаа,
 * удирдлага бүх хүний календарийг давхарлаж харна (хувийнх нь «Завгүй»).
 */
export default async function AgentCalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");
  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:py-6">
      <div className="mb-4 hidden border-b border-line md:block">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>
      <h1 className="mb-3 text-xl font-bold text-ink">Календарь</h1>
      <CrmCalendarSection basePath="/agent/crm" searchParams={sp} planStatus />
    </div>
  );
}
