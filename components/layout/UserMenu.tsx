"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, LayoutGrid, Heart, Home, Settings, LogOut, MessageCircle, Users } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { accountInitials } from "@/lib/avatar-upload";
import { Avatar } from "@/components/ui/avatar";
import { AvatarPicker } from "@/components/account/AvatarPicker";

export function UserMenu({
  userId,
  name,
  email,
  phone = "",
  role,
  avatarUrl = null,
}: {
  userId: string;
  name: string;
  email: string;
  /** Утсаар нэвтэрсэн хэрэглэгчийн харуулах дугаар (formatPhone). */
  phone?: string;
  role: string;
  /** profiles.avatar_url — бүртгэлийн зураг (цэсний толгойд дарж солино). */
  avatarUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [avatar, setAvatar] = useState(avatarUrl);
  const [seenAvatarUrl, setSeenAvatarUrl] = useState(avatarUrl);
  if (avatarUrl !== seenAvatarUrl) {
    setSeenAvatarUrl(avatarUrl);
    setAvatar(avatarUrl);
  }

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

  // Утсаар л нэвтэрсэн (нэр, и-мэйлгүй) бол цифр биш «Х» (Хэрэглэгч).
  const initials = accountInitials(name || (email.includes("@") ? email : ""));
  const label = name || (email ? email.split("@")[0] : phone);

  const isAgent = role === "agent";
  const isOffice = role === "office_admin" || role === "admin";
  const isAdmin = role === "admin";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Миний бүртгэл — ${label || "Хэрэглэгч"}`}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-surface-2"
      >
        <Avatar initials={initials} src={avatar} size="sm" color="#0F172A" alt="" />
        <span className="hidden text-sm font-medium text-ink sm:block">
          {label}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
          {/* Зураг дээр дарж шинэ зураг байршуулна (утсанд камер/цомог). */}
          <div className="flex flex-col items-center gap-1 border-b border-line px-4 pb-3 pt-3 text-center">
            <AvatarPicker userId={userId} initials={initials} src={avatar} size="lg" onChange={setAvatar} />
            <p className="mt-1 w-full truncate text-sm font-semibold text-ink">{name || "Хэрэглэгч"}</p>
            <p className="w-full truncate text-xs text-muted">{email || phone}</p>
          </div>
          {isAgent && (
            <>
              <MenuLink href="/agent" icon={<LayoutDashboard className="size-4" />}>
                Агентын самбар
              </MenuLink>
              <MenuLink href="/agent/crm" icon={<Users className="size-4" />}>
                CRM
              </MenuLink>
            </>
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
          <MenuLink href="/me" icon={<LayoutGrid className="size-4" />}>
            Миний Нэми
          </MenuLink>
          <MenuLink href="/messages" icon={<MessageCircle className="size-4" />}>
            Чат
          </MenuLink>
          <MenuLink href="/favorites" icon={<Heart className="size-4" />}>
            Хадгалсан
          </MenuLink>
          {!isAgent && !isOffice ? (
            <MenuLink href="/my-listings" icon={<Home className="size-4" />}>
              Миний зарууд
            </MenuLink>
          ) : null}
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
