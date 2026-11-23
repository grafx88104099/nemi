/**
 * R10 — оффисын Facebook хуудсанд шууд нийтлэх тохиргоо. ЦЭВЭР модуль (server-only-гүй,
 * зөвхөн дамжуулсан env объектыг уншина) — vitest-ээр шалгана. Токеныг энд логлохгүй.
 */
import { isUuid } from "@/lib/seo/site";

/** https://developers.facebook.com/docs/graph-api/changelog/versions — 2026-11-23-ны байдлаар хамгийн шинэ. */
export const DEFAULT_GRAPH_VERSION = "v26.0";

export type FbConfig = {
  pageId: string;
  token: string;
  version: string;
  officeId: string | null;
};

/** FB_PAGE_ID (тоо) ба FB_PAGE_ACCESS_TOKEN хоёул байхгүй бол null → функц нуугдана. */
export function parseFbConfig(env: Record<string, string | undefined>): FbConfig | null {
  const pageId = env.FB_PAGE_ID?.trim() ?? "";
  const token = env.FB_PAGE_ACCESS_TOKEN?.trim() ?? "";
  if (!/^\d{5,25}$/.test(pageId) || !token) return null;
  const v = env.FB_GRAPH_VERSION?.trim() ?? "";
  const office = env.FB_PAGE_OFFICE_ID?.trim() ?? "";
  return {
    pageId,
    token,
    version: /^v\d+\.\d+$/.test(v) ? v : DEFAULT_GRAPH_VERSION,
    officeId: isUuid(office) ? office.toLowerCase() : null,
  };
}

/**
 * Env түвшний хаалт (UI нуух/харуулах). Эрхийг эцэслэн DB-ийн listing_share_reserve шийднэ.
 * Платформын админ эсвэл FB_PAGE_OFFICE_ID оффисын office_admin (өөрийн болон зарын оффис ижил).
 */
export function canPostFacebook({
  role,
  myOfficeId,
  listingOfficeId,
  cfg,
}: {
  role: string | null | undefined;
  myOfficeId: string | null | undefined;
  listingOfficeId: string | null | undefined;
  cfg: FbConfig | null;
}): boolean {
  if (!cfg) return false;
  if (role === "admin") return true;
  if (role !== "office_admin" || !cfg.officeId) return false;
  const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();
  return norm(myOfficeId) === cfg.officeId && norm(listingOfficeId) === cfg.officeId;
}

export function mapGraphError(code: number | undefined): string {
  if (code === 190) return "Facebook хуудасны токен хүчингүй болсон. Админ шинэчилнэ үү.";
  if (code === 10 || code === 200) return "Facebook хуудсанд нийтлэх эрх (pages_manage_posts) алга.";
  return "Facebook-т нийтэлж чадсангүй. Дахин оролдоно уу.";
}

export function postUrl(id: string): string {
  return `https://www.facebook.com/${encodeURIComponent(id)}`;
}
