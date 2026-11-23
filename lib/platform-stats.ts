import { unstable_cache } from "next/cache";

import { createPublicClient } from "@/lib/supabase/public";
import { LISTINGS_TAG } from "@/lib/listings-cache";
import { computePlatformStats, type PlatformStats, type StatsListingRow } from "@/lib/platform-stats-core";

export type { PlatformStats, DistrictStat } from "@/lib/platform-stats-core";

const PAGE = 1000; // PostgREST max_rows = 1000 (supabase/config.toml) → .limit(5000) чимээгүй тасарна.
const MAX_PAGES = 5;

/**
 * Нүүр хуудас, footer-ийн бодит тоо (идэвхтэй зар, дүүрэг, м² медиан,
 * баталгаажсан агент, оффис). Cookie-гүй public client → anon RLS: getListings-тэй
 * ижил мөрүүд (идэвхтэй, түдгэлзээгүй оффис). Зар нэмэх/засахад LISTINGS_TAG
 * цэвэрлэгдэнэ; эс бөгөөс 1 цаг. Алдааг ШИДНЭ (unstable_cache алдааг кэшлэхгүй) —
 * дуудагч `.catch(() => null)` хийж тоог нууна.
 */
export const getPlatformStats = unstable_cache(
  async (): Promise<PlatformStats> => {
    const supabase = createPublicClient();

    async function listingRows(): Promise<StatsListingRow[]> {
      const rows: StatsListingRow[] = [];
      for (let p = 0; p < MAX_PAGES; p++) {
        const from = p * PAGE;
        const { data, error } = await supabase
          .from("listings")
          .select("district, deal_type, type, price, area, created_at")
          .eq("status", "active")
          .order("id")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`getPlatformStats listings: ${error.message}`);
        const page = (data ?? []) as unknown as StatsListingRow[];
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      return rows;
    }

    const [rows, agents, offices] = await Promise.all([
      listingRows(),
      supabase
        .from("agents")
        .select("id", { count: "exact", head: true })
        .eq("verified", true)
        .eq("status", "active"),
      supabase.from("offices").select("id", { count: "exact", head: true }).is("suspended_at", null),
    ]);
    if (agents.error) console.error("getPlatformStats agents:", agents.error.message);
    if (offices.error) console.error("getPlatformStats offices:", offices.error.message);

    return computePlatformStats(rows, agents.count ?? 0, offices.count ?? 0, Date.now());
  },
  ["platform-stats-v2"],
  { tags: [LISTINGS_TAG], revalidate: 3600 }
);
