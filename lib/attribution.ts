/**
 * R10 — First-party эх сурвалжийн хэмжилт (UTM). ЦЭВЭР модуль: next/* импортгүй,
 * proxy.ts, /api/listing-view, server action, vitest бүгд эндээс импортлоно.
 *
 * Нууцлал: DNT / Sec-GPC дохиог НЭГ predicate (optedOut) шийднэ — proxy (cookie
 * тавих), route (үзэлт тоолох), readAttributionColumns (чат/үзлэг/хүсэлтэд суваг
 * тэмдэглэх) болон клиентийн beacon бүгд үүнийг (эсвэл түүний толин хувилбарыг) ашиглана.
 * Cookie-д хувийн мэдээлэл (PII) байхгүй — зөвхөн utm_* утга.
 */

export const ATTR_COOKIE = "nemi_attr";
export const SID_COOKIE = "nemi_sid";
export const ATTR_MAX_AGE_S = 30 * 86_400;

export type Attribution = {
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
};

const UTM_MAX = 40;

/** Жижиг үсэг, [a-z0-9_-]-ээс бусад тэмдэгтийн дарааллыг «_», захын «_»-ийг хасна, 40 тэмдэгт. */
export function sanitizeUtm(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, UTM_MAX)
    .replace(/_+$/g, "");
  return s ? s : null;
}

/** URL-ийн utm_* параметрүүд. utm_source хүчинтэй биш бол null. */
export function parseUtm(sp: URLSearchParams): Attribution | null {
  const source = sanitizeUtm(sp.get("utm_source"));
  if (!source) return null;
  return {
    source,
    medium: sanitizeUtm(sp.get("utm_medium")),
    campaign: sanitizeUtm(sp.get("utm_campaign")),
    content: sanitizeUtm(sp.get("utm_content")),
  };
}

const PREFIX = "v1";

export function encodeAttribution(a: Attribution): string {
  return [PREFIX, a.source, a.medium ?? "", a.campaign ?? "", a.content ?? ""].join("~");
}

/** Cookie-ийн утгыг шалгаж задлана; хуурамч/эвдэрхий бол null. Хэсэг бүрийг дахин sanitize хийнэ. */
export function decodeAttribution(raw: string | null | undefined): Attribution | null {
  if (!raw || raw.length > 400) return null;
  const parts = raw.split("~");
  if (parts.length !== 5 || parts[0] !== PREFIX) return null;
  const source = sanitizeUtm(parts[1]);
  if (!source) return null;
  return {
    source,
    medium: sanitizeUtm(parts[2]),
    campaign: sanitizeUtm(parts[3]),
    content: sanitizeUtm(parts[4]),
  };
}

export type HeaderGet = (name: string) => string | null;

/** Хэрэглэгч хянуулахаас татгалзсан эсэх: Sec-GPC: 1 эсвэл DNT: 1. */
export function optedOut(get: HeaderGet): boolean {
  return get("sec-gpc")?.trim() === "1" || get("dnt")?.trim() === "1";
}

/**
 * Next-ийн userAgent().isBot-оос гадуурх мөлхөгч/скрипт. Cubot утас, FB/Instagram/Viber
 * апп доторх хөтчийг БАРИХГҮЙ (бие даасан «bot» үг, «…bot/» эсвэл тодорхой хэрэгслийн
 * нэр л таарна; «preview» дангаараа таарахгүй).
 */
export const EXTRA_BOT_RE =
  /\bbot\b|[a-z]bot\/|crawl|spider|slurp|headless|lighthouse|python-requests|curl\/|wget\/|httpclient|okhttp|go-http-client|axios\/|node-fetch|scrapy|link ?preview/i;

export function isBotUa(ua: string | null | undefined, nextIsBot = false): boolean {
  return nextIsBot || !ua || EXTRA_BOT_RE.test(ua);
}

/** proxy: энэ хүсэлтэд nemi_attr cookie тавих эсэх (utm байгаа эсэхийг дараа нь шалгана). */
export function shouldStampAttribution({
  method,
  pathname,
  get,
  nextIsBot,
}: {
  method: string;
  pathname: string;
  get: HeaderGet;
  nextIsBot: boolean;
}): boolean {
  return (
    method === "GET" &&
    !pathname.startsWith("/api/") &&
    !optedOut(get) &&
    !isBotUa(get("user-agent"), nextIsBot)
  );
}

export type AttributionColumns = {
  utm_source?: string;
  utm_medium?: string | null;
  utm_campaign?: string | null;
};

/** INSERT-д spread хийх багана. null → {} (DB-д NULL = «шууд»). */
export function attributionColumns(a: Attribution | null): AttributionColumns {
  if (!a) return {};
  return { utm_source: a.source, utm_medium: a.medium, utm_campaign: a.campaign };
}

export const CHANNEL_LABEL: Record<string, string> = {
  facebook: "Facebook",
  viber: "Viber",
  unegui: "unegui.mn",
  direct: "Шууд / бусад",
};

export function channelLabel(ch: string): string {
  return CHANNEL_LABEL[ch] ?? ch;
}
