import { describe, expect, it } from "vitest";

import { rankSimilar, similarPriceBand } from "@/lib/similar-listings";

describe("similarPriceBand", () => {
  it("үнэгүй → null", () => {
    expect(similarPriceBand(null)).toBeNull();
    expect(similarPriceBand(0)).toBeNull();
  });
  it("±35%", () => {
    expect(similarPriceBand(100)).toEqual([65, 135]);
  });
});

describe("rankSimilar", () => {
  const rows = [
    { id: "a", price: 130 },
    { id: "b", price: 90 },
    { id: "c", price: 101 },
  ];
  it("үнэгүй бол дараалал хэвээр", () => {
    expect(rankSimilar(rows, null).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
  it("үнийн зөрүүгээр, эх массив өөрчлөгдөхгүй", () => {
    expect(rankSimilar(rows, 100).map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});
