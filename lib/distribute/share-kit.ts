import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/seo/site";

import { canPostFacebook, postUrl } from "./facebook-config";
import { fbConfig } from "./facebook";
import { agentShort, listingShareUrl, photoDownloadUrl, SHARE_CHANNEL_ORDER, type ShareChannel } from "./links";
import { summarizeByListing } from "./stats-model";
import { buildShareTexts } from "./templates";
import type { ChannelStatRow, ShareKitData } from "./types";

const MAX_PHOTOS = 30;
const DAY_MS = 86_400_000;

/**
 * ЗӨВХӨН нийтийн багана (owner_phone, owner_name, review_note, crm2_*, хаягийн
 * нарийн мэдээлэл ОРОХГҮЙ). Агентын утас нь нийтийн зар дээр аль хэдийн харагддаг.
 */
const KIT_SELECT =
  "id, title, price, status, deal_type, type, district, rooms, area, floor, amenities, description, " +
  "rent_advance_months, rent_deposit_months, agent_id, " +
  "agent:agents(id, display_name, phone, office_id, office:offices(name)), " +
  "photos:listing_photos(url, sort_order, is_primary)";

type KitListing = {
  id: string;
  title: string | null;
  price: number | null;
  status: string;
  deal_type: string | null;
  type: string | null;
  district: string | null;
  rooms: number | null;
  area: number | null;
  floor: string | null;
  amenities: string[] | null;
  description: string | null;
  rent_advance_months: number | null;
  rent_deposit_months: number | null;
  agent_id: string | null;
  agent: {
    id: string;
    display_name: string | null;
    phone: string | null;
    office_id: string | null;
    office: { name: string | null } | null;
  } | null;
  photos: { url: string; sort_order: number; is_primary: boolean }[] | null;
};

/**
 * «Түгээх» хэрэгслийн өгөгдөл. Эрх: listing_can_distribute (агент өөрөө, оффисын
 * panel_admin, платформын админ, эсвэл холбогдсон CRM2 хөрөнгийг харах эрхтэй ажилтан).
 * Эрхгүй / олдохгүй бол null.
 */
export async function getShareKitData(listingId: string): Promise<ShareKitData | null> {
  if (!isUuid(listingId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: allowed, error: allowErr } = await supabase.rpc("listing_can_distribute", {
    p_listing: listingId,
  });
  if (allowErr) console.error("getShareKitData can_distribute:", allowErr.message);
  if (allowed !== true) return null;

  const [listingRes, myAgentRes, statsRes, profileRes, lastPostRes] = await Promise.all([
    supabase.from("listings").select(KIT_SELECT).eq("id", listingId).maybeSingle(),
    supabase.from("agents").select("id").eq("profile_id", user.id).limit(1).maybeSingle(),
    supabase.rpc("listing_channel_stats", { p_listing: listingId, p_days: 30 }),
    supabase.from("profiles").select("role, office_id").eq("id", user.id).maybeSingle(),
    supabase
      .from("listing_share_posts")
      .select("external_id, created_at")
      .eq("listing_id", listingId)
      .eq("channel", "facebook")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (listingRes.error) console.error("getShareKitData listing:", listingRes.error.message);
  if (statsRes.error) console.error("getShareKitData stats:", statsRes.error.message);
  if (lastPostRes.error) console.error("getShareKitData last post:", lastPostRes.error.message);

  const l = listingRes.data as unknown as KitListing | null;
  if (!l || !l.agent_id) return null;

  const active = l.status === "active";
  const short = agentShort(myAgentRes.data?.id ?? l.agent_id);
  const links = Object.fromEntries(
    SHARE_CHANNEL_ORDER.map((ch) => [ch, listingShareUrl(l.id, ch, short)])
  ) as Record<ShareChannel, string>;

  const photos = [...(l.photos ?? [])]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
    .slice(0, MAX_PHOTOS)
    .map((p, i) => ({
      url: p.url,
      downloadUrl: photoDownloadUrl(p.url, `nemi-${l.id.slice(0, 8)}-${i + 1}.jpg`),
    }));

  const texts = buildShareTexts(
    {
      title: l.title ?? "",
      price: l.price,
      dealType: l.deal_type,
      type: l.type,
      district: l.district,
      rooms: l.rooms,
      area: l.area,
      floor: l.floor,
      amenities: l.amenities,
      description: l.description,
      rentAdvanceMonths: l.rent_advance_months,
      rentDepositMonths: l.rent_deposit_months,
      agentName: l.agent?.display_name ?? null,
      agentPhone: l.agent?.phone ?? null,
      officeName: l.agent?.office?.name ?? null,
    },
    links
  );

  const rows = (statsRes.error ? [] : (statsRes.data ?? [])) as ChannelStatRow[];
  const stats = summarizeByListing(rows)[l.id]?.byChannel ?? {};

  const last = lastPostRes.error ? null : lastPostRes.data;
  const recent = !!last && Date.now() - new Date(last.created_at).getTime() < DAY_MS;
  const profile = profileRes.data as { role: string | null; office_id: string | null } | null;
  const enabled =
    active &&
    !recent &&
    canPostFacebook({
      role: profile?.role,
      myOfficeId: profile?.office_id,
      listingOfficeId: l.agent?.office_id,
      cfg: fbConfig(),
    });

  return {
    listingId: l.id,
    status: l.status,
    active,
    title: l.title ?? "",
    links,
    texts,
    photos,
    stats,
    facebook: {
      enabled,
      lastPostedAt: last?.created_at ?? null,
      lastPostUrl: last?.external_id ? postUrl(last.external_id) : null,
      lastPostPending: !!last && !last.external_id,
    },
  };
}

/** Агентын бүх зарын суваг × тоо (RPC эрх шалгана; эрхгүй бол хоосон). Алдаа → []. */
export async function getAgentChannelStats(agentId: string, days = 30): Promise<ChannelStatRow[]> {
  if (!isUuid(agentId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("listing_channel_stats", { p_agent: agentId, p_days: days });
  if (error) {
    console.error("getAgentChannelStats:", error.message);
    return [];
  }
  return (data ?? []) as ChannelStatRow[];
}
