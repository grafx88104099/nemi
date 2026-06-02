import Link from "next/link";
import { Plus, Heart, User } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/button";
import { UserMenu } from "@/components/layout/UserMenu";
import { NavLinks } from "@/components/layout/NavLinks";
import { NotificationBell } from "@/components/layout/NotificationBell";

export async function Topbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: { full_name: string | null; role: string } | null = null;
  let notes: { id: string; title: string | null; body: string | null; link: string | null; read_at: string | null; created_at: string }[] = [];
  if (user) {
    const [{ data: p }, { data: n }] = await Promise.all([
      supabase.from("profiles").select("full_name, role").eq("id", user.id).single(),
      supabase
        .from("notifications")
        .select("id, title, body, link, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    profile = p;
    notes = n ?? [];
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <Link href="/" className="shrink-0">
          <Logo color="#0F172A" className="h-7 w-auto" />
        </Link>
        <NavLinks />
        <div className="ml-auto flex items-center gap-2">
          <ButtonLink
            href="/agent/listings/new"
            variant="ghost"
            size="sm"
            className="hidden lg:inline-flex"
          >
            <Plus className="size-4" /> Зар оруулах
          </ButtonLink>
          {user ? (
            <>
              <NotificationBell initial={notes} />
              <UserMenu
                name={profile?.full_name ?? ""}
                email={user.email ?? ""}
                role={profile?.role ?? "buyer"}
              />
            </>
          ) : (
            <>
              <ButtonLink
                href="/favorites"
                variant="secondary"
                size="sm"
                className="hidden sm:inline-flex"
              >
                <Heart className="size-4" /> Хадгалсан
              </ButtonLink>
              <ButtonLink href="/login" variant="primary" size="sm">
                <User className="size-4" /> Нэвтрэх
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
