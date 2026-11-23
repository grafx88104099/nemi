import { describe, expect, it } from "vitest";

import {
  compactRpcArgs,
  facetCount,
  facetQueryKey,
  filterRpcArgs,
  formDataParams,
  parseFacets,
  quickChipVisible,
  type ListingFacets,
} from "@/lib/listing-facets";
import { QUICK_CHIPS, parseListingFilters } from "@/lib/listing-filters";
import { searchPatternGroups } from "@/lib/search/query";

const FACETS: ListingFacets = parseFacets({
  total: 133,
  new_from: 2021,
  deal: { sale: 89, rent: 44 },
  district: { "Хан-Уул": 68, Баянгол: 19 },
  type: { "Орон сууц": 92 },
  rooms: { "1": 107, "2": 99, "3": 61, "4": 34 },
  features: { furnished: 19, parking: 45, elevator: 9, balcony: 7, security: 17, storage: 4, kids_playground: 7, pets_allowed: 0 },
  flags: { newBuild: 40, adv1: 10, noDeposit: 0, loan8: 29, ownerOnly: 0 },
})!;

describe("filterRpcArgs", () => {
  it("хоосон шүүлт → null/false", () => {
    expect(filterRpcArgs(parseListingFilters({}))).toEqual({
      p_deal: null, p_districts: null, p_type: null, p_rooms: null, p_min_price: null, p_max_price: null,
      p_min_area: null, p_max_area: null, p_q_groups: null, p_posted: null, p_features: null,
      p_new_build: false, p_adv1: false, p_no_deposit: false, p_loan8: false, p_owner_only: false,
    });
  });

  it("бүх талбар", () => {
    const f = parseListingFilters({
      deal: "rent", district: "Баянгол,Хан-Уул", type: "Хаус", rooms: "3", minPrice: "1000", maxPrice: "9000",
      minArea: "40", maxArea: "90.5", q: "зайсан 2 өрөө", posted: "7", features: "parking,furnished",
      newBuild: "1", adv1: "1", noDeposit: "1", loan8: "1", ownerOnly: "1",
    });
    expect(filterRpcArgs(f)).toEqual({
      p_deal: "rent", p_districts: ["Хан-Уул", "Баянгол"], p_type: "Хаус", p_rooms: 3, p_min_price: 1000,
      p_max_price: 9000, p_min_area: 40, p_max_area: 90.5, p_q_groups: searchPatternGroups("зайсан 2 өрөө"),
      p_posted: 7, p_features: ["furnished", "parking"],
      // deal=rent → loan8 (зөвхөн худалдаа) хасагдана (sanitizeDealFlags).
      p_new_build: true, p_adv1: true, p_no_deposit: true, p_loan8: false, p_owner_only: true,
    });
  });

  it("зөрчилтэй туг parse-гүй объектоос ч хасагдана (Худалдаа + урьдчилгаа 1 сар → 0 биш)", () => {
    const sale = filterRpcArgs({ deal: "sale", adv1: true, noDeposit: true, loan8: true });
    expect([sale.p_deal, sale.p_adv1, sale.p_no_deposit, sale.p_loan8]).toEqual(["sale", false, false, true]);
    expect(facetQueryKey({ deal: "sale", adv1: true })).toBe(facetQueryKey({ deal: "sale" }));
    expect(facetQueryKey({ deal: "rent" })).not.toBe(facetQueryKey({ deal: "sale" }));
    // Эрэмбэ, хуудас тоонд нөлөөлөхгүй.
    expect(facetQueryKey({ deal: "rent", sort: "price_asc", page: 3 })).toBe(facetQueryKey({ deal: "rent" }));
  });
});

describe("compactRpcArgs", () => {
  it("null/undefined/false-ыг хасна, 0 ба массивыг үлдээнэ", () => {
    expect(compactRpcArgs({ a: null, b: undefined, c: false, d: 0, e: ["x"], f: true, g: "s" })).toEqual({
      d: 0, e: ["x"], f: true, g: "s",
    });
  });

  it("шүүлтгүй бол {} — хуучин газрын зургийн гарын үсэгт таарна", () => {
    expect(compactRpcArgs(filterRpcArgs(parseListingFilters({})))).toEqual({});
    expect(compactRpcArgs({ ...filterRpcArgs(parseListingFilters({})), p_has_location: false })).toEqual({});
    expect(compactRpcArgs(filterRpcArgs(parseListingFilters({ deal: "sale" })))).toEqual({ p_deal: "sale" });
  });
});

describe("parseFacets", () => {
  it("объект биш бол null", () => {
    expect(parseFacets(null)).toBeNull();
    expect(parseFacets("x")).toBeNull();
    expect(parseFacets([1])).toBeNull();
  });

  it("дутуу/буруу утга → 0, new_from → newFrom", () => {
    const f = parseFacets({ total: "12", new_from: 2021, deal: { sale: "x", rent: 3 }, rooms: { "1": null }, flags: 5 })!;
    expect(f.total).toBe(12);
    expect(f.newFrom).toBe(2021);
    expect(f.deal).toEqual({ sale: 0, rent: 3 });
    expect(f.rooms).toEqual({ "1": 0, "2": 0, "3": 0, "4": 0 });
    expect(f.features.pets_allowed).toBe(0);
    expect(f.flags).toEqual({ newBuild: 0, adv1: 0, noDeposit: 0, loan8: 0, ownerOnly: 0 });
    expect(parseFacets({ total: Infinity })!.total).toBe(0);
  });
});

describe("facetCount / quickChipVisible", () => {
  it("QUICK_CHIPS бүрийн тоо", () => {
    expect(Object.fromEntries(QUICK_CHIPS.map((id) => [id, facetCount(FACETS, id)]))).toEqual({
      furnished: 19, parking: 45, newBuild: 40, loan8: 29, adv1: 10, elevator: 9, noDeposit: 0, ownerOnly: 0,
    });
  });

  it("тэг бол нуугдана, сонгосон бол харагдана", () => {
    const f = parseListingFilters({});
    expect(quickChipVisible(f, FACETS, "noDeposit")).toBe(false);
    expect(quickChipVisible(f, FACETS, "ownerOnly")).toBe(false);
    expect(quickChipVisible(f, FACETS, "furnished")).toBe(true);
    expect(quickChipVisible(parseListingFilters({ ownerOnly: "1" }), FACETS, "ownerOnly")).toBe(true);
  });

  it("adv1/noDeposit худалдаанд, loan8 түрээсэнд нуугдана", () => {
    const sale = parseListingFilters({ deal: "sale" });
    const rent = parseListingFilters({ deal: "rent" });
    expect(quickChipVisible(sale, FACETS, "adv1")).toBe(false);
    expect(quickChipVisible(sale, null, "noDeposit")).toBe(false);
    expect(quickChipVisible(rent, FACETS, "loan8")).toBe(false);
    expect(quickChipVisible(rent, FACETS, "adv1")).toBe(true);
    expect(quickChipVisible(sale, FACETS, "loan8")).toBe(true);
  });

  it("facets байхгүй (RPC алдаа) → тоогүй харагдана", () => {
    const f = parseListingFilters({});
    for (const id of QUICK_CHIPS) expect(quickChipVisible(f, null, id)).toBe(true);
  });
});

describe("formDataParams", () => {
  it("давтагдсан түлхүүрийг getAll-оор уншина → каноник шүүлт", () => {
    const fd = new FormData();
    fd.append("district", "Баянгол");
    fd.append("district", "Хан-Уул");
    fd.append("features", "parking");
    fd.append("features", "furnished");
    fd.append("minPrice", "");
    fd.append("loan8", "1");
    const p = formDataParams(fd);
    expect(p.district).toEqual(["Баянгол", "Хан-Уул"]);
    const f = parseListingFilters(p);
    expect(f).toMatchObject({ district: "Хан-Уул,Баянгол", features: ["furnished", "parking"], loan8: true });
    expect(f.minPrice).toBeUndefined();
  });
});
