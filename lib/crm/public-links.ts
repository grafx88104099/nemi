import { createHash, createHmac, randomBytes } from "node:crypto";

import type { LinkState, OpenHouseState } from "@/lib/crm/public-links-labels";

export { LINK_STATE_LABEL, OPEN_HOUSE_STATE_LABEL, type LinkState, type OpenHouseState } from "@/lib/crm/public-links-labels";

/**
 * Харилцагчид гарах токентой холбоос (R9, R10, R11) — цэвэр логик.
 * Токен/кодыг зөвхөн SHA-256 hash-аар хадгална; нийтийн хуудас нь
 * hash-аар хайж, хугацаа, цуцлалтыг шалгана. Хувийн мэдээлэл (хаяг дахь
 * байр/тоот, өмчлөгч, бусад харилцагч) нийтэд гарахгүй.
 * ЗӨВХӨН СЕРВЕР ТАЛД (node:crypto).
 */

export type PublicLinkSettings = {
  collectionDays: number;
  ownerReportDays: number;
  collectionMinItems: number;
  collectionMaxItems: number;
  openHouseGraceHours: number;
  openHouseEarlyHours: number;
  visitsPerClientHour: number;
  visitsPerEventHour: number;
};

export const DEFAULT_PUBLIC_LINK_SETTINGS: PublicLinkSettings = {
  collectionDays: 7,
  ownerReportDays: 30,
  collectionMinItems: 3,
  collectionMaxItems: 7,
  openHouseGraceHours: 4,
  openHouseEarlyHours: 1,
  visitsPerClientHour: 5,
  visitsPerEventHour: 120,
};

function n(v: unknown, fallback: number, min: number, max: number): number {
  const x = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(x) && x >= min && x <= max ? Math.round(x) : fallback;
}

export function normalizePublicLinkSettings(raw: unknown): PublicLinkSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PUBLIC_LINK_SETTINGS;
  const min = n(r.collection_min_items, d.collectionMinItems, 1, 20);
  const max = n(r.collection_max_items, d.collectionMaxItems, 1, 20);
  return {
    collectionDays: n(r.collection_days, d.collectionDays, 1, 90),
    ownerReportDays: n(r.owner_report_days, d.ownerReportDays, 1, 120),
    collectionMinItems: Math.min(min, max),
    collectionMaxItems: Math.max(min, max),
    openHouseGraceHours: n(r.open_house_grace_hours, d.openHouseGraceHours, 0, 72),
    openHouseEarlyHours: n(r.open_house_early_hours, d.openHouseEarlyHours, 0, 24),
    visitsPerClientHour: n(r.visits_per_client_hour, d.visitsPerClientHour, 1, 100),
    visitsPerEventHour: n(r.visits_per_event_hour, d.visitsPerEventHour, 1, 5000),
  };
}

// ── Токен ────────────────────────────────────────────────

/** URL-д аюулгүй санамсаргүй токен (192 бит). */
export function generateToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/** QR-д зориулсан богино код (≈ 72 бит, том үсэг + тоо, андуурагдах тэмдэгтгүй). */
export function generateShortCode(length = 14): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

/** Токены хэлбэрийн урьдчилсан шалгалт (DB рүү хог хүсэлт явуулахгүй). */
export function isPlausibleToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{12,64}$/.test(token);
}

// ── Төлөв ────────────────────────────────────────────────

export function linkState(l: { expires_at: string; revoked_at: string | null }, now: Date = new Date()): LinkState {
  if (l.revoked_at) return "revoked";
  return Date.parse(l.expires_at) > now.getTime() ? "active" : "expired";
}

export type OpenHouseLite = {
  kind: "open_house" | "permanent";
  starts_at: string | null;
  ends_at: string | null;
  revoked_at: string | null;
};

/** Нээлттэй үзлэгийн бүртгэл: эхлэхээс N цагийн өмнө нээгдэж, дууссанаас M цагийн дараа хаагдана. */
export function openHouseState(oh: OpenHouseLite, s: PublicLinkSettings, now: Date = new Date()): OpenHouseState {
  if (oh.revoked_at) return "revoked";
  if (oh.kind === "permanent") return "open";
  if (!oh.starts_at || !oh.ends_at) return "closed";
  const t = now.getTime();
  if (t < Date.parse(oh.starts_at) - s.openHouseEarlyHours * 3600_000) return "upcoming";
  if (t > Date.parse(oh.ends_at) + s.openHouseGraceHours * 3600_000) return "closed";
  return "open";
}

// ── Хамгаалалт ───────────────────────────────────────────

const BOT_UA =
  /(bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|whatsapp|telegram|viber|skype|slack|discord|twitter|linkedin|embedly|pinterest|vkshare|google-inspectiontool|headless|curl|wget|python-requests|okhttp)/i;

/** Холбоосын урьдчилсан харагдац үүсгэдэг бот, скрипт (нээлтийн тоолуурт оруулахгүй). */
export function isLikelyBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.trim().length < 10) return true;
  return BOT_UA.test(userAgent);
}

/** Давтамжийн хязгаарт зориулсан нэг өдрийн нэргүй түлхүүр (IP-г хадгалахгүй). */
export function clientKey(ip: string | null, userAgent: string | null, dayIso: string, secret: string): string {
  return createHmac("sha256", secret || "nemi-public")
    .update(`${ip ?? "-"}|${(userAgent ?? "-").slice(0, 200)}|${dayIso}`)
    .digest("hex");
}

/** Чөлөөт текстийг цэвэрлэнэ: хяналтын тэмдэгт, илүү зай, урт. */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

export function collectionSizeError(count: number, s: PublicLinkSettings): string | null {
  if (count < s.collectionMinItems) return `Хамгийн багадаа ${s.collectionMinItems} үл хөдлөх сонгоно уу.`;
  if (count > s.collectionMaxItems) return `Хамгийн ихдээ ${s.collectionMaxItems} үл хөдлөх сонгоно.`;
  return null;
}

// ── Нийтэд харуулах мэдээлэл ─────────────────────────────

export type PublicAddress = { district?: unknown; khoroo?: unknown; complex?: unknown; building?: unknown; unit?: unknown };

/** Хаягаас зөвхөн дүүрэг, хотхоны нэр (байр, тоот гарахгүй). */
export function publicLocation(address: unknown): string {
  const a = (address && typeof address === "object" ? address : {}) as PublicAddress;
  const parts = [a.district, a.complex].filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return parts.map((p) => p.trim()).join(", ");
}

/** Үзлэгийн эргэх холбооны ангиллын тоог хувьд шилжүүлэх (тайлан). */
export function shareOf(counts: Record<string, number>): { key: string; count: number; pct: number }[] {
  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([key, count]) => ({ key, count, pct: total ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
}
