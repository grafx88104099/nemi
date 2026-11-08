"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  Briefcase,
  ClipboardList,
  ExternalLink,
  FolderKanban,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  UserCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";
import { Drawer } from "@/components/ui/drawer";
import { LogoutButton } from "@/components/auth/LogoutButton";

const items = [
  { href: "/office", label: "Хяналтын самбар", icon: LayoutDashboard },
  { href: "/office/about", label: "Танилцуулга", icon: BookOpen },
  { href: "/office/agents", label: "Агентууд", icon: UserCheck },
  { href: "/office/tasks", label: "Даалгавар", icon: ClipboardList },
  { href: "/office/crm", label: "CRM", icon: Briefcase },
  { href: "/office/projects", label: "Төсөл", icon: FolderKanban },
  { href: "/office/listings", label: "Зарууд", icon: Home },
  { href: "/office/settings", label: "Тохиргоо", icon: Settings },
];

const NOTIFICATIONS_HREF = "/office/crm/notifications";

type NavProps = { officeName: string; email: string; unread?: number; hasCrm?: boolean };

function NavList({ unread = 0, hasCrm = false, onNavigate }: { unread?: number; hasCrm?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => {
    if (href === "/office") return pathname === "/office";
    // CRM-ийн мэдэгдлийн хуудас «CRM»-ийг давхар идэвхжүүлэхгүй.
    if (href === "/office/crm" && pathname.startsWith(NOTIFICATIONS_HREF)) return false;
    return pathname.startsWith(href);
  };
  const linkClass = (active: boolean) =>
    cn(
      "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
      active ? "bg-brand-50 text-brand-700" : "text-ink hover:bg-surface-2"
    );

  return (
    <nav className="flex-1 space-y-1 p-3">
      {items.map((it) => (
        <Link key={it.href} href={it.href} onClick={onNavigate} className={linkClass(isActive(it.href))}>
          <it.icon className="size-4" /> {it.label}
        </Link>
      ))}
      {hasCrm ? (
        <Link href={NOTIFICATIONS_HREF} onClick={onNavigate} className={linkClass(isActive(NOTIFICATIONS_HREF))}>
          <Bell className="size-4" /> Мэдэгдэл
          {unread > 0 ? (
            <span className="ml-auto rounded-full bg-brand-500 px-1.5 text-[11px] font-bold leading-5 text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Link>
      ) : null}
      <Link
        href="/"
        onClick={onNavigate}
        className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2"
      >
        <ExternalLink className="size-4" /> Сайт руу
      </Link>
    </nav>
  );
}

function AccountFooter({ email }: { email: string }) {
  return (
    <div className="border-t border-line p-3">
      <p className="truncate px-3 pb-2 text-xs text-subtle">{email}</p>
      <LogoutButton className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-rose-50">
        <LogOut className="size-4" /> Гарах
      </LogoutButton>
    </div>
  );
}

/** Ширээний дэлгэцийн зүүн цэс (md-ээс дээш). */
export function OfficeSidebar({ officeName, email, unread = 0, hasCrm = false }: NavProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-line px-5">
        <Logo color="#0F172A" className="h-6 w-auto" />
      </div>
      <div className="border-b border-line px-5 py-3">
        <div className="text-xs text-subtle">Оффис</div>
        <div className="truncate text-sm font-bold text-ink">{officeName}</div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <NavList unread={unread} hasCrm={hasCrm} />
      </div>
      <AccountFooter email={email} />
    </aside>
  );
}

/** Гар утасны цэс: толгойн товч → хажуугийн цонх (md-ээс доош). */
export function OfficeMobileNav({ officeName, email, unread = 0, hasCrm = false }: NavProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2 md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex size-11 items-center justify-center rounded-lg text-ink hover:bg-surface-2"
        aria-label="Цэс нээх"
      >
        <Menu className="size-5" />
        {unread > 0 ? <span className="absolute right-2 top-2 size-2 rounded-full bg-brand-500" aria-hidden /> : null}
      </button>
      <span className="max-w-[45vw] truncate text-sm font-bold text-ink">{officeName}</span>
      <Drawer open={open} onClose={() => setOpen(false)} title="Цэс" widthClassName="max-w-xs">
        <div className="-m-5 flex min-h-[calc(100%+2.5rem)] flex-col">
          <NavList unread={unread} hasCrm={hasCrm} onNavigate={() => setOpen(false)} />
          <AccountFooter email={email} />
        </div>
      </Drawer>
    </div>
  );
}
