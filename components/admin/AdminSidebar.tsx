"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2, Users, UserCheck, Home, Inbox, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";
import { LogoutButton } from "@/components/auth/LogoutButton";

const items = [
  { href: "/admin", label: "Хяналтын самбар", icon: LayoutDashboard },
  { href: "/admin/office-requests", label: "Оффис хүсэлт", icon: Inbox },
  { href: "/admin/offices", label: "Оффисууд", icon: Building2 },
  { href: "/admin/agents", label: "Агентууд", icon: UserCheck },
  { href: "/admin/listings", label: "Зар", icon: Home },
  { href: "/admin/users", label: "Хэрэглэгчид", icon: Users },
];

export function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-white/10 bg-ink text-white">
      <div className="flex h-16 items-center gap-2 border-b border-white/10 px-5">
        <Logo color="#fff" className="h-6 w-auto" />
        <span className="rounded bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold">ADMIN</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {items.map((it) => {
          const active = it.href === "/admin" ? pathname === "/admin" : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                active ? "bg-brand-500 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <it.icon className="size-4" /> {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <p className="truncate px-3 pb-2 text-xs text-white/40">{email}</p>
        <LogoutButton className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white">
          <LogOut className="size-4" /> Гарах
        </LogoutButton>
      </div>
    </aside>
  );
}
