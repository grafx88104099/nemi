import { describe, it, expect } from "vitest";

import { recommendedRent } from "@/lib/rent";

describe("recommendedRent", () => {
  it("орлогын 30% / 40%-ийг тооцоолно", () => {
    expect(recommendedRent(3_000_000)).toEqual({ recommended: 900_000, max: 1_200_000 });
  });
  it("өрийг хасна", () => {
    expect(recommendedRent(3_000_000, 1_000_000)).toEqual({ recommended: 600_000, max: 800_000 });
  });
  it("сөрөг disposable-ийг 0 болгоно", () => {
    expect(recommendedRent(1_000_000, 2_000_000)).toEqual({ recommended: 0, max: 0 });
  });
});
