import { describe, expect, it } from "vitest";

import { findPublicTextRisks, maskPrivate } from "@/lib/crm2/text-privacy";

describe("maskPrivate", () => {
  const cases: [string, string][] = [
    ["Утас 9911 2233", "Утас •••• ••••"],
    ["+976-9911-2233 залга", "•••• •••• залга"],
    ["9911.2233", "•••• ••••"],
    ["45 тоот", "•• тоот"],
    ["Б12 тоот, 3 өрөө", "Б•• тоот, 3 өрөө"],
    ["45-р тоот", "••-р тоот"],
    ["тоот: 45", "тоот: ••"],
    ["орцны код 2580#", "орцны код ••"],
    ["хаалганы код: 1234*", "хаалганы код: ••"],
    ["домофон 45", "домофон ••"],
    ["mail: bat.bold@example.com", "mail: •••@•••"],
    ["Эзэн Ганбаатар утсаар", "Эзэн •• утсаар"],
    ["эзэн нь Батболд", "эзэн нь ••"],
    ["Эзэн: должин, 2 өрөө", "Эзэн: ••, 2 өрөө"],
    ["Эзний Бат-Эрдэнэ", "Эзний ••"],
    ["Холбогдох: Сараа 9911 2233", "Холбогдох: •• •••• ••••"],
    ["Болд ах залгаарай 88112233", "•• ах залгаарай •••• ••••"],
    ["Сараа 99112233", "•• •••• ••••"],
    ["Залгаарай Бат-Эрдэнэ, 3 өрөө", "Залгаарай ••, 3 өрөө"],
    ["88112233 Болд", "•••• •••• ••"],
    ["99112233 Сараа эгч.", "•••• •••• •• эгч."],
    ["Утас: 99112233, ХУД 3 өрөө", "Утас: •••• ••••, ХУД 3 өрөө"],
  ];
  it.each(cases)("%j", (input, want) => {
    expect(maskPrivate(input)).toBe(want);
  });

  it("нэр биш үгийг үлдээнэ", () => {
    expect(maskPrivate("эзэн нь өөрөө үзүүлнэ")).toBe("эзэн нь өөрөө үзүүлнэ");
    expect(maskPrivate("эзэнтэй уулзана")).toBe("эзэнтэй уулзана");
  });
  it("үнэ, талбай, давхрыг далдлахгүй", () => {
    const t = "3 өрөө 81,47 мкв, 4/16 давхар, үнэ 350 сая, 65000000₮";
    expect(maskPrivate(t)).toBe(t);
  });

  const samples = [
    "Эзэн Оюунаа 9909-1234. 45 тоот, орцны код 2580#, oyuna@mail.mn",
    "эзэн нь Батболд утас 9191 2323, 9191-2324; тоот: 12; код 0000",
    "ХУД, 3 өрөө, Эзэн: сараа 88-11-22-34, хаалганы код: 45*, 7011.2233",
    "Холбогдох: Сараа 9911 2233\nБолд ах залгаарай 88112233 Дорж",
    "",
  ];
  it.each(samples)("idempotent: %j", (s) => {
    const once = maskPrivate(s);
    expect(maskPrivate(once)).toBe(once);
    expect(findPublicTextRisks(once)).toEqual([]);
  });
});

describe("findPublicTextRisks", () => {
  it("утас, тоот, код", () => {
    expect(findPublicTextRisks("Утас 99112233")).toEqual(["phone"]);
    expect(findPublicTextRisks("45 тоот")).toEqual(["unit_no"]);
    expect(findPublicTextRisks("орцны код 1234")).toEqual(["door_code"]);
    expect(findPublicTextRisks("99112233, 45 тоот, код 1234")).toEqual(["phone", "unit_no", "door_code"]);
  });
  it("аюулгүй бичвэр", () => {
    expect(findPublicTextRisks("Хан-Уул, 3 өрөө, 120 мкв, 12/18 давхар, үнэ 350 сая")).toEqual([]);
    expect(findPublicTextRisks("Үнэ 65000000₮")).toEqual([]);
  });
});
