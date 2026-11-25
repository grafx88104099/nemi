"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CheckCheck,
  Clock3,
  ListTodo,
  MessageCircle,
  Settings2,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { StaffChatUnreadBadge } from "@/components/staff-chat/StaffChatUnreadBadge";
import { ScrollFadeRow } from "@/components/crm2/ui/scroll-fade-row";

import type { CrmNavIcon, CrmNavItem } from "./menu";

/** Утсанд (sm-ээс доош) богино шошго — урт нэр цэсний мөрийг дүүргэж бусдыг дэлгэцээс түлхдэг. */
const SHORT_LABEL: Partial<Record<CrmNavIcon, string>> = {
  waitlist: "Хүлээлэг",
};

const ICON: Record<CrmNavIcon, LucideIcon> = {
  staff: Building2,
  contacts: Users,
  myWork: ListTodo,
  waitlist: Clock3,
  finance: Wallet,
  reports: BarChart3,
  settings: Settings2,
  calendar: CalendarDays,
  team: UsersRound,
  teamChat: MessageCircle,
  approvals: CheckCheck,
};

function isActive(pathname: string, href: string, matchPrefix: string): boolean {
  return pathname === href || pathname.startsWith(`${matchPrefix}/`) || pathname === matchPrefix;
}

/**
 * CRM-ийн хэвтээ цэс (хоёр панельд ижил). Үндсэн 7 хэсэг зурагны дарааллаар,
 * дараа нь туслах хэсгүүд. Утсанд хэвтээ гүйлгэнэ (баруун талд бүдгэрэлт — цааш цэс байгааг
 * сануулна); идэвхтэй таб харагдах хэсэгт гүйлгэгдэнэ.
 * Харагдах эсэхийг сервер (эрхээр) шийдэж items-ээр дамжуулна.
 */
export function CrmNav({ primary, secondary }: { primary: CrmNavItem[]; secondary: CrmNavItem[] }) {
  const pathname = usePathname() ?? "";

  const render = (it: CrmNavItem, secondaryItem: boolean) => {
    const Icon = ICON[it.icon];
    const active = isActive(pathname, it.href, it.matchPrefix ?? it.href);
    const short = SHORT_LABEL[it.icon];
    return (
      <Link
        key={it.href}
        href={it.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition",
          active
            ? "border-brand-500 text-brand-700"
            : cn(
                "border-transparent hover:border-line-strong hover:text-ink",
                secondaryItem ? "text-subtle" : "text-muted"
              )
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {short ? (
          <>
            <span className="whitespace-nowrap sm:hidden">{short}</span>
            <span className="hidden whitespace-nowrap sm:inline">{it.label}</span>
          </>
        ) : (
          <span className="whitespace-nowrap">{it.label}</span>
        )}
        {it.badge ? (
          <span className="rounded-full bg-brand-50 px-1.5 text-xs font-semibold text-brand-700">{it.badge}</span>
        ) : null}
        {it.unreadChatId ? <StaffChatUnreadBadge chatId={it.unreadChatId} /> : null}
      </Link>
    );
  };

  return (
    <nav aria-label="CRM цэс" className="-mb-px">
      <ScrollFadeRow className="flex items-center gap-0.5" fadeFrom="from-surface" scrollKey={pathname}>
        {primary.map((it) => render(it, false))}
        {secondary.length ? <span className="mx-2 h-5 w-px shrink-0 bg-line" aria-hidden /> : null}
        {secondary.map((it) => render(it, true))}
      </ScrollFadeRow>
    </nav>
  );
}
