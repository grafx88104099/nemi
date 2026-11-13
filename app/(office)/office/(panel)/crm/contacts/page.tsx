import { ContactsListView } from "@/components/crm2/contacts/ContactsListView";

export const metadata = { title: "Харилцагчид — CRM" };

export default async function OfficeContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ContactsListView panel="office" searchParams={await searchParams} />;
}
