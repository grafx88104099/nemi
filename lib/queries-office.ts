import { createClient } from "@/lib/supabase/server";

/** Нэвтэрсэн office_admin-ийн оффис + агентууд + зарууд (эс бөгөөс null). */
export async function getMyOffice() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, office_id")
    .eq("id", user.id)
    .single();
  if (!profile?.office_id || (profile.role !== "office_admin" && profile.role !== "admin")) return null;

  const [{ data: office }, { data: agents }, { data: listings }] = await Promise.all([
    supabase.from("offices").select("*").eq("id", profile.office_id).single(),
    supabase
      .from("agents")
      .select("id, display_name, avatar, phone, rating, sold, listings_count, verified, premier, specialty, status")
      .eq("office_id", profile.office_id)
      .order("rating", { ascending: false }),
    supabase
      .from("listings")
      .select("id, title, price, status, district, ai_score, verified, agent:agents!inner(display_name, office_id)")
      .eq("agent.office_id", profile.office_id)
      .order("created_at", { ascending: false }),
  ]);

  return {
    office: office as Record<string, unknown>,
    agents: (agents ?? []) as Array<{
      id: string; display_name: string; avatar: string | null; phone: string | null;
      rating: number | null; sold: number; listings_count: number; verified: boolean; premier: boolean; specialty: string | null;
      status: "pending" | "active" | "rejected";
    }>,
    listings: (listings ?? []) as unknown as Array<{
      id: string; title: string; price: number; status: string; district: string | null; ai_score: number | null; verified: boolean;
      agent: { display_name: string } | null;
    }>,
  };
}

/** Оффисын админ өөрийн оффисын ТУХАЙН агентыг удирдах дэлгэрэнгүй. */
export async function getOfficeAgent(agentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, office_id")
    .eq("id", user.id)
    .single();
  if (!profile?.office_id || (profile.role !== "office_admin" && profile.role !== "admin")) return null;

  // Зөвхөн өөрийн оффисын агентыг (office_id таарсан)
  const { data: agent } = await supabase
    .from("agents")
    .select("*, office:offices(name, color)")
    .eq("id", agentId)
    .eq("office_id", profile.office_id)
    .maybeSingle();
  if (!agent) return null;

  const { data: listings } = await supabase
    .from("listings")
    .select("id, title, price, status, district, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  return {
    agent: agent as unknown as Record<string, unknown> & { office: { name: string; color: string | null } | null },
    listings: (listings ?? []) as Array<{
      id: string; title: string; price: number; status: string; district: string | null; created_at: string;
    }>,
  };
}
