import type { SupabaseClient } from "@supabase/supabase-js";

import {
  STAFF_CHAT_PAGE_SIZE,
  type StaffChatDirectoryEntry,
  type StaffChatKind,
  type StaffChatListItem,
  type StaffChatMessage,
  type StaffChatPerson,
} from "@/lib/staff-chat";
import type { Database } from "@/types/database";

/**
 * Дотоод чатын уншилт. Client-ийг дуудагч өгнө: сервер компонент ба хөтөч (шинэчлэлт,
 * хуучин мессеж) нэг кодыг хэрэглэж, хоёулаа хэрэглэгчийн эрхээр (RLS) уншина.
 * Жагсаалтын алдаанд null буцаана: шинэчлэлт бүтэлгүйтэхэд байгаа жагсаалт арилахгүй.
 */

type Client = SupabaseClient<Database>;

export type StaffChatHeader = { id: string; kind: StaffChatKind; name: string | null; team_id: string | null };
export type StaffChatMessagePage = { messages: StaffChatMessage[]; hasMore: boolean };

const MESSAGE_COLUMNS = "id, chat_id, sender_id, body, created_at";

export async function getStaffChatList(supabase: Client): Promise<StaffChatListItem[] | null> {
  const { data, error } = await supabase.rpc("staff_chat_list");
  if (error) {
    console.error("getStaffChatList:", error.message);
    return null;
  }
  return data ?? [];
}

export async function getStaffChatDirectory(supabase: Client): Promise<StaffChatDirectoryEntry[] | null> {
  const { data, error } = await supabase.rpc("staff_chat_directory");
  if (error) {
    console.error("getStaffChatDirectory:", error.message);
    return null;
  }
  return [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name, "mn"));
}

export async function getStaffChatPeople(supabase: Client, chatId: string): Promise<StaffChatPerson[] | null> {
  const { data, error } = await supabase.rpc("staff_chat_people", { p_chat: chatId });
  if (error) {
    console.error("getStaffChatPeople:", error.message);
    return null;
  }
  return [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name, "mn"));
}

/** Гишүүн биш бол RLS мөрийг нууж null буцаана. */
export async function getStaffChat(supabase: Client, chatId: string): Promise<StaffChatHeader | null> {
  const { data, error } = await supabase
    .from("staff_chats")
    .select("id, kind, name, team_id")
    .eq("id", chatId)
    .maybeSingle();
  if (error) console.error("getStaffChat:", error.message);
  return data;
}

/** Хамгийн сүүлийн мессежүүд; before өгвөл түүнээс өмнөх хуудас. Буцаах дараалал нь эртнээс шинэ рүү. */
export async function getStaffChatMessages(
  supabase: Client,
  chatId: string,
  before?: string
): Promise<StaffChatMessagePage | null> {
  let query = supabase.from("staff_chat_messages").select(MESSAGE_COLUMNS).eq("chat_id", chatId);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(STAFF_CHAT_PAGE_SIZE + 1);
  if (error) {
    console.error("getStaffChatMessages:", error.message);
    return null;
  }
  const rows = data ?? [];
  return { messages: rows.slice(0, STAFF_CHAT_PAGE_SIZE).reverse(), hasMore: rows.length > STAFF_CHAT_PAGE_SIZE };
}

const CATCH_UP_PAGE_SIZE = 200;

/** Realtime тасарсан хугацаанд алдсан мессежүүд, эртнээс шинэ рүү. hasMore бол дараагийн хуудас бий. */
export async function getStaffChatMessagesAfter(
  supabase: Client,
  chatId: string,
  after: string
): Promise<StaffChatMessagePage | null> {
  const { data, error } = await supabase
    .from("staff_chat_messages")
    .select(MESSAGE_COLUMNS)
    .eq("chat_id", chatId)
    .gt("created_at", after)
    .order("created_at", { ascending: true })
    .limit(CATCH_UP_PAGE_SIZE + 1);
  if (error) {
    console.error("getStaffChatMessagesAfter:", error.message);
    return null;
  }
  const rows = data ?? [];
  return { messages: rows.slice(0, CATCH_UP_PAGE_SIZE), hasMore: rows.length > CATCH_UP_PAGE_SIZE };
}
