/**
 * «Миний Нэми» хаб ба гар утасны доод цэсний цэвэр туслахууд (R03).
 * supabase/next импортгүй — клиент компонент, сервер, vitest бүгд ашиглана.
 */
import { UUID_RE } from "@/lib/seo/site";

export { UUID_RE };

// ── Зорилго (intent) ─────────────────────────────────────
export type HubIntent = "buy" | "rent" | "sell" | "browse";

export const HUB_INTENTS: [HubIntent, string][] = [
  ["buy", "Авах"],
  ["rent", "Түрээслэх"],
  ["sell", "Зарах"],
  ["browse", "Зүгээр үзэж байна"],
];

/** localStorage түлхүүр — зөвхөн хэсгүүдийн дарааллыг өөрчилнө. */
export const HUB_INTENT_KEY = "nemi:hub-intent";

export function parseHubIntent(v: unknown): HubIntent | null {
  return v === "buy" || v === "rent" || v === "sell" || v === "browse" ? v : null;
}

// ── Хэсгүүдийн дараалал ──────────────────────────────────
export type HubSectionId = "tours" | "messages" | "searches" | "saved" | "recent" | "agents" | "listings" | "tools";

const ORDER: Record<HubIntent | "default", HubSectionId[]> = {
  default: ["tours", "messages", "searches", "saved", "recent", "agents", "listings", "tools"],
  buy: ["searches", "saved", "tours", "agents", "messages", "recent", "tools", "listings"],
  rent: ["tours", "saved", "searches", "messages", "agents", "recent", "tools", "listings"],
  sell: ["listings", "agents", "messages", "tools", "tours", "saved", "searches", "recent"],
  browse: ["recent", "saved", "searches", "tools", "tours", "messages", "agents", "listings"],
};

export function hubSectionOrder(intent: HubIntent | null): HubSectionId[] {
  return [...ORDER[intent ?? "default"]];
}

// ── Холбоос, id ──────────────────────────────────────────
/** sendMessage-ийн бичдэг мэдэгдлийн холбоос — нэг эх сурвалж. */
export function conversationLink(id: string): string {
  return `/messages?c=${id}`;
}

/** «/messages?c=<uuid>» → uuid; өөр зам, буруу/байхгүй c → null. */
export function conversationIdFromLink(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const u = new URL(link, "https://x");
    if (u.pathname !== "/messages") return null;
    const c = u.searchParams.get("c");
    return c && UUID_RE.test(c) ? c : null;
  } catch {
    return null;
  }
}

/** Хадгалсан хайлтыг нээх холбоос — ?ss=<id> нь «үзсэн» тэмдэглэхэд ашиглагдана. */
export function savedSearchHref(id: string, filters: Record<string, string>): string {
  const params = new URLSearchParams(filters);
  params.delete("ss");
  params.set("ss", id);
  return `/listings?${params}`;
}

/** URL-д ?ss=<id> залгана (ухаалаг хайлтын каноник redirect ss-г алдахгүйн тулд). */
export function withSavedSearchParam(href: string, ss: string | null): string {
  if (!ss) return href;
  return `${href}${href.includes("?") ? "&" : "?"}ss=${encodeURIComponent(ss)}`;
}

// ── Доод цэсний идэвхтэй таб ─────────────────────────────
export type TabId = "search" | "map" | "saved" | "messages" | "me";

const under = (p: string, x: string) => p === x || p.startsWith(`${x}/`);

const TAB_PATHS: [TabId, string[]][] = [
  ["search", ["/listings"]],
  ["map", ["/map"]],
  ["saved", ["/favorites", "/saved-searches"]],
  ["messages", ["/messages"]],
  ["me", ["/me", "/account", "/tours", "/recently-viewed", "/my-listings", "/my-team", "/my-home"]],
];

export function activeTab(pathname: string | null | undefined): TabId | null {
  if (!pathname) return null;
  for (const [id, paths] of TAB_PATHS) if (paths.some((x) => under(pathname, x))) return id;
  return null;
}

// ── «Миний агентууд» ─────────────────────────────────────
export type HubAgentSrc = {
  id: string;
  display_name: string;
  avatar: string | null;
  avatar_url: string | null;
  office: { name: string | null; color: string | null } | null;
};

export type HubAgent = {
  id: string;
  display_name: string;
  avatar: string | null;
  avatar_url: string | null;
  officeName: string | null;
  officeColor: string | null;
  conversationId: string | null;
};

/**
 * Чатын агентууд эхэнд (эхний харилцааны id-тай), дараа нь үзлэгийн агентууд
 * (conversationId = null). Агентын id-аар давхардлыг арилгаж, null-ыг алгасна.
 */
export function mergeHubAgents(
  convs: { id: string; agent: HubAgentSrc | null }[],
  viewings: { agent: HubAgentSrc | null }[],
  max = 4
): HubAgent[] {
  const out: HubAgent[] = [];
  const seen = new Set<string>();
  const add = (a: HubAgentSrc | null, conversationId: string | null) => {
    if (!a?.id || seen.has(a.id) || out.length >= max) return;
    seen.add(a.id);
    out.push({
      id: a.id,
      display_name: a.display_name,
      avatar: a.avatar,
      avatar_url: a.avatar_url,
      officeName: a.office?.name ?? null,
      officeColor: a.office?.color ?? null,
      conversationId,
    });
  };
  for (const c of convs) add(c.agent, c.id);
  for (const v of viewings) add(v.agent, null);
  return out;
}

/** convIds-ийн хэд нь уншаагүй олонлогт байгаа вэ. */
export function countUnreadIn(convIds: string[], unread: Set<string>): number {
  let n = 0;
  for (const id of convIds) if (unread.has(id)) n++;
  return n;
}
