import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * iOS Safari 16px-ээс жижиг талбарт фокуслахад хуудсыг томруулдаг. Талбар бүр утсанд 16px
 * (`text-base sm:text-sm`) байх ёстой: primitive-ууд өөрсдөө, цонх/drawer/sheet доторх гар хийцийн
 * талбарыг тэдгээрийн биеийн `max-sm:[&_input]:text-base …` хамгаална.
 */

const ROOT = process.cwd();
const GUARD = ["max-sm:[&_input]:text-base", "max-sm:[&_select]:text-base", "max-sm:[&_textarea]:text-base"];

/** Өөр баг засварлаж буй хэсэг (гэрээ, батлалт) — энэ тестийн хамрах хүрээнээс гадуур. */
const FOREIGN = [
  ["components", "crm2", "staff", "card", "contract"].join(sep),
  ["components", "crm2", "approvals"].join(sep),
];

/** Утсанд харагддаггүй (зөвхөн ≥1024px) хүснэгт — зөвхөн ширээний компьютерт. */
const DESKTOP_ONLY = new Set([["components", "crm2", "staff", "incomplete", "CompletionTable.tsx"].join(sep)]);

/** Хамгаалалттай бүрхүүл (цонх, drawer, sheet) зурдаг файл. */
const CONTAINER_RE = /<(Modal|Drawer|BottomSheet|SheetShell|ReasonDialog|ConfirmDialog)\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "__tests__" && e.name !== "node_modules") walk(p, out);
    } else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** JSX нээх тагийн төгсгөл (`{…}` доторх `>`-ийг алгасна). */
function tagEnd(src: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let j = from; j < src.length; j++) {
    const c = src[j];
    if (quote) {
      if (c === quote && src[j - 1] !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return j;
  }
  return src.length - 1;
}

const FIELD_RE = /<(input|textarea|select|Input|Select|NumberInput)\b/g;
const NON_TEXT_TYPE = /type=["'](checkbox|radio|file|hidden|range|color)["']/;
/** Угтваргүй text-xs/text-sm (sm:text-sm биш). */
const SMALL = /(^|[^:\w-])text-(xs|sm)(?![\w-])/;
const BASE = /(^|[^:\w-])text-base(?![\w-])/;

type Hit = { file: string; line: number; tag: string };

/** 16px-гүй (утсанд 14px) текст талбарууд. */
function smallFields(src: string, file: string): Hit[] {
  const hits: Hit[] = [];
  for (const m of src.matchAll(FIELD_RE)) {
    const tag = src.slice(m.index, tagEnd(src, m.index + 1) + 1);
    if (NON_TEXT_TYPE.test(tag)) continue;
    if (SMALL.test(tag) && !BASE.test(tag)) {
      hits.push({ file, line: src.slice(0, m.index).split("\n").length, tag: m[1] });
    }
  }
  return hits;
}

function scan(dirs: string[]): { file: string; src: string }[] {
  return dirs.flatMap((d) => walk(join(ROOT, d))).map((f) => ({ file: relative(ROOT, f), src: readFileSync(f, "utf8") }));
}

describe("smallFields (тестийн туслах)", () => {
  it("14px талбарыг илрүүлж, утсанд 16px-тэйг алгасна", () => {
    expect(smallFields('<input className="h-11 text-sm" />', "x")).toHaveLength(1);
    expect(smallFields('<textarea\n  onChange={(e) => set(e.target.value)}\n  className="text-sm"\n/>', "x")).toHaveLength(1);
    expect(smallFields('<input className="text-base sm:text-sm" />', "x")).toHaveLength(0);
    expect(smallFields('<input type="checkbox" className="text-sm" />', "x")).toHaveLength(0);
    expect(smallFields('<Input className={cn("h-9", "sm:text-sm")} />', "x")).toHaveLength(0);
  });
});

describe("iOS: талбар утсанд 16px", () => {
  it("UI primitive-ууд (Input, Select, SuggestInput, FilterSearch, ReasonDialog, харилцагчийн Textarea)", () => {
    const files = [
      ...scan(["components/ui", "components/crm2/ui"]),
      ...scan(["components/crm2/contacts"]).filter((f) => f.file.endsWith("form-bits.tsx")),
    ];
    const hits = files.flatMap((f) => smallFields(f.src, f.file));
    expect(hits).toEqual([]);
  });

  it("iOS хэвтээ/iPad (≥640px, sm:text-sm 14px): globals.css мэдрэгчтэй iOS-д талбарыг 16px болгоно", () => {
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
    const at = css.indexOf("@supports (-webkit-touch-callout: none)");
    expect(at).toBeGreaterThan(-1);
    // @layer дотор биш (utility-г дарах ёстой) — өмнөх бүх @layer блок хаагдсан байх.
    const before = css.slice(0, at);
    expect((before.match(/{/g) ?? []).length).toBe((before.match(/}/g) ?? []).length);
    const rule = css.slice(at, css.indexOf("@media (forced-colors", at));
    expect(rule).toContain("@media (pointer: coarse)");
    expect(rule).toMatch(/select,\s+textarea/);
    expect(rule).toContain("font-size: 16px");
  });

  it("Modal, Drawer, BottomSheet-ийн бие доторх гар хийцийн талбарыг 16px болгоно", () => {
    for (const f of ["components/ui/modal.tsx", "components/ui/drawer.tsx", "components/crm2/ui/bottom-sheet.tsx"]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      for (const g of GUARD) expect(src, `${f}: ${g}`).toContain(g);
    }
  });

  it("Оффис, агентын самбар, ажлын жагсаалтын талбар: 16px, эсвэл хамгаалалттай цонх доторх", () => {
    const files = scan(["components/tasks", "components/office", "components/dashboard"]).filter((f) => !CONTAINER_RE.test(f.src));
    expect(files.flatMap((f) => smallFields(f.src, f.file))).toEqual([]);
    // `const sel = "… text-sm focus:border-…"` хэлбэрийн талбарын классыг хувьсагчаар дамжуулдаг.
    const consts = files.flatMap((f) =>
      [...f.src.matchAll(/const\s+\w+\s*=\s*"([^"]*focus:border[^"]*)"/g)]
        .filter((m) => SMALL.test(m[1]) && !BASE.test(m[1]))
        .map((m) => ({ file: f.file, line: f.src.slice(0, m.index).split("\n").length }))
    );
    expect(consts).toEqual([]);
  });

  it("CRM-ийн бусад талбар: 16px, эсвэл хамгаалалттай цонх доторх", () => {
    const hits = scan(["components/crm2"])
      .filter((f) => !FOREIGN.some((p) => f.file.startsWith(p)))
      .filter((f) => !DESKTOP_ONLY.has(f.file))
      .filter((f) => !CONTAINER_RE.test(f.src))
      .flatMap((f) => smallFields(f.src, f.file));
    expect(hits).toEqual([]);
  });
});
