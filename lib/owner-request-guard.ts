/**
 * Нэвтрэлтгүй «Оффист зуучлуулах» хүсэлтийн спамын хамгаалалт — цэвэр туслах (клиент ч
 * import хийж болно: зөвхөн тогтмол ба цэвэр функц). IP-г серверт давстай sha256 болгоно.
 *
 *  - honeypot: хүнд харагдахгүй «website» талбар — бөглөгдсөн бол бот (чимээгүй «амжилттай»);
 *  - IP: rate_limit_hit — цагт 5 хүсэлт;
 *  - оффис: 24 цагт 30 хүсэлтээс илүүг хүлээж авахгүй (мэдэгдлийн үерээс сэргийлнэ);
 *  - утас: 24 цагт 3 (өмнөх дүрэм хэвээр).
 */
export const OWNER_REQUEST_HONEYPOT = "website";
export const OWNER_REQUEST_IP_WINDOW_SECONDS = 3600;
export const OWNER_REQUEST_IP_MAX = 5;
export const OWNER_REQUEST_OFFICE_DAILY_CAP = 30;

/** Маягтын утгаас honeypot-ыг салгана (validateOwnerRequest нь .strict() тул илүү түлхүүр хүлээхгүй). */
export function splitHoneypot(raw: unknown): { trap: boolean; rest: Record<string, unknown> } {
  const obj = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
  const v = obj[OWNER_REQUEST_HONEYPOT];
  delete obj[OWNER_REQUEST_HONEYPOT];
  return { trap: typeof v === "string" && v.trim().length > 0, rest: obj };
}

/** rate_limit_hit-ийн түлхүүр (≤200 тэмдэгт). ipHash — давстай sha256 hex. */
export function ownerRequestIpKey(ipHash: string): string {
  return `owner-req:${ipHash.slice(0, 64)}`;
}
