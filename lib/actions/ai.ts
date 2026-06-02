"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { valuateWithAI } from "@/lib/ai/valuate";

/** Зарын AI үнэлгээ хийж ai_valuations + listings.ai_score-д хадгална. */
export async function valuateListing(
  listingId: string
): Promise<{ score?: number; note?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const { data: l } = await supabase
    .from("listings")
    .select("title, type, district, rooms, area, price, price_per_m2, year")
    .eq("id", listingId)
    .single();
  if (!l) return { error: "not_found" };

  // Харьцуулах зарууд (ижил дүүрэг + төрөл)
  const { data: comps } = await supabase
    .from("listings")
    .select("price, area, price_per_m2")
    .eq("district", l.district ?? "")
    .eq("type", l.type ?? "")
    .neq("id", listingId)
    .limit(8);

  const { result, error } = await valuateWithAI({
    title: l.title,
    type: l.type,
    district: l.district,
    rooms: l.rooms,
    area: l.area,
    price: l.price,
    price_per_m2: l.price_per_m2,
    year: l.year,
    comps: comps ?? [],
  });

  if (error) return { error };
  if (!result) return { error: "no_result" };

  // Эзэмшигч агент өөрийн зарын ai_score-г шинэчилнэ (RLS зөвшөөрнө)
  await supabase
    .from("listings")
    .update({ ai_score: result.score, ai_note: result.note })
    .eq("id", listingId);
  await supabase.from("ai_valuations").insert({
    listing_id: listingId,
    score: result.score,
    note: result.note,
    model: "claude-haiku-4-5",
  });

  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/agent/listings");
  return { score: result.score, note: result.note };
}
