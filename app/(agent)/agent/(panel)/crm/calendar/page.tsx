import { CrmCalendarSection } from "@/components/crm/calendar/CrmCalendarSection";

export const metadata = { title: "Календарь — CRM" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Агентын календарь (?view=day|week|month|agenda&date=YYYY-MM-DD&people=…): өөрийн
 * үйл явдал, даалгавар, Staff-ийн үзүүлэлт, сайтын үзлэг. Багийн ахлагч багийнхаа,
 * удирдлага бүх хүний календарийг давхарлаж харна (хувийнх нь «Завгүй»). Эрх, цэс layout-д.
 */
export default async function AgentCalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:py-6">
      <h1 className="mb-3 text-xl font-bold text-ink">Календарь</h1>
      <CrmCalendarSection basePath="/agent/crm" searchParams={sp} />
    </div>
  );
}
