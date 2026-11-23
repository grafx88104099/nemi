import { describe, expect, it } from "vitest";

import { DISTRICTS, PROPERTY_TYPES } from "@/lib/constants";
import cases from "@/lib/search/fold-cases.json";
import { buildListingSearchText, foldSearchText } from "@/lib/search/fold";
import {
  MAX_GROUPS,
  MAX_VARIANTS,
  STOPWORDS,
  likeAnyFilter,
  searchPatternGroups,
  splitRawTokens,
  tokenVariants,
} from "@/lib/search/query";
import { STATIC_SUGGESTIONS } from "@/lib/search/suggest";

/** SQL LIKE-ийн энгийн загварчлал (% → .*, бүтэн мөрөөр). */
function likeMatch(pattern: string, text: string): boolean {
  const re = pattern
    .split("%")
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${re}$`, "s").test(text);
}

const groupsMatch = (q: string, text: string) =>
  searchPatternGroups(q).every((g) => g.some((p) => likeMatch(p, text)));

describe("tokenVariants", () => {
  it("кирилл үг нэг хувилбартай", () => {
    expect(tokenVariants("Зайсан")).toEqual(["заисан"]);
  });

  it("латин бичлэгийн хоёрдмол үсэг", () => {
    expect(tokenVariants("zaisan")[0]).toBe("заисан");
    expect(tokenVariants("uruu")).toEqual(expect.arrayContaining(["оро", "уру"]));
    expect(tokenVariants("suuts")).toContain("суц");
  });

  it("олон хоёрдмол үсэгтэй үг: нэг жигд уншлага MAX_VARIANTS-д багтана", () => {
    // «Өгөөмөр» → «огомор»; өмнө нь 8 хувилбар бүгд «у»-аар эхэлж тасардаг байв.
    const v = tokenVariants("uguumur");
    expect(v).toEqual(expect.arrayContaining(["угумур", "огомор"]));
    expect(v.length).toBeLessThanOrEqual(MAX_VARIANTS);
    expect(groupsMatch("uguumur", " огомор хотхон ")).toBe(true);
    expect(v.slice(0, 2)).toEqual(["угумур", "огомор"]);
    const r = tokenVariants("uruu");
    expect(r.slice(0, 2)).toEqual(["уру", "оро"]);
    // u ба c хоёулаа: үсэг тус бүрийн жигд сонголтын 4 хослол эхэндээ.
    expect(tokenVariants("cucu").slice(0, 4)).toEqual(expect.arrayContaining(["цуцу", "куку", "цоцо", "коко"]));
    expect(tokenVariants("uuuuuuuuuuvvvvvvyyyyycccc").length).toBeLessThanOrEqual(MAX_VARIANTS);
  });

  it("зураастай үгийн зайтай хэлбэр", () => {
    expect(tokenVariants("хан-уул")).toEqual(expect.arrayContaining(["ханул", "хан ул"]));
  });

  it("[0] нь үргэлж foldSearchText, хязгаартай", () => {
    for (const [input] of cases as [string, string][]) {
      const v = tokenVariants(input);
      if (foldSearchText(input)) expect(v[0]).toBe(foldSearchText(input));
      else expect(v).toEqual([]);
    }
    expect(tokenVariants("uuuuuuuuuu").length).toBeLessThanOrEqual(MAX_VARIANTS);
  });
});

describe("splitRawTokens", () => {
  it("тэмдэгтээр хувааж, хязгаарлана", () => {
    expect(splitRawTokens("a, b;(c) «d»")).toEqual(["a", "b", "c", "d"]);
    expect(splitRawTokens("1 2 3 4 5 6 7 8 9 10 11 12 13 14")).toHaveLength(12);
  });
});

describe("searchPatternGroups", () => {
  it("тоо дараагийн үгтэйгээ нийлж, үгийн эхээр таарна", () => {
    expect(searchPatternGroups("zaisan 2 өрөө")).toEqual([["%заисан%"], ["% 2 оро%"]]);
    expect(searchPatternGroups("1r horoolol")).toEqual([["% 1р%"], ["%хоролол%"]]);
  });

  it("дүүргэгч үг ба ганц үсэг хасагдана", () => {
    expect(STOPWORDS.has(foldSearchText("байна"))).toBe(true);
    expect(searchPatternGroups("зайсан байр хайж байна")).toEqual([["%заисан%"], ["%баир%"]]);
    expect(searchPatternGroups("а зайсан")).toEqual([["%заисан%"]]);
    expect(searchPatternGroups("байна хайж")).toEqual([]);
  });

  it("6-аас олон бүлэггүй, хоосон бол []", () => {
    expect(searchPatternGroups("нэг хоёр гурав дөрөв тавхан зургаа долоо найм")).toHaveLength(MAX_GROUPS);
    expect(searchPatternGroups("")).toEqual([]);
    expect(searchPatternGroups(undefined)).toEqual([]);
  });

  it("хэв маяг зөвхөн аюулгүй үсэгтэй", () => {
    for (const g of searchPatternGroups(`✅ 50%_off\\ "x" (y), z`)) {
      for (const p of g) expect(p).toMatch(/^%[0-9а-я. ]*%$/);
    }
  });

  it.each(["хан уул", "Хан Уул", "khan uul", "khan-uul", "Хан-Уул", "ХУД", "хан-уул дүүрэг"])(
    "%j нь Хан-Уулын search_text-тэй таарна",
    (q) => {
      expect(searchPatternGroups(q).length).toBeGreaterThan(0);
      expect(groupsMatch(q, buildListingSearchText({ district: "Хан-Уул" }))).toBe(true);
    }
  );

  it("өөр дүүрэгтэй таарахгүй", () => {
    expect(groupsMatch("хан уул", buildListingSearchText({ district: "Баянгол" }))).toBe(false);
    expect(groupsMatch("2 өрөө", buildListingSearchText({ rooms: 3 }))).toBe(false);
  });

  it("латин бичлэгээр гарчигтай таарна", () => {
    const text = buildListingSearchText({ title: "Зайсан 3 өрөө орон сууц", deal: "sale" });
    expect(groupsMatch("zaisan 3 uruu", text)).toBe(true);
    expect(groupsMatch("oron suuts hudaldana", text)).toBe(true);
  });

  it("статик санал бүр өөрийн search_text-тэй таарна", () => {
    for (const s of STATIC_SUGGESTIONS) {
      const src =
        s.kind === "district"
          ? { district: s.label }
          : s.kind === "type"
            ? { type: s.label }
            : { deal: s.label === "Түрээс" ? "rent" : "sale" };
      expect(groupsMatch(s.label, buildListingSearchText(src)), s.label).toBe(true);
    }
    expect(STATIC_SUGGESTIONS.filter((s) => s.kind === "district")).toHaveLength(DISTRICTS.length);
    expect(STATIC_SUGGESTIONS.filter((s) => s.kind === "type")).toHaveLength(PROPERTY_TYPES.length);
    for (let n = 1; n <= 10; n++) expect(groupsMatch(`${n} өрөө`, buildListingSearchText({ rooms: n }))).toBe(true);
  });
});

describe("likeAnyFilter", () => {
  it("PostgREST-ийн хашилт", () => {
    expect(likeAnyFilter("search_text", ["%уру%", "%оро%"])).toBe('search_text.like."%уру%",search_text.like."%оро%"');
    expect(likeAnyFilter("c", ['a"b', "a\\b"])).toBe('c.like."a\\"b",c.like."a\\\\b"');
  });
});
