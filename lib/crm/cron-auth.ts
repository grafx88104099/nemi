/**
 * Cron endpoint-ийн хамгаалалт. Vercel Cron нь CRON_SECRET тохируулсан үед
 * `Authorization: Bearer <secret>` илгээдэг — ЗӨВХӨН энэ толгойг хүлээн авна.
 * `?key=<secret>` (query string) хүлээн авахгүй: URL лог, referrer, хөтчийн түүхэнд үлддэг.
 *
 * Deploy хийсэн орчинд (Vercel production/preview, `next start`) CRON_SECRET
 * тохируулаагүй бол хаалттай (503): эдгээр route мэдэгдэл илгээх, AI дуудах зэрэг
 * бичих үйлдэл хийдэг тул интернэтээс хэн ч дуудаж болохгүй. `next dev`-д нээлттэй.
 */
export function cronAuthError(
  request: Request,
  env: { CRON_SECRET?: string; VERCEL_ENV?: string; NODE_ENV?: string } = process.env
): { status: number; error: string } | null {
  const secret = env.CRON_SECRET;
  if (!secret) {
    const deployed = Boolean(env.VERCEL_ENV) || env.NODE_ENV === "production";
    return deployed ? { status: 503, error: "CRON_SECRET тохируулаагүй" } : null;
  }
  const auth = request.headers.get("authorization") ?? "";
  return safeEqual(auth, `Bearer ${secret}`) ? null : { status: 401, error: "unauthorized" };
}

/** Тогтмол хугацааны харьцуулалт (нууцын тэмдэгтийг хариуны хугацаагаар таахаас сэргийлнэ). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
