import { describe, expect, it } from "vitest";

import { filtersHref, parseListingFilters } from "@/lib/listing-filters";
import { applySmartQuery, parseSearchQuery, shouldTryAi, type SmartFilters } from "@/lib/search/parse-query";

const TABLE: [string, SmartFilters, string][] = [
  ["хан-уулд 2 өрөө 300 саяас доош", { district: "Хан-Уул", rooms: 2, maxPrice: 3e8 }, ""],
  ["хан уул 2 өрөө", { district: "Хан-Уул", rooms: 2 }, ""],
  ["Хан-Уул дүүрэгт 3 өрөө", { district: "Хан-Уул", rooms: 3 }, ""],
  ["2 өрөөтэй байр түрээс", { rooms: 2, type: "Орон сууц", deal: "rent" }, ""],
  ["гурван өрөө байшин", { rooms: 3, type: "Хаус" }, ""],
  ["2-3 сая сард", { minPrice: 2e6, maxPrice: 3e6, deal: "rent" }, ""],
  ["1 тэрбум", { maxPrice: 1e9 }, ""],
  ["1.5 тэрбумаас дээш", { minPrice: 1.5e9 }, ""],
  ["500 сая орчим", { minPrice: 425e6, maxPrice: 575e6 }, ""],
  ["300 сая төгрөгөөс доош", { maxPrice: 3e8 }, ""],
  ["800 мянга сард", { maxPrice: 8e5, deal: "rent" }, ""],
  ["1,600,000₮", { maxPrice: 1.6e6 }, ""],
  ["80м2-аас дээш", { minArea: 80 }, ""],
  ["60-90 мкв", { minArea: 60, maxArea: 90 }, ""],
  ["100 кв.м хүртэл", { maxArea: 100 }, ""],
  ["zaisan 3 uruu", { rooms: 3 }, "zaisan"],
  ["khan uul bair turees", { district: "Хан-Уул", type: "Орон сууц", deal: "rent" }, ""],
  ["БЗД оффис", { district: "Баянзүрх", type: "Оффис" }, ""],
  ["sukhbaatar office", { district: "Сүхбаатар", type: "Оффис" }, ""],
  ["худалдааны талбай зарна", { type: "Худалдааны талбай", deal: "sale" }, ""],
  ["Шинэ Яармаг хотхон", {}, "Шинэ Яармаг хотхон"],
  ["Мандала 365", {}, "Мандала 365"],
  ["39-р байранд 3 өрөө", { type: "Орон сууц", rooms: 3 }, "39-р"],
  ["зайсан байр хайж байна", { type: "Орон сууц" }, "зайсан хайж байна"],
  ["2 орон сууц", { type: "Орон сууц" }, "2"],
  ["3 сайхан байр", { type: "Орон сууц" }, "3 сайхан"],
  ["", {}, ""],
  // Facets: онцлог, шинэ барилга, 8%-ийн зээл.
  ["хан-уул 2 өрөө тавилгатай", { district: "Хан-Уул", rooms: 2, features: ["furnished"] }, ""],
  ["15-р хороолол, 8%-ийн зээлд тохирох", { loan8: true }, "15-р хороолол"],
  ["8% ипотекийн зээлд тохирох байр", { loan8: true, type: "Орон сууц" }, ""],
  ["ипотекийн зээлд тохирох байр", { loan8: true, type: "Орон сууц" }, ""],
  ["шинэ барилга баянзүрх", { newBuild: true, district: "Баянзүрх" }, ""],
  ["зогсоолтой байр", { features: ["parking"], type: "Орон сууц" }, ""],
  ["бүрэн тавилгатай лифттэй гаражтай", { features: ["furnished", "parking", "elevator"] }, ""],
  ["тагттай агуулахтай харуултай тоглоомын талбайтай", { features: ["balcony", "security", "storage", "kids_playground"] }, ""],
  ["тавилга", {}, "тавилга"],
  ["тавилгагүй байр", { type: "Орон сууц" }, "тавилгагүй"],
  ["Шинэ Яармаг", {}, "Шинэ Яармаг"],
];

describe("parseSearchQuery", () => {
  it.each(TABLE)("%j", (q, filters, rest) => {
    expect(parseSearchQuery(q)).toEqual({ filters, rest });
  });

  it("эвдэрсэн утгыг шүүлт болгохгүй", () => {
    expect(parseSearchQuery("0 сая").filters).toEqual({});
    expect(parseSearchQuery("90-60 мкв").filters).toEqual({ minArea: 60, maxArea: 90 });
  });
});

describe("applySmartQuery", () => {
  it("задалсан утга URL-ийн утгыг дарна, хуудас хасагдана", () => {
    const f = parseListingFilters({ district: "Баянгол", q: "хан-уул", page: "3", sort: "price_asc" });
    const r = applySmartQuery(f);
    expect(r.changed).toBe(true);
    expect(r.filters.district).toBe("Хан-Уул");
    expect(r.filters.q).toBeUndefined();
    expect(r.filters.page).toBeUndefined();
    expect(r.filters.sort).toBe("price_asc");
  });

  it("тогтвортой цэг хүртэл нэг дуудлагаар", () => {
    const r = applySmartQuery(parseListingFilters({ q: "2 байр өрөө" }));
    expect(r.filters).toMatchObject({ type: "Орон сууц", rooms: 2 });
    expect(r.filters.q).toBeUndefined();
  });

  it("онцлог: URL ба задалсан утгын нэгдэл, тогтвортой цэг", () => {
    const f = parseListingFilters({ features: "elevator", q: "тавилгатай зогсоолтой" });
    const r = applySmartQuery(f);
    expect(r.changed).toBe(true);
    expect(r.filters.features).toEqual(["furnished", "parking", "elevator"]);
    expect(r.filters.q).toBeUndefined();
    expect(applySmartQuery(r.filters).changed).toBe(false);
  });

  it("q-ийн дүүрэг URL-ийн БҮХ дүүргийн жагсаалтыг солино (баримтжуулсан дүрэм)", () => {
    const r = applySmartQuery(parseListingFilters({ district: "Хан-Уул,Баянгол", q: "сүхбаатар" }));
    expect(r.filters.district).toBe("Сүхбаатар");
  });

  it("олон дүүрэг, туг q-гүй үед өөрчлөгдөхгүй", () => {
    const f = parseListingFilters({ district: "Хан-Уул,Баянгол", features: "parking", loan8: "1" });
    expect(applySmartQuery(f).changed).toBe(false);
  });

  it("өөрчлөлтгүй бол ижил объект", () => {
    const f = parseListingFilters({ q: "Шинэ Яармаг" });
    expect(applySmartQuery(f)).toEqual({ filters: f, changed: false });
  });

  it.each(TABLE)("%j — давтахад өөрчлөгдөхгүй, redirect гогцоогүй", (q) => {
    const once = applySmartQuery(parseListingFilters({ q }));
    expect(applySmartQuery(once.filters).changed).toBe(false);
    // Каноник URL-ийг дахин уншихад мөн өөрчлөлтгүй.
    const href = filtersHref("/listings", once.filters, { withSort: true });
    const sp = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(applySmartQuery(parseListingFilters(sp)).changed).toBe(false);
  });
});

describe("shouldTryAi", () => {
  it("дүрмээр таниагүй урт чөлөөт текст", () => {
    expect(shouldTryAi("гэр бүлд тохиромжтой хотын төвд")).toBe(true);
    expect(shouldTryAi("2 өрөө")).toBe(false);
    expect(shouldTryAi("zaisan")).toBe(false);
    expect(shouldTryAi("зайсан байр хайж байна")).toBe(false);
    expect(shouldTryAi(undefined)).toBe(false);
  });
});
