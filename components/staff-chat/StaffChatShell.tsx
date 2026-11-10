"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useSelectedLayoutSegment } from "next/navigation";

import { getStaffChatList } from "@/lib/queries-staff-chat";
import type { StaffChatListItem } from "@/lib/staff-chat";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { StaffChatInbox } from "./StaffChatInbox";
import { useStaffChatActivity } from "./useStaffChatActivity";

type ShellValue = { basePath: string; currentUserId: string; refreshInbox: () => void };

const ShellContext = createContext<ShellValue | null>(null);

export function useStaffChatShell(): ShellValue {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useStaffChatShell: StaffChatShell дотор ашиглана");
  return value;
}

/** Жагсаалт ба яриа: lg-ээс дээш зэрэгцээ, утсан дээр тусдаа дэлгэц. */
export function StaffChatShell({
  basePath,
  currentUserId,
  initialChats,
  children,
}: {
  basePath: string;
  currentUserId: string;
  initialChats: StaffChatListItem[];
  children: React.ReactNode;
}) {
  const activeId = useSelectedLayoutSegment();
  const [chats, setChats] = useState(initialChats);
  const latestRequest = useRef(0);

  const refreshInbox = useCallback(async () => {
    const request = ++latestRequest.current;
    const next = await getStaffChatList(createClient());
    if (next && request === latestRequest.current) setChats(next);
  }, []);

  useStaffChatActivity(refreshInbox);

  const value = useMemo(() => ({ basePath, currentUserId, refreshInbox }), [basePath, currentUserId, refreshInbox]);

  return (
    <ShellContext.Provider value={value}>
      <div className="flex h-full min-h-0 overflow-hidden rounded-2xl border border-line bg-surface">
        <div
          className={cn(
            "min-h-0 w-full lg:flex lg:w-80 lg:shrink-0 lg:border-r lg:border-line xl:w-96",
            activeId ? "hidden" : "flex"
          )}
        >
          <StaffChatInbox chats={chats} activeId={activeId} />
        </div>
        <div className={cn("min-h-0 min-w-0 flex-1 lg:flex", activeId ? "flex" : "hidden")}>{children}</div>
      </div>
    </ShellContext.Provider>
  );
}
