import { describe, it, expect } from "vitest";

import { monthlyPayment, quoteProduct, type LoanProduct, type QuoteInput } from "@/lib/loans/banks";

const product: LoanProduct = {
  bank: "Тест банк",
  short: "Test",
  color: "#000",
  domain: "test.mn",
  name: "Ипотек",
  kind: "government",
  annualRatePct: 8,
  minDownPct: 30,
  maxYears: 20,
  maxAmount: 250_000_000,
  dtiMaxPct: 45,
};

describe("monthlyPayment", () => {
  it("аннуитет томьёог зөв тооцоолно", () => {
    // 100сая, 12%, 10 жил → ~1,434,709₮/сар
    const m = monthlyPayment(100_000_000, 12, 10);
    expect(Math.round(m)).toBeGreaterThan(1_430_000);
    expect(Math.round(m)).toBeLessThan(1_440_000);
  });

  it("0% хүүд шугаман хуваана", () => {
    expect(monthlyPayment(120_000_000, 0, 10)).toBe(1_000_000);
  });

  it("хугацаа 0 бол 0 буцаана", () => {
    expect(monthlyPayment(100_000_000, 8, 0)).toBe(0);
  });
});

describe("quoteProduct — тэнцэх шалгалт", () => {
  const base: QuoteInput = { price: 300_000_000, downPct: 30, years: 20, income: 5_000_000 };

  it("бүх нөхцөл хангавал тэнцэнэ", () => {
    const q = quoteProduct(product, base);
    expect(q.eligible).toBe(true);
    expect(q.issues).toHaveLength(0);
    expect(q.principal).toBe(210_000_000);
  });

  it("урьдчилгаа дутвал тэнцэхгүй", () => {
    const q = quoteProduct(product, { ...base, downPct: 20 });
    expect(q.eligible).toBe(false);
    expect(q.issues.some((i) => i.includes("Урьдчилгаа"))).toBe(true);
  });

  it("зээлийн дээд хэмжээ хэтэрвэл тэмдэглэнэ", () => {
    const q = quoteProduct(product, { price: 500_000_000, downPct: 30, years: 20, income: 20_000_000 });
    // principal = 350сая > 250сая cap
    expect(q.issues.some((i) => i.includes("дээд хэмжээ"))).toBe(true);
  });

  it("хугацаа дээд хязгаараар тасарна", () => {
    const q = quoteProduct(product, { ...base, years: 30 });
    expect(q.termYears).toBe(20);
    expect(q.issues.some((i) => i.includes("Хугацаа"))).toBe(true);
  });

  it("орлого хүрэлцэхгүй бол DTI шалгана", () => {
    const q = quoteProduct(product, { ...base, income: 1_000_000 });
    expect(q.dti).toBeGreaterThan(45);
    expect(q.eligible).toBe(false);
    expect(q.issues.some((i) => i.includes("Орлого"))).toBe(true);
  });

  it("орлого 0 бол DTI алгасна", () => {
    const q = quoteProduct(product, { ...base, income: 0 });
    expect(q.dti).toBeNull();
  });
});
