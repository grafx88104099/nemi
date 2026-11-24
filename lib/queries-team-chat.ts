import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Хэрэглэгчийн багийн чат (staff_chats.kind = 'team'). Багийн чатын гишүүд нь багийн идэвхтэй
 * ажилтнууд (crm_staff_team_sync); RLS зөвхөн гишүүнд мөрийг харуулдаг тул гишүүн биш бол null —
 * цэсэнд ажиллахгүй холбоос гарахгүй. Нэг хүсэлтэд агентын болон CRM-ийн layout хоёулаа дуудна.
 */
export const getMyTeamChatId = cache(async (teamId: string | null): Promise<string | null> => {
  if (!teamId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_chats")
    .select("id")
    .eq("kind", "team")
    .eq("team_id", teamId)
    .maybeSingle();
  if (error) {
    console.error("getMyTeamChatId:", error.message);
    return null;
  }
  return data?.id ?? null;
});
