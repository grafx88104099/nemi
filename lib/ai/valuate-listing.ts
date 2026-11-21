import { createAdminClient } from "@/lib/supabase/admin";
import { VALUATION_MODEL, valuateWithAI, type ValuationResult } from "@/lib/ai/valuate";

/**
 * Нэг зарыг AI-аар үнэлж listings.ai_score/ai_note + ai_valuations-д хадгална.
 * Service role-оор ажиллана — дуудагч эрхийг ӨӨРӨӨ шалгасан байх ёстой
 * (агентын товч: эзэмшил; зар хадгалах: тухайн агент; cron: нууц түлхүүр).
 */
export async function valuateAndStore(
  listingId: string
): Promise<{ result?: ValuationResult; error?: string }> {
  const admin = createAdminClient();
  const { data: l } = await admin
    .from("listings")
    .select("id, title, type, district, deal_type, rooms, area, price, price_per_m2, year, status")
    .eq("id", listingId)
    .maybeSingle();
  if (!l) return { error: "not_found" };

  // Харьцуулах: ижил гүйлгээ, дүүрэг, төрлийн идэвхтэй зарууд.
  let comps = admin
    .from("listings")
    .select("price, area, price_per_m2")
    .eq("status", "active")
    .eq("deal_type", l.deal_type)
    .neq("id", listingId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (l.district) comps = comps.eq("district", l.district);
  if (l.type) comps = comps.eq("type", l.type);
  const { data: compRows } = await comps;

  const { result, error } = await valuateWithAI({
    title: l.title,
    type: l.type,
    district: l.district,
    deal_type: l.deal_type,
    rooms: l.rooms,
    area: l.area,
    price: l.price,
    price_per_m2: l.price_per_m2,
    year: l.year,
    comps: compRows ?? [],
  });
  if (error || !result) return { error: error ?? "no_result" };

  const { error: upErr } = await admin
    .from("listings")
    .update({ ai_score: result.score, ai_note: result.note })
    .eq("id", listingId);
  if (upErr) return { error: upErr.message };
  await admin.from("ai_valuations").insert({
    listing_id: listingId,
    score: result.score,
    note: result.note,
    model: VALUATION_MODEL,
  });
  return { result };
}

/** Түлхүүр тохируулсан эсэх — тохируулаагүй бол автомат үнэлгээг огт эхлүүлэхгүй. */
export function aiValuationEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
