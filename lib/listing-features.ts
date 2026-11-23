/**
 * Зарын онцлог — хяналттай толь (listings.features). ЦЭВЭР, клиентэд аюулгүй.
 *
 * Дараалал нь supabase/migrations/20261123000800_listing_features_facets.sql-ийн
 * CHECK (listings_features_chk) ба listing_facets()-ийн unnest массивтай ЯГ
 * ижил байх ёстой (lib/__tests__/listing-features.test.ts шалгана).
 *
 * Зогсоол: parking > 0 бол 'parking' үргэлж байна — DB триггер
 * listings_features_parking ба validateListingInput (withDerivedFeatures) хоёул.
 */
export const FEATURE_KEYS = [
  "furnished",
  "parking",
  "elevator",
  "balcony",
  "security",
  "storage",
  "kids_playground",
  "pets_allowed",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  furnished: "Тавилгатай",
  parking: "Зогсоолтой",
  elevator: "Лифттэй",
  balcony: "Тагттай",
  security: "Харуул, камертай",
  storage: "Агуулахтай",
  kids_playground: "Хүүхдийн тоглоомын талбай",
  pets_allowed: "Тэжээвэр амьтан зөвшөөрнө",
};

export const LISTING_FEATURES: { key: FeatureKey; label: string }[] = FEATURE_KEYS.map((key) => ({
  key,
  label: FEATURE_LABEL[key],
}));

const KEY_SET: ReadonlySet<string> = new Set(FEATURE_KEYS);

export function isFeatureKey(x: unknown): x is FeatureKey {
  return typeof x === "string" && KEY_SET.has(x);
}

/** Хүчингүйг хасаж, давхардлыг арилгаж, толийн дарааллаар эрэмбэлнэ. */
export function normalizeFeatures(xs: readonly unknown[]): FeatureKey[] {
  const set = new Set(xs.filter(isFeatureKey));
  return FEATURE_KEYS.filter((k) => set.has(k));
}

/** parking > 0 бол 'parking'-ийг нэмээд хэвшүүлнэ (DB триггертэй ижил дүрэм). */
export function withDerivedFeatures(features: readonly unknown[], parking: number | null | undefined): FeatureKey[] {
  return normalizeFeatures((parking ?? 0) > 0 ? [...features, "parking"] : features);
}
