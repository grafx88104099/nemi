/**
 * R10 — түгээх хэрэгслийн ЦЭВЭР төрлүүд. Клиент файлууд эндээс зөвхөн
 * `import type` хийнэ (server-only модуль руу хүрэхгүй).
 */
import type { ShareChannel } from "./links";

export type { ShareChannel } from "./links";

/** listing_channel_stats RPC-ийн мөр (bigint нь string болж ирж болно). */
export type ChannelStatRow = {
  listing_id: string;
  channel: string;
  views: number | string;
  chats: number | string;
  viewing_requests: number | string;
};

export type Counts = { views: number; chats: number; viewings: number };

export type ShareTexts = {
  facebook: string;
  viber: string;
  unegui: { title: string; price: string; body: string };
};

export type ShareKitData = {
  listingId: string;
  status: string;
  active: boolean;
  title: string;
  links: Record<ShareChannel, string>;
  texts: ShareTexts;
  photos: { url: string; downloadUrl: string }[];
  /** Суваг (utm_source эсвэл 'direct') → сүүлийн 30 хоногийн тоо. */
  stats: Record<string, Counts>;
  facebook: {
    enabled: boolean;
    lastPostedAt: string | null;
    lastPostUrl: string | null;
    lastPostPending: boolean;
  };
};
