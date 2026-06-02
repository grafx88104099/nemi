import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart, Bookmark, Clock, CalendarDays, Home as HomeIcon, KeyRound, Users, ArrowRight } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ProfileForm } from "@/components/account/ProfileForm";

export const metadata = { title: "Миний профайл — Нэми" };

const SECTIONS: { href: string; label: string; desc: string; icon: typeof Heart }[] = [
  { href: "/favorites", label: "Хадгалсан зар", desc: "Дуртай зараа нэг дороос", icon: Heart },
  { href: "/saved-searches", label: "Хадгалсан хайлт", desc: "Хайлтаа хадгалж, мэдэгдэл аваарай", icon: Bookmark },
  { href: "/recently-viewed", label: "Сүүлд үзсэн", desc: "Саяхан үзсэн зарууд", icon: Clock },
  { href: "/tours", label: "Үзлэгийн цаг", desc: "Товлосон үзлэгүүд", icon: CalendarDays },
  { href: "/my-home", label: "Миний гэр", desc: "Гэрийн үнэлгээ, хяналт", icon: HomeIcon },
  { href: "/your-rental", label: "Миний түрээс", desc: "Түрээсийн мэдээлэл", icon: KeyRound },
  { href: "/my-team", label: "Миний баг", desc: "Холбоотой агентууд", icon: Users },
];

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, role")
    .eq("id", user.id)
    .single();

  const name = profile?.full_name || user.email?.split("@")[0] || "Хэрэглэгч";
  const initials = name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Толгой */}
      <div className="flex items-center gap-4">
        <Avatar initials={initials} size="lg" color="#0F172A" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold text-ink">{name}</h1>
          <p className="truncate text-sm text-muted">{user.email}</p>
        </div>
        <Badge tone="brand">{profile?.role ?? "buyer"}</Badge>
      </div>

      {/* Хурдан холбоосууд */}
      <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-subtle">Миний хэсгүүд</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition hover:border-brand-200 hover:shadow-sm"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-500 group-hover:text-white">
              <s.icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">{s.label}</div>
              <div className="truncate text-xs text-muted">{s.desc}</div>
            </div>
            <ArrowRight className="size-4 text-subtle transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
          </Link>
        ))}
      </div>

      {/* Дансны тохиргоо */}
      <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-subtle">Дансны тохиргоо</h2>
      <Card className="mt-3">
        <CardBody>
          <ProfileForm
            initial={{ full_name: profile?.full_name ?? "", phone: profile?.phone ?? "" }}
            email={user.email ?? ""}
          />
        </CardBody>
      </Card>
    </div>
  );
}
