"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type AgentProfileInput = {
  display_name: string;
  phone: string;
  avatar: string;
  avatar_url: string;
  bio: string;
  specialty: string;
  response_time: string;
  areas: string[];
  languages: string[];
};

/** Нэвтэрсэн агент ӨӨРИЙН профайлаа засна (RLS: profile_id = auth.uid()). */
export async function updateMyAgentProfile(
  input: AgentProfileInput
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { error } = await supabase
    .from("agents")
    .update({
      display_name: input.display_name.trim(),
      phone: input.phone || null,
      avatar: input.avatar.slice(0, 3).toUpperCase() || null,
      avatar_url: input.avatar_url || null,
      bio: input.bio || null,
      specialty: input.specialty || null,
      response_time: input.response_time || null,
      areas: input.areas.map((s) => s.trim()).filter(Boolean),
      languages: input.languages.map((s) => s.trim()).filter(Boolean),
    })
    .eq("profile_id", user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/agent/profile");
  return { ok: true };
}

/**
 * Оффис админ ӨӨРИЙГӨӨ уг оффисын агентаар бүртгэх (эсвэл болих).
 * enable=true: agents мөр active болгож үүсгэнэ/сэргээнэ → нийтэд агент болж
 * харагдаж, /agent самбараар зар, лидээ хөтөлнө. enable=false: идэвхгүйжүүлнэ.
 * RLS: agents_insert/update нь office_admin-д өөрийн оффист зөвшөөрдөг.
 */
export async function setSelfAgent(
  enable: boolean
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, office_id, full_name, email, avatar_url")
    .eq("id", user.id)
    .single();
  if (!profile || (profile.role !== "office_admin" && profile.role !== "admin")) {
    return { ok: false, error: "Зөвхөн оффисын админ өөрийгөө агентаар бүртгэнэ." };
  }
  if (!profile.office_id) return { ok: false, error: "Танд харьяалагдах оффис алга." };

  const { data: existing } = await supabase
    .from("agents")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (enable) {
    const name = (profile.full_name || profile.email?.split("@")[0] || "Агент").trim();
    const action = existing
      ? supabase
          .from("agents")
          .update({ status: "active", office_id: profile.office_id })
          .eq("id", existing.id)
      : supabase.from("agents").insert({
          profile_id: user.id,
          office_id: profile.office_id,
          display_name: name,
          avatar: name.slice(0, 2).toUpperCase(),
          avatar_url: profile.avatar_url || null,
          status: "active",
          verified: true,
        });
    const { error } = await action;
    if (error) return { ok: false, error: error.message };
  } else if (existing) {
    const { error } = await supabase
      .from("agents")
      .update({ status: "rejected" })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/office");
  revalidatePath("/agent");
  revalidatePath("/agents");
  return { ok: true };
}
