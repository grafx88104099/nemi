"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import { getStaffChatList } from "@/lib/queries-staff-chat";
import { totalUnread } from "@/lib/staff-chat";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { startStaffChatActivity } from "./useStaffChatActivity";

type UnreadEntry = { id: string; unread_count: number };

// Цэс хуудас бүрт шинээр mount хийгддэг тул сүүлийн утгыг хадгална: шилжих бүрд тэмдэг алга болж дахин гарахгүй.
const NONE: UnreadEntry[] = [];
let lastUnread = NONE;
const listeners = new Set<() => void>();

// Нэг хуудсанд хэд хэдэн тэмдэг («Чат», «Багийн чат», утасны доод цэс) байж болно: бүгд нэг realtime
// холболт, нэг staff_chat_list уншилтыг хуваалцана. Сүүлчийн тэмдэг салахад холболтыг түр хүлээгээд
// хаана — хуудас шилжихэд цэс дахин mount хийгдэхэд холболтыг дахин нээхгүй.
const STOP_GRACE_MS = 2_000;
let stopActivity: (() => void) | null = null;
let stopTimer: ReturnType<typeof setTimeout> | undefined;

// Хуудас шилжихэд шинэ цэс дахин mount хийгдэнэ: хуучин нэг тэмдэг тутамд уншдаг байсны оронд
// нэг удаа шинэчилнэ (realtime-д ирдэггүй өөрчлөлт, жишээ нь багаас хасагдсаныг нөхнө).
const REFRESH_DEBOUNCE_MS = 300;
const REFRESH_MIN_GAP_MS = 1_000;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let lastLoadAt = 0;

function refreshSoon() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (Date.now() - lastLoadAt >= REFRESH_MIN_GAP_MS) void load();
  }, REFRESH_DEBOUNCE_MS);
}

async function load() {
  lastLoadAt = Date.now();
  const chats = await getStaffChatList(createClient());
  if (!chats) return;
  lastUnread = chats.map(({ id, unread_count }) => ({ id, unread_count }));
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  clearTimeout(stopTimer);
  if (!stopActivity) stopActivity = startStaffChatActivity(load);
  else refreshSoon();
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => {
      if (listeners.size || !stopActivity) return;
      stopActivity();
      stopActivity = null;
    }, STOP_GRACE_MS);
  };
}

/** Цэсний чатын холбоосын уншаагүй мессежийн тоо. Анхдагч — бүх чат. */
export function StaffChatUnreadBadge({
  className,
  chatId,
  excludeChatId,
}: {
  className?: string;
  /** Зөвхөн энэ чатын тоо («Багийн чат»). */
  chatId?: string | null;
  /** Энэ чатыг тоолохгүй: тусдаа цэстэй тул «Чат»-д давхар тоологдохгүй. */
  excludeChatId?: string | null;
}) {
  const unread = useSyncExternalStore(
    subscribe,
    () => lastUnread,
    () => NONE
  );
  // Нээлттэй чатыг яриа өөрөө уншсанд тэмдэглэдэг тул жагсаалтын адил тоолохгүй.
  const activeId = usePathname().match(/\/chat\/([^/]+)/)?.[1] ?? null;

  const count = totalUnread(
    unread.filter(
      (chat) => chat.id !== activeId && (chatId ? chat.id === chatId : chat.id !== excludeChatId)
    )
  );
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} уншаагүй мессеж`}
      className={cn("rounded-full bg-brand-500 px-1.5 text-[11px] font-bold leading-5 text-white", className)}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
