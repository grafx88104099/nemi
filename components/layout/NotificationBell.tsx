"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { markNotificationsRead } from "@/lib/actions/notifications";
// CRM1-ийн хуучин холбоосыг CRM2 руу, оффисын панельд /office/crm руу тааруулна.
import { notificationHref } from "@/lib/crm/notify";

type Note = {
  id: string;
  type?: string | null;
  title: string | null;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/**
 * `panel="office"` — CRM-ийн холбоосыг (DB нь /agent/crm/... гэж бичдэг) оффисын
 * панелийн ижил хуудас руу тааруулна.
 */
export function NotificationBell({ initial, panel }: { initial: Note[]; panel?: "office" }) {
  const [notes, setNotes] = useState<Note[]>(initial);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = notes.filter((n) => !n.read_at).length;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    // Channel-г синхроноор, өвөрмөц нэртэй үүсгэнэ (StrictMode давхар mount-д
    // ижил channel дахин ашиглаж `.on()` after `.subscribe()` алдаа гарахаас сэргийлнэ).
    const channel = supabase
      .channel(`notifications:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (p) => {
          setNotes((prev) => [p.new as Note, ...prev]);
          // Гар утасны доод цэсний мессежийн тоо энэ channel-ийг дахин ашиглана.
          window.dispatchEvent(new CustomEvent("nemi:notification", { detail: p.new }));
        }
      );
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      channel.subscribe();
    })();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // /messages тухайн харилцааны мессежийн мэдэгдлийг уншсан болгоход цэгээ шинэчилнэ.
  useEffect(() => {
    function onMessagesRead(e: Event) {
      const link = (e as CustomEvent<{ link?: string } | null>).detail?.link;
      if (!link) return;
      const now = new Date().toISOString();
      setNotes((prev) => prev.map((n) => (n.link === link && !n.read_at ? { ...n, read_at: now } : n)));
    }
    window.addEventListener("nemi:messages-read", onMessagesRead);
    return () => window.removeEventListener("nemi:messages-read", onMessagesRead);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      markNotificationsRead();
      window.dispatchEvent(new Event("nemi:notifications-read"));
      setNotes((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    }
  }

  return (
    <div className="relative" ref={ref}>
      {/* 44px хүрэх талбай (өмнө 36px). */}
      <button
        onClick={toggle}
        className="relative inline-flex size-11 items-center justify-center rounded-lg text-ink hover:bg-surface-2"
        aria-label="Мэдэгдэл"
        aria-expanded={open}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        // Утсанд (sm-ээс доош) дэлгэцийн хоёр захад бэхэлсэн самбар: хонхонд наасан 320px самбар 375px-д
        // зүүн тийш ~10px дэлгэцээс гардаг байв. Дээд зай = толгой (≤64px) + iOS safe-area.
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-lg max-sm:fixed max-sm:inset-x-2 max-sm:top-[calc(env(safe-area-inset-top)+4.25rem)] max-sm:mt-0 max-sm:w-auto">
          <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">Мэдэгдэл</div>
          <div className="max-h-96 overflow-y-auto overscroll-contain max-sm:max-h-[calc(100dvh-env(safe-area-inset-top)-9rem)]">
            {notes.length === 0 && <p className="p-6 text-center text-sm text-muted">Мэдэгдэл алга.</p>}
            {notes.slice(0, 15).map((n) => (
              <Link
                key={n.id}
                href={notificationHref(n.link, n.type, panel) ?? "#"}
                onClick={() => setOpen(false)}
                className="block border-b border-line px-4 py-2.5 last:border-0 hover:bg-surface-2"
              >
                <div className="text-sm font-medium text-ink">{n.title}</div>
                {n.body && <div className="truncate text-xs text-muted">{n.body}</div>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
