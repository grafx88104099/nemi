import { createHash, randomUUID } from "node:crypto";

import { after, NextResponse, userAgent, type NextRequest } from "next/server";

import {
  ATTR_COOKIE,
  ATTR_MAX_AGE_S,
  SID_COOKIE,
  decodeAttribution,
  isBotUa,
  optedOut,
} from "@/lib/attribution";
import { readTextCapped } from "@/lib/http/read-capped";
import { isUuid } from "@/lib/seo/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { clientKey, createWindowLimiter } from "@/lib/window-limiter";

/**
 * R10: нэргүй зар үзэлтийн beacon. Хариу ҮРГЭЛЖ 204 (алгассан шалтгааныг хэлэхгүй).
 * Хадгалах зүйл: listing_id, utm_*, sha256(sid), огноо — IP/UA/user id ХАДГАЛАХГҮЙ.
 * Хязгаар: энд instance бүрт IP-аар 60 сек-т 30 (best-effort, IP-г логлохгүй);
 * хатуу хязгаар нь listing_view_record (SQL) дотор.
 */

const limiter = createWindowLimiter({ limit: 30, windowMs: 60_000, maxKeys: 5000 });
const SID_RE = /^[0-9a-f-]{36}$/;

function done() {
  return new NextResponse(null, { status: 204 });
}

/**
 * DB ганц (production) тул localhost болон Vercel preview-ийн туршилтын үзэлт
 * агентын статистикт холилдохгүй: зөвхөн production орчинд бүртгэнэ.
 * Локалд туршихдаа LISTING_VIEWS_FORCE=1.
 */
function recordingEnabled(): boolean {
  if (process.env.LISTING_VIEWS_FORCE === "1") return true;
  if (process.env.NODE_ENV !== "production") return false;
  const vercelEnv = process.env.VERCEL_ENV;
  return !vercelEnv || vercelEnv === "production";
}

export async function POST(request: NextRequest) {
  if (!recordingEnabled()) return done();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return done();

  const get = (n: string) => request.headers.get(n);
  const site = get("sec-fetch-site");
  if (site && site !== "same-origin") return done();
  if (isBotUa(get("user-agent"), userAgent(request).isBot) || optedOut(get)) return done();

  // 1 KB-аас хэтэрмэгц уншихаа зогсооно (Content-Length-гүй chunked хүсэлтэд ч).
  const raw = await readTextCapped(request, 1024);
  if (raw == null) return done();
  let body: { listing_id?: unknown } | null = null;
  try {
    body = JSON.parse(raw) as { listing_id?: unknown } | null;
  } catch {
    return done();
  }
  const listingId = typeof body?.listing_id === "string" ? body.listing_id.toLowerCase() : "";
  if (!isUuid(listingId)) return done();

  if (!limiter.hit(clientKey(get))) return done();

  const existing = request.cookies.get(SID_COOKIE)?.value;
  const newSid = !(existing && SID_RE.test(existing));
  const sid = newSid ? randomUUID() : (existing as string);
  const sessionHash = createHash("sha256").update(`nemi-lv:${sid}`).digest("hex");
  const attr = decodeAttribution(request.cookies.get(ATTR_COOKIE)?.value);

  // Үзэгч: зөвхөн агент өөрийн зарыг үзсэнийг алгасахад (хадгалахгүй).
  let viewer: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    viewer = typeof sub === "string" && isUuid(sub) ? sub : null;
  } catch {
    viewer = null;
  }

  after(async () => {
    try {
      const { error } = await createAdminClient().rpc("listing_view_record", {
        p_listing: listingId,
        p_session: sessionHash,
        p_viewer: viewer,
        p_source: attr?.source ?? null,
        p_medium: attr?.medium ?? null,
        p_campaign: attr?.campaign ?? null,
        p_content: attr?.content ?? null,
      });
      if (error) console.error("listing-view:", error.message);
    } catch (e) {
      console.error("listing-view:", e instanceof Error ? e.message : "unknown");
    }
  });

  const res = done();
  if (newSid) {
    res.cookies.set(SID_COOKIE, sid, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ATTR_MAX_AGE_S,
    });
  }
  return res;
}
