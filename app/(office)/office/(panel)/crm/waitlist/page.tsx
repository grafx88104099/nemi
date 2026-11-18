import { WaitlistScreen } from "@/components/crm2/waitlist/WaitlistScreen";

export const metadata = { title: "Хүлээлгийн үйлчлүүлэгч — CRM" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** T10 Хүлээлгийн жагсаалт (оффисын панель). Дэлгэц нь components/crm2/waitlist-д. */
export default async function OfficeWaitlistPage({ searchParams }: { searchParams: SearchParams }) {
  return <WaitlistScreen panel="office" searchParams={await searchParams} />;
}
