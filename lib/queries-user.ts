import { createClient } from "@/lib/supabase/server";
import type { ListingCardData } from "@/components/listings/ListingCard";
import { LISTING_CARD_SELECT } from "@/lib/listing-card-select";

/** Нийтийн картын багана л (anon браузер клиент ч ашигладаг) — lib/listing-card-select. */
const CARD = LISTING_CARD_SELECT;

/** queries-hub-д зориулсан alias (ижил select). */
export const CARD_SELECT_USER = LISTING_CARD_SELECT;

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

export async function getRecentlyViewed(limit = 20): Promise<ListingCardData[]> {
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
    .limit(limit);
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
