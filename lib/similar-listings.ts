/**
 * Төстэй зарын цэвэр туслахууд (getSimilarListings) — Supabase-гүй тестлэгдэнэ.
 */

/** Үнийн ±35% хүрээ. Үнэгүй (null/0) бол хязгааргүй → null. */
export function similarPriceBand(price: number | null): [number, number] | null {
  return price != null && price > 0 ? [Math.floor(price * 0.65), Math.ceil(price * 1.35)] : null;
}

/**
 * Үнийн хүрээтэй бол үнээр хамгийн ойрыг түрүүлсэн ХУУЛБАР; үгүй бол DB-ийн
 * дараалал (хамгийн шинэ нь эхэнд) хэвээр.
 */
export function rankSimilar<T extends { price: number }>(rows: T[], price: number | null): T[] {
  if (!similarPriceBand(price)) return rows;
  const p = price as number;
  return [...rows].sort((a, b) => Math.abs(a.price - p) - Math.abs(b.price - p));
}
