import { ContactsListView } from "@/components/crm2/contacts/ContactsListView";

export const metadata = { title: "Харилцагчид — CRM" };

export default async function AgentContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ContactsListView panel="agent" searchParams={await searchParams} />;
}
