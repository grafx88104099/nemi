import Link from "next/link";
import { Plus, Heart, User } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/user";
import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { Logo } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/button";
import { UserMenu } from "@/components/layout/UserMenu";
import { NavLinks } from "@/components/layout/NavLinks";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { LoginLink } from "@/components/layout/LoginLink";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { formatPhone } from "@/lib/crm2/phone";

/**
 * `site` — ЗӨВХӨН нийтийн сайтын app/(site)/layout.tsx дамжуулна: гар утасны
 * доод цэс, «Цэс» drawer, уншаагүй мессежийн тоо. Агентын самбар `site`-гүй
 * дууддаг тул өмнөхтэй яг ижил зурагдана. Өөр layout-д `site` бүү дамжуул.
 */
export async function Topbar({ site = false }: { site?: boolean } = {}) {
  const supabase = await createClient();
  // Нэг хүсэлтэд нэг удаа (layout, хуудас мөн ашиглана).
  const user = await getAuthUser();

  let profile: { full_name: string | null; role: string; avatar_url: string | null } | null = null;
  let notes: {
    id: string;
    type: string | null;
    title: string | null;
    body: string | null;
    link: string | null;
    read_at: string | null;
    created_at: string;
  }[] = [];
  let unreadMessages = 0;
  let crmStaff = false;
  if (user) {
    const [{ data: p }, { data: n }, { count }, crm] = await Promise.all([
      supabase.from("profiles").select("full_name, role, avatar_url").eq("id", user.id).single(),
      supabase
        .from("notifications")
        .select("id, type, title, body, link, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      site
        ? supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("type", "message")
            .is("read_at", null)
        : Promise.resolve({ count: 0 as number | null }),
      // Агентын самбар: CRM ажилтны лого CRM руу (layout-тай нэг уншилт — cache).
      site ? Promise.resolve(null) : getCrmStaffContext(),
    ]);
    profile = p;
    notes = n ?? [];
    unreadMessages = count ?? 0;
    crmStaff = !!crm;
  }
  const sellHref = profile?.role === "agent" || profile?.role === "office_admin" ? "/agent/listings" : "/sell";
  // Утсанд суулгасан апп (start_url /agent/crm) хаягийн мөргүй — лого нийтийн нүүр рүү гаргаж апп-аас
  // «төөрүүлдэг» байсан. CRM ажилтанд CRM-ийн эхлэл, бусдад өмнөх шигээ нүүр хуудас.
  const panelHome = crmStaff ? "/agent/crm" : "/";

  return (
    <>
      {/* Сайт: цул цөцгий фон (blur-гүй — гүйлгэхэд GPU ачаалалгүй), iOS notch-ийн дээд зай.
          Агентын самбар (site=false): мөн дээд зай — layout нь viewportFit "cover" идэвхжүүлдэг. */}
      <header
        className={
          site
            ? "sticky top-0 z-40 border-b border-line bg-bg pt-[env(safe-area-inset-top)]"
            : "sticky top-0 z-40 border-b border-line bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur"
        }
      >
        <div className={site ? "mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 md:h-16" : "mx-auto flex h-16 max-w-7xl items-center gap-6 px-4"}>
          {site ? (
            <div className="flex shrink-0 items-center">
              <Link href="/" aria-label="Нэми — нүүр хуудас" className="shrink-0 text-ink">
                <Logo color="currentColor" className="h-7 w-auto text-ink" />
              </Link>
              {/* Холбоосоос гадна: холбоосын нэр (aria-label) харагдах үгийг агуулах дүрэм (WCAG 2.5.3). */}
              {/* xl-ээс: lg (1024px) дээр «Зар оруулах»-тай хамт header-ийг хэтрүүлдэг байсан. */}
              <span className="ml-3 hidden text-[11px] font-semibold uppercase tracking-[0.08em] text-muted xl:inline">
                Улаанбаатар
              </span>
            </div>
          ) : (
            <Link href={panelHome} aria-label={crmStaff ? "Нэми — CRM" : "Нэми — нүүр хуудас"} className="shrink-0">
              <Logo color="#0F172A" className="h-7 w-auto" />
            </Link>
          )}
          <NavLinks />
          <div className="ml-auto flex items-center gap-2">
            {/* Зөвхөн агент/оффис → агентын самбар. Бусдад цэсний «Зар өгөх» (/sell) байгаа тул давхардуулахгүй. */}
            {sellHref !== "/sell" ? (
              <ButtonLink href={sellHref} variant="ghost" size="sm" className="hidden whitespace-nowrap lg:inline-flex">
                <Plus className="size-4" /> Зар оруулах
              </ButtonLink>
            ) : null}
            {user ? (
              <>
                <NotificationBell initial={notes} />
                <UserMenu
                  userId={user.id}
                  name={profile?.full_name ?? ""}
                  email={user.email ?? ""}
                  phone={user.phone ? formatPhone(user.phone) : ""}
                  role={profile?.role ?? "buyer"}
                  avatarUrl={profile?.avatar_url ?? null}
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
                <LoginLink variant={site ? "cta" : "primary"} size="sm">
                  <User className="size-4" /> Нэвтрэх
                </LoginLink>
              </>
            )}
            {site ? <MobileMenu sellHref={sellHref} /> : null}
          </div>
        </div>
      </header>
      {site ? <MobileTabBar signedIn={!!user} unreadMessages={unreadMessages} /> : null}
    </>
  );
}
