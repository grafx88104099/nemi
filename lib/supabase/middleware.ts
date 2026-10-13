import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Хүсэлт бүрт хэрэглэгчийн session-ийг шинэчилж, cookie-г дамжуулна.
 * Хамгаалагдсан замуудыг (dashboard, account гэх мэт) энд хаалт хийнэ.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Supabase env тохируулаагүй бол (Phase 0 / local) session шалгалтыг алгасна.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // ВАЖНО: getUser()-ийн өмнө ямар ч логик бүү бич — session refresh энд хийгдэнэ.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Backoffice (/admin) — тусдаа нэвтрэлт (/admin/login)
  if (path.startsWith("/admin") && path !== "/admin/login" && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Оффисын портал (/office, /office/*) — тусдаа нэвтрэлт (/office/login).
  // ТЭМДЭГЛЭЛ: "/office/" (зураастай) ашиглана — нийтийн "/offices", "/office-signup"-ийг барихгүй.
  const inOfficeArea = path === "/office" || path.startsWith("/office/");
  if (inOfficeArea && path !== "/office/login" && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/office/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // CRM §1.1(г) — эрхийн тэлэлтийн хаалт: panel_admin=false CRM ажилтанд оффис
  // панелийн CRM-ээс ГАДУУРХ хуудсууд хаалттай → /office/crm руу буцаана.
  // (Бичих эрх нь DB түвшинд crm_is_panel_admin() policy-уудаар аль хэдийн
  // нарийссан — энэ нь навигацийн давхар хаалт. crm_staff хүснэгт байхгүй /
  // мөргүй / panel_admin=true бол хуучин зан төлөв хэвээр.)
  const inCrmArea = path === "/office/crm" || path.startsWith("/office/crm/");
  if (user && inOfficeArea && !inCrmArea && path !== "/office/login") {
    const { data: crmStaff } = await supabase
      .from("crm_staff")
      .select("panel_admin")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (crmStaff && crmStaff.panel_admin === false) {
      const url = request.nextUrl.clone();
      url.pathname = "/office/crm";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Агентын талбар (/agent, /agent/*) — агентын нэвтрэлт (/agent/login).
  // ТЭМДЭГЛЭЛ: "/agent/" (зураастай) ашиглана — нийтийн "/agents"-ийг барихгүй.
  const inAgentArea = path === "/agent" || path.startsWith("/agent/");
  if (inAgentArea && path !== "/agent/login" && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/agent/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Бусад энгийн хамгаалагдсан замууд (худалдан авагч/нийтлэг).
  const protectedPrefixes = ["/account", "/office-signup"];
  if (protectedPrefixes.some((p) => path.startsWith(p)) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
