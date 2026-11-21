"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { valuateAndStore } from "@/lib/ai/valuate-listing";

/** Агент өөрийн зарыг гараар AI-аар дахин үнэлүүлэх. */
export async function valuateListing(
  listingId: string
): Promise<{ score?: number; note?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  // Эзэмшил шалгана — зөвхөн өөрийн зарыг үнэлүүлнэ (AI зардал дэмий гарахаас сэргийлнэ).
  const { data: me } = await supabase.from("agents").select("id").eq("profile_id", user.id).maybeSingle();
  if (!me) return { error: "not_agent" };
  const { data: l } = await supabase.from("listings").select("agent_id").eq("id", listingId).maybeSingle();
  if (!l) return { error: "not_found" };
  if (l.agent_id !== me.id) return { error: "forbidden" };

  const { result, error } = await valuateAndStore(listingId);
  if (error || !result) return { error: error ?? "no_result" };

  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/agent/listings");
  return { score: result.score, note: result.note };
}
