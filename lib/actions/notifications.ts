"use server";

import { createClient } from "@/lib/supabase/server";
import { conversationLink, UUID_RE } from "@/lib/hub";

export async function markNotificationsRead(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  return { ok: !error };
}

/**
 * /messages-д нээгдсэн харилцааны мессежийн мэдэгдлүүдийг уншсан болгож, үлдсэн
 * уншаагүй мессежийн мэдэгдлийн тоог буцаана (доод цэсний тоо, bell, DB нэг утгатай).
 * Клиентээс mount-ын дараа дуудагдана (GET render-т бичихгүй). Алдаа → remaining: -1 (тодорхойгүй).
 */
export async function markConversationNotificationsRead(conversationId: string): Promise<{ remaining: number }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || typeof conversationId !== "string" || !UUID_RE.test(conversationId)) return { remaining: 0 };
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("type", "message")
      .eq("link", conversationLink(conversationId))
      .is("read_at", null);
    if (error) return { remaining: -1 };
    const { count, error: countError } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "message")
      .is("read_at", null);
    if (countError) return { remaining: -1 };
    return { remaining: count ?? 0 };
  } catch {
    return { remaining: -1 };
  }
}
