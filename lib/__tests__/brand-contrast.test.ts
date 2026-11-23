import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const CSS = read("app/globals.css");

// ── WCAG 2.x харьцаа ────────────────────────────────────────────────────
type RGB = [number, number, number];
function hex(h: string): RGB {
  const m = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16)) as RGB;
}
function lum([r, g, b]: RGB): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
/** fg (alpha-тай) бол bg дээр нийлүүлнэ. */
function over(fg: RGB, a: number, bg: RGB): RGB {
  return fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a))) as RGB;
}
function ratio(a: RGB, b: RGB): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ── globals.css-ээс токен унших ─────────────────────────────────────────
function block(re: RegExp): string {
  const m = CSS.match(re);
  if (!m || m.index == null) throw new Error(`block not found: ${re}`);
  const start = CSS.indexOf("{", m.index) + 1;
  let depth = 1;
  let i = start;
  for (; i < CSS.length && depth > 0; i++) {
    if (CSS[i] === "{") depth++;
    else if (CSS[i] === "}") depth--;
  }
  return CSS.slice(start, i - 1);
}
function vars(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const THEME = vars(block(/@theme\s*\{/));
const THEME_INLINE_SRC = block(/@theme\s+inline\s*\{/);
const SITE = vars(block(/\[data-surface="site"\],\s*body:has\(\[data-surface="site"\]\)\s*\{/));
const site = (k: string) => hex(SITE[`--color-${k}`] ?? THEME[`--color-${k}`]);
const WHITE: RGB = [255, 255, 255];

describe("site-scope WCAG харьцаа", () => {
  const bg = site("bg");
  const surface = site("surface");
  const surface2 = site("surface-2");
  const ink = site("ink");

  it("≥ 7: ink / bg", () => {
    expect(ratio(ink, bg)).toBeGreaterThanOrEqual(7);
  });

  it.each([
    ["muted/bg", "muted", "bg"],
    ["muted/surface", "muted", "surface"],
    ["muted/surface-2", "muted", "surface-2"],
    ["subtle/bg", "subtle", "bg"],
    ["subtle/surface-2", "subtle", "surface-2"],
    ["brand-600/bg", "brand-600", "bg"],
    ["brand-600/surface", "brand-600", "surface"],
    ["brand-ink/bg", "brand-ink", "bg"],
    ["verified/bg", "verified", "bg"],
    ["verified/surface", "verified", "surface"],
    ["on-primary/brand-500", "on-primary", "brand-500"],
    ["on-primary/brand-hover", "on-primary", "brand-hover"],
    ["brand-logo/ink", "brand-logo", "ink"],
  ])("≥ 4.5: %s", (_n, fg, bgk) => {
    expect(ratio(site(fg), site(bgk))).toBeGreaterThanOrEqual(4.5);
  });

  it("≥ 4.5: white@70% ink дээр (tab bar, footer)", () => {
    expect(ratio(over(WHITE, 0.7, ink), ink)).toBeGreaterThanOrEqual(4.5);
  });

  it("≥ 3: фокус bg/surface дээр, табын ink тэмдэг surface дээр, tab-bar зураас, нуруу dawn дээр", () => {
    expect(ratio(site("focus"), bg)).toBeGreaterThanOrEqual(3);
    expect(ratio(site("focus"), surface)).toBeGreaterThanOrEqual(3);
    expect(ratio(ink, surface)).toBeGreaterThanOrEqual(3);
    expect(ratio(site("brand-500"), ink)).toBeGreaterThanOrEqual(3);
    expect(ratio(site("ridge"), site("dawn"))).toBeGreaterThanOrEqual(3);
    expect(ratio(site("focus"), surface2)).toBeGreaterThanOrEqual(3);
  });

  it("site primary hover нь brand-600 (#c2410c) БИШ — ink түүн дээр AA биш", () => {
    expect(SITE["--color-brand-hover"]).not.toBe(SITE["--color-brand-600"]);
    expect(ratio(ink, hex("#c2410c"))).toBeLessThan(4.5);
  });
});

describe("CRM өгөгдмөл хэвээр (@theme)", () => {
  it("өмнөх утгууд өөрчлөгдөөгүй", () => {
    expect(THEME["--color-bg"]).toBe("#f6f8fa");
    expect(THEME["--color-ink"]).toBe("#0f172a");
    expect(THEME["--color-muted"]).toBe("#64748b");
    expect(THEME["--color-brand-600"]).toBe("#ea580c");
    expect(THEME["--color-brand-500"]).toBe("#f97316");
    expect(THEME["--color-surface"]).toBe("#ffffff");
  });

  it("шинэ токены өгөгдмөл = өнөөдрийн CRM утга", () => {
    expect(THEME["--color-on-primary"]).toBe("#ffffff");
    expect(THEME["--color-brand-hover"]).toBe("#ea580c");
    expect(THEME["--color-focus"]).toBe("#f97316");
    expect(THEME["--color-focus-soft"]).toBe("color-mix(in oklab, var(--color-brand-500) 40%, transparent)");
    expect(THEME["--color-verified"]).toBe("var(--color-emerald-600)");
    expect(THEME["--color-brand-ink"]).toBe("#c2410c");
    expect(THEME["--radius-card"]).toBe("1rem");
    expect(THEME["--radius-sheet"]).toBe("1.5rem");
  });
});

describe("фонт токен, хамгаалалтын дүрмүүд", () => {
  it("--font-display нь @theme inline дотор (энгийн @theme-д биш)", () => {
    expect(THEME_INLINE_SRC).toContain("--font-display");
    expect(THEME_INLINE_SRC).toContain("var(--font-manrope");
    expect(THEME["--font-display"]).toBeUndefined();
    expect(THEME["--font-sans"]).toContain("var(--font-inter)");
  });

  it("reduced-motion ба AA safety net нь body:has(...) хамарна", () => {
    const rm = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(rm.slice(0, 300)).toContain('body:has([data-surface="site"])');
    expect(CSS).toMatch(/body:has\(\[data-surface="site"\]\)\)\s*\.bg-brand-500\.text-white\s*\{/);
    expect(CSS).toMatch(/body:has\(\[data-surface="site"\]\)\)\s*\.bg-brand-500\.text-white:hover\s*\{/);
  });

  it("safety net нь @layer-ээс ГАДНА (utilities-ийг дарах ёстой)", () => {
    const i = CSS.indexOf(".bg-brand-500.text-white {");
    const before = CSS.slice(0, i);
    // Нээгдсэн бүх хаалт хаагдсан → давхаргагүй түвшин.
    expect((before.match(/\{/g) ?? []).length).toBe((before.match(/\}/g) ?? []).length);
  });

  it("button: primary text-on-primary + hover:bg-brand-hover, base ring-focus-soft, cta variant", () => {
    const src = read("components/ui/button.tsx");
    const primary = src.match(/primary:\s*"([^"]+)"/)?.[1] ?? "";
    expect(primary).toContain("text-on-primary");
    expect(primary).toContain("hover:bg-brand-hover");
    expect(primary).not.toContain("text-white");
    const base = src.match(/const base =\s*"([^"]+)"/)?.[1] ?? "";
    expect(base).toContain("ring-focus-soft");
    expect(src).toMatch(/cta:\s*"[^"]*text-on-primary[^"]*ring-offset-2/);
  });
});

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((f) => {
    const p = `${dir}/${f}`;
    return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
  });
}

describe("эх кодын lint (брэнд)", () => {
  const files = [...walk("components/home"), ...walk("components/brand")];

  it.each(files)("%s: цайвар фон дээр улбар шар текст, цагаан-улбар шар байхгүй", (f) => {
    const src = read(f);
    expect(src).not.toMatch(/\btext-brand-(400|500)\b/);
    for (const m of src.matchAll(/"([^"]*)"/g)) {
      const cls = m[1].split(/\s+/);
      expect(cls.includes("bg-brand-500") && cls.includes("text-white"), `${f}: ${m[1]}`).toBe(false);
    }
  });

  it("app/(site)/layout.tsx нь data-surface=\"site\" wrapper-тэй", () => {
    expect(read("app/(site)/layout.tsx")).toContain('data-surface="site"');
  });

  it("Topbar-ын site салбарт backdrop-blur байхгүй", () => {
    const src = read("components/layout/Topbar.tsx");
    const siteBranches = [...src.matchAll(/site\s*\?\s*"([^"]*)"/g)].map((m) => m[1]);
    expect(siteBranches.length).toBeGreaterThan(0);
    for (const c of siteBranches) expect(c).not.toContain("backdrop-blur");
  });

  it("MobileTabBar ink дээр, blur-гүй", () => {
    const src = read("components/layout/MobileTabBar.tsx");
    expect(src).toContain("bg-ink");
    expect(src).not.toContain("backdrop-blur");
  });
});
