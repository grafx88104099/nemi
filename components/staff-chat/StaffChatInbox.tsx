"use client";

import { useMemo, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { Loader2, MessagesSquare, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  chatTimeLabel,
  filterStaffChats,
  staffChatTitle,
  visibleStaffChats,
  type StaffChatListItem,
} from "@/lib/staff-chat";
import { cn } from "@/lib/utils";

import { ChatAvatar } from "./ChatAvatar";
import { NewChatModal } from "./NewChatModal";
import { useStaffChatShell } from "./StaffChatShell";

export function StaffChatInbox({ chats, activeId }: { chats: StaffChatListItem[]; activeId: string | null }) {
  const [query, setQuery] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);

  const available = useMemo(() => visibleStaffChats(chats, activeId), [chats, activeId]);
  const shown = useMemo(() => filterStaffChats(available, query), [available, query]);

  return (
    <div className="flex min-h-0 w-full flex-col">
      <div className="shrink-0 space-y-3 border-b border-line p-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-extrabold text-ink">Чат</h1>
          <Button size="sm" onClick={() => setNewChatOpen(true)}>
            <Plus className="size-4" /> Шинэ чат
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Чат хайх"
            aria-label="Чат хайх"
            className="h-10 pl-9 text-base lg:text-sm"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {shown.length === 0 ? (
          query.trim() ? (
            <EmptyState compact title="Илэрц олдсонгүй" className="mt-6" />
          ) : (
            <EmptyState
              compact
              icon={MessagesSquare}
              title="Чат алга"
              description="Хамт олонтойгоо чатлаж эхлээрэй."
              action={{ label: "Шинэ чат", onClick: () => setNewChatOpen(true) }}
              className="mt-6"
            />
          )
        ) : (
          <ul>
            {shown.map((chat) => (
              <li key={chat.id}>
                <InboxRow chat={chat} active={chat.id === activeId} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {newChatOpen ? <NewChatModal onClose={() => setNewChatOpen(false)} /> : null}
    </div>
  );
}

function InboxRow({ chat, active }: { chat: StaffChatListItem; active: boolean }) {
  const { basePath, currentUserId } = useStaffChatShell();
  const title = staffChatTitle(chat);
  // Нээлттэй чат аль хэдийн уншигдаж байгаа; серверийн тоо ирэхийг хүлээхгүй.
  const unread = active ? 0 : chat.unread_count;
  const mine = chat.last_sender_id === currentUserId;

  return (
    <Link
      href={`${basePath}/${chat.id}`}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-16 items-center gap-3 border-b border-line px-3 py-2.5 transition",
        active ? "bg-brand-50" : "hover:bg-surface-2"
      )}
    >
      <ChatAvatar kind={chat.kind} avatarUrl={chat.other_avatar_url} name={title} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-sm text-ink", unread > 0 ? "font-bold" : "font-semibold")}>{title}</span>
          {chat.kind === "team" ? <KindMarker tone="brand">Баг</KindMarker> : null}
          {chat.kind === "group" ? <KindMarker tone="neutral">Бүлэг</KindMarker> : null}
          <span className="ml-auto shrink-0 text-[11px] text-subtle">
            {chatTimeLabel(chat.last_message_at ?? chat.created_at)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className={cn("truncate text-xs", unread > 0 ? "font-medium text-ink" : "text-muted")}>
            {chat.last_body ? `${mine ? "Та: " : ""}${chat.last_body}` : "Мессеж алга"}
          </span>
          <PendingIndicator />
          {unread > 0 ? (
            <span
              aria-label={`${unread} уншаагүй`}
              className="ml-auto min-w-5 shrink-0 rounded-full bg-brand-500 px-1.5 text-center text-[11px] font-bold leading-5 text-white"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function KindMarker({ tone, children }: { tone: "brand" | "neutral"; children: React.ReactNode }) {
  return (
    <Badge tone={tone} className="shrink-0 px-1.5 py-0 text-[10px]">
      {children}
    </Badge>
  );
}

/** Мөр бүрийг урьдчилан ачаалахгүй тул дарсны дараах хүлээлтийг харуулна. */
function PendingIndicator() {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className="size-3 shrink-0 animate-spin text-subtle" aria-hidden /> : null;
}
