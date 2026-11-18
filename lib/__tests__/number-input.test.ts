import { describe, expect, it } from "vitest";

import { normalizeNumberText, parseNumberText } from "@/lib/number-input";

describe("parseNumberText", () => {
  it("энгийн тоо", () => {
    expect(parseNumberText("81")).toBe(81);
    expect(parseNumberText(" 81 ")).toBe(81);
    expect(parseNumberText("-1")).toBe(-1);
    expect(parseNumberText("+7")).toBe(7);
    expect(parseNumberText("0")).toBe(0);
  });

  it("цэг = бутархай", () => {
    expect(parseNumberText("96.5")).toBe(96.5);
    expect(parseNumberText(".5")).toBe(0.5);
    // Нэг цэг үргэлж бутархай — «1.500» нь 1500 биш 1.5.
    expect(parseNumberText("1.500")).toBe(1.5);
  });

  it("таслал: 3 оронгийн бүлэг бол мянгат", () => {
    expect(parseNumberText("1,234")).toBe(1234);
    expect(parseNumberText("250,000,000")).toBe(250_000_000);
    expect(parseNumberText("1,500")).toBe(1500);
  });

  it("таслал: бүлэг нь 3 орон биш бол бутархай (гомдлын тохиолдол)", () => {
    expect(parseNumberText("81,47")).toBe(81.47);
    expect(parseNumberText("0,5")).toBe(0.5);
    expect(parseNumberText("2,25")).toBe(2.25);
    expect(parseNumberText("81,4")).toBe(81.4);
    expect(parseNumberText(",5")).toBe(0.5);
    expect(parseNumberText("81,")).toBe(81);
  });

  it("хоёулаа байвал сүүлийнх нь бутархайн тэмдэг", () => {
    expect(parseNumberText("1,234.56")).toBe(1234.56);
    expect(parseNumberText("1.234,56")).toBe(1234.56);
    expect(parseNumberText("250,000,000.25")).toBe(250_000_000.25);
  });

  it("цэгээр бүлэглэсэн (европ хэв маяг)", () => {
    expect(parseNumberText("1.234.567")).toBe(1_234_567);
  });

  it("зайгаар бүлэглэсэн", () => {
    expect(parseNumberText("1 234 567")).toBe(1_234_567);
    expect(parseNumberText("1 234")).toBe(1234);
  });

  it("хоосон ба буруу утга → null", () => {
    expect(parseNumberText("")).toBeNull();
    expect(parseNumberText("   ")).toBeNull();
    expect(parseNumberText("abc")).toBeNull();
    expect(parseNumberText("12abc")).toBeNull();
    expect(parseNumberText(",")).toBeNull();
    expect(parseNumberText(".")).toBeNull();
    expect(parseNumberText("1,2.3,4")).toBeNull();
    expect(parseNumberText("1.2.3")).toBeNull();
    expect(parseNumberText("1,23,45")).toBeNull();
    expect(parseNumberText("1,2.3")).toBeNull();
  });
});

describe("normalizeNumberText", () => {
  it("уншсанаа буцааж харуулна", () => {
    expect(normalizeNumberText("81,47")).toBe("81.47");
    expect(normalizeNumberText("250,000,000")).toBe("250000000");
    expect(normalizeNumberText("96.5")).toBe("96.5");
    expect(normalizeNumberText(" 81 ")).toBe("81");
  });

  it("таниагүй бол хэвээр (алдааг схем хэлнэ)", () => {
    expect(normalizeNumberText("")).toBe("");
    expect(normalizeNumberText(" abc ")).toBe("abc");
    expect(normalizeNumberText("1,2.3")).toBe("1,2.3");
  });

  it("хэт том тоог шинжлэх ухааны бичиглэлд оруулахгүй", () => {
    expect(normalizeNumberText("1000000000000000000")).toBe("1000000000000000000");
  });
});
