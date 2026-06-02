"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { sendMessage } from "@/lib/actions/chat";
import { cn } from "@/lib/utils";

type Msg = { id: string; sender_id: string | null; body: string; created_at: string };

export function ChatThread({
  conversationId,
  initial,
  currentUserId,
  title,
}: {
  conversationId: string;
  initial: Msg[];
  currentUserId: string;
  title: string;
}) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // RLS-тэй realtime: socket-д хэрэглэгчийн token өгнө.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`messages:${conversationId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
          (payload) => {
            const m = payload.new as Msg;
            setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    startTransition(async () => {
      await sendMessage(conversationId, body);
    });
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-2xl border border-line bg-surface">
      <div className="border-b border-line px-4 py-3 font-bold text-ink">{title}</div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                  mine ? "bg-brand-500 text-white" : "bg-surface-2 text-ink"
                )}
              >
                {m.body}
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">Мессеж бичиж эхэлнэ үү.</p>
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-line p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Мессеж бичих..."
          className="h-11 flex-1 rounded-xl border border-line px-3.5 text-sm focus:border-brand-500 focus:outline-none"
        />
        <button type="submit" className="flex size-11 items-center justify-center rounded-xl bg-brand-500 text-white hover:bg-brand-600">
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
