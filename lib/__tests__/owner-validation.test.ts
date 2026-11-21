import { describe, expect, it } from "vitest";

import { normalizeOwnerPhone, validateOwnerContact, validateOwnerRequest } from "@/lib/validation/owner";

const OFFICE = "6c50ca17-3ded-4620-8035-d043578ecdd7";

describe("normalizeOwnerPhone", () => {
  it("зай, зураас, +976-г хасна", () => {
    expect(normalizeOwnerPhone("9911 2233")).toBe("99112233");
    expect(normalizeOwnerPhone("+976 9911-2233")).toBe("99112233");
    expect(normalizeOwnerPhone("(976) 88001122")).toBe("88001122");
  });
  it("буруу дугаарт null", () => {
    expect(normalizeOwnerPhone("abc")).toBeNull();
    expect(normalizeOwnerPhone("123")).toBeNull();
  });
});

describe("validateOwnerContact", () => {
  it("нэр, утсыг цэвэрлэнэ", () => {
    expect(validateOwnerContact({ owner_name: "  Бат ", owner_phone: "9911 2233" })).toEqual({
      data: { owner_name: "Бат", owner_phone: "99112233" },
    });
  });
  it("хоосон нэрт монгол алдаа", () => {
    expect(validateOwnerContact({ owner_name: " ", owner_phone: "99112233" })).toEqual({ error: "Нэрээ оруулна уу" });
  });
});

describe("validateOwnerRequest", () => {
  const base = { office_id: OFFICE, contact_name: "Бат", contact_phone: "99112233", deal_type: "sale" };

  it("заавал биш тоон талбарын хоосныг null болгоно", () => {
    const r = validateOwnerRequest({ ...base, area: "", rooms: "", price: "", note: "  ", district: "" });
    expect("data" in r && r.data).toMatchObject({ area: null, rooms: null, price: null, note: null, district: null });
  });

  it("тоог уншина", () => {
    const r = validateOwnerRequest({ ...base, area: "81.47", rooms: "2", price: "250000000" });
    expect("data" in r && r.data).toMatchObject({ area: 81.47, rooms: 2, price: 250_000_000 });
  });

  it("үл мэдэгдэх талбарыг хүлээж авахгүй (status, user_id хуурахаас сэргийлнэ)", () => {
    expect("error" in validateOwnerRequest({ ...base, status: "closed" })).toBe(true);
    expect("error" in validateOwnerRequest({ ...base, user_id: OFFICE })).toBe(true);
  });

  it("буруу утсанд монгол алдаа", () => {
    expect(validateOwnerRequest({ ...base, contact_phone: "12" })).toEqual({ error: "Утасны дугаар буруу байна" });
  });
});
