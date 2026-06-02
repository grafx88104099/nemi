import Link from "next/link";

import { getConversations, getMessages } from "@/lib/queries-chat";
import { ChatThread } from "@/components/chat/ChatThread";
import { Avatar } from "@/components/ui/avatar";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { cn } from "@/lib/utils";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const { user, conversations } = await getConversations();
  if (!user) return <LoginPrompt desc="Чатаа харахын тулд нэвтэрнэ үү." next="/messages" />;

  const active = c ? conversations.find((x) => x.id === c) : conversations[0];
  const messages = active ? await getMessages(active.id) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-extrabold text-ink">Чат</h1>
      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        {/* List */}
        <div className="space-y-1 rounded-2xl border border-line bg-surface p-2">
          {conversations.length === 0 && (
            <p className="p-6 text-center text-sm text-muted">Харилцаа алга. Зар дээрээс «Чат бичих» дарна уу.</p>
          )}
          {conversations.map((cv) => (
            <Link
              key={cv.id}
              href={`/messages?c=${cv.id}`}
              className={cn(
                "flex items-center gap-3 rounded-xl p-2.5 transition",
                active?.id === cv.id ? "bg-brand-50" : "hover:bg-surface-2"
              )}
            >
              <Avatar
                initials={cv.agent?.avatar ?? "NA"}
                color={cv.agent?.office?.color ?? "#C2410C"}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">{cv.agent?.display_name ?? "Агент"}</div>
                <div className="truncate text-xs text-muted">{cv.listing?.title ?? ""}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Thread */}
        <div>
          {active ? (
            <ChatThread
              conversationId={active.id}
              initial={messages}
              currentUserId={user.id}
              title={`${active.agent?.display_name ?? "Агент"} · ${active.listing?.title ?? ""}`}
            />
          ) : (
            <div className="flex h-[70vh] items-center justify-center rounded-2xl border border-line bg-surface text-muted">
              Харилцаа сонгоно уу
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
