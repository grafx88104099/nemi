import "server-only";

import { mapGraphError, parseFbConfig, type FbConfig } from "./facebook-config";

/** Env-ээс уншина; FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN хоосон бол null (функц унтаа). */
export function fbConfig(): FbConfig | null {
  return parseFbConfig(process.env);
}

export type FeedPostResult = { ok: true; id: string } | { ok: false; error: string; definite: boolean };

const AMBIGUOUS = "Facebook хариу өгсөнгүй. Хуудсаа шалгаад дараа дахин оролдоно уу.";

/**
 * POST /{page-id}/feed (message + link). definite=false → пост үүссэн байж магадгүй
 * (timeout/сүлжээ/тодорхойгүй хариу) — дуудагч захиалгыг цуцлахгүй.
 * Токен, хүсэлтийн биеийг ХЭЗЭЭ Ч логлохгүй.
 */
export async function postToPageFeed(
  cfg: FbConfig,
  { message, link }: { message: string; link: string }
): Promise<FeedPostResult> {
  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/${cfg.version}/${cfg.pageId}/feed`, {
      method: "POST",
      body: new URLSearchParams({ message, link, access_token: cfg.token }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, definite: false, error: AMBIGUOUS };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  const obj = (json ?? {}) as { id?: unknown; error?: { code?: unknown; message?: unknown } };

  if (obj.error && typeof obj.error.code === "number") {
    const msg = typeof obj.error.message === "string" ? obj.error.message.slice(0, 200) : "";
    console.error("fb feed:", obj.error.code, msg);
    return { ok: false, definite: true, error: mapGraphError(obj.error.code) };
  }
  if (res.ok && typeof obj.id === "string" && /^[0-9_]{1,200}$/.test(obj.id)) {
    return { ok: true, id: obj.id };
  }
  console.error("fb feed:", res.status, "unexpected response");
  return { ok: false, definite: false, error: AMBIGUOUS };
}
