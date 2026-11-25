/**
 * CRM бүрхүүлийн төхөөрөмжийн хэсгийн цэвэр дүрэм (тестлэнэ): дуусаагүй ноорогийн баннер,
 * хуучирсан ноорогийн хэмжилт (draft_stale), глобал тэмдэгтийн бичвэр, гарахын анхааруулга.
 * Хувийн өгөгдөл (утас, нэр) энд огт орохгүй — зөвхөн тоо, түлхүүр, хугацаа.
 */

import { isPropertyTab, type Crm2Paths } from "@/lib/crm2/paths";

/** Ноорогийн индексийн мөрөөс хэрэгтэй хэсэг (lib/crm2/device/draft-store DraftIndexEntry). */
export type DraftLike = { clientKey: string; savedAt: number; status: "editing" | "queued"; deletedAt?: number | null };

/** Баннерт харуулах «шинэ» ноорог — 12 цагаас доош (автоматаар сэргээгдэх хугацаа). */
export const RECENT_DRAFT_MS = 12 * 60 * 60 * 1000;
/** Илгээгдээгүй ноорогийг «хаягдсан» гэж хэмжих хугацаа. */
export const STALE_DRAFT_MS = 24 * 60 * 60 * 1000;
/** draft_stale-ийг нэг ноорогт нэг л удаа бичихийн тулд санах түлхүүрийн дээд тоо. */
export const STALE_LOG_MAX = 50;

/** 12 цагаас доош засагдсан, илгээгдээгүй (editing) ноорогууд — шинэ нь эхэнд. */
export function recentDrafts<T extends DraftLike>(drafts: readonly T[], now = Date.now()): T[] {
  return drafts
    .filter((d) => !d.deletedAt && d.status === "editing" && now - d.savedAt >= 0 && now - d.savedAt < RECENT_DRAFT_MS)
    .sort((a, b) => b.savedAt - a.savedAt);
}

/** 24+ цаг илгээгдээгүй, өмнө нь бичигдээгүй ноорогууд (draft_stale-д). */
export function staleDraftsToLog<T extends DraftLike>(drafts: readonly T[], logged: ReadonlySet<string>, now = Date.now()): T[] {
  return drafts.filter((d) => !d.deletedAt && d.status === "editing" && now - d.savedAt >= STALE_DRAFT_MS && !logged.has(d.clientKey));
}

/** Санасан түлхүүрүүдийн жагсаалтыг шинэчилнэ (сүүлийнх нь үлдэнэ, давхардалгүй). */
export function mergeLoggedKeys(prev: readonly string[], added: readonly string[], max = STALE_LOG_MAX): string[] {
  const out = [...prev.filter((k) => !added.includes(k)), ...added];
  return out.slice(Math.max(0, out.length - max));
}

/** localStorage-ийн утгыг аюулгүй задлах (зөвхөн string[]). */
export function parseLoggedKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length <= 64).slice(-STALE_LOG_MAX) : [];
  } catch {
    return [];
  }
}

export const staleLogKey = (profileId: string) => `crm2:stale-logged:${profileId}`;

/** Глобал тэмдэгтийн бичвэр: дараалал (зураг/файл) + «Илгээгдсэн — анхаарах». Юу ч үгүй бол null. */
export function deviceBadgeText(q: { pending: number; failed: number }, attention: number): string | null {
  const parts: string[] = [];
  if (q.failed > 0) parts.push(`${q.failed} файл хуулагдсангүй`);
  if (q.pending > 0) parts.push(`${q.pending} файл хүлээгдэж байна`);
  if (attention > 0) parts.push(`${attention} бүртгэл анхаарах`);
  return parts.length ? parts.join(" · ") : null;
}

/** Гарахын анхааруулгын гарчиг (null = юу ч алдагдахгүй, шууд гарна). */
export function logoutLossText(s: {
  photos: number;
  submits: number;
  /** Дуусаагүй (илгээгээгүй) ноорог ба тэдгээрийн зураг. */
  drafts?: number;
  draftPhotos?: number;
  /** Утсан дээрх гэрээний хуудас. */
  pages?: number;
}): string | null {
  const n = (v: number | undefined) => Math.max(0, Math.floor(v || 0));
  const photos = n(s.photos);
  const submits = n(s.submits);
  const drafts = n(s.drafts);
  const draftPhotos = n(s.draftPhotos);
  const pages = n(s.pages);
  const parts: string[] = [];
  if (photos > 0) parts.push(`${photos} зураг`);
  if (submits > 0) parts.push(`${submits} бүртгэл`);
  if (pages > 0) parts.push(`${pages} гэрээний хуудас`);
  const sent = parts.length ? `Илгээгдээгүй ${parts.join(" / ")}` : "";
  const draft = drafts > 0 ? `дуусаагүй ${drafts} ноорог${draftPhotos > 0 ? ` (${draftPhotos} зураг)` : ""}` : "";
  if (!sent && !draft) return null;
  if (!sent) return `Утсан дээрх ${draft} устна`;
  return draft ? `${sent}, ${draft} устна` : `${sent} устна`;
}

// ── Утасны доод хурдан цэс ───────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Хөрөнгийн картын хуудас (`<base>/staff/<uuid>`) бол хөрөнгийн id; «new», «incomplete», дэд хуудас биш. */
export function cardPropertyId(pathname: string | null | undefined, base: string): string | null {
  const prefix = `${base}/staff/`;
  const path = (pathname ?? "").replace(/\/+$/, "");
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  return UUID_RE.test(rest) ? rest : null;
}

/**
 * Хурдан цэсний «Дуудлага»: хөрөнгийн карт дээр бол ТЭР хөрөнгө + одоогийн таб (?tab=calls г.м.)
 * хэвээр ?call=1 — цонхыг хаахад агент ажиллаж байсан табдаа үлдэнэ. Бусад үед Staff-ийн жагсаалт.
 */
export function quickCallHref(p: Crm2Paths, cardId: string | null, tab: string | null | undefined): string {
  if (!cardId) return p.staff({ call: "1" });
  return p.property(cardId, isPropertyTab(tab) ? tab : undefined, { call: "1" });
}

/** Хурдан цэсний холбоос одоогийн хуудас (эсвэл түүний дэд хуудас) эсэх — aria-current. */
export function quickBarCurrent(pathname: string | null | undefined, href: string): boolean {
  const path = (pathname ?? "").replace(/\/+$/, "");
  const target = href.split("?")[0].replace(/\/+$/, "");
  return !!target && (path === target || path.startsWith(`${target}/`));
}
