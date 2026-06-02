"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, UserCheck, Home, Settings, LogOut, ExternalLink, BookOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";
import { LogoutButton } from "@/components/auth/LogoutButton";

const items = [
  { href: "/office", label: "Хяналтын самбар", icon: LayoutDashboard },
  { href: "/office/about", label: "Танилцуулга", icon: BookOpen },
  { href: "/office/agents", label: "Агентууд", icon: UserCheck },
  { href: "/office/listings", label: "Зарууд", icon: Home },
  { href: "/office/settings", label: "Тохиргоо", icon: Settings },
];

export function OfficeSidebar({ officeName, email }: { officeName: string; email: string }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex h-16 items-center gap-2 border-b border-line px-5">
        <Logo color="#0F172A" className="h-6 w-auto" />
      </div>
      <div className="border-b border-line px-5 py-3">
        <div className="text-xs text-subtle">Оффис</div>
        <div className="truncate text-sm font-bold text-ink">{officeName}</div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {items.map((it) => {
          const active = it.href === "/office" ? pathname === "/office" : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                active ? "bg-brand-50 text-brand-700" : "text-ink hover:bg-surface-2"
              )}
            >
              <it.icon className="size-4" /> {it.label}
            </Link>
          );
        })}
        <Link href="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2">
          <ExternalLink className="size-4" /> Сайт руу
        </Link>
      </nav>
      <div className="border-t border-line p-3">
        <p className="truncate px-3 pb-2 text-xs text-subtle">{email}</p>
        <LogoutButton className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-rose-50">
          <LogOut className="size-4" /> Гарах
        </LogoutButton>
      </div>
    </aside>
  );
}
