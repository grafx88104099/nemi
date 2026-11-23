import { describe, it, expect } from "vitest";

import { fmtMNT, shortMNT, fmtArea, fmtPriceShort } from "@/lib/format";
import { priceShort } from "@/lib/seo/listing";

describe("format helpers", () => {
  it("fmtMNT нь төгрөгийн тэмдэгтэй болгоно", () => {
    expect(fmtMNT(1000000)).toContain("₮");
  });

  it("shortMNT нь тэрбум/саяг товчилно (CRM, зайгүй ₮)", () => {
    expect(shortMNT(1_650_000_000)).toBe("1.65 тэрбум₮");
    expect(shortMNT(285_000_000)).toBe("285 сая₮");
    expect(shortMNT(50_000)).toContain("₮");
  });

  it("shortMNT 100 саяас доош нэг аравтын оронтой (өмнө «3 сая₮» гэж тойруулдаг байсан)", () => {
    expect(shortMNT(2_500_000)).toBe("2.5 сая₮");
    expect(shortMNT(2_000_000)).toBe("2 сая₮");
    expect(shortMNT(1_000_000_000)).toBe("1 тэрбум₮");
  });

  it("fmtArea нь м² нэмнэ, null үед —", () => {
    expect(fmtArea(118)).toBe("118 м²");
    expect(fmtArea(null)).toBe("—");
  });
});

describe("fmtPriceShort (нийтийн UI)", () => {
  it.each([
    [320_000_000, "320 сая ₮"],
    [2_500_000, "2.5 сая ₮"],
    [1_650_000_000, "1.65 тэрбум ₮"],
    [1_000_000_000, "1 тэрбум ₮"],
    [7_226_460_000, "7.23 тэрбум ₮"],
    [2_000_000, "2 сая ₮"],
    [12_400_000, "12.4 сая ₮"],
    [9_960_000, "10 сая ₮"],
    [999_600_000, "1 тэрбум ₮"],
    [999_999, "1 сая ₮"],
    [850_000, "850 мянга ₮"],
    [82_500, "82.5 мянга ₮"],
    [1_000, "1 мянга ₮"],
    [950, "950 ₮"],
    [0, "0 ₮"],
  ])("%d → %s", (n, out) => {
    expect(fmtPriceShort(n)).toBe(out);
  });

  it("түрээс /сар залгана", () => {
    expect(fmtPriceShort(2_500_000, "rent")).toBe("2.5 сая ₮/сар");
    expect(fmtPriceShort(2_500_000, "sale")).toBe("2.5 сая ₮");
    expect(fmtPriceShort(2_500_000, null)).toBe("2.5 сая ₮");
  });

  it("NaN, сөрөг → —", () => {
    expect(fmtPriceShort(NaN)).toBe("—");
    expect(fmtPriceShort(-5)).toBe("—");
    expect(fmtPriceShort(Infinity)).toBe("—");
  });

  it("lib/seo/listing.ts priceShort хөндөгдөөгүй", () => {
    expect(priceShort(320_000_000)).toBe("320 сая₮");
  });
});
