import { describe, expect, it } from "vitest";

import {
  formatPhone,
  isFullPhone,
  isValidPhone,
  normalizePhone,
  phoneSearchDigits,
  telHref,
  uniquePhones,
} from "@/lib/crm2/phone";

describe("normalizePhone — crm2_normalize_phone()-тэй ижил", () => {
  // Хүлээгдэж буй утгыг DB-ийн crm2_normalize_phone()-оос авсан (read-only шалгалт).
  const cases: [string, string][] = [
    ["9911-2233", "97699112233"],
    ["+976 9911 2233", "97699112233"],
    ["0097699112233", "97699112233"],
    ["99112233", "97699112233"],
    ["12345", ""],
    ["123456", "123456"],
    ["1234567", "1234567"],
    ["+1 (202) 555-0100", "12025550100"],
    ["00 1 202 555 0100", "12025550100"],
    ["976 9911 2233 ext", "97699112233"],
    ["", ""],
    ["  88 11 22 33  ", "97688112233"],
    ["70112233", "97670112233"],
    ["+97670112233", "97670112233"],
    ["001234", ""],
  ];
  it.each(cases)("%s → %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it("null/undefined → ''", () => {
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone(undefined)).toBe("");
  });
});

describe("isFullPhone / isValidPhone", () => {
  it("RPC-ийн бүтэн дугаарын шаардлага (≥ 8 цифр жигдрүүлсний дараа)", () => {
    expect(isFullPhone("9911 2233")).toBe(true);
    expect(isFullPhone("1234567")).toBe(false);
    expect(isFullPhone("123")).toBe(false);
  });
  it("хадгалах боломжтой эсэх", () => {
    expect(isValidPhone("9911-2233")).toBe(true);
    expect(isValidPhone("12345")).toBe(false);
    expect(isValidPhone("abc")).toBe(false);
    expect(isValidPhone("1".repeat(41))).toBe(false);
  });
});

describe("formatPhone", () => {
  it("Монгол дугаар «XXXX XXXX»", () => {
    expect(formatPhone("+976-9911-2233")).toBe("9911 2233");
    expect(formatPhone("99112233")).toBe("9911 2233");
  });
  it("гадаад дугаар «+цифр»", () => {
    expect(formatPhone("+1 202 555 0100")).toBe("+12025550100");
  });
  it("жигдрүүлэх боломжгүй бол эх бичвэр", () => {
    expect(formatPhone(" 123 ")).toBe("123");
  });
  it("tel: холбоос", () => {
    expect(telHref("9911 2233")).toBe("tel:+97699112233");
    expect(telHref("12")).toBeNull();
  });
});

describe("phoneSearchDigits", () => {
  it("дугаар маягийн бичвэрээс цифр", () => {
    expect(phoneSearchDigits("9911-22")).toBe("991122");
    expect(phoneSearchDigits("+976 9911")).toBe("9769911");
    expect(phoneSearchDigits("00976 9911")).toBe("9769911");
  });
  it("нэр эсвэл богино цифр бол null", () => {
    expect(phoneSearchDigits("Бат")).toBeNull();
    expect(phoneSearchDigits("Бат 9911")).toBeNull();
    expect(phoneSearchDigits("991")).toBeNull();
    expect(phoneSearchDigits("")).toBeNull();
  });
});

describe("uniquePhones", () => {
  it("жигдрүүлсэн утгаар давхардал, хоосныг хасна", () => {
    const out = uniquePhones([{ phone: "9911 2233" }, { phone: "+976 99112233" }, { phone: "12" }, { phone: "8811 2233" }]);
    expect(out.map((p) => p.phone)).toEqual(["9911 2233", "8811 2233"]);
  });
});
