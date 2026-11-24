import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HeroSearch, HERO_EXAMPLES } from "@/components/home/HeroSearch";

const html = renderToString(createElement(HeroSearch));

describe("HeroSearch (SSR, JS-гүй)", () => {
  it("GET /listings маягт, role=search", () => {
    expect(html).toMatch(/<form[^>]*action="\/listings"[^>]*method="get"/);
    expect(html).toMatch(/<form[^>]*role="search"/);
  });

  it("q нь combobox, aria-label «Хайх», тусдаа <label> байхгүй", () => {
    const input = html.match(/<input[^>]*name="q"[^>]*>/)?.[0] ?? "";
    expect(input).toContain('role="combobox"');
    expect(input).toContain('aria-label="Хайх"');
    expect(html).not.toContain("<label");
  });

  it("өгөгдмөл таб «Зарах» → hidden deal=sale", () => {
    expect(html).toMatch(/<input type="hidden" name="deal" value="sale"\/?>/);
  });

  it("гурван tab, яг нэг нь aria-selected=true, roving tabindex", () => {
    const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>([\s\S]*?)<\/button>/g)];
    expect(tabs.map((t) => t[1].replace(/<[^>]+>/g, "").trim())).toEqual(["Зарах", "Түрээслэх", "Зар өгөх"]);
    const opens = tabs.map((t) => t[0].match(/^<button[^>]*>/)?.[0] ?? "");
    expect(opens.filter((o) => o.includes('aria-selected="true"'))).toHaveLength(1);
    expect(opens[0]).toContain('aria-selected="true"');
    expect(opens.filter((o) => o.includes('tabindex="0"'))).toHaveLength(1);
    for (const o of opens) expect(o).toMatch(/aria-controls="hero-panel-/);
    expect(html).toContain('id="hero-panel-search"');
  });

  it("SSR placeholder = эхний жишээ", () => {
    expect(HERO_EXAMPLES[0]).toBe("Хан-Уул, 2 өрөө, 250 сая хүртэл");
    const input = html.match(/<input[^>]*name="q"[^>]*>/)?.[0] ?? "";
    expect(input).toContain(`placeholder="${HERO_EXAMPLES[0]}"`);
  });

  it("идэвхтэй табын тэмдэг ink — улбар шар биш", () => {
    const indicator = html.match(/<span[^>]*data-tab-indicator[^>]*>/)?.[0] ?? "";
    expect(indicator).toContain("bg-ink");
    expect(indicator).not.toContain("bg-brand-500");
  });
});
