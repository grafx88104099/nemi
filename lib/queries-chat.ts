import { createClient } from "@/lib/supabase/server";

export async function getConversations() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, conversations: [] as ConversationRow[] };

  const { data } = await supabase
    .from("conversations")
    .select(
      "id, last_message_at, buyer_id, listing:listings(id, title, photo), agent:agents(display_name, avatar, profile_id, office:offices(color))"
    )
    .order("last_message_at", { ascending: false });

  return {
    user,
    conversations: (data ?? []) as unknown as ConversationRow[],
  };
}

export type ConversationRow = {
  id: string;
  last_message_at: string | null;
  buyer_id: string | null;
  listing: { id: string; title: string; photo: string | null } | null;
  agent: { display_name: string; avatar: string | null; profile_id: string | null; office: { color: string | null } | null } | null;
};

export async function getMessages(conversationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return (data ?? []) as Array<{ id: string; sender_id: string | null; body: string; created_at: string }>;
}
