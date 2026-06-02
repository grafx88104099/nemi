"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Зар дээрх агенттай харилцаа эхлүүлэх (байгаа бол буцаана). */
export async function startConversation(listingId: string): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const { data: listing } = await supabase
    .from("listings")
    .select("agent_id")
    .eq("id", listingId)
    .single();
  if (!listing?.agent_id) return { error: "Агентгүй зар." };

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("buyer_id", user.id)
    .eq("listing_id", listingId)
    .eq("agent_id", listing.agent_id)
    .maybeSingle();
  if (existing) return { id: existing.id };

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      buyer_id: user.id,
      listing_id: listingId,
      agent_id: listing.agent_id,
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

/** Заргүйгээр агенттай шууд харилцаа эхлүүлэх (профайлаас). */
export async function startAgentChat(agentId: string): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("buyer_id", user.id)
    .eq("agent_id", agentId)
    .is("listing_id", null)
    .maybeSingle();
  if (existing) return { id: existing.id };

  const { data, error } = await supabase
    .from("conversations")
    .insert({ buyer_id: user.id, agent_id: agentId, last_message_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export async function sendMessage(conversationId: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const text = body.trim();
  if (!text) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    body: text,
  });
  if (error) return { ok: false, error: error.message };

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  // Хүлээн авагчид мэдэгдэл үүсгэх (нөгөө тал)
  try {
    const { data: cv } = await supabase
      .from("conversations")
      .select("buyer_id, agent:agents(profile_id, display_name)")
      .eq("id", conversationId)
      .single();
    const cvRow = cv as unknown as { buyer_id: string | null; agent: { profile_id: string | null } | null } | null;
    const agentProfile = cvRow?.agent?.profile_id ?? null;
    const recipient = user.id === cvRow?.buyer_id ? agentProfile : cvRow?.buyer_id ?? null;
    if (recipient && recipient !== user.id) {
      const admin = createAdminClient();
      await admin.from("notifications").insert({
        user_id: recipient,
        type: "message",
        title: "Шинэ мессеж",
        body: text.slice(0, 120),
        link: `/messages?c=${conversationId}`,
      });
    }
  } catch {
    // мэдэгдэл амжилтгүй болсон ч мессеж илгээгдсэн хэвээр
  }

  revalidatePath("/messages");
  return { ok: true };
}
