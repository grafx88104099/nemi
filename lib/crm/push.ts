import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Web Push суваг (R4 сервер тал, §6.4/§6.28) — VAPID түлхүүрээр
 * crm_push_subscriptions-ийн төхөөрөмжүүд рүү илгээнэ.
 *
 * Орчны хувьсагч (нууц утга кодонд/логт бичигдэхгүй):
 *   VAPID_PUBLIC_KEY  (эсвэл NEXT_PUBLIC_VAPID_PUBLIC_KEY — клиент захиалгад)
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT     ('mailto:…' эсвэл 'https://…')
 * Аль нэг нь дутуу бол push чимээгүй алгасна (апп доторх мэдэгдэл хэвээр).
 *
 * Клиент тал (manifest, service worker, захиалгын товч) — U8. Захиалгыг
 * хадгалахдаа parsePushSubscription + upsertPushSubscription ашиглана.
 */

export type PushEnv = {
  VAPID_PUBLIC_KEY?: string;
  NEXT_PUBLIC_VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

/** VAPID тохиргоо бүрэн бол буцаана, үгүй бол null (алгасах дохио). */
export function vapidConfig(env: PushEnv = process.env as PushEnv): VapidConfig | null {
  const publicKey = (env.VAPID_PUBLIC_KEY || env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = (env.VAPID_PRIVATE_KEY || "").trim();
  const subject = (env.VAPID_SUBJECT || "").trim();
  if (!publicKey || !privateKey || !subject) return null;
  if (!/^(mailto:|https:\/\/)/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

export function isPushConfigured(env: PushEnv = process.env as PushEnv): boolean {
  return vapidConfig(env) !== null;
}

export type PushPayload = {
  title: string;
  body: string;
  /** Дарахад нээгдэх апп доторх зам ('/agent/crm/staff/…'). */
  url?: string;
  /** Ижил tag-тай мэдэгдэл төхөөрөмж дээр солигдоно (давхардал багасгана). */
  tag?: string;
};

/** Service worker-т очих JSON — урт текстийг тайрч, гадаад холбоосыг хасна. */
export function buildPushPayload(p: PushPayload): string {
  const url = p.url && p.url.startsWith("/") && !p.url.startsWith("//") ? p.url : "/";
  return JSON.stringify({
    title: p.title.slice(0, 80),
    body: p.body.slice(0, 160),
    url,
    tag: p.tag?.slice(0, 64),
  });
}

export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string };

/** Хөтчийн PushSubscription.toJSON() утгыг шалгана; буруу бол null. */
export function parsePushSubscription(raw: unknown): PushSubscriptionInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof r.endpoint === "string" ? r.endpoint.trim() : "";
  const p256dh = typeof r.keys?.p256dh === "string" ? r.keys.p256dh.trim() : "";
  const auth = typeof r.keys?.auth === "string" ? r.keys.auth.trim() : "";
  if (!/^https:\/\/[^\s]+$/.test(endpoint) || endpoint.length > 2000) return null;
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,100}$/.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

/** 404/410 — захиалга хүчингүй болсон (төхөөрөмж зөвшөөрлөө цуцалсан). */
export function isGoneStatus(status: number | null | undefined): boolean {
  return status === 404 || status === 410;
}

/** Захиалгыг хадгална (endpoint давхардвал шинэчилж, идэвхжүүлнэ). Admin client. */
export async function upsertPushSubscription(
  admin: AdminClient,
  profileId: string,
  sub: PushSubscriptionInput,
  userAgent?: string | null
): Promise<{ ok: boolean }> {
  const { error } = await admin.from("crm_push_subscriptions").upsert(
    {
      profile_id: profileId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: userAgent?.slice(0, 300) ?? null,
      failed_count: 0,
      disabled_at: null,
    },
    { onConflict: "endpoint" }
  );
  if (error) console.error("upsertPushSubscription:", error.message);
  return { ok: !error };
}

/**
 * Хэрэглэгчдийн идэвхтэй төхөөрөмжүүд рүү push илгээнэ. ХЭЗЭЭ Ч шидэхгүй.
 * VAPID тохиргоогүй бол 0 буцаана.
 */
export async function sendPushToProfiles(
  admin: AdminClient,
  profileIds: string[],
  payload: PushPayload
): Promise<number> {
  const cfg = vapidConfig();
  const targets = [...new Set(profileIds.filter(Boolean))];
  if (!cfg || targets.length === 0) return 0;
  let sent = 0;
  try {
    const { data: subs, error } = await admin
      .from("crm_push_subscriptions")
      .select("id, endpoint, p256dh, auth, failed_count")
      .in("profile_id", targets)
      .is("disabled_at", null)
      .limit(200);
    if (error) {
      console.error("sendPushToProfiles:", error.message);
      return 0;
    }
    if (!subs?.length) return 0;

    // CommonJS сан — ESM/CJS аль хэлбэрээр ирсэн ч ажиллана.
    const mod = await import("web-push");
    const webpush = (mod as unknown as { default?: typeof mod }).default ?? mod;
    const body = buildPushPayload(payload);
    const nowIso = new Date().toISOString();
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
            { vapidDetails: cfg, TTL: 3600, urgency: "high" }
          );
          sent += 1;
          await admin
            .from("crm_push_subscriptions")
            .update({ last_success_at: nowIso, failed_count: 0 })
            .eq("id", s.id);
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode ?? null;
          await admin
            .from("crm_push_subscriptions")
            .update({
              failed_count: (s.failed_count ?? 0) + 1,
              disabled_at: isGoneStatus(status) ? nowIso : null,
            })
            .eq("id", s.id);
          if (!isGoneStatus(status)) console.error("push send failed:", status ?? "network");
        }
      })
    );
  } catch (e) {
    console.error("sendPushToProfiles:", e instanceof Error ? e.message : e);
  }
  return sent;
}
