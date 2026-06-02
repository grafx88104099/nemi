"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export async function saveSearch(
  filters: Record<string, string>,
  name: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };
  const { error } = await supabase
    .from("saved_searches")
    .insert({ user_id: user.id, name, filters });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/saved-searches");
  return { ok: true };
}

export async function deleteSavedSearch(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.from("saved_searches").delete().eq("id", id);
  revalidatePath("/saved-searches");
  return { ok: !error };
}

export async function toggleSearchAlert(id: string, on: boolean): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.from("saved_searches").update({ alert_enabled: on }).eq("id", id);
  revalidatePath("/saved-searches");
  return { ok: !error };
}
