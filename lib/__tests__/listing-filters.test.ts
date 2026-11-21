import { describe, expect, it } from "vitest";

import {
  activeFilterChips,
  applyListingFilters,
  escapeLike,
  filtersHref,
  parseListingFilters,
  type FilterableQuery,
} from "@/lib/listing-filters";

/** Дуудлагыг бичиж авдаг хуурмаг асуулга. */
class FakeQuery implements FilterableQuery<FakeQuery> {
  calls: [string, string, unknown][] = [];
  eq(c: string, v: unknown) { this.calls.push(["eq", c, v]); return this; }
  gte(c: string, v: unknown) { this.calls.push(["gte", c, v]); return this; }
  lte(c: string, v: unknown) { this.calls.push(["lte", c, v]); return this; }
  ilike(c: string, v: string) { this.calls.push(["ilike", c, v]); return this; }
}

describe("parseListingFilters", () => {
  it("хүчинтэй утгыг уншина", () => {
    const f = parseListingFilters({
      deal: "rent", district: "Хан-Уул", rooms: "2", minPrice: "1,500,000", maxArea: "90.5", sort: "price_asc", page: "3",
    });
    expect(f).toMatchObject({
      deal: "rent", district: "Хан-Уул", rooms: 2, minPrice: 1_500_000, maxArea: 90.5, sort: "price_asc", page: 3,
    });
  });

  it("буруу утгыг чимээгүй орхино", () => {
    const f = parseListingFilters({ deal: "lease", rooms: "abc", minPrice: "-5", sort: "evil", page: "0", q: "   " });
    expect(f.deal).toBeUndefined();
    expect(f.rooms).toBeUndefined();
    expect(f.minPrice).toBeUndefined();
    expect(f.q).toBeUndefined();
    expect(f.sort).toBe("new");
    expect(f.page).toBe(1);
  });

  it("массив параметрийн эхнийхийг авна", () => {
    expect(parseListingFilters({ district: ["Баянгол", "Хан-Уул"] }).district).toBe("Баянгол");
  });
});

describe("filtersHref", () => {
  it("хуудас ба анхдагч эрэмбийг оруулахгүй, deal-ийг хадгална", () => {
    const f = parseListingFilters({ deal: "rent", district: "Баянгол", page: "4" });
    expect(filtersHref("/listings", f)).toBe("/listings?deal=rent&district=%D0%91%D0%B0%D1%8F%D0%BD%D0%B3%D0%BE%D0%BB");
    expect(filtersHref("/listings", parseListingFilters({}))).toBe("/listings");
  });
});

describe("activeFilterChips", () => {
  it("чипийг дарвал зөвхөн тэр шүүлт арилна, Түрээс хадгалагдана", () => {
    const f = parseListingFilters({ deal: "rent", district: "Баянгол", rooms: "2", page: "2" });
    const chips = activeFilterChips("/listings", f);
    expect(chips.map((c) => c.key)).toEqual(["district", "rooms"]);
    const rooms = chips.find((c) => c.key === "rooms")!;
    expect(rooms.label).toBe("2+ өрөө");
    const u = new URL(rooms.href, "http://x");
    expect(u.searchParams.get("deal")).toBe("rent");
    expect(u.searchParams.get("district")).toBe("Баянгол");
    expect(u.searchParams.has("rooms")).toBe(false);
    expect(u.searchParams.has("page")).toBe(false);
  });

  it("үнэ, талбайн чипийн нэр", () => {
    const chips = activeFilterChips("/listings", parseListingFilters({ minPrice: "300000000", maxArea: "80" }));
    expect(chips.map((c) => c.label)).toEqual(["300 сая₮-аас дээш", "80 м² хүртэл"]);
  });
});

describe("applyListingFilters", () => {
  it("Түрээс/Худалдах ба талбайн шүүлтийг хэрэглэнэ", () => {
    const q = applyListingFilters(new FakeQuery(), parseListingFilters({ deal: "rent", minArea: "60", maxArea: "90" }));
    expect(q.calls).toEqual([
      ["eq", "deal_type", "rent"],
      ["gte", "area", 60],
      ["lte", "area", 90],
    ]);
  });

  it("хугацааны шүүлтийг тогтсон цагаар тооцно, мэдэгдэлд алгасна", () => {
    const now = Date.parse("2026-11-21T00:00:00Z");
    const f = parseListingFilters({ posted: "7" });
    expect(applyListingFilters(new FakeQuery(), f, { now }).calls).toEqual([
      ["gte", "created_at", "2026-11-14T00:00:00.000Z"],
    ]);
    expect(applyListingFilters(new FakeQuery(), f, { now, ignorePosted: true }).calls).toEqual([]);
  });

  it("хайлтын % _ тэмдгийг үсэг болгоно", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    const q = applyListingFilters(new FakeQuery(), parseListingFilters({ q: "100%" }));
    expect(q.calls).toEqual([["ilike", "title", "%100\\%%"]]);
  });
});
