"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Building2, ListTodo, MessageCircle, Phone, Users, type LucideIcon } from "lucide-react";

import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { staffChatHref, TEAM_CHAT_LABEL } from "@/lib/staff-chat";
import { cn } from "@/lib/utils";
import { StaffChatUnreadBadge } from "@/components/staff-chat/StaffChatUnreadBadge";

import { cardPropertyId, quickBarCurrent, quickCallHref } from "./shell-model";

/** action — хуудас биш үйлдэл (идэвхтэй гэж тэмдэглэхгүй). */
type QuickItem = { href: string; label: string; icon: LucideIcon; unreadChatId?: string; action?: boolean };

/**
 * Утсанд (md-ээс доош) доод хэсэгт байнга харагдах хурдан үйлдэл. Агент
 * ихэнхдээ талбай дээр, утсаараа ажилладаг: дуудлага ирэхэд цэс ухалгүй нэг
 * товчоор хөрөнгөө сонгож бүртгэнэ (хөрөнгийн карт дээр бол ТЭР хөрөнгийн дуудлага шууд нээгдэнэ,
 * одоогийн таб хэвээр),
 * шинэ хөрөнгийг тэр дор нь нэмнэ («+ Хөрөнгө» — үргэлж шинэ ноорог).
 * Багийн гишүүнд «Багийн чат» (уншаагүй тоотой) — багийнхантайгаа нэг товчоор.
 * Одоогийн хэсэг aria-current-тай, тодруулсан.
 */
export function CrmQuickBar(props: { panel: Crm2Panel; teamChatId?: string | null }) {
  // useSearchParams (картын ?tab=) — Suspense-гүй бол статик render бүхэлдээ client руу шилждэг;
  // fallback нь табгүй ижил цэс (харагдах байдал өөрчлөгдөхгүй).
  return (
    <React.Suspense fallback={<QuickBarView {...props} tab={null} />}>
      <QuickBarWithTab {...props} />
    </React.Suspense>
  );
}

function QuickBarWithTab(props: { panel: Crm2Panel; teamChatId?: string | null }) {
  const tab = useSearchParams().get("tab");
  return <QuickBarView {...props} tab={tab} />;
}

function QuickBarView({ panel, teamChatId = null, tab }: { panel: Crm2Panel; teamChatId?: string | null; tab: string | null }) {
  const pathname = usePathname();
  const p = crm2Paths(panel);
  const cardId = cardPropertyId(pathname, p.base);
  const items: QuickItem[] = [
    {
      href: quickCallHref(p, cardId, tab),
      label: "Дуудлага",
      icon: Phone,
      action: true,
    },
    { href: p.staffNew(), label: "+ Хөрөнгө", icon: Building2 },
    { href: p.contacts(), label: "Харилцагч", icon: Users },
    { href: p.myWork(), label: "Миний ажил", icon: ListTodo },
  ];
  if (teamChatId) {
    items.push({ href: staffChatHref(panel, teamChatId), label: TEAM_CHAT_LABEL, icon: MessageCircle, unreadChatId: teamChatId });
  }
  return (
    <nav
      aria-label="Хурдан үйлдэл"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur md:hidden"
    >
      <ul className={cn("grid", items.length > 4 ? "grid-cols-5" : "grid-cols-4")}>
        {items.map(({ href, label, icon: Icon, unreadChatId, action }) => {
          const current = !action && quickBarCurrent(pathname, href);
          return (
            <li key={label} className="min-w-0">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center gap-0.5 px-1 text-center text-[11px] leading-tight active:bg-surface-2",
                  current ? "bg-brand-50 font-semibold text-brand-700" : "font-medium text-ink",
                  // 5 товчтой үед зарим шошго 2 мөр болно: дүрсүүд нэг шугамд байхаар дээрээс эхэлнэ.
                  items.length > 4 ? "justify-start pt-2" : "justify-center"
                )}
              >
                <span className="relative">
                  <Icon className={cn("size-5", current ? "text-brand-700" : "text-brand-600")} aria-hidden />
                  {unreadChatId ? (
                    <StaffChatUnreadBadge
                      chatId={unreadChatId}
                      className="absolute -top-1.5 left-3 min-w-5 text-center ring-2 ring-surface"
                    />
                  ) : null}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
