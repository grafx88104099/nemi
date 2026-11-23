/**
 * R10 — түгээх холбоосууд (UTM). Цэвэр, клиентэд аюулгүй.
 * siteUrl нь lib/seo/site.ts-ийн нэг эх сурвалжаас.
 */
import { siteUrl } from "@/lib/seo/site";

export type ShareChannel = "facebook" | "viber" | "unegui";

export const SHARE_CHANNEL_ORDER: ShareChannel[] = ["facebook", "viber", "unegui"];

export const SHARE_CHANNELS: Record<ShareChannel, { source: string; medium: string; label: string }> = {
  facebook: { source: "facebook", medium: "social", label: "Facebook" },
  viber: { source: "viber", medium: "messenger", label: "Viber" },
  unegui: { source: "unegui", medium: "classified", label: "unegui.mn" },
};

/** utm_content: түгээсэн агентын id-ийн эхний 8 hex (зураасгүй), эс бөгөөс «nemi». */
export function agentShort(agentId: string | null | undefined): string {
  const hex = (agentId ?? "").toLowerCase().replace(/[^0-9a-f]/g, "");
  return hex.length >= 8 ? hex.slice(0, 8) : "nemi";
}

export function listingShareUrl(listingId: string, channel: ShareChannel, short: string): string {
  const ch = SHARE_CHANNELS[channel];
  const qs = new URLSearchParams({
    utm_source: ch.source,
    utm_medium: ch.medium,
    utm_campaign: "listing",
    utm_content: short,
  });
  return `${siteUrl()}/listings/${encodeURIComponent(listingId)}?${qs.toString()}`;
}

/** Supabase public storage URL бол ?download=<нэр> залгана (хөтөч шууд татна). */
export function photoDownloadUrl(
  url: string,
  filename: string,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL
): string {
  if (!supabaseUrl) return url;
  const base = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/`;
  if (!url.startsWith(base)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(filename)}`;
}

export function viberForwardUrl(text: string): string {
  return `viber://forward?text=${encodeURIComponent(text)}`;
}

export function facebookSharerUrl(link: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
}

export const UNEGUI_POST_URL = "https://www.unegui.mn/";
