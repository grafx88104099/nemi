import { describe, expect, it } from "vitest";

import {
  LOAN8_MAX_PRICE,
  QUICK_CHIPS,
  activeFilterChips,
  activeFilterCount,
  applyListingFilters,
  districtList,
  escapeLike,
  filtersHref,
  filtersToParams,
  newBuildFrom,
  parseListingFilters,
  quickChipActive,
  quickChipLabel,
  sanitizeDealFlags,
  toggleQuickChip,
  type FilterableQuery,
} from "@/lib/listing-filters";

/** Дуудлагыг бичиж авдаг хуурмаг асуулга. */
class FakeQuery implements FilterableQuery<FakeQuery> {
  calls: [string, string, unknown][] = [];
  eq(c: string, v: unknown) { this.calls.push(["eq", c, v]); return this; }
  gte(c: string, v: unknown) { this.calls.push(["gte", c, v]); return this; }
  lte(c: string, v: unknown) { this.calls.push(["lte", c, v]); return this; }
  like(c: string, v: string) { this.calls.push(["like", c, v]); return this; }
  or(v: string) { this.calls.push(["or", "", v]); return this; }
  in(c: string, v: readonly unknown[]) { this.calls.push(["in", c, [...v]]); return this; }
  contains(c: string, v: readonly string[]) { this.calls.push(["contains", c, [...v]]); return this; }
  is(c: string, v: null) { this.calls.push(["is", c, v]); return this; }
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

  it("давтагдсан дүүргийг каноник таслалтай жагсаалт болгоно", () => {
    expect(parseListingFilters({ district: ["Баянгол", "Хан-Уул"] }).district).toBe("Хан-Уул,Баянгол");
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
    expect(chips.map((c) => c.key)).toEqual(["district:Баянгол", "rooms"]);
    expect(chips.every((c) => c.nofollow)).toBe(true);
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
    expect(chips.map((c) => c.label)).toEqual(["300 сая ₮-аас дээш", "80 м² хүртэл"]);
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
    // Нугалалт % _ \-ийг хасдаг тул хэв маягт хэзээ ч орохгүй.
    const q = applyListingFilters(new FakeQuery(), parseListingFilters({ q: "100%" }));
    expect(q.calls).toEqual([["like", "search_text", "% 100%"]]);
  });

  it("q-г search_text-ээр, латин бичлэгийг кирилл болгож хайна", () => {
    const q = applyListingFilters(new FakeQuery(), parseListingFilters({ q: "zaisan" }));
    expect(q.calls).toEqual([["like", "search_text", "%заисан%"]]);
  });

  it("хоёрдмол латин үсэг нэг or= бүлэг болно", () => {
    const q = applyListingFilters(new FakeQuery(), parseListingFilters({ q: "uruu" }));
    expect(q.calls).toHaveLength(1);
    const [op, , v] = q.calls[0];
    expect(op).toBe("or");
    expect(v).toContain('search_text.like."%уру%"');
    expect(v).toContain('search_text.like."%оро%"');
  });

  it("дүүргэгч үгс хасагдана", () => {
    const q = applyListingFilters(new FakeQuery(), parseListingFilters({ q: "зайсан байр хайж байна" }));
    expect(q.calls).toEqual([
      ["like", "search_text", "%заисан%"],
      ["like", "search_text", "%баир%"],
    ]);
    expect(applyListingFilters(new FakeQuery(), parseListingFilters({ q: "байна" })).calls).toEqual([]);
  });
});

// ── Facets: онцлог, туг, олон дүүрэг ─────────────────────────────────────────
describe("parseListingFilters — онцлог, туг, олон дүүрэг", () => {
  it("онцлогийг толийн дарааллаар, танихгүйг хасна", () => {
    expect(parseListingFilters({ features: "elevator,furnished,bogus" }).features).toEqual(["furnished", "elevator"]);
    expect(parseListingFilters({ features: ["parking", "furnished"] }).features).toEqual(["furnished", "parking"]);
    expect(parseListingFilters({ features: "bogus," }).features).toBeUndefined();
  });

  it("туг: «1», «true» → true; бусад нь undefined", () => {
    const f = parseListingFilters({ newBuild: "1", adv1: "true", noDeposit: "0", loan8: "yes", ownerOnly: "" });
    expect(f.newBuild).toBe(true);
    expect(f.adv1).toBe(true);
    expect(f.noDeposit).toBeUndefined();
    expect(f.loan8).toBeUndefined();
    expect(f.ownerOnly).toBeUndefined();
  });

  it("дүүрэг каноник: DISTRICTS-ийн дарааллаар, танихгүй нь араас", () => {
    expect(parseListingFilters({ district: "Баянгол,Хан-Уул" }).district).toBe("Хан-Уул,Баянгол");
    expect(parseListingFilters({ district: "Багануур,Хан-Уул" }).district).toBe("Хан-Уул,Багануур");
    expect(parseListingFilters({ district: "Хан-Уул, Хан-Уул ,," }).district).toBe("Хан-Уул");
    expect(parseListingFilters({ district: " , " }).district).toBeUndefined();
    const many = Array.from({ length: 12 }, (_, i) => `D${i}`).join(",");
    expect(districtList(parseListingFilters({ district: many }))).toHaveLength(9);
    expect(districtList(parseListingFilters({ district: "x".repeat(80) }))[0]).toHaveLength(60);
  });
});

describe("filtersToParams — шинэ параметрүүд", () => {
  it("онцлог таслалаар, туг «1», false/undefined орхигдоно", () => {
    const p = filtersToParams({ features: ["furnished", "parking"], newBuild: true, adv1: false, loan8: true });
    expect(p.get("features")).toBe("furnished,parking");
    expect(p.get("newBuild")).toBe("1");
    expect(p.has("adv1")).toBe(false);
    expect(p.get("loan8")).toBe("1");
  });

  it("parse ∘ toParams тойрог ижил", () => {
    const f = parseListingFilters({
      deal: "rent", district: "Баянгол,Хан-Уул,Багануур", features: "elevator,parking", newBuild: "1", adv1: "1",
      noDeposit: "1", loan8: "1", ownerOnly: "1", rooms: "2", minPrice: "1000000", q: "зайсан", posted: "7",
    });
    expect(parseListingFilters(Object.fromEntries(filtersToParams(f)))).toEqual(f);
  });
});

describe("activeFilterChips — дүүрэг, онцлог, туг", () => {
  const f = parseListingFilters({
    district: "Хан-Уул,Баянгол", features: "furnished,parking", newBuild: "1", adv1: "1", noDeposit: "1", loan8: "1", ownerOnly: "1",
  });
  const chips = activeFilterChips("/listings", f);

  it("дүүрэг, онцлог бүр тусдаа чип, зөвхөн өөрийнхөө утгыг хасна", () => {
    const d = chips.find((c) => c.key === "district:Хан-Уул")!;
    expect(new URL(d.href, "http://x").searchParams.get("district")).toBe("Баянгол");
    const ft = chips.find((c) => c.key === "features:parking")!;
    expect(ft.label).toBe("Зогсоолтой");
    const u = new URL(ft.href, "http://x");
    expect(u.searchParams.get("features")).toBe("furnished");
    expect(u.searchParams.get("district")).toBe("Хан-Уул,Баянгол");
    expect(chips.every((c) => c.nofollow === true)).toBe(true);
  });

  it("тугийн нэр", () => {
    const label = (k: string) => chips.find((c) => c.key === k)?.label;
    expect(label("newBuild")).toBe(`Шинэ барилга (${newBuildFrom()}+)`);
    expect(label("adv1")).toBe("Урьдчилгаа 1 сар");
    expect(label("noDeposit")).toBe("Барьцаагүй");
    expect(label("loan8")).toBe("8%-ийн зээлд тохирох (тооцоолол)");
    expect(label("ownerOnly")).toBe("Эзэн өөрөө");
  });

  it("сүүлийн дүүргийг хасвал district алга болно", () => {
    const one = activeFilterChips("/listings", parseListingFilters({ district: "Баянгол" }));
    expect(new URL(one[0].href, "http://x").searchParams.has("district")).toBe(false);
  });
});

describe("activeFilterCount", () => {
  it("дүүрэг, онцлог, туг тус бүр; үнэ/талбайн муж 1; deal, q, sort тоологдохгүй", () => {
    expect(activeFilterCount(parseListingFilters({}))).toBe(0);
    expect(activeFilterCount(parseListingFilters({ deal: "rent", q: "зайсан", sort: "price_asc" }))).toBe(0);
    expect(
      activeFilterCount(
        parseListingFilters({
          district: "Хан-Уул,Баянгол", type: "Хаус", rooms: "2", minPrice: "1", maxPrice: "9", minArea: "40", maxArea: "90",
          posted: "7", features: "furnished,parking", loan8: "1", ownerOnly: "1",
        })
      )
    ).toBe(2 + 1 + 1 + 1 + 1 + 1 + 2 + 2);
  });
});

describe("QUICK_CHIPS", () => {
  it("дараалал", () => {
    expect([...QUICK_CHIPS]).toEqual(["furnished", "parking", "newBuild", "loan8", "adv1", "elevator", "noDeposit", "ownerOnly"]);
  });

  it("сэлгэхэд нэмж/хасна, хуудас хасагдана, бусад шүүлт хэвээр", () => {
    const f = parseListingFilters({ deal: "sale", features: "parking", page: "3" });
    const a = toggleQuickChip(f, "furnished");
    expect(a.features).toEqual(["furnished", "parking"]);
    expect(a.page).toBeUndefined();
    expect(a.deal).toBe("sale");
    expect(quickChipActive(a, "furnished")).toBe(true);
    const b = toggleQuickChip(toggleQuickChip(a, "furnished"), "parking");
    expect(b.features).toBeUndefined();
    const c = toggleQuickChip(f, "loan8");
    expect(c.loan8).toBe(true);
    expect(toggleQuickChip(c, "loan8").loan8).toBeUndefined();
  });

  it("нэр", () => {
    expect(quickChipLabel("newBuild", 2021)).toBe("Шинэ барилга (2021+)");
    expect(quickChipLabel("loan8", 2021)).toBe("8%-ийн зээлд тохирох");
    expect(quickChipLabel("elevator", 2021)).toBe("Лифттэй");
  });
});

describe("applyListingFilters — шинэ шүүлт", () => {
  const now = Date.parse("2026-11-23T04:00:00Z");

  it("олон дүүрэг → in, нэг → eq", () => {
    expect(applyListingFilters(new FakeQuery(), parseListingFilters({ district: "Баянгол,Хан-Уул" })).calls).toEqual([
      ["in", "district", ["Хан-Уул", "Баянгол"]],
    ]);
    expect(applyListingFilters(new FakeQuery(), parseListingFilters({ district: "Баянгол" })).calls).toEqual([
      ["eq", "district", "Баянгол"],
    ]);
  });

  it("онцлог → contains, шинэ барилга → gte year (УБ он − 5)", () => {
    const q = applyListingFilters(new FakeQuery(), parseListingFilters({ features: "parking,furnished", newBuild: "1" }), { now });
    expect(q.calls).toEqual([
      ["contains", "features", ["furnished", "parking"]],
      ["gte", "year", 2021],
    ]);
    expect(newBuildFrom(now)).toBe(2021);
    // УБ-д шинэ он эхэлсэн (UTC-д өмнөх он хэвээр).
    expect(newBuildFrom(Date.parse("2026-12-31T17:00:00Z"))).toBe(2022);
  });

  it("adv1 + noDeposit → rent нэг удаа (deal=rent бол давхардахгүй)", () => {
    expect(applyListingFilters(new FakeQuery(), parseListingFilters({ adv1: "1", noDeposit: "1" })).calls).toEqual([
      ["eq", "deal_type", "rent"],
      ["lte", "rent_advance_months", 1],
      ["eq", "rent_deposit_months", 0],
    ]);
    expect(applyListingFilters(new FakeQuery(), parseListingFilters({ deal: "rent", adv1: "1" })).calls).toEqual([
      ["eq", "deal_type", "rent"],
      ["lte", "rent_advance_months", 1],
    ]);
  });

  it("loan8 → sale, Орон сууц, price ≤ 357 сая; ownerOnly → is agent_id null", () => {
    expect(applyListingFilters(new FakeQuery(), parseListingFilters({ loan8: "1", ownerOnly: "1" })).calls).toEqual([
      ["eq", "deal_type", "sale"],
      ["eq", "type", "Орон сууц"],
      ["lte", "price", 357_000_000],
      ["is", "agent_id", null],
    ]);
    expect(LOAN8_MAX_PRICE).toBe(357_000_000);
    expect(
      applyListingFilters(new FakeQuery(), parseListingFilters({ deal: "sale", type: "Орон сууц", loan8: "1" })).calls
    ).toEqual([
      ["eq", "deal_type", "sale"],
      ["eq", "type", "Орон сууц"],
      ["lte", "price", 357_000_000],
    ]);
  });

  it("хадгалсан хайлт (cron) — онцлог, туг, олон дүүрэг тойрог ижил, posted алгасна", () => {
    const saved = Object.fromEntries(
      filtersToParams(
        parseListingFilters({ district: "Баянзүрх,Хан-Уул", features: "elevator", loan8: "1", posted: "7" }),
        { withSort: true }
      )
    );
    const f = parseListingFilters(saved);
    expect(f).toMatchObject({ district: "Хан-Уул,Баянзүрх", features: ["elevator"], loan8: true, posted: 7 });
    expect(applyListingFilters(new FakeQuery(), f, { now, ignorePosted: true }).calls).toEqual([
      ["in", "district", ["Хан-Уул", "Баянзүрх"]],
      ["contains", "features", ["elevator"]],
      ["eq", "deal_type", "sale"],
      ["eq", "type", "Орон сууц"],
      ["lte", "price", 357_000_000],
    ]);
  });
});

describe("sanitizeDealFlags — deal-тэй зөрчилдөх туг", () => {
  it("Худалдаа → adv1/noDeposit хасагдана, Түрээс → loan8 хасагдана, deal-гүй бол хэвээр", () => {
    expect(parseListingFilters({ deal: "sale", adv1: "1", noDeposit: "1", loan8: "1" })).toMatchObject({
      deal: "sale",
      adv1: undefined,
      noDeposit: undefined,
      loan8: true,
    });
    expect(parseListingFilters({ deal: "rent", adv1: "1", loan8: "1" })).toMatchObject({
      deal: "rent",
      adv1: true,
      loan8: undefined,
    });
    const free = { adv1: true, loan8: true };
    expect(sanitizeDealFlags(free)).toBe(free);
  });

  it("deal=sale&adv1=1 нь 'sale' ба 'rent' хоёуланг тавьж хоосон хуудас өгөхгүй", () => {
    const calls = applyListingFilters(new FakeQuery(), { deal: "sale", adv1: true }).calls;
    expect(calls).toEqual([["eq", "deal_type", "sale"]]);
  });

  it("табын href: Худалдах руу шилжихэд түрээсийн туг үлдэхгүй", () => {
    const f = parseListingFilters({ adv1: "1", district: "Хан-Уул" });
    expect(filtersHref("/listings", sanitizeDealFlags({ ...f, deal: "sale" }))).toBe(
      `/listings?deal=sale&district=${encodeURIComponent("Хан-Уул")}`
    );
  });
});
