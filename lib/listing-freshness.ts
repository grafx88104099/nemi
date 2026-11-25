import { daysSince } from "@/lib/format";

/**
 * Зарын «хуучирсан» дохио (нийтийн зарын хуудас). updated_at-д найдахгүй —
 * бөөнөөр шинэчилсэн мөрүүд (2026-11-13) бүгд «шинэ» харагдана; нийтэлсэн
 * огноо (created_at)-оос тоолно.
 */
export const STALE_LISTING_DAYS = 60;

/** created_at-аас хойш STALE_LISTING_DAYS-аас олон хоног өнгөрсөн бол true. */
export function isStaleListing(createdAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return false;
  return daysSince(createdAt, now) > STALE_LISTING_DAYS;
}
