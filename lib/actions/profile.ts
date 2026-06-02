"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export async function updateProfile(input: {
  full_name: string;
  phone: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: input.full_name, phone: input.phone })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/account");
  return { ok: true };
}
