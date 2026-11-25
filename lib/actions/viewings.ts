"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/user";
import { readAttributionColumns } from "@/lib/attribution-server";

/**
 * Зар үзсэнийг тэмдэглэх (recently_viewed upsert). Нэвтрээгүй бол алгасна.
 * Зарын хуудасны render-ээс дуудагдана — хэрэглэгчийг Topbar, isFavorited-тэй
 * НЭГ getUser-ээр хуваалцана (getAuthUser нь React cache, хүсэлт бүрт шинэ).
 */
export async function recordView(listingId: string) {
  const user = await getAuthUser();
  if (!user) return;
  const supabase = await createClient();
  await supabase
    .from("recently_viewed")
    .upsert(
      { user_id: user.id, listing_id: listingId, viewed_at: new Date().toISOString() },
      { onConflict: "user_id,listing_id" }
    );
}

/** Үзлэгийн цаг товлох. */
export async function bookViewing(
  listingId: string,
  agentId: string | null,
  scheduledAt: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { error } = await supabase.from("viewings").insert({
    listing_id: listingId,
    agent_id: agentId,
    buyer_id: user.id,
    scheduled_at: scheduledAt,
    status: "pending",
    ...(await readAttributionColumns()),
  });
  if (error) return { ok: false, error: error.message };
  // Агентад DB trigger (viewings_notify_agent) мэдэгдэнэ.
  revalidatePath("/tours");
  return { ok: true };
}
