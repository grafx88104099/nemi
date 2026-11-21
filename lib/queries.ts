import { unstable_cache } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { ListingCardData } from "@/components/listings/ListingCard";
import { applyListingFilters, type ListingFilters } from "@/lib/listing-filters";
import { LISTINGS_TAG } from "@/lib/listings-cache";

/**
 * ListingCard-д шаардагдах зарын багананууд. Оффисын самбар ч ижил картыг
 * харуулдаг тул нэг эх сурвалжаас авна — нэг нь зураггүй болж хоцрохоос
 * сэргийлнэ. Агентын embed нь дуудлага болгонд өөр (оффисын самбар
 * agents!inner-ээр шүүдэг) тул тусад нь залгана.
 */
export const LISTING_CARD_COLUMNS =
  "id, title, price, ai_score, rooms, area, floor, district, photo, hot, verified, deal_type, " +
  "rent_advance_months, rent_deposit_months, created_at, owner_name";

/** ListingCard-д хэрэгтэй агентын embed (нийтийн хуудсууд). */
export const LISTING_CARD_AGENT = "agent:agents(display_name, avatar, avatar_url, verified, office:offices(color))";

const CARD_SELECT = `${LISTING_CARD_COLUMNS}, ${LISTING_CARD_AGENT}`;

/** Нүүр хуудасны «Онцлох зарууд»-ын эх оффис (PMC). */
export const FEATURED_OFFICE_ID = "931b4a39-a38a-442c-9170-ea573522efd0";

/**
 * «Онцлох зарууд» — ЭРГЭЛДДЭГ: FEATURED_OFFICE_ID-ийн агентуудын хамгийн
 * сүүлд нэмэгдсэн 10 боломжит (идэвхтэй, нүүр зурагтай) зар. Шинэ зар нэмэгдэхэд
 * эхэнд орж, хамгийн хуучин нь гарна; зарагдсан/буцаагдсан нь өөрөө гарна.
 * Гараар тэмдэглэх (listings.featured) биш, дүрмээр — ямар ч замаар (агентын
 * маягт, Staff-аас нийтлэх) нэмэгдсэн зар шууд орно.
 *
 * 60 секунд кэшлэнэ; зар өөрчлөх Server Action бүр шууд цэвэрлэнэ
 * (lib/listings-cache). cookie-гүй public client (unstable_cache дотор cookies() хориотой).
 */
export const getFeaturedListings = unstable_cache(
  async (limit = 10): Promise<ListingCardData[]> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("listings")
      .select(
        `${LISTING_CARD_COLUMNS}, agent:agents!inner(display_name, avatar, avatar_url, verified, office_id, office:offices(color))`
      )
      .eq("status", "active")
      .not("photo", "is", null)
      .eq("agent.office_id", FEATURED_OFFICE_ID)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(limit);
    if (error) console.error("getFeaturedListings:", error.message);
    return (data ?? []) as unknown as ListingCardData[];
  },
  ["featured-listings"],
  { tags: [LISTINGS_TAG], revalidate: 60 }
);

/**
 * Нүүр хуудасны «Шинэ зарууд»: хамгийн сүүлд нийтлэгдсэн, одоо БОЛОМЖИТ
 * (идэвхтэй — зарагдсан, ноорог, хянагдаж буйг оруулахгүй) зар. Нүүрэнд
 * зураггүй карт харагдахгүйн тулд нүүр зурагтайг л авна.
 *
 * Зар хадгалах Server Action бүр кэшийг шууд цэвэрлэдэг (lib/listings-cache);
 * Staff-аас DB триггерээр шинэчлэгдсэн зар 60 секундэд гарна.
 * RLS (anon) түдгэлзүүлсэн оффисын зарыг өөрөө хасна.
 */
export const getLatestListings = unstable_cache(
  async (limit = 8): Promise<ListingCardData[]> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("listings")
      .select(CARD_SELECT)
      .eq("status", "active")
      .not("photo", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(limit);
    if (error) console.error("getLatestListings:", error.message);
    return (data ?? []) as unknown as ListingCardData[];
  },
  ["latest-listings"],
  { tags: [LISTINGS_TAG], revalidate: 60 }
);

export type { ListingFilters } from "@/lib/listing-filters";

/**
 * AI үнэлгээтэй идэвхтэй зар байгаа эсэх. Байхгүй үед «AI оноо» эрэмбийг
 * санал болгохгүй — бүх утга хоосон бол эрэмбэ утгагүй.
 */
export const hasAiScores = unstable_cache(
  async (): Promise<boolean> => {
    const supabase = createPublicClient();
    const { count } = await supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .not("ai_score", "is", null);
    return (count ?? 0) > 0;
  },
  ["has-ai-scores"],
  { tags: [LISTINGS_TAG], revalidate: 600 }
);

/** Жагсаалт + шүүлтүүр + хуудаслалт. */
export async function getListings(f: ListingFilters = {}) {
  const supabase = await createClient();
  const pageSize = f.pageSize ?? 12;
  const page = f.page ?? 1;
  const from = (page - 1) * pageSize;

  let query = applyListingFilters(
    supabase.from("listings").select(CARD_SELECT, { count: "exact" }).eq("status", "active"),
    f
  );

  switch (f.sort) {
    case "price_asc": query = query.order("price", { ascending: true }); break;
    case "price_desc": query = query.order("price", { ascending: false }); break;
    // Үнэлгээгүй зар төгсгөлд — эс бөгөөс DESC нь NULL-ийг эхэнд тавина.
    case "ai": query = query.order("ai_score", { ascending: false, nullsFirst: false }); break;
  }
  // Ижил үнэтэй/оноотой зар хуудас хооронд үсрэхгүй байх тогтвортой эрэмбэ.
  query = query.order("created_at", { ascending: false }).order("id", { ascending: true });

  const { data, count } = await query.range(from, from + pageSize - 1);
  return {
    listings: (data ?? []) as unknown as ListingCardData[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

// Нийтийн хуудас тул агент/оффисоос зөвхөн харуулдаг баганыг л татна
// (profile_id, offices.email/license_no зэрэг дотоод/нууц талбар ил гаргахгүй).
const LISTING_DETAIL_SELECT =
  "*, agent:agents(id, display_name, avatar, avatar_url, verified, rating, reviews_count, phone, " +
  "office:offices(name, color)), photos:listing_photos(url, sort_order, is_primary), " +
  "valuations:ai_valuations(score, note, model, created_at)";

export async function getListingById(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listings")
    .select(LISTING_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  return data as
    | (Record<string, unknown> & {
        agent: (Record<string, unknown> & { office: Record<string, unknown> | null }) | null;
        photos: { url: string; sort_order: number; is_primary: boolean }[];
        valuations: { score: number | null; note: string | null; model: string | null; created_at: string }[];
      })
    | null;
}

/**
 * Төстэй зар: ижил төрөл (худалдах/түрээс) ба үл хөдлөхийн төрөл, үнэ ±35%.
 * Эхлээд ижил дүүргээс, дутвал бусад дүүргээс; үнээр хамгийн ойрыг түрүүлнэ.
 */
export async function getSimilarListings(
  l: { id: string; deal_type: string | null; type: string | null; district: string | null; price: number },
  limit = 4
): Promise<ListingCardData[]> {
  if (!l.deal_type || !(l.price > 0)) return [];
  const supabase = await createClient();
  const base = () => {
    let q = supabase
      .from("listings")
      .select(`${CARD_SELECT}, deal_type`)
      .eq("status", "active")
      .eq("deal_type", l.deal_type as "sale" | "rent")
      .neq("id", l.id)
      .gte("price", Math.floor(l.price * 0.65))
      .lte("price", Math.ceil(l.price * 1.35));
    if (l.type) q = q.eq("type", l.type);
    return q;
  };
  const byGap = (a: ListingCardData, b: ListingCardData) => Math.abs(a.price - l.price) - Math.abs(b.price - l.price);

  const near = l.district ? ((await base().eq("district", l.district).limit(24)).data ?? []) : [];
  const picked = (near as unknown as ListingCardData[]).sort(byGap).slice(0, limit);
  if (picked.length < limit) {
    const { data } = await base().limit(24);
    const seen = new Set(picked.map((p) => p.id));
    const more = ((data ?? []) as unknown as ListingCardData[]).filter((p) => !seen.has(p.id)).sort(byGap);
    picked.push(...more.slice(0, limit - picked.length));
  }
  return picked;
}

/** Зарын координат (lng/lat) — geography баганаас ST_X/ST_Y RPC-ээр. */
export async function getListingPoint(id: string): Promise<{ lat: number; lng: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("listing_point", { p_id: id });
  if (error) { console.error("getListingPoint:", error.message); return null; }
  const row = (data as { lng: number; lat: number }[] | null)?.[0];
  return row ? { lat: row.lat, lng: row.lng } : null;
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
  office_id: string | null;
  office: { name: string; color: string | null } | null;
};

export async function getAgents(officeId?: string): Promise<AgentListItem[]> {
  const supabase = await createClient();
  let q = supabase
    .from("agents")
    .select(
      "id, display_name, avatar, avatar_url, rating, reviews_count, sold, years, verified, premier, specialty, areas, languages, office_id, office:offices(name, color)"
    )
    .eq("status", "active");
  if (officeId) q = q.eq("office_id", officeId);
  const { data } = await q
    .order("premier", { ascending: false })
    .order("rating", { ascending: false });
  return (data ?? []) as unknown as AgentListItem[];
}

export type OfficeListItem = {
  id: string;
  name: string;
  logo: string | null;
  logo_url: string | null;
  color: string | null;
  verified: boolean;
  agents_count: number;
  listings_count: number;
  specialties: string[];
};

/** Нийтэд харагдах оффисуудын жагсаалт. */
export async function getOffices(): Promise<OfficeListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("offices")
    .select("id, name, logo, logo_url, color, verified, agents_count, listings_count, specialties")
    .order("verified", { ascending: false })
    .order("agents_count", { ascending: false });
  return (data ?? []) as unknown as OfficeListItem[];
}

export type OfficeProfile = {
  id: string;
  name: string;
  logo: string | null;
  logo_url: string | null;
  cover_url: string | null;
  color: string | null;
  verified: boolean;
  agents_count: number;
  listings_count: number;
  about: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  founded_year: number | null;
  license_no: string | null;
  facebook: string | null;
  instagram: string | null;
  specialties: string[];
  service_areas: string[];
};

/** Нэг оффисын нийтийн профайл. */
export async function getOfficeProfile(id: string): Promise<OfficeProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("offices")
    .select(
      "id, name, logo, logo_url, cover_url, color, verified, agents_count, listings_count, about, description, phone, email, address, website, founded_year, license_no, facebook, instagram, specialties, service_areas"
    )
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as OfficeProfile) ?? null;
}

export async function getAgentById(id: string) {
  const supabase = await createClient();
  const [{ data: agent }, { data: listings }, { data: reviews }] = await Promise.all([
    supabase
      .from("agents")
      // profile_id/legacy_id зэрэг дотоод талбар оруулахгүй; оффисоос зөвхөн name,color
      .select(
        "id, display_name, phone, avatar, avatar_url, rating, reviews_count, years, sold, " +
        "listings_count, verified, premier, response_time, languages, areas, specialty, bio, " +
        "sub_ratings, office:offices(name, color)"
      )
      .eq("id", id)
      .maybeSingle(),
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
