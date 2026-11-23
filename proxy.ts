import { userAgent, type NextRequest, type NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";
import {
  ATTR_COOKIE,
  ATTR_MAX_AGE_S,
  encodeAttribution,
  parseUtm,
  shouldStampAttribution,
} from "@/lib/attribution";

export async function proxy(request: NextRequest) {
  // Session refresh (getUser) ЭХЭНД — түүний өмнө ямар ч логик бүү нэм.
  const response = await updateSession(request);
  stampAttribution(request, response);
  return response;
}

/**
 * R10: utm_source-той GET хүсэлтэд first-party nemi_attr cookie (30 хоног, httpOnly,
 * PII-гүй). Сүүлийн шууд бус хандалт ялна. /api/*, мөлхөгч, DNT/GPC үед тавихгүй.
 * updateSession-ийн redirect хариуд ч ажиллана (NextResponse.redirect нь .cookies-тэй).
 */
function stampAttribution(request: NextRequest, response: NextResponse) {
  // Хямд эхний шүүлт: utm_source-гүй хүсэлтэд UA задлахгүй.
  if (!request.nextUrl.searchParams.has("utm_source")) return;
  const get = (n: string) => request.headers.get(n);
  if (
    !shouldStampAttribution({
      method: request.method,
      pathname: request.nextUrl.pathname,
      get,
      nextIsBot: userAgent(request).isBot,
    })
  ) {
    return;
  }
  const a = parseUtm(request.nextUrl.searchParams);
  if (!a) return;
  response.cookies.set(ATTR_COOKIE, encodeAttribution(a), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ATTR_MAX_AGE_S,
  });
}

export const config = {
  matcher: [
    /*
     * Дараахаас бусад бүх замд ажиллана:
     * - _next/static, _next/image (статик)
     * - favicon, зураг
     * - sitemap.xml, robots.txt (мөлхөгчид session хэрэггүй → Supabase getUser() дуудахгүй)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
