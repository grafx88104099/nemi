/**
 * Standard Webhooks (https://www.standardwebhooks.com) гарын үсэг шалгагч —
 * Supabase Auth Hook (Send SMS)-д. node:crypto л ашиглана (шинэ dependency-гүй).
 * Сервер дээр л (Route Handler, runtime = nodejs).
 *
 * Гарын үсэг: base64(HMAC-SHA256(key, `${id}.${timestamp}.${payload}`)),
 * толгой `webhook-signature: v1,<b64> [v1,<b64> ...]`. Нууц: `v1,whsec_<base64>`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Нууцын түлхүүрийн байт (`v1,` ба `whsec_` угтваргүй base64). Хоосон бол 0 урт. */
export function secretKeyBytes(secret: string): Buffer {
  const b64 = secret.trim().replace(/^v\d+,/, "").replace(/^whsec_/, "");
  return Buffer.from(b64, "base64");
}

export function verifyStandardWebhook(opts: {
  payload: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  nowSec?: number;
  toleranceSec?: number;
}): boolean {
  try {
    const { payload, id, timestamp, signature, secret } = opts;
    if (!id || !timestamp || !signature || !secret) return false;

    const ts = Number(timestamp);
    if (!/^\d+$/.test(timestamp) || !Number.isInteger(ts)) return false;
    const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > (opts.toleranceSec ?? 300)) return false;

    const key = secretKeyBytes(secret);
    if (key.length === 0) return false;
    const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest();

    for (const entry of signature.split(" ")) {
      if (!entry.startsWith("v1,")) continue;
      const got = Buffer.from(entry.slice(3), "base64");
      if (got.length === expected.length && timingSafeEqual(got, expected)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
