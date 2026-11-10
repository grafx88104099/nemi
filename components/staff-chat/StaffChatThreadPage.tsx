import { notFound } from "next/navigation";
import { z } from "zod";

import { getStaffChat, getStaffChatMessages, getStaffChatPeople } from "@/lib/queries-staff-chat";
import { createClient } from "@/lib/supabase/server";

import { StaffChatThread } from "./StaffChatThread";

/** Яриаг ачаална. Гишүүн биш бол RLS мөрийг нуух тул not-found болно. */
export async function StaffChatThreadPage({ chatId }: { chatId: string }) {
  if (!z.string().uuid().safeParse(chatId).success) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const chat = await getStaffChat(supabase, chatId);
  if (!chat) notFound();

  const [page, loadedPeople] = await Promise.all([
    getStaffChatMessages(supabase, chatId),
    getStaffChatPeople(supabase, chatId),
  ]);
  const people = loadedPeople ?? [];
  const other = chat.kind === "direct" ? people.find((p) => p.profile_id !== user.id) : undefined;

  return (
    <StaffChatThread
      key={chat.id}
      chatId={chat.id}
      kind={chat.kind}
      title={chat.kind === "direct" ? (other?.name ?? "Хэрэглэгч") : (chat.name ?? "Чат")}
      avatarUrl={other?.avatar_url ?? null}
      currentUserId={user.id}
      initialMessages={page?.messages ?? []}
      initialHasMore={page?.hasMore ?? false}
      initialPeople={people}
    />
  );
}
