import { describe, it, expect } from "vitest";

import { fmtMNT, shortMNT, fmtArea } from "@/lib/format";

describe("format helpers", () => {
  it("fmtMNT нь төгрөгийн тэмдэгтэй болгоно", () => {
    expect(fmtMNT(1000000)).toContain("₮");
  });

  it("shortMNT нь тэрбум/саяг товчилно", () => {
    expect(shortMNT(1_650_000_000)).toBe("1.65 тэрбум₮");
    expect(shortMNT(285_000_000)).toBe("285 сая₮");
    expect(shortMNT(50_000)).toContain("₮");
  });

  it("fmtArea нь м² нэмнэ, null үед —", () => {
    expect(fmtArea(118)).toBe("118 м²");
    expect(fmtArea(null)).toBe("—");
  });
});
