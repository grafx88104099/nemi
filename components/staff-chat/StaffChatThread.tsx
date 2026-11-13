"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AlertCircle, ArrowDown, ArrowLeft, Clock, Info, Loader2, Send } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { markChatRead, sendStaffMessage } from "@/lib/actions/staff-chat";
import { personAvatar } from "@/lib/avatar";
import { fmtTime } from "@/lib/format";
import { getStaffChatMessages, getStaffChatMessagesAfter, getStaffChatPeople } from "@/lib/queries-staff-chat";
import {
  STAFF_CHAT_MAX_BODY,
  groupMessagesByDay,
  mergeStaffMessages,
  newStaffMessageId,
  type StaffChatKind,
  type StaffChatMessage,
  type StaffChatPerson,
  type StaffChatThreadMessage,
} from "@/lib/staff-chat";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { ChatAvatar } from "./ChatAvatar";
import { GroupInfoModal } from "./GroupInfoModal";
import { useStaffChatShell } from "./StaffChatShell";

const STICK_THRESHOLD_PX = 96;
const MARK_READ_DELAY_MS = 250;
const COMPOSER_MAX_HEIGHT_PX = 128;
const SHOW_COUNTER_FROM = STAFF_CHAT_MAX_BODY - 200;

type SendResult = { ok: boolean; message?: StaffChatMessage };

export function StaffChatThread({
  chatId,
  kind,
  title,
  avatarUrl,
  currentUserId,
  initialMessages,
  initialHasMore,
  initialPeople,
}: {
  chatId: string;
  kind: StaffChatKind;
  title: string;
  avatarUrl: string | null;
  currentUserId: string;
  initialMessages: StaffChatMessage[];
  initialHasMore: boolean;
  initialPeople: StaffChatPerson[];
}) {
  const { basePath } = useStaffChatShell();
  const [messages, setMessages] = useState<StaffChatThreadMessage[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [people, setPeople] = useState(initialPeople);
  const [text, setText] = useState("");
  const [newBelow, setNewBelow] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const prependedFromHeight = useRef<number | null>(null);
  const markReadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Зөвхөн серверээс уншсан/realtime-аар ирсэн мессежээр урагшилна. Өөрийн илгээснээр
  // урагшилбал socket тасарсан үед бусдын бичсэн мессеж нөхөгдөхгүй алгасагдана.
  const syncedAt = useRef<string | null>(initialMessages.at(-1)?.created_at ?? null);
  const knownSenders = useRef(new Set(initialPeople.map((p) => p.profile_id)));

  const showSenders = kind !== "direct";
  const groups = useMemo(() => groupMessagesByDay(messages), [messages]);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.profile_id, p])), [people]);

  useEffect(() => {
    knownSenders.current = new Set(people.map((p) => p.profile_id));
  }, [people]);

  const scheduleMarkRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    clearTimeout(markReadTimer.current);
    markReadTimer.current = setTimeout(() => {
      markChatRead(chatId).catch(() => undefined);
    }, MARK_READ_DELAY_MS);
  }, [chatId]);

  const refreshPeople = useCallback(async () => {
    const next = await getStaffChatPeople(createClient(), chatId);
    if (next) setPeople(next);
  }, [chatId]);

  const receive = useCallback(
    (batch: StaffChatMessage[]) => {
      for (const m of batch) {
        if (!syncedAt.current || Date.parse(m.created_at) > Date.parse(syncedAt.current)) syncedAt.current = m.created_at;
      }
      setMessages((current) => mergeStaffMessages(current, batch));
      const incoming = batch.filter((m) => m.sender_id !== currentUserId);
      if (incoming.length === 0) return;
      if (!stickToBottom.current) setNewBelow(true);
      scheduleMarkRead();
      if (incoming.some((m) => m.sender_id && !knownSenders.current.has(m.sender_id))) void refreshPeople();
    },
    [currentUserId, refreshPeople, scheduleMarkRead]
  );

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    // Socket холбогдохоос өмнө болон тасарсан хугацаанд ирсэн мессежийг нөхнө.
    const catchUp = async () => {
      let after = syncedAt.current;
      if (!after) {
        const page = await getStaffChatMessages(supabase, chatId);
        if (!cancelled && page?.messages.length) receive(page.messages);
        return;
      }
      // Удаан тасарсан бол хуудаслан бүгдийг авна: дунд нь цоорхой үлдвэл «Өмнөх мессежүүд» нөхөхгүй.
      for (;;) {
        const page = await getStaffChatMessagesAfter(supabase, chatId, after);
        if (cancelled || !page) return;
        if (page.messages.length) receive(page.messages);
        const last = page.messages.at(-1);
        if (!page.hasMore || !last) return;
        after = last.created_at;
      }
    };

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      channel = supabase
        .channel(`staff-chat:${chatId}:${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "staff_chat_messages", filter: `chat_id=eq.${chatId}` },
          (payload) => receive([payload.new as StaffChatMessage])
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void catchUp();
        });
    })();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      scheduleMarkRead();
      void catchUp();
    };
    document.addEventListener("visibilitychange", onVisible);
    scheduleMarkRead();

    return () => {
      cancelled = true;
      clearTimeout(markReadTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [chatId, receive, scheduleMarkRead]);

  // Утасны гар нээгдэхэд visual viewport багасдаг ч 100dvh хэвээр үлдэнэ.
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = rootRef.current;
    if (!viewport || !root) return;
    const apply = () => {
      root.style.setProperty("--chat-vh", `${Math.round(viewport.height)}px`);
      root.style.setProperty("--chat-top", `${Math.round(viewport.offsetTop)}px`);
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
    };
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prependedFromHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prependedFromHeight.current;
      prependedFromHeight.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Гар нээгдэх, бичих талбар томрох үед яриа доод талдаа үлдэнэ.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  }, [text]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
    stickToBottom.current = atBottom;
    if (atBottom) setNewBelow(false);
  }

  function jumpToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = true;
    setNewBelow(false);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  async function deliver(id: string, body: string) {
    const result: SendResult = await sendStaffMessage({ id, chatId, body }).catch(() => ({ ok: false }));
    if (result.ok && result.message) {
      const confirmed = result.message;
      setMessages((current) => mergeStaffMessages(current, [confirmed]));
      return;
    }
    // Realtime хуулбар түрүүлж ирсэн бол мессеж хадгалагдсан тул «амжилтгүй» болгохгүй.
    setMessages((current) => current.map((m) => (m.id === id && m.status === "sending" ? { ...m, status: "failed" } : m)));
  }

  function submit() {
    const body = text.trim();
    if (!body) return;
    const id = newStaffMessageId();
    stickToBottom.current = true;
    setNewBelow(false);
    setText("");
    setMessages((current) =>
      mergeStaffMessages(current, [
        { id, chat_id: chatId, sender_id: currentUserId, body, created_at: new Date().toISOString(), status: "sending" },
      ])
    );
    void deliver(id, body);
    inputRef.current?.focus();
  }

  function retry(message: StaffChatThreadMessage) {
    setMessages((current) => current.map((m) => (m.id === message.id ? { ...m, status: "sending" } : m)));
    void deliver(message.id, message.body);
  }

  function discard(id: string) {
    setMessages((current) => current.filter((m) => m.id !== id));
  }

  async function loadOlder() {
    const oldest = messages.find((m) => !m.status);
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    const page = await getStaffChatMessages(createClient(), chatId, oldest.created_at);
    if (page) {
      prependedFromHeight.current = scrollRef.current?.scrollHeight ?? null;
      setMessages((current) => mergeStaffMessages(current, page.messages));
      setHasMore(page.hasMore);
    } else {
      toast.error("Өмнөх мессежүүдийг ачаалж чадсангүй.");
    }
    setLoadingOlder(false);
  }

  return (
    <div
      ref={rootRef}
      className="fixed inset-x-0 top-[var(--chat-top,0px)] z-50 flex h-[var(--chat-vh,100dvh)] min-w-0 flex-col bg-surface lg:static lg:z-auto lg:h-full lg:flex-1"
    >
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-1 lg:gap-2 lg:px-4">
        <Link
          href={basePath}
          aria-label="Чатын жагсаалт руу буцах"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-surface-2 lg:hidden"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <ChatAvatar kind={kind} avatarUrl={avatarUrl} name={title} size="sm" />
        <div className="ml-1 min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold text-ink">{title}</h2>
          {showSenders ? <p className="text-xs text-muted">{people.length} гишүүн</p> : null}
        </div>
        {showSenders ? (
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            aria-label="Чатын мэдээлэл"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
          >
            <Info className="size-5" />
          </button>
        ) : null}
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          role="log"
          aria-live="polite"
          aria-label="Мессежүүд"
          className="absolute inset-0 overflow-y-auto overscroll-contain px-3 py-3 lg:px-4"
        >
          {hasMore ? (
            <div className="mb-2 flex justify-center">
              <button
                type="button"
                onClick={() => void loadOlder()}
                disabled={loadingOlder}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-medium text-muted hover:text-ink disabled:opacity-60"
              >
                {loadingOlder ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                Өмнөх мессежүүд
              </button>
            </div>
          ) : null}

          {messages.length === 0 ? (
            <EmptyState compact title="Мессеж алга" description="Эхний мессежээ бичээрэй." className="mt-10" />
          ) : null}

          {groups.map((group) => (
            <section key={group.key}>
              <div className="my-3 flex justify-center">
                <span className="rounded-full bg-bg px-3 py-1 text-[11px] font-medium text-muted">{group.label}</span>
              </div>
              {group.messages.map((message, index) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  mine={message.sender_id === currentUserId}
                  showSender={showSenders}
                  firstOfRun={group.messages[index - 1]?.sender_id !== message.sender_id}
                  sender={message.sender_id ? peopleById.get(message.sender_id) : undefined}
                  onRetry={retry}
                  onDiscard={discard}
                />
              ))}
            </section>
          ))}
        </div>

        {newBelow ? (
          <button
            type="button"
            onClick={jumpToBottom}
            className="absolute bottom-3 left-1/2 inline-flex min-h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink px-3 text-xs font-semibold text-white shadow-lg"
          >
            <ArrowDown className="size-3.5" aria-hidden /> Шинэ мессеж
          </button>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex shrink-0 items-end gap-2 border-t border-line bg-surface p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:p-3"
      >
        <div className="min-w-0 flex-1">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            maxLength={STAFF_CHAT_MAX_BODY}
            enterKeyHint="send"
            placeholder="Мессеж бичих..."
            aria-label="Мессеж бичих"
            // 16px-ээс жижиг бол iOS фокуслахад хуудсыг томруулж, бичих талбар дэлгэцээс гарна.
            className="block max-h-32 min-h-11 w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 lg:text-sm"
          />
          {text.length >= SHOW_COUNTER_FROM ? (
            <p className="mt-1 text-right text-[11px] text-muted">
              {text.length}/{STAFF_CHAT_MAX_BODY}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={!text.trim()}
          // Товч фокус авбал утасны гар хаагдана.
          onMouseDown={(e) => e.preventDefault()}
          aria-label="Илгээх"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </form>

      {infoOpen ? (
        <GroupInfoModal
          chatId={chatId}
          kind={kind}
          title={title}
          people={people}
          onMembersChanged={refreshPeople}
          onClose={() => setInfoOpen(false)}
        />
      ) : null}
    </div>
  );
}

function MessageRow({
  message,
  mine,
  showSender,
  firstOfRun,
  sender,
  onRetry,
  onDiscard,
}: {
  message: StaffChatThreadMessage;
  mine: boolean;
  showSender: boolean;
  firstOfRun: boolean;
  sender: StaffChatPerson | undefined;
  onRetry: (message: StaffChatThreadMessage) => void;
  onDiscard: (id: string) => void;
}) {
  const failed = message.status === "failed";
  const withSender = showSender && !mine;
  const senderName = sender?.name ?? "Хуучин гишүүн";
  const avatar = personAvatar(sender?.avatar_url ?? null, senderName);

  return (
    <div className={cn("flex gap-2", mine ? "justify-end" : "justify-start", firstOfRun ? "mt-3" : "mt-1")}>
      {withSender ? (
        firstOfRun ? (
          <Avatar src={avatar.src} initials={avatar.initials} size="sm" className="shrink-0" />
        ) : (
          <span className="w-7 shrink-0" aria-hidden />
        )
      ) : null}
      <div className={cn("flex min-w-0 max-w-[80%] flex-col lg:max-w-[70%]", mine ? "items-end" : "items-start")}>
        {withSender && firstOfRun ? <span className="mb-0.5 text-xs font-semibold text-muted">{senderName}</span> : null}
        <div
          className={cn(
            "max-w-full whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm [overflow-wrap:anywhere]",
            failed
              ? "bg-rose-50 text-rose-900 ring-1 ring-rose-300"
              : mine
                ? "bg-brand-500 text-white"
                : "border border-line bg-bg text-ink",
            message.status === "sending" && "opacity-70"
          )}
        >
          {message.body}
        </div>
        {failed ? (
          <div className="mt-1 flex flex-wrap items-center justify-end gap-x-3 text-xs" role="alert">
            <span className="inline-flex items-center gap-1 font-medium text-danger">
              <AlertCircle className="size-3.5" aria-hidden /> Илгээгдсэнгүй
            </span>
            <button
              type="button"
              onClick={() => onRetry(message)}
              className="min-h-9 font-semibold text-brand-700 hover:underline"
            >
              Дахин илгээх
            </button>
            <button type="button" onClick={() => onDiscard(message.id)} className="min-h-9 text-muted hover:underline">
              Устгах
            </button>
          </div>
        ) : (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-subtle">
            {message.status === "sending" ? (
              <>
                <Clock className="size-3" aria-hidden /> Илгээж байна
              </>
            ) : (
              fmtTime(message.created_at)
            )}
          </span>
        )}
      </div>
    </div>
  );
}
