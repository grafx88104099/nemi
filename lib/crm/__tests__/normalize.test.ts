import { describe, expect, it } from "vitest";

import { formatPhone, normalizeEmail, normalizeName, normalizePhone, phonesEqual } from "@/lib/crm/normalize";

describe("normalizePhone", () => {
  it("монголын 8 оронтой дугаарын бүх хэлбэр нэг утгад буудаг (F-107)", () => {
    expect(normalizePhone("99112233")).toBe("97699112233");
    expect(normalizePhone("9911-2233")).toBe("97699112233");
    expect(normalizePhone("+976 99112233")).toBe("97699112233");
    expect(normalizePhone("976 9911 2233")).toBe("97699112233");
    expect(normalizePhone("(976) 99-11-22-33")).toBe("97699112233");
  });

  it("00-угтвартай олон улсын хэлбэрийг цэвэрлэдэг", () => {
    expect(normalizePhone("0097699112233")).toBe("97699112233");
  });

  it("бусад олон улсын дугаарыг цифрээр хадгалдаг", () => {
    expect(normalizePhone("+82 10 1234 5678")).toBe("821012345678");
    expect(normalizePhone("+1 (415) 555-0123")).toBe("14155550123");
  });

  it("хэт богино утгыг хоосон болгодог", () => {
    expect(normalizePhone("123")).toBe("");
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("утас алга")).toBe("");
  });
});

describe("phonesEqual", () => {
  it("өөр хэлбэрийн ижил дугаарыг таньдаг", () => {
    expect(phonesEqual("99112233", "+976 9911-2233")).toBe(true);
  });
  it("өөр дугаарыг ялгадаг", () => {
    expect(phonesEqual("99112233", "99112234")).toBe(false);
  });
  it("хоосон утгыг хэзээ ч тэнцүүлдэггүй", () => {
    expect(phonesEqual("", "")).toBe(false);
  });
});

describe("formatPhone", () => {
  it("монгол дугаарыг 9911-2233 хэлбэрт буулгадаг", () => {
    expect(formatPhone("97699112233")).toBe("9911-2233");
  });
  it("олон улсын дугаарт + угтвар нэмдэг", () => {
    expect(formatPhone("821012345678")).toBe("+821012345678");
  });
});

describe("normalizeEmail", () => {
  it("lowercase + trim хийдэг", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
  });
  it("хүчингүй и-мэйлийг хоосон болгодог", () => {
    expect(normalizeEmail("буруу-имэйл")).toBe("");
    expect(normalizeEmail("a@b")).toBe("");
  });
});

describe("normalizeName", () => {
  it("зай, том жижиг үсгийг нэгтгэдэг", () => {
    expect(normalizeName("  Бат   Эрдэнэ ")).toBe("бат эрдэнэ");
  });
});
