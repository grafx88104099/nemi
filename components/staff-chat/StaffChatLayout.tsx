import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { getStaffChatList } from "@/lib/queries-staff-chat";
import { createClient } from "@/lib/supabase/server";

import { StaffChatShell } from "./StaffChatShell";

/** Хоёр панелийн чатын layout. CRM бүртгэл шаардахгүй, зөвхөн оффис хэрэгтэй. */
export async function StaffChatLayout({
  basePath,
  loginPath,
  children,
}: {
  basePath: string;
  loginPath: string;
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginPath);

  const { data: officeId, error } = await supabase.rpc("crm_office_id");
  if (error) console.error("StaffChatLayout:", error.message);
  if (!officeId) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="Чат оффисын ажилтнуудад зориулагдсан"
        description="Оффист харьяалагдсаны дараа хамт олонтойгоо чатлах боломжтой болно."
      />
    );
  }

  const chats = (await getStaffChatList(supabase)) ?? [];
  return (
    <StaffChatShell basePath={basePath} currentUserId={user.id} initialChats={chats}>
      {children}
    </StaffChatShell>
  );
}
