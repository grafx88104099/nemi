import { createClient } from "@/lib/supabase/server";
import type { ListingCardData } from "@/components/listings/ListingCard";

const CARD =
  "id, title, price, ai_score, rooms, area, floor, district, photo, hot, verified, " +
  "agent:agents(display_name, avatar, verified, office:offices(color))";

export async function isFavorited(listingId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("favorites")
    .select("listing_id")
    .eq("user_id", user.id)
    .eq("listing_id", listingId)
    .maybeSingle();
  return !!data;
}

export async function getFavoriteListings(): Promise<ListingCardData[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("favorites")
    .select(`listing:listings(${CARD})`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? [])
    .map((r: { listing: unknown }) => r.listing)
    .filter(Boolean) as unknown as ListingCardData[];
}

export async function getRecentlyViewed(): Promise<ListingCardData[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("recently_viewed")
    .select(`listing:listings(${CARD})`)
    .eq("user_id", user.id)
    .order("viewed_at", { ascending: false })
    .limit(20);
  return (data ?? [])
    .map((r: { listing: unknown }) => r.listing)
    .filter(Boolean) as unknown as ListingCardData[];
}

export async function getMyViewings() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("viewings")
    .select(
      "id, scheduled_at, status, listing:listings(id, title, district, photo, price), agent:agents(display_name, phone)"
    )
    .eq("buyer_id", user.id)
    .order("scheduled_at", { ascending: true });
  return (data ?? []) as unknown as Array<{
    id: string;
    scheduled_at: string | null;
    status: string;
    listing: { id: string; title: string; district: string | null; photo: string | null; price: number } | null;
    agent: { display_name: string; phone: string | null } | null;
  }>;
}
