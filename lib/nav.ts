/**
 * `?next=` параметрийг аюулгүй болгох — зөвхөн өгөгдсөн prefix-тэй дотоод
 * зам зөвшөөрнө (open-redirect, login-loop-оос сэргийлнэ).
 *
 * Хөтөч URL-ийг задлан шинжлэхдээ `\`-ийг `/` болгож, таб/мөр шилжилтийг
 * хаядаг тул `/\evil.com` мэтийг гараар шалгаж барьж болохгүй. Иймд URL-ээр
 * нь задлаад гарал үүсэл (origin) өөрчлөгдсөн эсэхийг шалгана.
 */
const BASE = "http://nemi.invalid";

export function safeNext(
  next: string | undefined,
  prefix: string,
  fallback: string
): string {
  if (!next) return fallback;

  let path: string;
  try {
    const url = new URL(next, BASE);
    // Үнэмлэхүй хаяг, `//evil.com`, `/\evil.com`, `javascript:` → өөр origin.
    if (url.origin !== BASE) return fallback;
    path = `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }

  if (!path.startsWith(prefix)) return fallback;
  // Нэвтрэх хуудас руу буцаахгүй (давталт).
  const loginPath = prefix === "/" ? "/login" : `${prefix}/login`;
  if (path === loginPath) return fallback;

  return path;
}
