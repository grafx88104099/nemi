import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * "use server" файл зөвхөн async функц экспортлох ёстой. `export type { X }`,
 * `export { x }`, `export const` зэрэг нь tsc/build-ийг давдаг ч Next-ийн server
 * action ачаалагч runtime-д ReferenceError өгч, тухайн хуудасны БҮХ action-ыг
 * унагадаг (жишээ: сэжмийн картын «Бүртгэх» 500 буцаасан).
 */
const ROOT = path.resolve(__dirname, "../..");
const DIRS = ["lib", "app", "components"];

function walk(dir: string, out: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "__tests__") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
}

function serverFiles(): string[] {
  const all: string[] = [];
  DIRS.forEach((d) => walk(path.join(ROOT, d), all));
  // Файлын түвшний директив: эхний утгатай мөр нь "use server".
  return all.filter((f) => {
    const first = fs
      .readFileSync(f, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("//") && !l.startsWith("/*") && !l.startsWith("*"));
    return first === '"use server";' || first === "'use server';" || first === '"use server"';
  });
}

describe('"use server" файлын экспорт', () => {
  const files = serverFiles();

  it("server action файлууд олдоно", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("зөвхөн async функц (ба erasable `export type X =`/interface) экспортлоно", () => {
    const bad: string[] = [];
    for (const f of files) {
      const lines = fs.readFileSync(f, "utf8").split("\n");
      lines.forEach((l, i) => {
        if (
          /^export\s+(type\s+)?\{/.test(l) ||
          /^export\s+\*\s+from/.test(l) ||
          /^export\s+(const|let|var|class|enum)\s/.test(l) ||
          /^export\s+function\s/.test(l) ||
          /^export\s+default\s+(?!async)/.test(l)
        ) {
          bad.push(`${path.relative(ROOT, f)}:${i + 1}: ${l.trim()}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });
});
