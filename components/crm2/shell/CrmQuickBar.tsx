import Link from "next/link";
import { Building2, ListTodo, MessageCircle, Phone, Users, type LucideIcon } from "lucide-react";

import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { staffChatHref, TEAM_CHAT_LABEL } from "@/lib/staff-chat";
import { cn } from "@/lib/utils";
import { StaffChatUnreadBadge } from "@/components/staff-chat/StaffChatUnreadBadge";

type QuickItem = { href: string; label: string; icon: LucideIcon; unreadChatId?: string };

/**
 * Утсанд (md-ээс доош) доод хэсэгт байнга харагдах хурдан үйлдэл. Агент
 * ихэнхдээ талбай дээр, утсаараа ажилладаг: дуудлага ирэхэд цэс ухалгүй нэг
 * товчоор хөрөнгөө сонгож бүртгэнэ, шинэ хөрөнгийг тэр дор нь нэмнэ («+ Хөрөнгө» — үргэлж шинэ ноорог).
 * Багийн гишүүнд «Багийн чат» (уншаагүй тоотой) — багийнхантайгаа нэг товчоор.
 */
export function CrmQuickBar({ panel, teamChatId = null }: { panel: Crm2Panel; teamChatId?: string | null }) {
  const p = crm2Paths(panel);
  const items: QuickItem[] = [
    { href: p.staff({ call: "1" }), label: "Дуудлага", icon: Phone },
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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className={cn("grid", items.length > 4 ? "grid-cols-5" : "grid-cols-4")}>
        {items.map(({ href, label, icon: Icon, unreadChatId }) => (
          <li key={label} className="min-w-0">
            <Link
              href={href}
              className={cn(
                "flex min-h-14 flex-col items-center gap-0.5 px-1 text-center text-[11px] font-medium leading-tight text-ink active:bg-surface-2",
                // 5 товчтой үед зарим шошго 2 мөр болно: дүрсүүд нэг шугамд байхаар дээрээс эхэлнэ.
                items.length > 4 ? "justify-start pt-2" : "justify-center"
              )}
            >
              <span className="relative">
                <Icon className="size-5 text-brand-600" aria-hidden />
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
        ))}
      </ul>
    </nav>
  );
}
