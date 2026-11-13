import { StaffFormScreen } from "@/components/crm2/staff/form/StaffFormScreen";

export const metadata = { title: "Staff хөрөнгө засах — CRM" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** S02 Staff хөрөнгө засах (оффисын панель). Дэлгэц нь components/crm2/staff/form-д. */
export default async function OfficeStaffEditPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <StaffFormScreen panel="office" propertyId={id} created={sp.created === "1"} />;
}
