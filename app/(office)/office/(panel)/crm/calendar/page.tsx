import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { CrmCalendarSection } from "@/components/crm/calendar/CrmCalendarSection";

export const metadata = { title: "Календарь — CRM" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Оффисын календарь (?view=&date=&people=): CRM-ийн эрхээр — өөрийнхөө, багийн
 * ахлагч багийнхаа, удирдлага (БХЗ, ҮАМ, CEO) бүх хүний календарь. Цэс layout-д.
 */
export default async function OfficeCalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  const sp = await searchParams;

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Календарь</h1>
      <p className="mb-4 text-sm text-muted">
        Уулзалт, дуудлага, үзлэг, даалгаврын хугацаа, дараагийн үйлдэл — нэг дор, Улаанбаатарын цагаар.
      </p>
      <CrmCalendarSection basePath="/office/crm" searchParams={sp} planStatus />
    </div>
  );
}
