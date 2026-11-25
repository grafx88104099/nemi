import { describe, expect, it } from "vitest";

import { AGENT_PROFILE_LISTINGS, agentStats } from "@/lib/agent-stats";

describe("agentStats — хоосон/0 статистикийг нуух", () => {
  it("DB-ийн одоогийн хоосон утгууд (rating/years null, sold/reviews 0) → бүгд null", () => {
    expect(agentStats({ rating: null, reviews_count: 0, sold: 0, years: null })).toEqual({
      rating: null,
      sold: null,
      years: null,
    });
  });

  it("сэтгэгдэлгүй rating-ийг харуулахгүй (худал «★ 5 (0)» биш)", () => {
    expect(agentStats({ rating: 5, reviews_count: 0, sold: 0, years: 0 }).rating).toBeNull();
    expect(agentStats({ rating: 4.8, reviews_count: null, sold: 0, years: 0 }).rating).toBeNull();
  });

  it("бодит утгууд хэвээр", () => {
    expect(agentStats({ rating: 4.7, reviews_count: 12, sold: 5, years: 3 })).toEqual({
      rating: { value: 4.7, reviews: 12 },
      sold: 5,
      years: 3,
    });
  });

  it("сөрөг, NaN утгыг харуулахгүй", () => {
    expect(agentStats({ rating: Number.NaN, reviews_count: 3, sold: -1, years: Number.NaN })).toEqual({
      rating: null,
      sold: null,
      years: null,
    });
  });

  it("профайлд нэг дор 12 зар", () => {
    expect(AGENT_PROFILE_LISTINGS).toBe(12);
  });
});
