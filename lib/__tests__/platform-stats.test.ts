import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DistrictTiles } from "@/components/home/DistrictTiles";
import { ProofStrip, proofItems } from "@/components/home/ProofStrip";
import { SmartTools } from "@/components/home/SmartTools";

import {
  aboutStatItems,
  ALL_DISTRICTS,
  computePlatformStats,
  median,
  sortCityTiles,
  type StatsListingRow,
} from "@/lib/platform-stats-core";

// next/font/google нь зөвхөн Next-ийн build дотор ажиллана.
vi.mock("@/components/brand/fonts", () => ({ manrope: { variable: "manrope-var", className: "manrope" } }));

const NOW = Date.parse("2026-11-23T04:00:00Z");
const OLD = "2026-10-01T00:00:00Z";

function apt(district: string, price: number, area: number, created_at = OLD): StatsListingRow {
  return { district, deal_type: "sale", type: "Орон сууц", price, area, created_at };
}

describe("median", () => {
  it("сондгой ба тэгш", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("computePlatformStats", () => {
  it("сондгой тооны орон сууцны худалдааны м² медиан", () => {
    const rows = [1, 2, 3, 4, 5].map((m) => apt("Хан-Уул", m * 1_000_000 * 50, 50));
    const s = computePlatformStats(rows, 0, 0, NOW);
    const d = s.districts.find((x) => x.district === "Хан-Уул")!;
    expect(d.medianPpm).toBe(3_000_000);
    expect(d.aptSaleCount).toBe(5);
    expect(d.count).toBe(5);
  });

  it("тэгш тооны медиан нь дундын хоёрын дундаж", () => {
    const rows = [1, 2, 3, 4, 5, 6].map((m) => apt("Баянгол", m * 1_000_000 * 40, 40));
    const d = computePlatformStats(rows, 0, 0, NOW).districts.find((x) => x.district === "Баянгол")!;
    expect(d.medianPpm).toBe(3_500_000);
  });

  it("n < 5 бол medianPpm null", () => {
    const rows = [1, 2, 3, 4].map((m) => apt("Чингэлтэй", m * 1e8, 50));
    const d = computePlatformStats(rows, 0, 0, NOW).districts.find((x) => x.district === "Чингэлтэй")!;
    expect(d.count).toBe(4);
    expect(d.medianPpm).toBeNull();
  });

  it("түрээс, орон сууцаас бусад худалдаа, area ≤ 0 медианд орохгүй", () => {
    const rows: StatsListingRow[] = [
      ...[1, 1, 1, 1, 1].map(() => apt("Сүхбаатар", 100_000_000, 50)), // 2 сая/м²
      { district: "Сүхбаатар", deal_type: "rent", type: "Орон сууц", price: 999e9, area: 1, created_at: OLD },
      { district: "Сүхбаатар", deal_type: "sale", type: "Хаус", price: 999e9, area: 1, created_at: OLD },
      { district: "Сүхбаатар", deal_type: "sale", type: "Газар", price: 999e9, area: 1, created_at: OLD },
      { district: "Сүхбаатар", deal_type: "sale", type: "Оффис", price: 999e9, area: 1, created_at: OLD },
      { district: "Сүхбаатар", deal_type: "sale", type: "Орон сууц", price: 999e9, area: 0, created_at: OLD },
      { district: "Сүхбаатар", deal_type: "sale", type: "Орон сууц", price: 999e9, area: null, created_at: OLD },
    ];
    const d = computePlatformStats(rows, 0, 0, NOW).districts.find((x) => x.district === "Сүхбаатар")!;
    expect(d.medianPpm).toBe(2_000_000);
    expect(d.aptSaleCount).toBe(5);
    expect(d.count).toBe(11);
  });

  it("9 дүүрэг CITY + OUTER дарааллаар, заргүй нь 0", () => {
    const s = computePlatformStats([apt("Баянзүрх", 1e8, 50)], 0, 0, NOW);
    expect(s.districts.map((d) => d.district)).toEqual([...ALL_DISTRICTS]);
    expect(s.districts.find((d) => d.district === "Налайх")!.count).toBe(0);
    expect(s.districts.find((d) => d.district === "Баянзүрх")!.count).toBe(1);
  });

  it("districtsWithListings нь ≥1 зартай дүүргийг л тоолно", () => {
    const rows = [apt("Хан-Уул", 1e8, 50), apt("Хан-Уул", 1e8, 50), apt("Баянгол", 1e8, 50)];
    rows.push({ district: null, deal_type: "sale", type: "Орон сууц", price: 1, area: 1, created_at: OLD });
    const s = computePlatformStats(rows, 24, 1, NOW);
    expect(s.districtsWithListings).toBe(2);
    expect(s.activeListings).toBe(4);
    expect(s.verifiedAgents).toBe(24);
    expect(s.partnerOffices).toBe(1);
  });

  it("new7d нь дамжуулсан now-ийг ашиглана", () => {
    const rows = [
      apt("Хан-Уул", 1e8, 50, "2026-11-22T00:00:00Z"),
      apt("Хан-Уул", 1e8, 50, "2026-11-17T00:00:00Z"),
      apt("Хан-Уул", 1e8, 50, "2026-11-15T00:00:00Z"),
    ];
    expect(computePlatformStats(rows, 0, 0, NOW).new7d).toBe(2);
    expect(computePlatformStats(rows, 0, 0, Date.parse("2026-11-30T00:00:00Z")).new7d).toBe(0);
  });
});

describe("sortCityTiles", () => {
  it("тоо буурахаар, тэнцвэл CITY дараалал; stats null үед CITY дараалал", () => {
    const rows = [apt("Баянзүрх", 1e8, 50), apt("Баянзүрх", 1e8, 50), apt("Чингэлтэй", 1e8, 50), apt("Хан-Уул", 1e8, 50)];
    const s = computePlatformStats(rows, 0, 0, NOW);
    expect(sortCityTiles(s).map((d) => d.district)).toEqual([
      "Баянзүрх",
      "Хан-Уул",
      "Чингэлтэй",
      "Сүхбаатар",
      "Баянгол",
      "Сонгинохайрхан",
    ]);
    expect(sortCityTiles(null).map((d) => d.district)[0]).toBe("Хан-Уул");
  });
});

describe("нүүрний статистик хэсгүүд (SSR)", () => {
  const rows = [
    ...[1, 2, 3, 4, 5].map((m) => apt("Хан-Уул", m * 46e5 * 50, 50, "2026-11-22T00:00:00Z")),
    apt("Баянзүрх", 1e8, 50),
  ];
  const stats = computePlatformStats(rows, 24, 1, NOW);

  it("ProofStrip: босгоос доош тоо нуугдана, нийт зарын тоо гарахгүй", () => {
    expect(proofItems(stats).map((i) => i.text)).toEqual(["дүүрэгт зар", "баталгаажсан агент"]);
    expect(proofItems({ ...stats, verifiedAgents: 9, new7d: 17 }).map((i) => i.text)).toEqual([
      "дүүрэгт зар",
      "шинэ зар",
    ]);
    expect(renderToStaticMarkup(createElement(ProofStrip, { stats: null }))).toBe("");
    const html = renderToStaticMarkup(createElement(ProofStrip, { stats }));
    expect(html).toContain("font-display");
    expect(html).not.toContain("6 зар");
  });

  it("DistrictTiles: тоо, «Удахгүй», м² медиан, алслагдсан дүүргийн холбоос", () => {
    const html = renderToStaticMarkup(createElement(DistrictTiles, { stats }));
    // Харагдах бичвэр нь accessible name — aria-label медиан/«Удахгүй»-г дарж нуухгүй.
    expect(html).not.toContain("aria-label=");
    expect(html).toContain("5 зар");
    expect(html).toContain("Удахгүй");
    expect(html).toContain("13.8 сая ₮/м²");
    expect(html).toContain("(зарын үнэ)");
    expect(html).toContain(`href="/listings?district=${encodeURIComponent("Багахангай")}"`);
    expect(html.indexOf("Хан-Уул")).toBeLessThan(html.indexOf("Баянзүрх"));
  });

  it("DistrictTiles stats null → тоогүй", () => {
    const html = renderToStaticMarkup(createElement(DistrictTiles, { stats: null }));
    expect(html).not.toContain("зар</span>");
    expect(html).not.toContain("Удахгүй");
  });

  it("SmartTools: медианы жагсаалт эсвэл «Мэдээлэл цуглуулж байна»", () => {
    expect(renderToStaticMarkup(createElement(SmartTools, { stats }))).toContain("Хан-Уул · м² ≈");
    expect(renderToStaticMarkup(createElement(SmartTools, { stats: null }))).toContain("Мэдээлэл цуглуулж байна");
  });
});

describe("aboutStatItems (/about)", () => {
  const base = computePlatformStats([apt("Хан-Уул", 1e8, 50), apt("Баянзүрх", 1e8, 50)], 24, 1, NOW);

  it("бодит тоо, footer/ProofStrip-ийн босго: зар <500, оффис <3 нуугдана", () => {
    expect(aboutStatItems(base)).toEqual([
      { n: 2, label: "Дүүрэгт зар" },
      { n: 24, label: "Баталгаажсан агент" },
    ]);
  });

  it("босго давбал харагдана; null → хоосон (хуурамч тоо байхгүй)", () => {
    const big = { ...base, activeListings: 500, verifiedAgents: 9, partnerOffices: 3 };
    expect(aboutStatItems(big).map((i) => i.label)).toEqual(["Идэвхтэй зар", "Дүүрэгт зар", "Хамтрагч оффис"]);
    expect(aboutStatItems(null)).toEqual([]);
  });
});
