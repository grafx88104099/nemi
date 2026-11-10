import { StaffChatThreadPage } from "@/components/staff-chat/StaffChatThreadPage";

export default async function AgentChatThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StaffChatThreadPage chatId={id} />;
}
