import { describe, expect, it } from "vitest";

import {
  buildShareTexts,
  excerpt,
  scrubPhones,
  UNEGUI_TITLE_MAX,
  VIBER_MAX,
  type ShareTextInput,
} from "@/lib/distribute/templates";

const LINKS = {
  facebook: "https://www.nemi.mn/listings/1?utm_source=facebook",
  viber: "https://www.nemi.mn/listings/1?utm_source=viber",
  unegui: "https://www.nemi.mn/listings/1?utm_source=unegui",
};

const base: ShareTextInput = {
  title: "Зайсанд 3 өрөө байр",
  price: 350_000_000,
  dealType: "sale",
  type: "Орон сууц",
  district: "Хан-Уул",
  rooms: 3,
  area: 85,
  floor: "7/16",
  amenities: ["Тагт", "Лифт", "Зогсоол", "Интернет", "Хамгаалалт", "Тоглоомын талбай"],
  description: "Нарлаг, дулаан. Утас 99112233 руу залгаарай. 2015 онд ашиглалтад орсон.",
  rentAdvanceMonths: null,
  rentDepositMonths: null,
  agentName: "Болд",
  agentPhone: "88001122",
  officeName: "PMC",
};

const all = (t: ReturnType<typeof buildShareTexts>) =>
  [t.facebook, t.viber, t.unegui.title, t.unegui.price, t.unegui.body].join("\n");

describe("scrubPhones", () => {
  it("монгол утасны хэлбэрийг арилгана", () => {
    for (const p of ["99112233", "9911-2233", "+976 8811 2233", "7011 2233", "976-99112233", "6611 2233"]) {
      expect(scrubPhones(`Залга ${p} одоо`), p).toBe("Залга одоо");
    }
  });
  it("үнэ, тоог хөндөхгүй", () => {
    for (const s of ["350 000 000₮", "1 200 000 төг", "75000000₮", "120 сая", "тоот 12-345", "2015 онд", "8500 0000 төг", "1.5 тэрбум"]) {
      expect(scrubPhones(s), s).toBe(s);
    }
  });
  it("давтан дуудахад тогтвортой (g туг)", () => {
    expect(scrubPhones("99112233")).toBe("");
    expect(scrubPhones("99112233")).toBe("");
  });
});

describe("excerpt", () => {
  it("≤ 300 тэмдэгт, утасгүй", () => {
    const long = `${"маш сайхан байр ".repeat(40)} 99112233`;
    const e = excerpt(long);
    expect(e.length).toBeLessThanOrEqual(300);
    expect(e.endsWith("…")).toBe(true);
    expect(excerpt("Утас: 99112233")).toBe("Утас:");
    expect(excerpt(null)).toBe("");
  });
});

describe("buildShareTexts", () => {
  it("худалдах: үнэ, дүүрэг, үзүүлэлт, холбоос", () => {
    const t = buildShareTexts(base, LINKS);
    expect(t.facebook).toContain("Зарна: Зайсанд 3 өрөө байр");
    expect(t.facebook).toContain("Хан-Уул");
    expect(t.facebook).toContain("3 өрөө");
    expect(t.facebook).toContain("85 м²");
    expect(t.facebook).toContain("7/16 давхар");
    expect(t.facebook).toContain("#ХанУул");
    expect(t.facebook).not.toContain("/сар");
    expect(t.facebook).not.toContain("99112233");
    expect(t.facebook).toContain("2015 онд");
    expect(t.facebook).toContain("88001122");
    expect(t.facebook).toContain(LINKS.facebook);
    expect(t.viber).toContain(LINKS.viber);
    expect(t.unegui.body).toContain(LINKS.unegui);
    expect(t.facebook).not.toContain(LINKS.viber);
  });

  it("тохижилт 5 хүртэл", () => {
    const t = buildShareTexts(base, LINKS);
    expect(t.facebook).toContain("Хамгаалалт");
    expect(t.facebook).not.toContain("Тоглоомын талбай");
  });

  it("түрээс: /сар ба нөхцөл", () => {
    const t = buildShareTexts(
      { ...base, dealType: "rent", price: 2_500_000, rentAdvanceMonths: 1, rentDepositMonths: 1 },
      LINKS
    );
    expect(t.facebook).toContain("Түрээслүүлнэ:");
    expect(t.facebook).toContain("/сар");
    expect(t.facebook).toContain("1 сар түрээс + 1 сар барьцаа");
    expect(t.unegui.price).toBe("2500000");
  });

  it("хоосон талбарыг цэвэр алгасна", () => {
    const t = buildShareTexts(
      {
        ...base,
        rooms: 0,
        floor: "-",
        area: null,
        type: null,
        district: null,
        amenities: null,
        description: null,
        agentName: null,
        agentPhone: null,
        officeName: null,
        price: null,
      },
      LINKS
    );
    const text = all(t);
    expect(text).not.toMatch(/undefined|null/);
    expect(text).not.toContain("0 өрөө");
    expect(text).not.toContain("- давхар");
    expect(text).not.toContain("Тохижилт");
    expect(text).not.toContain("Холбогдох");
    expect(t.unegui.price).toBe("");
  });

  it("unegui: гарчиг ≤ 70, үнэ зөвхөн цифр", () => {
    const t = buildShareTexts({ ...base, title: "Маш том ".repeat(20) }, LINKS);
    expect(t.unegui.title.length).toBeLessThanOrEqual(UNEGUI_TITLE_MAX);
    expect(buildShareTexts(base, LINKS).unegui.price).toBe("350000000");
  });

  it("Viber ≤ 700 тэмдэгт, холбоос үлдэнэ", () => {
    const t = buildShareTexts({ ...base, description: "урт тайлбар ".repeat(200) }, LINKS);
    expect(t.viber.length).toBeLessThanOrEqual(VIBER_MAX);
    expect(t.viber).toContain(LINKS.viber);
  });
});
