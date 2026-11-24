import { IncompleteScreen } from "@/components/crm2/staff/incomplete/IncompleteScreen";

export const metadata = { title: "Миний дутуу хөрөнгө — CRM" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** «Миний дутуу хөрөнгө» (оффисын панель). Дэлгэц нь components/crm2/staff/incomplete-д. */
export default async function OfficeStaffIncompletePage({ searchParams }: { searchParams: SearchParams }) {
  return <IncompleteScreen panel="office" searchParams={await searchParams} />;
}
