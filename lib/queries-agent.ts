import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

const AGENT_COLUMNS =
  "id, profile_id, office_id, display_name, phone, avatar, avatar_url, rating, reviews_count, " +
  "years, sold, listings_count, verified, premier, response_time, specialty, areas, bio, status";

export type AgentRow = Record<string, unknown> & {
  office: { name: string; color: string | null } | null;
};

export type AgentListingRow = {
  id: string; title: string; price: number; status: string;
  district: string | null; photo: string | null; ai_score: number | null; created_at: string;
};
export type AgentLeadRow = {
  id: string; name: string; phone: string | null; stage: string; score: number | null;
  note: string | null; last_touch: string | null; listing: { title: string } | null;
};
export type AgentViewingRow = {
  id: string; scheduled_at: string | null; status: string; listing: { title: string } | null;
};

/**
 * Нэвтэрсэн хэрэглэгчийн agent мөр (агент биш бол null).
 * React `cache`-ээр нэг хүсэлтийн дотор давхар дуудалтыг дедупльдэнэ
 * (layout + page хоёр зэрэг дуудахад нэг л query явна).
 */
export const getMyAgent = cache(async (): Promise<AgentRow | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("agents")
    .select(`${AGENT_COLUMNS}, office:offices(name, color)`)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (error) console.error("getMyAgent:", error.message);
  return (data as AgentRow | null) ?? null;
});

/** Агентын зарууд (Миний зар + Түрээс удирдах хуудсууд). */
export async function getAgentListings(agentId: string): Promise<AgentListingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select("id, title, price, status, district, photo, ai_score, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });
  if (error) console.error("getAgentListings:", error.message);
  return (data ?? []) as AgentListingRow[];
}

/** Агентын бүх лид (CRM самбар бүх шатыг бүлэглэх тул бүтнээр). */
export async function getAgentLeads(agentId: string): Promise<AgentLeadRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id, name, phone, stage, score, note, last_touch, listing:listings(title)")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });
  if (error) console.error("getAgentLeads:", error.message);
  return (data ?? []) as unknown as AgentLeadRow[];
}

/** Түрээс удирдах хуудсанд: товлосон үзлэгийн тоо. */
export async function getAgentViewingsCount(agentId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("viewings")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId);
  if (error) console.error("getAgentViewingsCount:", error.message);
  return count ?? 0;
}

/**
 * Тойм хуудасны нэгдсэн өгөгдөл — KPI тоонуудыг SQL `count`-аар,
 * жагсаалтуудыг зөвхөн `limit`-тэйгээр татна (бүх мөрийг JS рүү татахгүй).
 */
export async function getAgentOverview(agentId: string) {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const dayStart = `${today}T00:00:00`;
  const dayEnd = `${today}T23:59:59`;

  const [activeCount, leadStages, recentLeads, upcoming, todayCount] = await Promise.all([
    supabase.from("listings").select("id", { count: "exact", head: true })
      .eq("agent_id", agentId).eq("status", "active"),
    supabase.from("leads").select("stage").eq("agent_id", agentId),
    supabase.from("leads")
      .select("id, name, stage, last_touch, listing:listings(title)")
      .eq("agent_id", agentId).order("created_at", { ascending: false }).limit(5),
    supabase.from("viewings")
      .select("id, scheduled_at, status, listing:listings(title)")
      .eq("agent_id", agentId).gte("scheduled_at", dayStart)
      .order("scheduled_at", { ascending: true }).limit(5),
    supabase.from("viewings").select("id", { count: "exact", head: true })
      .eq("agent_id", agentId).gte("scheduled_at", dayStart).lte("scheduled_at", dayEnd),
  ]);

  const stages = (leadStages.data ?? []) as { stage: string }[];
  const byStage: Record<string, number> = {};
  for (const s of stages) byStage[s.stage] = (byStage[s.stage] ?? 0) + 1;

  return {
    today,
    stats: {
      active: activeCount.count ?? 0,
      leads: stages.length,
      newLeads: byStage["new"] ?? 0,
      todayViewings: todayCount.count ?? 0,
    },
    byStage,
    recentLeads: (recentLeads.data ?? []) as unknown as AgentLeadRow[],
    upcoming: (upcoming.data ?? []) as unknown as AgentViewingRow[],
  };
}

/** Эзэн агентын зарууд тус бүр хэдэн агенттай хуваалцагдсаныг буцаана. */
export async function getShareCounts(
  listingIds: string[]
): Promise<Record<string, { count: number; names: string[] }>> {
  if (!listingIds.length) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("listing_shares")
    .select("listing_id, agent:agents!listing_shares_agent_id_fkey(display_name)")
    .in("listing_id", listingIds);

  const map: Record<string, { count: number; names: string[] }> = {};
  for (const row of (data ?? []) as unknown as Array<{
    listing_id: string;
    agent: { display_name: string } | { display_name: string }[] | null;
  }>) {
    const ag = Array.isArray(row.agent) ? row.agent[0] : row.agent;
    const m = (map[row.listing_id] ??= { count: 0, names: [] });
    m.count++;
    if (ag?.display_name) m.names.push(ag.display_name);
  }
  return map;
}

/** Энэ агентад өөр агентуудын хуваалцсан зарууд. */
export async function getSharedWithMe(agentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listing_shares")
    .select(
      "created_at, shared_by, " +
        "listing:listings(id, title, price, district, status, photo, ai_score), " +
        "owner:agents!listing_shares_shared_by_fkey(display_name)"
    )
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as Array<{
    created_at: string;
    listing: {
      id: string; title: string; price: number; district: string | null;
      status: string; photo: string | null; ai_score: number | null;
    } | null;
    owner: { display_name: string } | null;
  }>).filter((r) => r.listing);
}

/** Зөвхөн ӨӨРИЙН зарыг (засварлахаар) буцаана — хуваалцсан/бусдын зар null. */
export async function getMyListing(id: string) {
  const agent = await getMyAgent();
  if (!agent) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select("*, photos:listing_photos(url, sort_order)")
    .eq("id", id)
    .eq("agent_id", agent.id as string)
    .maybeSingle();
  if (error) console.error("getMyListing:", error.message);
  return (data as (Record<string, unknown> & { photos: { url: string; sort_order: number }[] }) | null) ?? null;
}
