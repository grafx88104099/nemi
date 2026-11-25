import { describe, expect, it } from "vitest";

import { propertyTabCounts } from "../tab-counts";

describe("propertyTabCounts — утсанд гүйлгэх табын тоо", () => {
  it("хэлцлийн тоо, дуудлага/үзүүлэлтийн нийлбэр", () => {
    expect(
      propertyTabCounts({
        rows: [
          { calls: 3, showings: 1 },
          { calls: 1, showings: 0 },
        ],
        error: false,
      })
    ).toEqual({ calls: 4, showings: 1, deals: 2 });
  });

  it("хэлцэлгүй — 0 (CardTabsNav тэмдэг харуулахгүй)", () => {
    expect(propertyTabCounts({ rows: [], error: false })).toEqual({ calls: 0, showings: 0, deals: 0 });
  });

  it("уншиж чадаагүй бол тоогүй — буруу 0 гаргахгүй", () => {
    expect(propertyTabCounts({ rows: [], error: true })).toEqual({});
  });
});
