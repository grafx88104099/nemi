import { describe, expect, it } from "vitest";

import { scrollLeftToReveal } from "@/components/crm2/ui/scroll-fade-row";

describe("scrollLeftToReveal", () => {
  const row = { left: 0, right: 375, scrollLeft: 0 };
  it("харагдаж буй табыг хөдөлгөхгүй", () => {
    expect(scrollLeftToReveal(row, { left: 100, right: 200 })).toBe(0);
  });
  it("баруун талд нуугдсан идэвхтэй табыг (жишээ: «Хэлцлүүд») харагдуулна", () => {
    expect(scrollLeftToReveal(row, { left: 400, right: 480 })).toBe(480 - 375 + 16);
  });
  it("зүүн талд гүйлгэгдэж үлдсэн табыг буцааж харагдуулна, 0-оос доош биш", () => {
    expect(scrollLeftToReveal({ left: 0, right: 375, scrollLeft: 300 }, { left: -120, right: -40 })).toBe(300 - 120 - 16);
    expect(scrollLeftToReveal({ left: 0, right: 375, scrollLeft: 10 }, { left: -8, right: 60 })).toBe(0);
  });
});
