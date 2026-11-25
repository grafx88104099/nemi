/**
 * Агентын нийтийн статистик (профайл, AgentCard) — хоосон/0 утгыг харуулахгүй.
 * DB-д rating/years null, sold/reviews_count 0 байх нь «мэдээлэл алга» гэсэн үг
 * (жинхэнэ тэг биш) тул «0 зарсан», « жил туршлага» гэж бичихгүй.
 */

export type AgentStatsInput = {
  rating: number | null;
  reviews_count: number | null;
  sold: number | null;
  years: number | null;
};

export type AgentStats = {
  /** Сэтгэгдэлтэй үнэлгээ (сэтгэгдэлгүй rating-ийг харуулахгүй). */
  rating: { value: number; reviews: number } | null;
  /** Зарсан зарын тоо (> 0 үед). */
  sold: number | null;
  /** Туршлагын жил (> 0 үед). */
  years: number | null;
};

const positive = (n: number | null | undefined): number | null =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;

export function agentStats(a: AgentStatsInput): AgentStats {
  const reviews = positive(a.reviews_count);
  const rating = typeof a.rating === "number" && Number.isFinite(a.rating) && reviews ? a.rating : null;
  return {
    rating: rating != null && reviews ? { value: rating, reviews } : null,
    sold: positive(a.sold),
    years: positive(a.years),
  };
}

/** Профайлд нэг дор харуулах зарын тоо; илүү бол «Бүх N зар» холбоос. */
export const AGENT_PROFILE_LISTINGS = 12;
