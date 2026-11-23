import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UBSkyline } from "@/components/brand/UBSkyline";

const STATIC = fileURLToPath(new URL("../../public/brand/skyline-dawn.svg", import.meta.url));
const BUDGET = 8192;

const vars = renderToStaticMarkup(createElement(UBSkyline));
const hex = renderToStaticMarkup(createElement(UBSkyline, { colors: "hex" }));
const strip = renderToStaticMarkup(createElement(UBSkyline, { variant: "strip" }));
const stripHex = renderToStaticMarkup(createElement(UBSkyline, { variant: "strip", colors: "hex" }));

const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

function checkBudget(svg: string) {
  expect(gzipSync(svg).length).toBeLessThanOrEqual(BUDGET);
  expect((svg.match(/<[a-zA-Z]/g) ?? []).length).toBeLessThanOrEqual(300);
  for (const banned of ["filter", "<image", "<foreignObject", "<script", "blur", "drop-shadow"]) {
    expect(svg).not.toContain(banned);
  }
}

describe("UBSkyline", () => {
  it("төсөв: gzip ≤ 8 KB, ≤ 300 элемент, filter/blur/image/script байхгүй", () => {
    checkBudget(vars);
    checkBudget(hex);
    checkBudget(strip);
    checkBudget(stripHex);
  });

  it("root нь чимэглэл: aria-hidden, focusable=false, ub-skyline класс, viewBox", () => {
    const root = vars.match(/^<svg[^>]*>/)?.[0] ?? "";
    expect(root).toContain('aria-hidden="true"');
    expect(root).toContain('focusable="false"');
    expect(root).toContain('class="ub-skyline"');
    expect(root).toContain('viewBox="0 0 1440 240"');
    expect(root).toContain('preserveAspectRatio="xMidYMax slice"');
    expect(root).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("6–10 асаалттай цонх (ub-lit)", () => {
    const n = (vars.match(/class="ub-lit"/g) ?? []).length;
    expect(n).toBeGreaterThanOrEqual(6);
    expect(n).toBeLessThanOrEqual(10);
  });

  it("цонхны мөр = давхар: урд эгнээ 5/9/12 давхар (pattern 10 нэгж)", () => {
    const pat = attrs(vars.match(/<pattern id="ubw"[^>]*>/)?.[0] ?? "");
    const cell = Number(pat.height);
    expect(cell).toBe(10);
    // Урд эгнээний pattern overlay: y = 246 - h, өндөр h - 6; цонх y = 10m + 3 (4 өндөр).
    const overlays = [...vars.matchAll(/<rect[^>]*fill="url\(#ubw\)"[^>]*>/g)].map((m) => attrs(m[0]));
    const floors = overlays.map((o) => {
      const top = Number(o.y);
      const bottom = top + Number(o.height);
      let n = 0;
      for (let y = 3; y + 4 <= bottom; y += cell) if (y >= top) n++;
      return n;
    });
    expect(new Set(floors)).toEqual(new Set([5, 9, 12]));
  });

  it("strip: 360×56 viewBox, 3–4 асаалттай цонх ≥3×3, байшин/нар/голгүй, өөр id", () => {
    const root = strip.match(/^<svg[^>]*>/)?.[0] ?? "";
    expect(root).toContain('viewBox="0 0 360 56"');
    expect(root).toContain('aria-hidden="true"');
    const lit = [...strip.matchAll(/<rect[^>]*class="ub-lit"[^>]*>/g)].map((m) => attrs(m[0]));
    expect(lit.length).toBeGreaterThanOrEqual(3);
    expect(lit.length).toBeLessThanOrEqual(4);
    for (const l of lit) {
      expect(Number(l.width)).toBeGreaterThanOrEqual(3);
      expect(Number(l.height)).toBeGreaterThanOrEqual(3);
    }
    expect(strip).not.toContain("<circle");
    // Бүтэн хувилбартай нэг хуудсанд зэрэг inline байх тул id давхцахгүй.
    const ids = (svg: string) => [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids(strip)) expect(ids(vars)).not.toContain(id);
  });

  it("colors=vars нь CSS хувьсагч, hex нь var()-гүй", () => {
    expect(vars).toContain("var(--ub-ridge)");
    expect(hex).not.toContain("var(");
  });

  it("className залгагдана", () => {
    const html = renderToStaticMarkup(createElement(UBSkyline, { className: "h-14 w-full" }));
    expect(html).toMatch(/^<svg[^>]*class="ub-skyline h-14 w-full"/);
  });

  it("public/brand/skyline-dawn.svg = colors='hex' render (UPDATE_SKYLINE=1 дахин бичнэ)", () => {
    if (process.env.UPDATE_SKYLINE === "1") writeFileSync(STATIC, hex);
    const file = readFileSync(STATIC, "utf8");
    expect(file).toBe(hex);
    expect(gzipSync(file).length).toBeLessThanOrEqual(BUDGET);
    expect(file).not.toContain("var(");
  });
});
