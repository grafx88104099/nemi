"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CheckCheck,
  Clock3,
  ListTodo,
  Settings2,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { CrmNavIcon, CrmNavItem } from "./menu";

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
  approvals: CheckCheck,
};

function isActive(pathname: string, href: string, matchPrefix: string): boolean {
  return pathname === href || pathname.startsWith(`${matchPrefix}/`) || pathname === matchPrefix;
}

/**
 * CRM-ийн хэвтээ цэс (хоёр панельд ижил). Үндсэн 7 хэсэг зурагны дарааллаар,
 * дараа нь туслах хэсгүүд. Утсанд хэвтээ гүйлгэнэ; идэвхтэй таб харагдах хэсэгт гүйлгэгдэнэ.
 * Харагдах эсэхийг сервер (эрхээр) шийдэж items-ээр дамжуулна.
 */
export function CrmNav({ primary, secondary }: { primary: CrmNavItem[]; secondary: CrmNavItem[] }) {
  const pathname = usePathname() ?? "";
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  const render = (it: CrmNavItem, secondaryItem: boolean) => {
    const Icon = ICON[it.icon];
    const active = isActive(pathname, it.href, it.matchPrefix ?? it.href);
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
        <span className="whitespace-nowrap">{it.label}</span>
        {it.badge ? (
          <span className="rounded-full bg-brand-50 px-1.5 text-xs font-semibold text-brand-700">{it.badge}</span>
        ) : null}
      </Link>
    );
  };

  return (
    <nav aria-label="CRM цэс" className="-mb-px">
      <div
        ref={listRef}
        className="flex items-center gap-0.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {primary.map((it) => render(it, false))}
        {secondary.length ? <span className="mx-2 h-5 w-px shrink-0 bg-line" aria-hidden /> : null}
        {secondary.map((it) => render(it, true))}
      </div>
    </nav>
  );
}
