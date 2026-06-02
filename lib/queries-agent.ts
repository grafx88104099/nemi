import { createClient } from "@/lib/supabase/server";

/** Нэвтэрсэн хэрэглэгчийн agent мөр (агент биш бол null). */
export async function getMyAgent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("agents")
    .select("*, office:offices(name, color)")
    .eq("profile_id", user.id)
    .maybeSingle();
  return data as
    | (Record<string, unknown> & { office: { name: string; color: string | null } | null })
    | null;
}

export async function getAgentDashboard(agentId: string) {
  const supabase = await createClient();
  const [listings, leads, viewings] = await Promise.all([
    supabase
      .from("listings")
      .select("id, title, price, status, district, photo, ai_score, created_at")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false }),
    supabase
      .from("leads")
      .select("id, name, phone, stage, score, note, last_touch, listing:listings(title)")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false }),
    supabase
      .from("viewings")
      .select("id, scheduled_at, status, listing:listings(title)")
      .eq("agent_id", agentId)
      .order("scheduled_at", { ascending: true }),
  ]);

  const ls = listings.data ?? [];
  return {
    listings: ls as Array<{
      id: string; title: string; price: number; status: string;
      district: string | null; photo: string | null; ai_score: number | null; created_at: string;
    }>,
    leads: (leads.data ?? []) as unknown as Array<{
      id: string; name: string; phone: string | null; stage: string; score: number | null;
      note: string | null; last_touch: string | null; listing: { title: string } | null;
    }>,
    viewings: (viewings.data ?? []) as unknown as Array<{
      id: string; scheduled_at: string | null; status: string; listing: { title: string } | null;
    }>,
    stats: {
      total: ls.length,
      active: ls.filter((l) => l.status === "active").length,
      leads: (leads.data ?? []).length,
      pendingViewings: (viewings.data ?? []).filter((v) => v.status === "pending").length,
    },
  };
}

export async function getMyListing(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listings")
    .select("*, photos:listing_photos(url, sort_order)")
    .eq("id", id)
    .single();
  return data as (Record<string, unknown> & { photos: { url: string; sort_order: number }[] }) | null;
}
