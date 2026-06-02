import Link from "next/link";
import { Users, Building2, UserCheck, Home, Inbox, Clock } from "lucide-react";

import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Backoffice — Нэми" };

export default async function AdminOverview() {
  const supabase = await createClient();

  const [users, offices, agentsActive, agentsPending, listings, reqPending] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("offices").select("*", { count: "exact", head: true }),
    supabase.from("agents").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("agents").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("listings").select("*", { count: "exact", head: true }),
    supabase.from("office_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const stats = [
    { label: "Хэрэглэгч", value: users.count ?? 0, icon: Users, href: "/admin/users" },
    { label: "Оффис", value: offices.count ?? 0, icon: Building2, href: "/admin/offices" },
    { label: "Идэвхтэй агент", value: agentsActive.count ?? 0, icon: UserCheck, href: "/admin/agents" },
    { label: "Зар", value: listings.count ?? 0, icon: Home, href: "/admin/listings" },
  ];

  const alerts = [
    { label: "Хүлээгдэж буй оффис хүсэлт", value: reqPending.count ?? 0, icon: Inbox, href: "/admin/office-requests" },
    { label: "Батлах хүлээж буй агент", value: agentsPending.count ?? 0, icon: Clock, href: "/admin/agents" },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Хяналтын самбар</h1>
      <p className="text-sm text-muted">Системийн ерөнхий байдал</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-2xl border border-line bg-surface p-5 shadow-sm transition hover:shadow-md">
            <s.icon className="size-5 text-brand-600" />
            <div className="mt-2 text-3xl font-extrabold text-ink">{s.value}</div>
            <div className="text-sm text-muted">{s.label}</div>
          </Link>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-bold text-ink">Анхаарал шаардсан</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {alerts.map((a) => (
          <Link key={a.label} href={a.href} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm transition hover:shadow-md">
            <div className={`flex size-11 items-center justify-center rounded-xl ${a.value > 0 ? "bg-amber-100 text-amber-700" : "bg-surface-2 text-muted"}`}>
              <a.icon className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-ink">{a.value}</div>
              <div className="text-sm text-muted">{a.label}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
