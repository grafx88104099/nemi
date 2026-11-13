import { StaffListScreen } from "@/components/crm2/staff/list/StaffListScreen";

export const metadata = { title: "Staff — CRM" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** S01 Staff жагсаалт (оффисын панель). Дэлгэц нь components/crm2/staff/list-д. */
export default async function OfficeStaffPage({ searchParams }: { searchParams: SearchParams }) {
  return <StaffListScreen panel="office" searchParams={await searchParams} />;
}
