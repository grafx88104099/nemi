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
 * CRM1 (2026-11-13-нд CRM2-оор солигдсон)-ийн мэдэгдлийн төрлүүд. Эдгээрийг одоо
 * юу ч үүсгэдэггүй; хуучин мөрүүдийн холбоос CRM2-т байхгүй бичлэг рүү заадаг.
 * supabase/migrations/20261125000300_notifications_cleanup.sql-тэй ижил жагсаалт.
 */
export const LEGACY_CRM_NOTIFICATION_TYPES = [
  "crm_next_step_overdue",
  "crm_lead_sla_breach",
  "crm_hot_lead_inactive",
  "crm_lead_unprotected",
  "crm_lead_assigned",
  "crm_offer_followup_due",
  "crm_aml_threshold_due",
  "crm_arrears_step",
  "crm_monthly_record_due",
] as const;

/** CRM1-ийн устгасан сегмент → CRM2-ийн ойролцоо хэсэг (lib/crm-redirects-тэй ижил чиглэл). */
const LEGACY_SEGMENTS: [segment: string, target: string][] = [
  ["leads", "contacts"],
  ["pipeline", "staff"],
  ["deals", "staff"],
  ["properties", "staff"],
  ["transactions", "staff"],
  ["listings", "staff"],
  ["pool", "staff"],
  ["disputes", "staff"],
  ["commissions", "finance"],
  ["rentals", "finance"],
  ["aml", "finance"],
  ["week", "calendar"],
  ["worklists", "my-work"],
];

/**
 * Хуучин CRM1 мэдэгдлийн холбоосыг CRM2-ийн хуудас руу шууд (next.config redirect-ийн
 * дамжлагагүй) тааруулна. «Дараагийн алхам хоцорсон» (crm_next_step_overdue) нь ажил
 * тул «Миний ажил» руу; бусад нь сегментийн ойролцоо хэсэг рүү. Устсан бичлэгийн id-г
 * хаяна (CRM2-т тэр id байхгүй). CRM1 биш холбоосыг өөрчлөхгүй.
 */
export function legacyCrmLink(link: string, type?: string | null): string {
  for (const base of [AGENT_BASE, OFFICE_BASE]) {
    if (!link.startsWith(`${base}/`)) continue;
    const segment = link.slice(base.length + 1).split(/[/?#]/, 1)[0];
    const hit = LEGACY_SEGMENTS.find(([s]) => s === segment);
    if (!hit) return link;
    if (type === "crm_next_step_overdue") return `${base}/my-work`;
    return `${base}/${hit[1]}`;
  }
  return link;
}

/**
 * Мэдэгдлийн холбоос (хонх): CRM1-ийн хуучин холбоосыг CRM2 руу, `panel="office"` үед
 * оффисын панель руу. Холбоосгүй бол null.
 */
export function notificationHref(
  link: string | null | undefined,
  type?: string | null,
  panel?: "office"
): string | null {
  if (!link) return null;
  const l = legacyCrmLink(link, type);
  return panel === "office" ? panelLink(l, "office_admin") : l;
}

/**
 * Холбоосыг хүлээн авагчийн панельд тааруулна. Хоёр панель CRM-д ижил
 * сегменттэй тул суурь замыг солино; ялгаатай нь зөвхөн баг (агент
 * /team/monitor ↔ оффис /teams), оффисын тохиргоо ба мэдэгдлийн хуудас.
 * CRM1-ийн устгасан сегментийг (leads, pipeline, deals …) эхлээд CRM2 руу тааруулна.
 */
export function panelLink(rawLink: string, profileRole: string | null | undefined): string {
  const link = legacyCrmLink(rawLink);
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
