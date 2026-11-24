import { describe, expect, it } from "vitest";

import {
  PRICE_TOO_HIGH,
  PRICE_TOO_LOW,
  formatPricePreview,
  hasFieldErrors,
  issuesByField,
  parsePriceInput,
  perM2FromTotal,
  priceMagnitudeWarning,
  priceToInput,
  shortAmount,
  totalFromPerM2,
  validateFields,
} from "@/lib/crm2/field-validation";

describe("parsePriceInput", () => {
  it("сая, тэрбум, нэгжгүй", () => {
    expect(parsePriceInput("350", "сая")).toBe(350_000_000);
    expect(parsePriceInput("350000000", "none")).toBe(350_000_000);
    expect(parsePriceInput("350 000 000", "none")).toBe(350_000_000);
    expect(parsePriceInput("2,5", "сая")).toBe(2_500_000);
    expect(parsePriceInput("2.5", "сая")).toBe(2_500_000);
    expect(parsePriceInput("1.25", "тэрбум")).toBe(1_250_000_000);
    expect(parsePriceInput("81,47", "none")).toBe(81.47);
  });
  it("буруу оролт → null", () => {
    expect(parsePriceInput("", "сая")).toBeNull();
    expect(parsePriceInput("abc", "none")).toBeNull();
    expect(parsePriceInput("-5", "сая")).toBeNull();
    expect(parsePriceInput(null)).toBeNull();
  });
  it("буцааж бичих", () => {
    expect(priceToInput(350_000_000, "сая")).toBe("350");
    expect(priceToInput(2_500_000, "сая")).toBe("2.5");
    expect(priceToInput(null, "сая")).toBe("");
  });
});

describe("нийт ↔ м²", () => {
  it("хоёр чиглэлд, 2 оронтой бутархайгаар", () => {
    expect(perM2FromTotal(350_000_000, 65)).toBe(5_384_615.38);
    expect(totalFromPerM2(5_384_615.38, 65)).toBe(349_999_999.7);
    expect(totalFromPerM2(4_000_000, 81.47)).toBe(325_880_000);
    expect(perM2FromTotal(100, 0)).toBeNull();
    expect(totalFromPerM2(100, null)).toBeNull();
  });
  it("урьдчилан харах мөр", () => {
    expect(formatPricePreview({ amount: 350_000_000, area_m2: 65 })).toBe("350 000 000 ₮ · м² нь 5.4 сая");
    expect(formatPricePreview({ amount: 350_000_000 })).toBe("350 000 000 ₮");
    expect(formatPricePreview({ amount: 5_000_000, basis: "per_m2", area_m2: 70 })).toBe("5 000 000 ₮/м² · нийт 350 сая");
    expect(formatPricePreview({ amount: 2_500_000, period: "month" })).toBe("2 500 000 ₮/сар");
    expect(formatPricePreview({ amount: 1200, currency: "USD", period: "month" })).toBe("$1 200/сар");
    expect(formatPricePreview({ amount: null })).toBe("");
    expect(shortAmount(1_250_000_000)).toBe("1.25 тэрбум");
  });
});

describe("validateFields", () => {
  it("давхар барилгын давхраас их → алдаа", () => {
    const issues = validateFields({ floor: 19, building_floors: 18 });
    expect(issuesByField(issues, "error").floor).toMatch(/барилгын давхраас/);
    expect(hasFieldErrors(issues)).toBe(true);
    expect(validateFields({ floor: 18, building_floors: 18 })).toEqual([]);
  });
  it("м²-ийн үнэ талбайгүй → алдаа", () => {
    expect(issuesByField(validateFields({ price_basis: "per_m2", price: 1, area_m2: null })).area_m2).toMatch(/хэмжээ/);
  });
  it("ангилал ба хугацаа", () => {
    expect(issuesByField(validateFields({ category: "sale", price_period: "month" }), "error").price_period).toBeTruthy();
    expect(issuesByField(validateFields({ category: "rent", price_period: "total" }), "error").price_period).toBeTruthy();
    const day = validateFields({ category: "lease", price_period: "day" });
    expect(hasFieldErrors(day)).toBe(false);
    expect(day[0]).toMatchObject({ field: "price_period", level: "warning", publish: true });
    expect(day[0].message).toMatch(/нийтлэхэд саад болно/);
    expect(validateFields({ category: "rent", price_period: "day" })[0].message).toMatch(/нийтлэхэд саад болно/);
    expect(validateFields({ category: "lease", price_period: "total" })[0]).toMatchObject({ level: "warning", publish: true });
  });
  it("доллар → нийтлэхэд саад", () => {
    const usd = validateFields({ category: "sale", currency: "USD", price: 100_000, price_period: "total" });
    expect(usd).toEqual([expect.objectContaining({ field: "currency", level: "warning", publish: true })]);
    expect(usd[0].message).toMatch(/нийтлэхэд саад болно/);
  });
});

describe("үнийн хэмжээний сануулга (ангиллаар)", () => {
  it("худалдах нийт: 5 сая – 50 тэрбум", () => {
    expect(priceMagnitudeWarning({ category: "sale", price: 350 })).toBe(PRICE_TOO_LOW);
    expect(priceMagnitudeWarning({ category: "sale", price: 4_999_999 })).toBe(PRICE_TOO_LOW);
    expect(priceMagnitudeWarning({ category: "sale", price: 350_000_000 })).toBeNull();
    expect(priceMagnitudeWarning({ category: "sale", price: 60e9 })).toBe(PRICE_TOO_HIGH);
  });
  it("түрээс сараар: 100 000 ₮ – 100 сая", () => {
    expect(priceMagnitudeWarning({ category: "rent", price: 2.5, price_period: "month" })).toBe(PRICE_TOO_LOW);
    expect(priceMagnitudeWarning({ category: "rent", price: 2_500_000, price_period: "month" })).toBeNull();
    expect(priceMagnitudeWarning({ category: "managed_rent", price: 2_500_000_000, price_period: "month" })).toBe(PRICE_TOO_HIGH);
    // м²-ийн түрээс: нийтээр нь (талбайтай бол).
    expect(priceMagnitudeWarning({ category: "rent", price: 30_000, price_basis: "per_m2", area_m2: 80 })).toBeNull();
    expect(priceMagnitudeWarning({ category: "rent", price: 30_000, price_basis: "per_m2", area_m2: null })).toBeNull();
    expect(priceMagnitudeWarning({ category: "rent", price: 50_000, price_period: "day" })).toBeNull();
  });
  it("худалдах м²-ийн үнэ: 100 000 ₮ – 50 сая", () => {
    expect(priceMagnitudeWarning({ category: "sale", price: 5_400_000, price_basis: "per_m2", area_m2: 65 })).toBeNull();
    expect(priceMagnitudeWarning({ category: "sale", price: 5.4, price_basis: "per_m2", area_m2: 65 })).toBe(PRICE_TOO_LOW);
    expect(priceMagnitudeWarning({ category: "sale", price: 60_000_000, price_basis: "per_m2", area_m2: 65 })).toBe(PRICE_TOO_HIGH);
  });
  it("доллар, үнэгүй, ангилалгүй → сануулахгүй; хадгалахыг саатуулахгүй", () => {
    expect(priceMagnitudeWarning({ category: "sale", price: 350, currency: "USD" })).toBeNull();
    expect(priceMagnitudeWarning({ category: "sale", price: null })).toBeNull();
    expect(priceMagnitudeWarning({ price: 350 })).toBeNull();
    const w = validateFields({ category: "sale", price: 350, price_period: "total" });
    expect(w).toEqual([{ field: "price", level: "warning", message: PRICE_TOO_LOW }]);
    expect(hasFieldErrors(w)).toBe(false);
    expect(PRICE_TOO_LOW).toBe("Үнэ хэт бага байна — нэгжийг шалгана уу");
  });
});
