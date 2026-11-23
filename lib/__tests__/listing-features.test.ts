import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  FEATURE_KEYS,
  FEATURE_LABEL,
  LISTING_FEATURES,
  isFeatureKey,
  normalizeFeatures,
  withDerivedFeatures,
} from "@/lib/listing-features";
import { LOAN8_MAX_PRICE } from "@/lib/listing-filters";
import { getBankProducts } from "@/lib/loans/banks";

const MIGRATION = readFileSync(
  fileURLToPath(new URL("../../supabase/migrations/20261123000800_listing_features_facets.sql", import.meta.url)),
  "utf8"
);

describe("FEATURE_KEYS", () => {
  it("давхардалгүй, тогтсон дараалалтай", () => {
    expect([...FEATURE_KEYS]).toEqual([
      "furnished", "parking", "elevator", "balcony", "security", "storage", "kids_playground", "pets_allowed",
    ]);
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
    expect(LISTING_FEATURES.map((x) => x.key)).toEqual([...FEATURE_KEYS]);
    for (const k of FEATURE_KEYS) expect(FEATURE_LABEL[k]).toBeTruthy();
    expect(FEATURE_LABEL.security).toBe("Харуул, камертай");
  });

  it("isFeatureKey", () => {
    expect(isFeatureKey("parking")).toBe(true);
    expect(isFeatureKey("Parking")).toBe(false);
    expect(isFeatureKey(1)).toBe(false);
  });
});

describe("миграц 20261123000800-тэй тулгалт", () => {
  it("бүх array['furnished',…] литерал FEATURE_KEYS-тэй дараалал хүртэл ижил", () => {
    const literals = [...MIGRATION.matchAll(/array\[('furnished'[^\]]*)\]/g)].map((m) =>
      m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""))
    );
    expect(literals.length).toBeGreaterThanOrEqual(2); // CHECK + facets unnest
    for (const l of literals) expect(l).toEqual([...FEATURE_KEYS]);
  });

  it("357000000 = LOAN8_MAX_PRICE, parking триггер байна", () => {
    const prices = [...MIGRATION.matchAll(/price <= (\d{6,})/g)].map((m) => Number(m[1]));
    expect(prices.length).toBeGreaterThan(0);
    for (const p of prices) expect(p).toBe(LOAN8_MAX_PRICE);
    expect(MIGRATION).toContain("create trigger listings_features_parking");
  });
});

describe("normalizeFeatures / withDerivedFeatures", () => {
  it("хүчингүйг хасаж, давхардлыг арилгаж, толийн дарааллаар", () => {
    expect(normalizeFeatures(["elevator", "furnished", "elevator", "bogus", 5, null])).toEqual(["furnished", "elevator"]);
    expect(normalizeFeatures([])).toEqual([]);
  });

  it("parking > 0 → 'parking'", () => {
    expect(withDerivedFeatures([], 2)).toEqual(["parking"]);
    expect(withDerivedFeatures(["furnished"], 0)).toEqual(["furnished"]);
    expect(withDerivedFeatures(["elevator", "parking"], 1)).toEqual(["parking", "elevator"]);
    expect(withDerivedFeatures(["parking"], 0)).toEqual(["parking"]); // гараар сонгосныг хадгална
    expect(withDerivedFeatures(["furnished"], null)).toEqual(["furnished"]);
  });
});

describe("8%-ийн зээлийн босго", () => {
  it("LOAN8_MAX_PRICE = floor(maxAmount / (1 − minDownPct) / 1e6) · 1e6 (lib/loans/banks.ts)", async () => {
    const gov = (await getBankProducts()).filter((p) => p.kind === "government" && p.maxAmount != null);
    expect(gov.length).toBeGreaterThan(0);
    const best = gov.reduce((a, b) => ((b.maxAmount ?? 0) > (a.maxAmount ?? 0) ? b : a));
    const expected = Math.floor(best.maxAmount! / (1 - best.minDownPct / 100) / 1e6) * 1e6;
    expect(LOAN8_MAX_PRICE).toBe(expected);
  });
});
