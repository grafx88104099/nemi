"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/** Зар хадгалах/устгах. Буцаах: шинэ төлөв (true = хадгалсан). */
export async function toggleFavorite(listingId: string): Promise<{ favorited: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { favorited: false, error: "auth" };

  const { data: existing } = await supabase
    .from("favorites")
    .select("listing_id")
    .eq("user_id", user.id)
    .eq("listing_id", listingId)
    .maybeSingle();

  if (existing) {
    await supabase.from("favorites").delete().eq("user_id", user.id).eq("listing_id", listingId);
    revalidatePath("/favorites");
    return { favorited: false };
  }
  await supabase.from("favorites").insert({ user_id: user.id, listing_id: listingId });
  revalidatePath("/favorites");
  return { favorited: true };
}
