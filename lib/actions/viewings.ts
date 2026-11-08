"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { ingestSiteInquiry } from "@/lib/crm/lead-intake";

/** Зар үзсэнийг тэмдэглэх (recently_viewed upsert). Нэвтрээгүй бол алгасна. */
export async function recordView(listingId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
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
  });
  if (error) return { ok: false, error: error.message };
  // §6.1/§6.4: сайтын хандалт CRM-ийн албан бүртгэлд сэжим болж орно
  // (алдаа гарсан ч үзлэгийн захиалга хэвээр).
  await ingestSiteInquiry({
    buyerProfileId: user.id,
    agentId,
    listingId,
    channel: "viewing",
    scheduledAt,
  });
  revalidatePath("/tours");
  return { ok: true };
}
