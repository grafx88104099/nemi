/**
 * `?next=` параметрийг аюулгүй болгох — зөвхөн өгөгдсөн prefix-тэй дотоод
 * зам зөвшөөрнө (open-redirect, login-loop-оос сэргийлнэ).
 *
 * Хөтөч URL-ийг задлан шинжлэхдээ `\`-ийг `/` болгож, таб/мөр шилжилтийг
 * хаядаг тул `/\evil.com` мэтийг гараар шалгаж барьж болохгүй. Иймд URL-ээр
 * нь задлаад гарал үүсэл (origin) өөрчлөгдсөн эсэхийг шалгана.
 */
const BASE = "http://nemi.invalid";

/** `next`-ийн дээд урт — хэт урт query-гоор URL/cookie дүүргэхээс сэргийлнэ. */
const MAX_NEXT_LEN = 2048;

export function safeNext(
  next: string | undefined,
  prefix: string,
  fallback: string
): string {
  if (!next) return fallback;
  if (next.length > MAX_NEXT_LEN) return fallback;

  let url: URL;
  let path: string;
  try {
    url = new URL(next, BASE);
    // Үнэмлэхүй хаяг, `//evil.com`, `/\evil.com`, `javascript:` → өөр origin.
    if (url.origin !== BASE) return fallback;
    path = `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }

  if (!path.startsWith(prefix)) return fallback;
  // Нэвтрэх/бүртгүүлэх хуудас руу буцаахгүй (давталт). Query-г үл харгалзан
  // pathname-аар шалгана: `/login?next=/x` ч давталт.
  const loginPath = prefix === "/" ? "/login" : `${prefix}/login`;
  if (url.pathname === loginPath) return fallback;
  if (
    prefix === "/" &&
    (url.pathname === "/signup" ||
      url.pathname === "/forgot-password" ||
      url.pathname.startsWith("/auth/"))
  ) {
    return fallback;
  }
  // ТЭМДЭГЛЭЛ: /reset-password-ийг санаатай зөвшөөрнө (auth/confirm next=/reset-password).

  return path;
}

/** Нэвтрэх хуудасны холбоос: `loginHref("/listings?q=1")` → `/login?next=%2Flistings%3Fq%3D1`. */
export function loginHref(next: string, base = "/login"): string {
  return `${base}?next=${encodeURIComponent(next)}`;
}

/** Хөтчийн одоогийн зам + query (сервер дээр «/»). Зөвхөн клиентийн үйлдлээс дуудна. */
export function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}

/** Нэвтрэлтийн урсгалын хуудас уу (query-г хасаж pathname-аар). */
export function isAuthPath(p: string): boolean {
  const pathname = p.split(/[?#]/, 1)[0];
  return (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/auth/")
  );
}
