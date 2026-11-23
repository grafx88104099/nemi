import { describe, expect, it } from "vitest";

import cases from "@/lib/search/fold-cases.json";
import { DIGRAPHS, buildListingSearchText, foldSearchText } from "@/lib/search/fold";
import { LATIN_DIGRAPH_OPTIONS } from "@/lib/search/query";

const FIXTURES = cases as [string, string][];

describe("foldSearchText (public.search_fold-ийн толь)", () => {
  it.each(FIXTURES)("%j → %j", (input, expected) => {
    expect(foldSearchText(input)).toBe(expected);
  });

  it("давтан нугалахад өөрчлөгдөхгүй", () => {
    for (const [input] of FIXTURES) {
      const once = foldSearchText(input);
      expect(foldSearchText(once)).toBe(once);
    }
  });

  it("гаралт зөвхөн [0-9а-я. ] үсэгтэй", () => {
    for (const [input] of FIXTURES) expect(foldSearchText(input)).toMatch(/^[0-9а-я. ]*$/);
    expect(foldSearchText(null)).toBe("");
    expect(foldSearchText(undefined)).toBe("");
  });

  it("query.ts нь бүх хос үсгийг мэднэ", () => {
    for (const [d] of DIGRAPHS) expect(LATIN_DIGRAPH_OPTIONS[d]).toBeDefined();
  });
});

describe("buildListingSearchText (public.listings_build_search_text-ийн толь)", () => {
  it("зураастай дүүргийг нийлмэл, зайтай, товчлолоор хадгална", () => {
    const s = buildListingSearchText({ district: "Хан-Уул" });
    expect(s).toContain(" ханул ");
    expect(s).toContain(" хан ул ");
    expect(s).toContain(" худ ");
  });

  it("зураастай гарчгийг зайтай хэлбэрээр ч хадгална", () => {
    const s = buildListingSearchText({ title: "Энх-Өргөө хотхон" });
    expect(s).toContain("енхорго");
    expect(s).toContain("енх орго");
  });

  it("гүйлгээний үг ба өрөө", () => {
    const sale = buildListingSearchText({ deal: "sale" });
    expect(sale).toContain("худалдах");
    expect(sale).toContain("зарна");
    expect(buildListingSearchText({ deal: "rent" })).toContain("турес");
    expect(buildListingSearchText({ rooms: 2 })).toContain(" 2 оро ");
    expect(buildListingSearchText({ rooms: 0 })).toBe("  ");
  });

  it("prod-ийн SQL-тэй ижил (parity SELECT-ээр шалгасан утга)", () => {
    expect(
      buildListingSearchText({ title: "Энх-Өргөө хотхон", district: "Хан-Уул", type: "Орон сууц", deal: "sale", rooms: 2 })
    ).toBe(" енхорго хотхон енх орго хотхон ханул хан ул худ орон суц баир худалдана худалдах зарна зарах 2 оро ");
    expect(
      buildListingSearchText({
        title: "Зайсан — 2 өрөө",
        district: "Баянзүрх",
        type: "Хаус",
        description: "Тайлбар №5, 1,600,000₮",
        deal: "rent",
        rooms: 3,
      })
    ).toBe(" заисан 2 оро баянзурх бзд хаус баишин турес туреслех туреслулне холслулне 3 оро таилбар но5 1.600.000 ");
  });

  it("тайлбарын эхний 4000 тэмдэгт л орно", () => {
    const s = buildListingSearchText({ description: "а".repeat(3997) + " б" + " в".repeat(10) });
    expect(s).toContain(" б ");
    expect(s).not.toContain(" в");
  });
});
