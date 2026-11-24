"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  MessageCircle,
  MessagesSquare,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { staffChatHref, TEAM_CHAT_LABEL } from "@/lib/staff-chat";
import { StaffChatUnreadBadge } from "@/components/staff-chat/StaffChatUnreadBadge";

const CHAT_HREF = staffChatHref("agent");
const MY_WORK_HREF = "/agent/crm/my-work";

export type AgentNav = {
  /** CRM-ийн ажилтан эсэх (цэсийг тохируулахад). */
  crm: boolean;
  /** Багийн чат (гишүүн бол) — «Багийн чат» цэс. */
  teamChatId: string | null;
};

/** Агентын layout-аас. */
const AgentNavContext = React.createContext<AgentNav>({ crm: false, teamChatId: null });

export function AgentNavProvider({
  crm,
  teamChatId = null,
  children,
}: {
  crm: boolean;
  teamChatId?: string | null;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ crm, teamChatId }), [crm, teamChatId]);
  return <AgentNavContext.Provider value={value}>{children}</AgentNavContext.Provider>;
}

export type AgentNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: (p: string) => boolean;
  /** Уншаагүй тоо: { all } — багийн чатаас бусад бүх чат, { chatId } — зөвхөн тэр чат. */
  unread?: { all: true } | { chatId: string };
};

const starts = (prefix: string) => (p: string) => p === prefix || p.startsWith(prefix + "/");

/**
 * Агентын дээд цэс. CRM-ийн ажилтанд «Даалгавар» тусдаа цэс биш — оффисын
 * даалгавар CRM «Миний ажил»-д дараагийн алхмуудтайгаа нэг жагсаалтад
 * харагдана. CRM-гүй оффисын агентад хуучнаараа. Багийн гишүүнд «Багийн чат»
 * шууд багийнхаа яриа руу; «Чат» бусад ярианд (тоо нь давхардахгүй).
 */
export function agentNavItems({ crm, teamChatId }: AgentNav): AgentNavItem[] {
  const teamChat = teamChatId ? staffChatHref("agent", teamChatId) : null;
  return [
    { href: "/agent", label: "Тойм", icon: LayoutDashboard, active: (p) => p === "/agent" },
    ...(crm
      ? [
          { href: MY_WORK_HREF, label: "Миний ажил", icon: ListTodo, active: (p: string) => starts(MY_WORK_HREF)(p) || starts("/agent/tasks")(p) },
          { href: "/agent/crm", label: "CRM", icon: Users, active: (p: string) => starts("/agent/crm")(p) && !starts(MY_WORK_HREF)(p) },
        ]
      : []),
    { href: "/agent/listings", label: "Миний зар", icon: Building2, active: starts("/agent/listings") },
    { href: "/agent/projects", label: "Төслүүд", icon: FolderKanban, active: starts("/agent/projects") },
    ...(crm ? [] : [{ href: "/agent/tasks", label: "Даалгавар", icon: ClipboardList, active: starts("/agent/tasks") }]),
    ...(teamChat && teamChatId
      ? [{ href: teamChat, label: TEAM_CHAT_LABEL, icon: MessageCircle, active: starts(teamChat), unread: { chatId: teamChatId } }]
      : []),
    {
      href: CHAT_HREF,
      label: "Чат",
      icon: MessagesSquare,
      active: (p: string) => starts(CHAT_HREF)(p) && !(teamChat && starts(teamChat)(p)),
      unread: { all: true },
    },
    { href: "/agent/profile", label: "Миний профайл", icon: UserCircle, active: starts("/agent/profile") },
  ];
}

export function DashboardNav() {
  const pathname = usePathname();
  const nav = React.useContext(AgentNavContext);
  const navRef = React.useRef<HTMLElement>(null);

  // Утсанд цэс хэвтээ гүйлгэгдэнэ: шууд нээсэн хуудасны (жишээ нь CRM-ийн доод цэснээс «Багийн чат») таб харагдана.
  React.useEffect(() => {
    navRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <nav ref={navRef} aria-label="Агентын цэс" className="flex gap-1 overflow-x-auto border-b border-line">
      {agentNavItems(nav).map(({ href, label, icon: Icon, active, unread }) => {
        const on = active(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition",
              on ? "border-brand-500 text-brand-600" : "border-transparent text-muted hover:text-ink"
            )}
          >
            <Icon className="size-4" /> {label}
            {unread ? (
              "chatId" in unread ? (
                <StaffChatUnreadBadge chatId={unread.chatId} />
              ) : (
                <StaffChatUnreadBadge excludeChatId={nav.teamChatId} />
              )
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
