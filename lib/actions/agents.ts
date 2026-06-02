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
