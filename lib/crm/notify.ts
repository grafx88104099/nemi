/**
 * CRM мэдэгдлийн цэвэр туслахууд. CRM2-ийн мэдэгдлийг DB (crm2_notify) бичнэ;
 * энд зөвхөн холбоосыг хүлээн авагчийн панельд тааруулах, чимээгүй цагийн
 * тооцоо (push сувагт) үлдсэн.
 */

export type QuietHours = { start: string; end: string };

/** Улаанбаатарын цагийн бүс (UTC+8). */
export const UB_UTC_OFFSET_HOURS = 8;

/** 'HH:MM' → минут (0–1439); буруу бол null. */
export function parseHm(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Чимээгүй цагт байна уу. Мужийг локал цагаар (UTC+8) үнэлнэ;
 * start > end бол шөнө дамнасан муж (21:00–09:00).
 */
export function isQuietHours(
  now: Date,
  quiet: QuietHours | null | undefined,
  utcOffsetHours: number = UB_UTC_OFFSET_HOURS
): boolean {
  const start = parseHm(quiet?.start);
  const end = parseHm(quiet?.end);
  if (start == null || end == null || start === end) return false;
  const local = (now.getUTCHours() * 60 + now.getUTCMinutes() + utcOffsetHours * 60) % (24 * 60);
  if (start < end) return local >= start && local < end;
  return local >= start || local < end; // шөнө дамнасан
}

/** Давхардлын цонхны зүсэлт (ижил мэдэгдлийг тодорхой хугацаанд давтахгүй). */
export function dedupeCutoffIso(now: Date = new Date(), hours = 24): string {
  return new Date(now.getTime() - hours * 3600 * 1000).toISOString();
}

const AGENT_BASE = "/agent/crm";
const OFFICE_BASE = "/office/crm";

function isOfficeRole(role: string | null | undefined): boolean {
  return role === "office_admin" || role === "admin";
}

function under(link: string, base: string): boolean {
  return link === base || link.startsWith(`${base}/`) || link.startsWith(`${base}?`);
}

/**
 * Холбоосыг хүлээн авагчийн панельд тааруулна. Хоёр панель CRM-д ижил
 * сегменттэй тул суурь замыг солино; ялгаатай нь зөвхөн баг (агент
 * /team/monitor ↔ оффис /teams), оффисын тохиргоо ба мэдэгдлийн хуудас.
 */
export function panelLink(link: string, profileRole: string | null | undefined): string {
  if (isOfficeRole(profileRole)) {
    if (under(link, `${AGENT_BASE}/team`)) return `${OFFICE_BASE}/teams`;
    return under(link, AGENT_BASE) ? `${OFFICE_BASE}${link.slice(AGENT_BASE.length)}` : link;
  }
  if (!under(link, OFFICE_BASE)) return link;
  if (under(link, `${OFFICE_BASE}/teams`)) return `${AGENT_BASE}/team/monitor`;
  if (under(link, `${OFFICE_BASE}/settings`)) return `${AGENT_BASE}/settings`;
  if (under(link, `${OFFICE_BASE}/notifications`)) return AGENT_BASE;
  return `${AGENT_BASE}${link.slice(OFFICE_BASE.length)}`;
}
