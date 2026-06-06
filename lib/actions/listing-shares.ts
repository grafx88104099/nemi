"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { diffShares } from "@/lib/share-diff";

export type ShareAgent = {
  id: string;
  display_name: string;
  avatar: string | null;
  avatar_url: string | null;
  color: string | null;
  shared: boolean;
};

/** Нэвтэрсэн агент + түүний эзэмшдэг зар мөн эсэхийг шалгана. */
async function ownerContext(listingId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, me: null as null | { id: string; office_id: string | null } };

  const { data: me } = await supabase
    .from("agents")
    .select("id, office_id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!me) return { supabase, me: null };

  // Зар үнэхээр энэ агентынх эсэх (эзэмшил шалгах).
  const { data: listing } = await supabase
    .from("listings")
    .select("id, agent_id")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing || listing.agent_id !== me.id) return { supabase, me: null };

  return { supabase, me: me as { id: string; office_id: string | null } };
}

/**
 * Хуваалцах диалогийн өгөгдөл: ижил оффисын идэвхтэй агентууд
 * (өөрийгөө хасаад) + аль нь аль хэдийн хуваалцагдсан эсэх.
 */
export async function getShareTargets(
  listingId: string
): Promise<{ agents: ShareAgent[]; error?: string }> {
  const { supabase, me } = await ownerContext(listingId);
  if (!me) return { agents: [], error: "Энэ зарыг хуваалцах эрх алга." };
  if (!me.office_id) return { agents: [], error: "Та оффист харьяалагдаагүй байна." };

  const [{ data: mates }, { data: shares }] = await Promise.all([
    supabase
      .from("agents")
      .select("id, display_name, avatar, avatar_url, office:offices(color)")
      .eq("office_id", me.office_id)
      .eq("status", "active")
      .neq("id", me.id)
      .order("display_name"),
    supabase.from("listing_shares").select("agent_id").eq("listing_id", listingId),
  ]);

  const sharedSet = new Set((shares ?? []).map((s) => s.agent_id));
  const rows = (mates ?? []) as unknown as Array<{
    id: string;
    display_name: string;
    avatar: string | null;
    avatar_url: string | null;
    office: { color: string | null } | { color: string | null }[] | null;
  }>;
  const agents: ShareAgent[] = rows.map((a) => {
    const office = a.office;
    const color = Array.isArray(office) ? office[0]?.color ?? null : office?.color ?? null;
    return {
      id: a.id,
      display_name: a.display_name,
      avatar: a.avatar,
      avatar_url: a.avatar_url,
      color,
      shared: sharedSet.has(a.id),
    };
  });

  return { agents };
}

/**
 * Зарын хуваалцлыг шинэчилнэ — desired нь СОНГОГДСОН агентуудын
 * бүрэн жагсаалт (toggle биш, эцсийн төлөв). RLS давхар хамгаална.
 */
export async function setListingShares(
  listingId: string,
  desired: string[]
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, me } = await ownerContext(listingId);
  if (!me) return { ok: false, error: "Энэ зарыг хуваалцах эрх алга." };
  if (!me.office_id) return { ok: false, error: "Та оффист харьяалагдаагүй байна." };

  // Зөвшөөрөгдөх хүлээн авагчид = ижил оффисын идэвхтэй агентууд (өөрийгөө хасаад).
  const { data: mates } = await supabase
    .from("agents")
    .select("id")
    .eq("office_id", me.office_id)
    .eq("status", "active")
    .neq("id", me.id);
  const allowed = (mates ?? []).map((a) => a.id);

  const { data: existing } = await supabase
    .from("listing_shares")
    .select("agent_id")
    .eq("listing_id", listingId);
  const current = (existing ?? []).map((s) => s.agent_id);

  const { toAdd, toRemove } = diffShares(current, desired, allowed);

  if (toRemove.length) {
    const { error } = await supabase
      .from("listing_shares")
      .delete()
      .eq("listing_id", listingId)
      .in("agent_id", toRemove);
    if (error) return { ok: false, error: error.message };
  }
  if (toAdd.length) {
    const { error } = await supabase
      .from("listing_shares")
      .insert(
        toAdd.map((agent_id) => ({ listing_id: listingId, agent_id, shared_by: me.id }))
      );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/agent/listings");
  return { ok: true };
}
