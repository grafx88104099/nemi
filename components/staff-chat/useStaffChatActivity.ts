"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

const DEBOUNCE_MS = 400;

/**
 * Mount хийхэд болон хэрэглэгчийн аль нэг чатад өөрчлөлт гарахад (шинэ мессеж, нэмэгдсэн
 * чат, уншсан тэмдэглэгээ) дуудна. RLS зөвхөн гишүүн чатын мессежийг дамжуулдаг тул шүүлт
 * хэрэггүй. Socket тасарсан хугацааны өөрчлөлтийг холболт сэргэх, таб идэвхжих үед нөхнө.
 */
export function useStaffChatActivity(onActivity: () => void) {
  const callback = useRef(onActivity);
  useEffect(() => {
    callback.current = onActivity;
  }, [onActivity]);

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => callback.current(), DEBOUNCE_MS);
    };

    callback.current();

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !session) return;
      supabase.realtime.setAuth(session.access_token);
      const myMemberships = `profile_id=eq.${session.user.id}`;
      // Нэрийг өвөрмөц болгоно: нэг хуудсанд хэд хэдэн тэмдэг зэрэг холбогдоно.
      channel = supabase
        .channel(`staff-chat-activity:${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "staff_chat_messages" }, schedule)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "staff_chat_members", filter: myMemberships },
          schedule
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "staff_chat_members", filter: myMemberships },
          schedule
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") schedule();
        });
    })();

    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);
}
