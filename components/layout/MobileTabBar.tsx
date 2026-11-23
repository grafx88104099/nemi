"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Map as MapIcon, MessageCircle, Search, User, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { activeTab, type TabId } from "@/lib/hub";

/**
 * sr: харагдах шошгыг бүрэн солих нэр (харагдах үгийг агуулсан байх ёстой — WCAG 2.5.3).
 * srHint: харагдах шошгын АРД залгах тайлбар (нэр = «шошго, тайлбар»).
 */
type Tab = { id: TabId; href: string; label: string; sr?: string; srHint?: string; icon: LucideIcon };

const TYPING_SELECTOR =
  "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]), textarea, select, [contenteditable=true]";

/**
 * Нийтийн сайтын гар утасны доод цэс (md-ээс доош). ЗӨВХӨН (site) layout-ын
 * <Topbar site /> зурна — агентын самбарт гарахгүй.
 * Мессежийн тоо: серверийн анхны утга + NotificationBell-ийн realtime event,
 * /messages-ийн «nemi:messages-read» (серверийн үлдэгдэл тоо), bell «бүгдийг уншсан».
 */
export function MobileTabBar({ signedIn, unreadMessages }: { signedIn: boolean; unreadMessages: number }) {
  const pathname = usePathname();
  const current = activeTab(pathname);

  const [count, setCount] = useState(unreadMessages);
  const [prevProp, setPrevProp] = useState(unreadMessages);
  if (unreadMessages !== prevProp) {
    setPrevProp(unreadMessages);
    setCount(unreadMessages);
  }

  const [typing, setTyping] = useState(false);

  useEffect(() => {
    function onNotification(e: Event) {
      const d = (e as CustomEvent<{ type?: string | null; link?: string | null } | null>).detail;
      if (d?.type !== "message") return;
      // Яг одоо нээлттэй харилцааны мессеж тоологдохгүй.
      if (d.link && d.link === window.location.pathname + window.location.search) return;
      setCount((c) => c + 1);
    }
    function onMessagesRead(e: Event) {
      const d = (e as CustomEvent<{ link: string; remaining: number } | null>).detail;
      if (d && typeof d.remaining === "number" && d.remaining >= 0) setCount(Math.max(0, d.remaining));
    }
    function onAllRead() {
      setCount(0);
    }
    window.addEventListener("nemi:notification", onNotification);
    window.addEventListener("nemi:messages-read", onMessagesRead);
    window.addEventListener("nemi:notifications-read", onAllRead);
    return () => {
      window.removeEventListener("nemi:notification", onNotification);
      window.removeEventListener("nemi:messages-read", onMessagesRead);
      window.removeEventListener("nemi:notifications-read", onAllRead);
    };
  }, []);

  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      const t = e.target;
      setTyping(t instanceof Element && t.matches(TYPING_SELECTOR));
    }
    function onFocusOut() {
      setTyping(false);
    }
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  const tabs: Tab[] = [
    { id: "search", href: "/listings", label: "Хайх", icon: Search },
    { id: "map", href: "/map", label: "Зураг", sr: "Газрын зураг", icon: MapIcon },
    { id: "saved", href: "/favorites", label: "Хадгалсан", icon: Heart },
    { id: "messages", href: "/messages", label: "Мессеж", icon: MessageCircle },
    {
      id: "me",
      href: signedIn ? "/me" : "/login?next=%2Fme",
      label: "Би",
      // Дуут удирдлагаар «Би» гэж хэлэхэд таарахын тулд нэр «Би»-ээр эхэлнэ.
      srHint: signedIn ? "Миний Нэми" : "нэвтрэх",
      icon: User,
    },
  ];

  return (
    <nav
      data-mobile-tabbar
      aria-label="Үндсэн цэс"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden",
        typing && "invisible"
      )}
    >
      <ul className="grid grid-cols-5">
        {tabs.map(({ id, href, label, sr, srHint, icon: Icon }) => {
          const active = current === id;
          return (
            <li key={id}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-medium leading-tight",
                  active ? "text-brand-600" : "text-muted"
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span aria-hidden={sr ? true : undefined} className="max-w-full truncate whitespace-nowrap">
                  {label}
                </span>
                {sr ? <span className="sr-only">{sr}</span> : null}
                {srHint ? <span className="sr-only">, {srHint}</span> : null}
                {id === "messages" && count > 0 ? (
                  <>
                    <span
                      aria-hidden
                      className="absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full bg-brand-500 px-1 text-center text-[10px] font-bold leading-4 text-white"
                    >
                      {count > 9 ? "9+" : count}
                    </span>
                    <span className="sr-only">, {count} уншаагүй</span>
                  </>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
