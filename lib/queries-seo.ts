/**
 * SEO/шэйрийн уншилтууд — cookie-гүй анон client (RLS үйлчилнэ; хувийн талбар
 * хэзээ ч select хийхгүй). Серверт л ашиглана («server-only» багц төсөлд
 * суугаагүй тул импортлоогүй; анон түлхүүрээр нийтийн мөр л уншдаг тул аюулгүй).
 *
 * React cache(): нэг хүсэлт доторх давхардлыг (generateMetadata + page) нэгтгэнэ,
 * хүсэлт хооронд хадгалахгүй — санамсаргүй UUID дата кэшийг дүүргэхгүй, хуучирсан
 * үр дүн хүсэлтээс илүү амьдрахгүй. Дуудагч эхлээд isUuid(id) шалгана.
 * Алдааг ШИДНЭ: түр зуурын DB алдаа noindex/буруу metadata болж кэшлэгдэхгүй
 * (500 → мөлхөгч дахин оролдоно).
 */
import { cache } from "react";

import { createPublicClient } from "@/lib/supabase/public";
import type { ClosedListing, ListingSeo } from "@/lib/seo/listing";
import type { AgentSeo, OfficeSeo } from "@/lib/seo/profiles";

const LISTING_SEO_SELECT =
  "id, title, description, price, price_per_m2, deal_type, type, rooms, area, floor, district, photo, " +
  "created_at, updated_at, photos:listing_photos(url, sort_order, is_primary)";

export const getListingSeo = cache(async (id: string): Promise<ListingSeo | null> => {
  const { data, error } = await createPublicClient()
    .from("listings")
    .select(LISTING_SEO_SELECT)
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`getListingSeo: ${error.message}`);
  return (data as unknown as ListingSeo | null) ?? null;
});

let warnedClosedMissing = false;

/** Хаагдсан агентын зар (listing_closed_public RPC). RPC байхгүй (PGRST202) бол унтаа → null. */
export const getClosedListing = cache(async (id: string): Promise<ClosedListing | null> => {
  const { data, error } = await createPublicClient().rpc("listing_closed_public", { p_id: id });
  if (error) {
    if (error.code === "PGRST202") {
      if (!warnedClosedMissing) {
        warnedClosedMissing = true;
        console.error("getClosedListing: listing_closed_public RPC олдсонгүй (migration тавигдаагүй?)");
      }
      return null;
    }
    throw new Error(`getClosedListing: ${error.message}`);
  }
  return (data?.[0] as ClosedListing | undefined) ?? null;
});

/** Идэвхтэй агент (RLS түдгэлзсэн оффисын агентыг ч нууна). phone/profile_id АВАХГҮЙ. */
export const getAgentSeo = cache(async (id: string): Promise<AgentSeo | null> => {
  const { data, error } = await createPublicClient()
    .from("agents")
    .select("id, display_name, avatar_url, rating, reviews_count, sold, years, specialty, areas, bio, office:offices(name)")
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`getAgentSeo: ${error.message}`);
  return (data as unknown as AgentSeo | null) ?? null;
});

/** Оффис (offices_select RLS = true → түдгэлзсэн нь ч ирнэ; suspended_at-аар noindex). phone/email/address/license_no/watermark_* АВАХГҮЙ. */
export const getOfficeSeo = cache(async (id: string): Promise<OfficeSeo | null> => {
  const { data, error } = await createPublicClient()
    .from("offices")
    .select("id, name, logo_url, cover_url, agents_count, listings_count, about, description, service_areas, suspended_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getOfficeSeo: ${error.message}`);
  return (data as unknown as OfficeSeo | null) ?? null;
});

export type SitemapRows = {
  listings: { id: string; updated_at: string | null; photo: string | null }[];
  agents: { id: string }[];
  offices: { id: string }[];
};

const PAGE = 1000; // PostgREST max-rows
const MAX_LISTINGS = 45000; // sitemap-ийн 50k хязгаараас доош

/** Sitemap-ийн динамик мөрүүд (зөвхөн идэвхтэй зар/агент, түдгэлзээгүй оффис). Алдаа → шиднэ. */
export async function getSitemapRows(): Promise<SitemapRows> {
  const sb = createPublicClient();
  const listings: SitemapRows["listings"] = [];
  for (let i = 0; i < MAX_LISTINGS; i += PAGE) {
    const { data, error } = await sb
      .from("listings")
      .select("id, updated_at, photo")
      .eq("status", "active")
      .order("id", { ascending: true })
      .range(i, i + PAGE - 1);
    if (error) throw new Error(`getSitemapRows listings: ${error.message}`);
    listings.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }

  const [agents, offices] = await Promise.all([
    sb.from("agents").select("id").eq("status", "active"),
    sb.from("offices").select("id").is("suspended_at", null),
  ]);
  if (agents.error) throw new Error(`getSitemapRows agents: ${agents.error.message}`);
  if (offices.error) throw new Error(`getSitemapRows offices: ${offices.error.message}`);

  return { listings, agents: agents.data ?? [], offices: offices.data ?? [] };
}
