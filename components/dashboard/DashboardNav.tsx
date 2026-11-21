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
  MessagesSquare,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { StaffChatUnreadBadge } from "@/components/staff-chat/StaffChatUnreadBadge";

const CHAT_HREF = "/agent/chat";
const MY_WORK_HREF = "/agent/crm/my-work";

/** Агентын layout-аас: CRM-ийн ажилтан эсэх (цэсийг тохируулахад). */
const AgentNavContext = React.createContext<{ crm: boolean }>({ crm: false });

export function AgentNavProvider({ crm, children }: { crm: boolean; children: React.ReactNode }) {
  return <AgentNavContext.Provider value={{ crm }}>{children}</AgentNavContext.Provider>;
}

type Item = { href: string; label: string; icon: LucideIcon; active: (p: string) => boolean };

const starts = (prefix: string) => (p: string) => p === prefix || p.startsWith(prefix + "/");

/**
 * Агентын дээд цэс. CRM-ийн ажилтанд «Даалгавар» тусдаа цэс биш — оффисын
 * даалгавар CRM «Миний ажил»-д дараагийн алхмуудтайгаа нэг жагсаалтад
 * харагдана. CRM-гүй оффисын агентад хуучнаараа.
 */
function itemsFor(crm: boolean): Item[] {
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
    { href: CHAT_HREF, label: "Чат", icon: MessagesSquare, active: starts(CHAT_HREF) },
    { href: "/agent/profile", label: "Миний профайл", icon: UserCircle, active: starts("/agent/profile") },
  ];
}

export function DashboardNav() {
  const pathname = usePathname();
  const { crm } = React.useContext(AgentNavContext);
  return (
    <nav aria-label="Агентын цэс" className="flex gap-1 overflow-x-auto border-b border-line">
      {itemsFor(crm).map(({ href, label, icon: Icon, active }) => {
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
            {href === CHAT_HREF ? <StaffChatUnreadBadge /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
