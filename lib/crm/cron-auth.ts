/**
 * CRM cron endpoint-ийн хамгаалалт. Vercel Cron нь CRON_SECRET тохируулсан үед
 * `Authorization: Bearer <secret>` илгээдэг; гадаад scheduler `?key=<secret>` ашиглана.
 *
 * Deploy хийсэн орчинд (Vercel production/preview, `next start`) CRON_SECRET
 * тохируулаагүй бол хаалттай: эдгээр route нэхэмжлэх үүсгэх, мэдэгдэл илгээх зэрэг
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
  const auth = request.headers.get("authorization");
  const key = new URL(request.url).searchParams.get("key");
  return auth === `Bearer ${secret}` || key === secret ? null : { status: 401, error: "unauthorized" };
}
