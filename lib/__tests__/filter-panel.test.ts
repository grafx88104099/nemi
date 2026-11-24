import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FilterPanel } from "@/components/listings/filters/FilterPanel";
import { FilterPanelForm } from "@/components/listings/filters/FilterPanelForm";
import { SearchFilterBar } from "@/components/listings/SearchFilterBar";
import { DISTRICTS } from "@/lib/constants";
import { parseFacets } from "@/lib/listing-facets";
import { parseListingFilters } from "@/lib/listing-filters";

const tags = (html: string, re: RegExp) => html.match(re) ?? [];
const inputs = (html: string, name: string) =>
  tags(html, /<input[^>]*>/g).filter((t) => t.includes(`name="${name}"`));

describe("FilterPanel — JS-гүй (SSR)", () => {
  const f = parseListingFilters({ district: "Хан-Уул,Багануур", q: "зайсан", sort: "price_asc" });
  const html = renderToString(createElement(FilterPanel, { base: "/listings", f, facets: null }));

  it("<details> + <summary> дотор бүтэн GET маягт, portal-гүй", () => {
    expect(html.startsWith("<details")).toBe(true);
    expect(html.trimEnd().endsWith("</details>")).toBe(true);
    expect(html).toContain("<summary");
    expect(html).toMatch(/<form[^>]*action="\/listings"/);
    expect(html).toMatch(/<form[^>]*method="get"/);
    expect(html).not.toContain('role="dialog"');
    expect(html).toContain("Шүүлтүүр");
    // 2 дүүрэг = 2 идэвхтэй шүүлт (q, sort тоологдохгүй).
    expect(html).toMatch(/\(<!-- -->2<!-- -->\)|\(2\)/);
  });

  it("7 дүүргийн checkbox + сонгосон танихгүй «Багануур» checked", () => {
    const ds = inputs(html, "district");
    for (const d of DISTRICTS) expect(ds.some((t) => t.includes(`value="${d}"`))).toBe(true);
    const extra = ds.find((t) => t.includes('value="Багануур"'))!;
    expect(extra).toBeTruthy();
    expect(extra).toMatch(/checked/);
    expect(ds.find((t) => t.includes('value="Хан-Уул"'))).toMatch(/checked/);
    expect(ds.find((t) => t.includes('value="Баянгол"'))).not.toMatch(/checked/);
  });

  it("өрөөний radio, онцлог, туг, далд q/sort, submit", () => {
    expect(inputs(html, "rooms").length).toBe(5);
    expect(inputs(html, "features").length).toBe(8);
    expect(inputs(html, "loan8").length).toBe(1);
    expect(inputs(html, "q")[0]).toContain('type="hidden"');
    expect(inputs(html, "sort")[0]).toContain('value="price_asc"');
    expect(html).toMatch(/<button[^>]*type="submit"/);
    expect(html).toContain("Зээлийн шийдвэрийг банк гаргана.");
  });

  it("түрээсэд «Худалдаа», худалдаанд «Түрээсийн нөхцөл» нуугдана", () => {
    const rent = renderToString(
      createElement(FilterPanel, { base: "/listings", f: parseListingFilters({ deal: "rent" }), facets: null })
    );
    expect(inputs(rent, "loan8")).toHaveLength(0);
    expect(inputs(rent, "adv1")).toHaveLength(1);
    const sale = renderToString(
      createElement(FilterPanel, { base: "/map", f: parseListingFilters({ deal: "sale" }), facets: null })
    );
    expect(inputs(sale, "adv1")).toHaveLength(0);
    expect(sale).toMatch(/<form[^>]*action="\/map"/);
  });

  it("тоотой үед: тэг тоотой сонгоогүй онцлог идэвхгүй, сонгосон нь идэвхтэй", () => {
    const facets = parseFacets({
      total: 0,
      new_from: 2021,
      features: { furnished: 3 },
      flags: {},
      type: { "Орон сууц": 92 },
    });
    const h = renderToString(
      createElement(FilterPanel, { base: "/listings", f: parseListingFilters({ features: "elevator" }), facets })
    );
    const fs = inputs(h, "features");
    expect(fs.find((t) => t.includes('value="pets_allowed"'))).toMatch(/disabled/);
    expect(fs.find((t) => t.includes('value="furnished"'))).not.toMatch(/disabled/);
    expect(fs.find((t) => t.includes('value="elevator"'))).not.toMatch(/disabled/);
    expect(inputs(h, "type").find((t) => t.includes('value="Хаус"'))).toMatch(/disabled/);
    expect(h).toContain("Тохирох зар алга");
    expect(h).toContain("Шинэ барилга (2021+)");
  });
});

describe("SearchFilterBar", () => {
  const f = parseListingFilters({ deal: "rent", district: "Хан-Уул", features: "parking", q: "зайсан" });
  const facets = parseFacets({
    total: 5,
    new_from: 2021,
    deal: { sale: 89, rent: 44 },
    features: { furnished: 2, parking: 5, elevator: 1 },
    flags: { newBuild: 3, adv1: 1, noDeposit: 0, loan8: 0, ownerOnly: 0 },
  });
  const html = renderToString(createElement(SearchFilterBar, { base: "/listings", f, facets, showSort: true }));

  it("FilterPanel нь хайлтын </form>-ийн ДАРАА (дотор биш)", () => {
    const searchStart = html.search(/<form[^>]*role="search"/);
    const searchEnd = html.indexOf("</form>", searchStart);
    const details = html.indexOf("<details");
    expect(searchStart).toBeGreaterThanOrEqual(0);
    expect(details).toBeGreaterThan(searchEnd);
    const search = html.slice(searchStart, searchEnd);
    expect(search).not.toContain("<details");
    expect(search.match(/<form/g)).toHaveLength(1);
  });

  it("хайлтын маягт q-аас бусад шүүлтийг далд талбараар хадгална", () => {
    const searchStart = html.search(/<form[^>]*role="search"/);
    const search = html.slice(searchStart, html.indexOf("</form>", searchStart));
    expect(search).toMatch(/<input type="hidden" name="deal" value="rent"/);
    expect(search).toMatch(/<input type="hidden" name="district" value="Хан-Уул"/);
    expect(search).toMatch(/<input type="hidden" name="features" value="parking"/);
    expect(search).not.toMatch(/type="hidden" name="q"/);
    expect(search).toContain('name="sort"');
  });

  it("таб тоотой, түргэн чип ба арилгах чип rel=nofollow", () => {
    expect(html).toContain("Бүгд");
    expect(html).toMatch(/Түрээслэх<span[^>]*>\(<!-- -->44<!-- -->\)/);
    expect(html).toMatch(/Зарах<span[^>]*>\(<!-- -->89<!-- -->\)/);
    expect(html).toMatch(/Бүгд<span[^>]*>\(<!-- -->133<!-- -->\)/);
    const chipList = html.slice(html.indexOf('aria-label="Түргэн шүүлт"'));
    const anchors = tags(chipList.slice(0, chipList.indexOf("</ul>")), /<a[^>]*>/g);
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) expect(a).toContain('rel="nofollow"');
    // loan8 түрээсэнд, noDeposit тэг тоотой → нуугдана.
    expect(chipList.slice(0, chipList.indexOf("</ul>"))).not.toContain("loan8");
    const removable = tags(html, /<a[^>]*шүүлтийг арилгах[^>]*>/g);
    expect(removable.length).toBeGreaterThan(0);
    for (const a of removable) expect(a).toContain('rel="nofollow"');
  });
});

describe("FilterPanelForm — sheet горим (амьд тоо)", () => {
  const facets = parseFacets({
    total: 0,
    new_from: 2021,
    deal: { sale: 0, rent: 0 },
    district: { "Хан-Уул": 0 },
    features: { furnished: 0 },
    flags: { noDeposit: 0, adv1: 0 },
  });
  const f = parseListingFilters({ deal: "rent", noDeposit: "1" });
  const render = (props: Partial<Parameters<typeof FilterPanelForm>[0]>) =>
    renderToString(createElement(FilterPanelForm, { base: "/listings", f, facets, ...props }));

  it("countsPending: хуучин facets-ээр юу ч идэвхгүй болохгүй, «Тоолж байна…», aria-busy", () => {
    // noDeposit-ийг сая арилгасан: cur ≠ facets-ийн сонголт.
    const h = render({ cur: { ...f, noDeposit: undefined }, countsPending: true });
    expect(h).not.toMatch(/<input[^>]*disabled/);
    expect(h).toContain("Тоолж байна…");
    expect(h).toMatch(/<form[^>]*aria-busy="true"/);
    expect(h).not.toContain("зар тохирч байна");
  });

  it("countsPending=false үед тэг тоотой сонгоогүй нь идэвхгүй (хэвийн)", () => {
    const h = render({ cur: { ...f, noDeposit: undefined } });
    expect(inputs(h, "noDeposit")[0]).toMatch(/disabled/);
  });

  it("countsStale: хуучин тоо нуугдаж, «Тоо шинэчлэгдсэнгүй» харагдана (live region ч)", () => {
    const h = render({ countsStale: true });
    expect(h.match(/Тоо шинэчлэгдсэнгүй/g)?.length).toBe(2);
    expect(h).toContain("Зар харах");
    expect(h).not.toMatch(/<input[^>]*disabled/);
  });

  it("onReset → type=button «Арилгах» (холбоос биш); JS-гүй үед холбоос", () => {
    const h = render({ onReset: () => {} });
    expect(h).toMatch(/<button[^>]*type="button"[^>]*data-filter-reset/);
    expect(render({})).toMatch(/<a[^>]*rel="nofollow"[^>]*>Арилгах/);
  });

  it("үнийн тайлбар: aria-live-гүй, aria-describedby-оор холбогдсон, «-аас» дагаваргүй", () => {
    const h = renderToString(
      createElement(FilterPanelForm, {
        base: "/listings",
        f: parseListingFilters({ minPrice: "320000000" }),
        facets: null,
      })
    );
    expect(h).toContain("Доод: 320 сая ₮");
    expect(h).not.toContain("₮-аас");
    expect(h).not.toContain('aria-live="polite">Доод');
    const min = inputs(h, "minPrice")[0];
    const id = min.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(h).toContain(`id="${id}"`);
  });

  it("туг нь амьд сонголтоор (cur) checked — хэсэг дахин гарч ирэхэд URL-ын утга сэргэхгүй", () => {
    const h = render({ cur: { ...f, noDeposit: undefined }, countsPending: true });
    expect(inputs(h, "noDeposit")[0]).not.toMatch(/checked/);
  });
});

describe("SearchFilterBar — зөрчилтэй туг", () => {
  it("adv1-тэй үед «Худалдах» таб adv1-гүй холбоос", () => {
    const html = renderToString(
      createElement(SearchFilterBar, { base: "/listings", f: parseListingFilters({ adv1: "1" }), facets: null })
    );
    const sale = tags(html, /<a[^>]*href="[^"]*deal=sale[^"]*"[^>]*>/g)[0];
    expect(sale).toBeTruthy();
    expect(sale).not.toContain("adv1");
  });
});
