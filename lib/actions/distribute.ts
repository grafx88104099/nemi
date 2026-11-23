"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { canPostFacebook, postUrl } from "@/lib/distribute/facebook-config";
import { fbConfig, postToPageFeed } from "@/lib/distribute/facebook";
import { agentShort, listingShareUrl } from "@/lib/distribute/links";
import { getShareKitData } from "@/lib/distribute/share-kit";
import type { ShareKitData } from "@/lib/distribute/types";

const NO_ACCESS = "Энэ зарыг түгээх эрх алга эсвэл зар олдсонгүй.";
const FB_FORBIDDEN = "Оффисын Facebook хуудсанд зөвхөн оффисын админ нийтэлнэ.";
const FB_GENERIC = "Facebook-т нийтэлж чадсангүй. Дахин оролдоно уу.";
const FB_COOLDOWN =
  "Энэ зарыг одоогоор Facebook-т нийтлэх боломжгүй: сүүлийн 24 цагт нийтэлсэн, нийтлэл хүлээгдэж буй, эсвэл зар нийтэд харагдахгүй байна.";

/** «Түгээх» цонхны өгөгдөл (эрхийг getShareKitData → listing_can_distribute шалгана). */
export async function loadShareKit(
  listingId: string
): Promise<{ ok: true; data: ShareKitData } | { ok: false; error: string }> {
  try {
    const data = await getShareKitData(String(listingId ?? ""));
    return data ? { ok: true, data } : { ok: false, error: NO_ACCESS };
  } catch (e) {
    console.error("loadShareKit:", e instanceof Error ? e.message : "unknown");
    return { ok: false, error: NO_ACCESS };
  }
}

const PostSchema = z.object({
  listing_id: z.uuid(),
  message: z.string().trim().min(10).max(5000),
});

/**
 * Оффисын Facebook хуудсанд зарыг нийтлэх. Давхар нийтлэлээс DB түвшинд
 * (listing_share_reserve: advisory lock + 24 цагийн хүлээгдэж буй мөр) хамгаална.
 * Холбоосыг серверт бүтээнэ (клиентээс авахгүй).
 */
export async function postListingToFacebook(input: {
  listing_id: string;
  message: string;
}): Promise<{ ok: true; postUrl: string } | { ok: false; error: string }> {
  const parsed = PostSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Нийтлэлийн текст 10–5000 тэмдэгт байх ёстой." };
  const { listing_id, message } = parsed.data;

  const cfg = fbConfig();
  if (!cfg) return { ok: false, error: "Facebook хуудас холбогдоогүй байна." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Нэвтэрнэ үү." };

  const [profileRes, listingRes, myAgentRes] = await Promise.all([
    supabase.from("profiles").select("role, office_id").eq("id", user.id).maybeSingle(),
    supabase.from("listings").select("id, status, agent_id, agent:agents(office_id)").eq("id", listing_id).maybeSingle(),
    supabase.from("agents").select("id").eq("profile_id", user.id).limit(1).maybeSingle(),
  ]);
  const listing = listingRes.data as unknown as {
    id: string;
    status: string;
    agent_id: string | null;
    agent: { office_id: string | null } | null;
  } | null;
  if (!listing || !listing.agent_id) return { ok: false, error: NO_ACCESS };
  if (listing.status !== "active") return { ok: false, error: "Зар нийтэд идэвхтэй үед л нийтэлнэ." };

  const profile = profileRes.data;
  if (
    !canPostFacebook({
      role: profile?.role,
      myOfficeId: profile?.office_id,
      listingOfficeId: listing.agent?.office_id,
      cfg,
    })
  ) {
    return { ok: false, error: FB_FORBIDDEN };
  }

  const { data: reservation, error: reserveErr } = await supabase.rpc("listing_share_reserve", {
    p_listing: listing_id,
  });
  if (reserveErr) {
    if (reserveErr.code === "42501") return { ok: false, error: FB_FORBIDDEN };
    console.error("listing_share_reserve:", reserveErr.code, reserveErr.message);
    return { ok: false, error: FB_GENERIC };
  }
  // null: 24 цагт нийтэлсэн/хүлээгдэж буй, эсвэл зар нийтэд харагдахгүй — нэг ерөнхий мессеж.
  if (!reservation) return { ok: false, error: FB_COOLDOWN };

  const link = listingShareUrl(listing.id, "facebook", agentShort(myAgentRes.data?.id ?? listing.agent_id));
  const res = await postToPageFeed(cfg, { message, link });

  if (!res.ok) {
    if (res.definite) {
      const { error: relErr } = await supabase.rpc("listing_share_release", { p_id: reservation });
      if (relErr) console.error("listing_share_release:", relErr.message);
    }
    // definite=false: захиалга үлдэнэ → 24 цагийн хамгаалалт хэвээр (давхар пост гаргахгүй).
    return { ok: false, error: res.error };
  }

  const { error: doneErr } = await supabase.rpc("listing_share_complete", {
    p_id: reservation,
    p_external_id: res.id,
  });
  if (doneErr) console.error("listing_share_complete:", doneErr.message);

  revalidatePath("/agent/listings");
  return { ok: true, postUrl: postUrl(res.id) };
}
