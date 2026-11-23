"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { GUEST_FAVS_MAX, UUID_RE, sanitizeListingIds } from "@/lib/guest-favorites";

/** Зар хадгалах/устгах. Буцаах: шинэ төлөв (true = хадгалсан). */
export async function toggleFavorite(listingId: string): Promise<{ favorited: boolean; error?: string }> {
  if (typeof listingId !== "string" || !UUID_RE.test(listingId)) return { favorited: false, error: "invalid" };

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

/**
 * Энэ төхөөрөмж дээр (localStorage) хадгалсан зарыг нэвтэрсэн бүртгэлд нэгтгэнэ.
 * Зөвхөн идэвхтэй зарыг нэмнэ; аль хэдийн хадгалсныг алгасна (ON CONFLICT DO
 * NOTHING). `inserted` = ШИНЭЭР нэмэгдсэн мөрүүд — «Буцаах» яг эдгээрийг л устгана.
 */
export async function mergeGuestFavorites(
  ids: unknown
): Promise<{ ok: boolean; inserted: string[]; error?: string }> {
  const clean = sanitizeListingIds(ids, GUEST_FAVS_MAX);
  if (!clean.length) return { ok: true, inserted: [] };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, inserted: [], error: "auth" };

  const { data: visible, error: e1 } = await supabase
    .from("listings")
    .select("id")
    .in("id", clean)
    .eq("status", "active");
  if (e1) return { ok: false, inserted: [], error: "db" };
  if (!visible?.length) return { ok: true, inserted: [] };

  const { data: ins, error: e2 } = await supabase
    .from("favorites")
    .upsert(
      visible.map((v) => ({ user_id: user.id, listing_id: v.id })),
      { onConflict: "user_id,listing_id", ignoreDuplicates: true }
    )
    .select("listing_id");
  if (e2) return { ok: false, inserted: [], error: "db" };

  revalidatePath("/favorites");
  return { ok: true, inserted: (ins ?? []).map((r) => r.listing_id) };
}

/** Өөрийн хадгалсан заруудаас өгөгдсөн id-уудыг хасна (нэгтгэлийн «Буцаах»). */
export async function removeFavorites(ids: unknown): Promise<{ ok: boolean }> {
  const clean = sanitizeListingIds(ids, GUEST_FAVS_MAX);
  if (!clean.length) return { ok: true };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  // RLS favorites_own ч user_id = auth.uid()-г шаардана.
  const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).in("listing_id", clean);
  revalidatePath("/favorites");
  return { ok: !error };
}
