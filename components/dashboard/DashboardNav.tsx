"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2, Users, UserCircle, FolderKanban } from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  ["/agent", "Тойм", LayoutDashboard],
  ["/agent/listings", "Миний зар", Building2],
  ["/agent/leads", "Лид (CRM)", Users],
  ["/agent/projects", "Төслүүд", FolderKanban],
  ["/agent/profile", "Миний профайл", UserCircle],
] as const;

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-line">
      {items.map(([href, label, Icon]) => {
        const active = href === "/agent" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition",
              active ? "border-brand-500 text-brand-600" : "border-transparent text-muted hover:text-ink"
            )}
          >
            <Icon className="size-4" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
