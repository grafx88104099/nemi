import type { Crm2Tone } from "@/lib/crm2/labels";

/**
 * Нийтийн зарын (public.listings.status) төлвийн монгол нэр. CRM-ийн хөрөнгийн
 * төлвөөс ялгаатай: зар нь хөрөнгөө дагаж автоматаар шинэчлэгдэнэ
 * (crm2_sync_listing), буцаасан зар үргэлж «withdrawn».
 */
export const LISTING_STATUS_LABEL: Record<string, string> = {
  draft: "Ноорог",
  review: "Хянагдаж буй",
  active: "Нийтэд харагдаж байна",
  paused: "Түр зогссон",
  sold: "Зарагдсан",
  rented: "Түрээслэгдсэн",
  withdrawn: "Зарнаас буцаасан",
};

export const LISTING_STATUS_TONE: Record<string, Crm2Tone> = {
  draft: "neutral",
  review: "amber",
  active: "green",
  paused: "amber",
  sold: "rose",
  rented: "rose",
  withdrawn: "neutral",
};

/** Танихгүй төлөв ирвэл кодыг нь хэвээр нь харуулна (хоосон бол «—»). */
export function listingStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return LISTING_STATUS_LABEL[status] ?? status;
}

export function listingStatusTone(status: string | null | undefined): Crm2Tone {
  if (!status) return "neutral";
  return LISTING_STATUS_TONE[status] ?? "neutral";
}
