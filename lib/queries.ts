import { createClient } from "@/lib/supabase/server";
import type { ListingCardData } from "@/components/listings/ListingCard";

const CARD_SELECT =
  "id, title, price, ai_score, rooms, area, floor, district, photo, hot, verified, deal_type, " +
  "agent:agents(display_name, avatar, avatar_url, verified, office:offices(color))";

/** Онцлох (featured) идэвхтэй зарууд. */
export async function getFeaturedListings(limit = 8): Promise<ListingCardData[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listings")
    .select(CARD_SELECT)
    .eq("status", "active")
    .eq("featured", true)
    .order("ai_score", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as ListingCardData[];
}

export type ListingFilters = {
  q?: string;
  district?: string;
  type?: string;
  rooms?: number;
  minPrice?: number;
  maxPrice?: number;
  deal?: "sale" | "rent";
  sort?: "new" | "price_asc" | "price_desc" | "ai";
  page?: number;
  pageSize?: number;
};

/** Жагсаалт + шүүлтүүр + хуудаслалт. */
export async function getListings(f: ListingFilters = {}) {
  const supabase = await createClient();
  const pageSize = f.pageSize ?? 12;
  const page = f.page ?? 1;
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("listings")
    .select(CARD_SELECT, { count: "exact" })
    .eq("status", "active");

  if (f.q) query = query.ilike("title", `%${f.q}%`);
  if (f.deal) query = query.eq("deal_type", f.deal);
  if (f.district) query = query.eq("district", f.district);
  if (f.type) query = query.eq("type", f.type);
  if (f.rooms) query = query.gte("rooms", f.rooms);
  if (f.minPrice) query = query.gte("price", f.minPrice);
  if (f.maxPrice) query = query.lte("price", f.maxPrice);

  switch (f.sort) {
    case "price_asc": query = query.order("price", { ascending: true }); break;
    case "price_desc": query = query.order("price", { ascending: false }); break;
    case "ai": query = query.order("ai_score", { ascending: false }); break;
    default: query = query.order("created_at", { ascending: false });
  }

  const { data, count } = await query.range(from, from + pageSize - 1);
  return {
    listings: (data ?? []) as unknown as ListingCardData[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

const LISTING_DETAIL_SELECT =
  "*, agent:agents(*, office:offices(*)), photos:listing_photos(url, sort_order, is_primary), " +
  "valuations:ai_valuations(score, note, model, created_at)";

export async function getListingById(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listings")
    .select(LISTING_DETAIL_SELECT)
    .eq("id", id)
    .single();
  return data as
    | (Record<string, unknown> & {
        agent: (Record<string, unknown> & { office: Record<string, unknown> | null }) | null;
        photos: { url: string; sort_order: number; is_primary: boolean }[];
        valuations: { score: number | null; note: string | null; model: string | null; created_at: string }[];
      })
    | null;
}

export type AgentListItem = {
  id: string;
  display_name: string;
  avatar: string | null;
  avatar_url: string | null;
  rating: number | null;
  reviews_count: number;
  sold: number;
  years: number | null;
  verified: boolean;
  premier: boolean;
  specialty: string | null;
  areas: string[];
  languages: string[];
  office: { name: string; color: string | null } | null;
};

export async function getAgents(): Promise<AgentListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agents")
    .select(
      "id, display_name, avatar, avatar_url, rating, reviews_count, sold, years, verified, premier, specialty, areas, languages, office:offices(name, color)"
    )
    .eq("status", "active")
    .order("premier", { ascending: false })
    .order("rating", { ascending: false });
  return (data ?? []) as unknown as AgentListItem[];
}

export async function getAgentById(id: string) {
  const supabase = await createClient();
  const [{ data: agent }, { data: listings }, { data: reviews }] = await Promise.all([
    supabase
      .from("agents")
      .select("*, office:offices(*)")
      .eq("id", id)
      .single(),
    supabase.from("listings").select(CARD_SELECT).eq("agent_id", id).eq("status", "active"),
    supabase
      .from("reviews")
      .select("*")
      .eq("agent_id", id)
      .order("created_at", { ascending: false }),
  ]);
  return {
    agent: agent as (Record<string, unknown> & { office: Record<string, unknown> | null }) | null,
    listings: (listings ?? []) as unknown as ListingCardData[],
    reviews: (reviews ?? []) as Array<{
      id: string;
      author_name: string | null;
      area: string | null;
      deal_type: string | null;
      rating: number | null;
      text: string | null;
      verified: boolean;
      created_at: string;
    }>,
  };
}
