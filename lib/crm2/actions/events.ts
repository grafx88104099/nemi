import { uiEventSchema, type UiEventInput } from "@/lib/crm2/schemas";

/**
 * UI хэмжилт (P2) — fire-and-forget. ЗОРИУД 'use server' БИШ: тогтсон гарын үсэг нь синхрон `void`
 * (async server action биш), мөн deploy бүрт солигддог action-ID-ээс хамаарахгүйн тулд тогтвортой
 * POST /api/crm2/events route руу илгээнэ (route: Origin шалгалт, uiEventSchema, хэрэглэгчийн session).
 *
 * Зөвхөн хугацаа, тоо, туг — нэр, утас, чөлөөт текст ХЭЗЭЭ Ч илгээхгүй (schema ба DB guard хоёулаа хаана).
 * Алдаа, сүлжээгүй байдал хэрэглэгчид харагдахгүй (хэмжилт ажлыг хэзээ ч саатуулахгүй). Сервер дээр
 * дуудвал юу ч хийхгүй.
 */

export const UI_EVENTS_URL = "/api/crm2/events";

export function logUiEvent(e: UiEventInput): void {
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  const parsed = uiEventSchema.safeParse(e);
  if (!parsed.success) return;
  try {
    void fetch(UI_EVENTS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
      credentials: "same-origin",
      cache: "no-store",
      // Хуудаснаас гарах (pagehide) үед ч илгээгдэнэ.
      keepalive: true,
    }).catch(() => {});
  } catch {
    // хэмжилт хэзээ ч алдаа шидэхгүй
  }
}
