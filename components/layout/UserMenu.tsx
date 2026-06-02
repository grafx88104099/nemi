"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Heart, Settings, LogOut, MessageCircle } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/avatar";

export function UserMenu({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const initials = (name || email || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isAgent = role === "agent";
  const isOffice = role === "office_admin" || role === "admin";
  const isAdmin = role === "admin";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-surface-2"
      >
        <Avatar initials={initials} size="sm" color="#0F172A" />
        <span className="hidden text-sm font-medium text-ink sm:block">
          {name || email.split("@")[0]}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
          <div className="border-b border-line px-4 py-2.5">
            <p className="truncate text-sm font-semibold text-ink">{name || "Хэрэглэгч"}</p>
            <p className="truncate text-xs text-muted">{email}</p>
          </div>
          {isAgent && (
            <MenuLink href="/agent" icon={<LayoutDashboard className="size-4" />}>
              Агентын самбар
            </MenuLink>
          )}
          {isOffice && (
            <MenuLink href="/office" icon={<LayoutDashboard className="size-4" />}>
              Оффисын самбар
            </MenuLink>
          )}
          {isAdmin && (
            <MenuLink href="/admin" icon={<LayoutDashboard className="size-4" />}>
              Админ самбар
            </MenuLink>
          )}
          <MenuLink href="/messages" icon={<MessageCircle className="size-4" />}>
            Чат
          </MenuLink>
          <MenuLink href="/favorites" icon={<Heart className="size-4" />}>
            Хадгалсан
          </MenuLink>
          <MenuLink href="/account" icon={<Settings className="size-4" />}>
            Миний профайл
          </MenuLink>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-danger hover:bg-surface-2"
          >
            <LogOut className="size-4" /> Гарах
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink hover:bg-surface-2"
    >
      {icon}
      {children}
    </Link>
  );
}
