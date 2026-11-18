import { WaitlistScreen } from "@/components/crm2/waitlist/WaitlistScreen";

export const metadata = { title: "Хүлээлгийн үйлчлүүлэгч — CRM" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** T10 Хүлээлгийн жагсаалт (агентын панель). Дэлгэц нь components/crm2/waitlist-д. */
export default async function AgentWaitlistPage({ searchParams }: { searchParams: SearchParams }) {
  return <WaitlistScreen panel="agent" searchParams={await searchParams} />;
}
