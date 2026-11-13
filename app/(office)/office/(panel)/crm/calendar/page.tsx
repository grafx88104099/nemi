import { CrmCalendarSection } from "@/components/crm/calendar/CrmCalendarSection";

export const metadata = { title: "Календарь — CRM" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Оффисын календарь (?view=&date=&people=): CRM-ийн эрхээр — өөрийнхөө, багийн
 * ахлагч багийнхаа, удирдлага (БХЗ, ҮАМ, CEO) бүх хүний календарь. Эрх, цэс layout-д.
 */
export default async function OfficeCalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Календарь</h1>
      <p className="mb-4 text-sm text-muted">
        Уулзалт, дуудлага, Staff-ийн үзүүлэлт, даалгаврын хугацаа — нэг дор, Улаанбаатарын цагаар.
      </p>
      <CrmCalendarSection basePath="/office/crm" searchParams={sp} />
    </div>
  );
}
