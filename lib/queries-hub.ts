import { createClient } from "@/lib/supabase/server";
import type { ListingCardData } from "@/components/listings/ListingCard";
import { CARD_SELECT_USER } from "@/lib/queries-user";
import { applyListingFilters, parseListingFilters } from "@/lib/listing-filters";
import { applySmartQuery } from "@/lib/search/parse-query";
import {
  conversationIdFromLink,
  countUnreadIn,
  mergeHubAgents,
  savedSearchHref,
  type HubAgent,
  type HubAgentSrc,
} from "@/lib/hub";

/**
 * «Миний Нэми» хабын өгөгдөл — нэг createClient, нэг getUser; бүх асуулга
 * хэрэглэгчийн клиентээр (RLS). Дэд асуулга бүр алдаанд хоосон утга руу буурна.
 * Нууц талбар (address_detail, owner_phone, client_phone, note, агентын утас/и-мэйл)
 * ЭНД СОНГОХГҮЙ.
 */

export type HubSearch = {
  id: string;
  name: string;
  filters: Record<string, string>;
  alertEnabled: boolean;
  newCount: number;
  href: string;
};

export type HubTour = {
  id: string;
  scheduled_at: string | null;
  status: string;
  listing: { id: string; title: string; district: string | null; photo: string | null } | null;
  agent: HubAgentSrc | null;
};

export type HubConversation = {
  id: string;
  last_message_at: string | null;
  listing: { id: string; title: string; photo: string | null } | null;
  agent: HubAgentSrc | null;
  unread: boolean;
};

export type HubOwnerCounts = { active: number; review: number; draft: number; other: number };

export type HubData = {
  user: { id: string; email: string | null; phone: string | null };
  profile: { full_name: string | null; role: string } | null;
  searches: HubSearch[];
  saved: { items: ListingCardData[]; count: number };
  recent: ListingCardData[];
  tours: HubTour[];
  conversations: HubConversation[];
  unreadTotal: number;
  agents: HubAgent[];
  owner: { counts: HubOwnerCounts; requests: number; hasAny: boolean };
};

const AGENT_EMBED = "agent:agents(id, display_name, avatar, avatar_url, office:offices(name, color))";

/** jsonb шүүлтийг string-record болгоно (string биш утгыг алгасна). */
function stringFilters(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === "string") out[k] = x;
  return out;
}

function cards(rows: unknown[] | null | undefined): ListingCardData[] {
  return (rows ?? [])
    .map((r) => (r as { listing: unknown }).listing)
    .filter(Boolean) as ListingCardData[];
}

export async function getHubData(): Promise<HubData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const nowIso = new Date().toISOString();

  const [profileRes, searchesRes, favRes, recentRes, toursRes, convRes, notesRes, ownerRes, reqRes] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle(),
    supabase
      .from("saved_searches")
      .select("id, name, filters, alert_enabled, created_at, last_seen_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("favorites")
      // !inner: RLS-ээр харагдахгүй болсон (зарагдсан/нуусан) зарын мөрийг тоо ба
      // жагсаалтаас хоёуланг нь хасна — badge-ийн тоо картуудтай таарна.
      .select(`listing:listings!inner(${CARD_SELECT_USER})`, { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("recently_viewed")
      .select(`listing:listings(${CARD_SELECT_USER})`)
      .eq("user_id", user.id)
      .order("viewed_at", { ascending: false })
      .limit(8),
    supabase
      .from("viewings")
      .select(`id, scheduled_at, status, listing:listings(id, title, district, photo), ${AGENT_EMBED}`)
      .eq("buyer_id", user.id)
      .gte("scheduled_at", nowIso)
      .in("status", ["pending", "confirmed"])
      .order("scheduled_at", { ascending: true })
      .limit(3),
    // Зөвхөн худалдан авагчийн талын харилцаа — агентын талынх /agent/chat-д.
    supabase
      .from("conversations")
      .select(`id, last_message_at, listing:listings(id, title, photo), ${AGENT_EMBED}`)
      .eq("buyer_id", user.id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(20),
    supabase
      .from("notifications")
      .select("link")
      .eq("user_id", user.id)
      .eq("type", "message")
      .is("read_at", null)
      .limit(200),
    supabase.from("listings").select("status").eq("owner_id", user.id).is("agent_id", null),
    supabase.from("owner_requests").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  // Хадгалсан хайлт бүрийн «сүүлд нээснээс хойш» шинэ зар — cron-той ижил шүүлт.
  const searchRows = (searchesRes.error ? [] : (searchesRes.data ?? [])) as {
    id: string;
    name: string | null;
    filters: unknown;
    alert_enabled: boolean;
    created_at: string;
    last_seen_at: string | null;
  }[];
  const searches: HubSearch[] = await Promise.all(
    searchRows.map(async (s) => {
      const filters = stringFilters(s.filters);
      let newCount = 0;
      try {
        const f = applySmartQuery(parseListingFilters(filters)).filters;
        const { count } = await applyListingFilters(
          supabase
            .from("listings")
            .select("id", { count: "exact", head: true })
            .eq("status", "active")
            .gt("created_at", s.last_seen_at ?? s.created_at),
          f,
          { ignorePosted: true }
        );
        newCount = count ?? 0;
      } catch {
        newCount = 0;
      }
      return {
        id: s.id,
        name: s.name || "Хайлт",
        filters,
        alertEnabled: s.alert_enabled,
        newCount,
        href: savedSearchHref(s.id, filters),
      };
    })
  );

  const unread = new Set(
    ((notesRes.data ?? []) as { link: string | null }[])
      .map((r) => conversationIdFromLink(r.link))
      .filter((x): x is string => !!x)
  );

  const allConvs = (convRes.data ?? []) as unknown as Omit<HubConversation, "unread">[];
  const conversations: HubConversation[] = allConvs.slice(0, 3).map((c) => ({ ...c, unread: unread.has(c.id) }));
  const unreadTotal = countUnreadIn(
    allConvs.map((c) => c.id),
    unread
  );

  const tours = (toursRes.data ?? []) as unknown as HubTour[];
  const agents = mergeHubAgents(allConvs, tours, 4);

  const counts: HubOwnerCounts = { active: 0, review: 0, draft: 0, other: 0 };
  const ownerRows = (ownerRes.data ?? []) as { status: string }[];
  for (const r of ownerRows) {
    if (r.status === "active" || r.status === "review" || r.status === "draft") counts[r.status]++;
    else counts.other++;
  }
  const requests = reqRes.count ?? 0;

  return {
    user: { id: user.id, email: user.email ?? null, phone: user.phone || null },
    profile: (profileRes.data as { full_name: string | null; role: string } | null) ?? null,
    searches,
    saved: { items: cards(favRes.data), count: favRes.count ?? 0 },
    recent: cards(recentRes.data),
    tours,
    conversations,
    unreadTotal,
    agents,
    owner: { counts, requests, hasAny: ownerRows.length > 0 || requests > 0 },
  };
}
