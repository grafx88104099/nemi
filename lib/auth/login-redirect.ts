/**
 * Proxy (lib/supabase/middleware.ts)-ийн нэвтрэх redirect-ийн цэвэр туслах.
 * Supabase импортгүй — vitest-ээр шалгана.
 *
 * `next` нь анхны зам + query-г бүтнээр хадгална; анхны query нэвтрэх URL дээр
 * давхар үлдэхгүй (url.search-ийг цэвэрлэнэ), hash хаягдана.
 * NextURL нь runtime-д URL-ийн дэд төрөл тул `href`-ээр хуулна.
 */
export function buildLoginRedirectUrl(nextUrl: URL, loginPath: string): URL {
  const url = new URL(nextUrl.href);
  const back = nextUrl.pathname + nextUrl.search;
  url.pathname = loginPath;
  url.search = "";
  url.hash = "";
  url.searchParams.set("next", back);
  return url;
}
