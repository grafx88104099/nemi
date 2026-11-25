import type { Viewport } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/user";
import { getMyTeamChatId } from "@/lib/queries-team-chat";
import { OfficeSidebar, OfficeMobileNav } from "@/components/office/OfficeSidebar";
import { NotificationBell } from "@/components/layout/NotificationBell";

/**
 * Оффисын админ ч утсанд суулгасан аппаас (/agent/crm → /office/crm) ажилладаг. viewportFit "cover" нь
 * iOS-д env(safe-area-inset-*)-ийг идэвхжүүлнэ: толгой (дээд), энэ wrapper (зүүн/баруун), CRM-ийн доод
 * хурдан цэс ба sheet (доод) зай авна.
 */
export const viewport: Viewport = { viewportFit: "cover" };

export default async function OfficePanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  // Нэг хүсэлтэд нэг удаа (CRM layout-ийн getCrmStaffContext мөн ашиглана).
  const user = await getAuthUser();
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
  const [{ data: office }, { data: notes }, { count: unread }, { hasCrm, teamChatId }] = await Promise.all([
    supabase.from("offices").select("name").eq("id", profile.office_id).single(),
    supabase
      .from("notifications")
      // type — NotificationBell-ийн notificationHref (CRM1-ийн хуучин төрлийг CRM2 руу) хэрэглэнэ.
      .select("id, type, title, body, link, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
    // Багийн гишүүн бол «Багийн чат» (CRM-ийн бүрхүүл ч мөн уншина — нэг хүсэлтэд кэшлэгдэнэ).
    // Ажилтны мөр → багийн чат гинжийг бусад уншилттай зэрэг явуулна (өмнө нь тэднийг хүлээдэг байв).
    (async () => {
      const { data: staff } = await supabase
        .from("crm_staff")
        .select("profile_id, team_id")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .limit(1);
      return {
        hasCrm: (staff ?? []).length > 0,
        teamChatId: await getMyTeamChatId(staff?.[0]?.team_id ?? null),
      };
    })(),
  ]);
  const officeName = office?.name ?? "Оффис";
  const email = user.email ?? "";

  return (
    <div className="flex min-h-screen bg-bg pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <OfficeSidebar officeName={officeName} email={email} unread={unread ?? 0} hasCrm={hasCrm} teamChatId={teamChatId} />
      <main className="min-w-0 flex-1 overflow-x-clip">
        {/* backdrop-blur ХЭРЭГЛЭХГҮЙ: backdrop-filter нь fixed элементийн хүрээг толгой болгож,
            утасны «Цэс» drawer (OfficeMobileNav) 56px өндөрт хавчигдаж цэсний холбоосууд харагддаггүй байсан.
            z-40: drawer толгойн stacking context дотор тул CRM-ийн доод хурдан цэсний (z-30) дээр гарна.
            Өндөр = 3.5rem + дээд safe-area (border-box тул padding өндөрт багтана). */}
        <header className="sticky top-0 z-40 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-2 border-b border-line bg-surface px-3 pt-[env(safe-area-inset-top)] md:px-6">
          <OfficeMobileNav
            officeName={officeName}
            email={email}
            unread={unread ?? 0}
            hasCrm={hasCrm}
            teamChatId={teamChatId}
          />
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
