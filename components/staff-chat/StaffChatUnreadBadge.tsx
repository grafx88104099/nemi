"use client";

import { useCallback, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import { getStaffChatList } from "@/lib/queries-staff-chat";
import { totalUnread } from "@/lib/staff-chat";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { useStaffChatActivity } from "./useStaffChatActivity";

type UnreadEntry = { id: string; unread_count: number };

// Цэс хуудас бүрт шинээр mount хийгддэг тул сүүлийн утгыг хадгална: шилжих бүрд тэмдэг алга болж дахин гарахгүй.
const NONE: UnreadEntry[] = [];
let lastUnread = NONE;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Цэсний «Чат» холбоосын уншаагүй мессежийн тоо. */
export function StaffChatUnreadBadge({ className }: { className?: string }) {
  const unread = useSyncExternalStore(
    subscribe,
    () => lastUnread,
    () => NONE
  );
  // Нээлттэй чатыг яриа өөрөө уншсанд тэмдэглэдэг тул жагсаалтын адил тоолохгүй.
  const activeId = usePathname().match(/\/chat\/([^/]+)/)?.[1] ?? null;

  const load = useCallback(async () => {
    const chats = await getStaffChatList(createClient());
    if (!chats) return;
    lastUnread = chats.map(({ id, unread_count }) => ({ id, unread_count }));
    listeners.forEach((listener) => listener());
  }, []);

  useStaffChatActivity(load);

  const count = totalUnread(unread.filter((chat) => chat.id !== activeId));
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
