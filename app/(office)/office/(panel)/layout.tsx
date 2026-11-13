import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { OfficeSidebar, OfficeMobileNav } from "@/components/office/OfficeSidebar";
import { NotificationBell } from "@/components/layout/NotificationBell";

export default async function OfficePanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/office/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, office_id")
    .eq("id", user.id)
    .single();

  if ((profile?.role !== "office_admin" && profile?.role !== "admin") || !profile?.office_id) {
    redirect("/office/login");
  }

  // Удирдлагын хонх (§6.28): CRM-ийн сануулга, эскалаци оффисын панелд ч хүрнэ.
  const [{ data: office }, { data: notes }, { count: unread }, { data: staff }] = await Promise.all([
    supabase.from("offices").select("name").eq("id", profile.office_id).single(),
    supabase
      .from("notifications")
      .select("id, title, body, link, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
    supabase.from("crm_staff").select("profile_id").eq("profile_id", user.id).eq("is_active", true).limit(1),
  ]);
  const officeName = office?.name ?? "Оффис";
  const email = user.email ?? "";
  const hasCrm = (staff ?? []).length > 0;

  return (
    <div className="flex min-h-screen bg-bg">
      <OfficeSidebar officeName={officeName} email={email} unread={unread ?? 0} hasCrm={hasCrm} />
      <main className="min-w-0 flex-1 overflow-x-clip">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur md:px-6">
          <OfficeMobileNav officeName={officeName} email={email} unread={unread ?? 0} hasCrm={hasCrm} />
          <div className="ml-auto flex items-center gap-1">
            {hasCrm ? (
              <Link
                href="/office/crm/notifications"
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-ink sm:inline-flex"
              >
                Бүх мэдэгдэл
              </Link>
            ) : null}
            <NotificationBell initial={notes ?? []} panel="office" />
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
