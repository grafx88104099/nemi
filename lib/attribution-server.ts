import "server-only";

import { cookies, headers } from "next/headers";

import {
  ATTR_COOKIE,
  attributionColumns,
  decodeAttribution,
  optedOut,
  type AttributionColumns,
} from "@/lib/attribution";

/**
 * Server action-д: одоогийн хүсэлтийн nemi_attr cookie-гоос utm_* багана.
 * DNT/GPC илгээж буй бол (cookie өмнө нь тавигдсан байсан ч) {} буцаана.
 * Ямар ч алдаа бизнесийн үйлдлийг унагахгүй — {} буцаана.
 */
export async function readAttributionColumns(): Promise<AttributionColumns> {
  try {
    const h = await headers();
    if (optedOut((n) => h.get(n))) return {};
    const store = await cookies();
    return attributionColumns(decodeAttribution(store.get(ATTR_COOKIE)?.value));
  } catch {
    return {};
  }
}
