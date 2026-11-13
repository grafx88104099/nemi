import { ContactCardView } from "@/components/crm2/contacts/ContactCardView";

export const metadata = { title: "Харилцагч — CRM" };

export default async function AgentContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContactCardView panel="agent" id={id} />;
}
