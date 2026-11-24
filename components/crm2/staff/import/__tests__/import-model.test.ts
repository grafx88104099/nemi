import { describe, expect, it } from "vitest";

import {
  MAX_IMPORT_BATCH,
  parseImportParam,
  progressText,
  pruneSelection,
  resultLine,
  summarizeImport,
  toggleSelection,
  type ImportRunResult,
} from "../import-model";

type Outcome = Extract<ImportRunResult, { ok: true }>["outcome"];

const ok = (o: Partial<Outcome> = {}): ImportRunResult => ({
  listingId: "l1",
  title: "Зар",
  ok: true,
  outcome: { propertyId: "p1", code: "P010", existing: false, readOnly: false, photosCopied: 0, photosFailed: 0, duplicates: [], ...o },
});

describe("toggleSelection", () => {
  it("утсанд нэг л зар (дахин дарвал болино)", () => {
    expect(toggleSelection([], "a", false)).toEqual(["a"]);
    expect(toggleSelection(["a"], "b", false)).toEqual(["b"]);
    expect(toggleSelection(["b"], "b", false)).toEqual([]);
  });
  it("ширээнд олон, дээд хязгаартай", () => {
    expect(toggleSelection(["a"], "b", true)).toEqual(["a", "b"]);
    const full = Array.from({ length: MAX_IMPORT_BATCH }, (_, i) => `x${i}`);
    expect(toggleSelection(full, "new", true)).toEqual(full);
  });
  it("жагсаалтаас гарсан сонголтыг хасна", () => {
    expect(pruneSelection(["a", "b"], [{ id: "b" }])).toEqual(["b"]);
  });
});

describe("progress, result", () => {
  it("явцын бичвэр", () => {
    expect(progressText(0, 3)).toBe("Хуулж байна 1/3…");
    expect(progressText(3, 3)).toBe("Дууслаа: 3/3");
    expect(progressText(0, 0)).toBe("");
  });
  it("үр дүнгийн мөр", () => {
    expect(resultLine(ok({ photosCopied: 5 }))).toBe("Ноорог үүслээ: P010 · 5 зураг");
    expect(resultLine(ok({ photosCopied: 3, photosFailed: 2 }))).toBe("Ноорог үүслээ: P010 · 3 зураг, 2 хуулагдсангүй");
    expect(resultLine(ok())).toBe("Ноорог үүслээ: P010 · зураггүй");
    expect(resultLine(ok({ existing: true, readOnly: true }))).toBe("P010 аль хэдийн бүртгэлтэй");
    expect(resultLine(ok({ existing: true, propertyId: null, code: null }))).toMatch(/харах эрхгүй/);
    expect(resultLine({ listingId: "x", title: "t", ok: false, error: "Алдаа" })).toBe("Алдаа");
  });
  it("нэгтгэл", () => {
    const s = summarizeImport([
      ok({ duplicates: [{}], photosFailed: 1 }),
      ok({ existing: true }),
      { listingId: "x", title: "t", ok: false, error: "e" },
    ]);
    expect(s).toEqual({ created: 1, existing: 1, failed: 1, withDuplicates: 1, photosFailed: 1 });
  });
});

describe("parseImportParam", () => {
  it("?import=1 нээнэ, uuid бол урьдчилан сонгоно", () => {
    expect(parseImportParam(undefined)).toEqual({ open: false, listingId: null });
    expect(parseImportParam("1")).toEqual({ open: true, listingId: null });
    expect(parseImportParam("0F9B2C3E-1111-4222-8333-444455556666")).toEqual({
      open: true,
      listingId: "0f9b2c3e-1111-4222-8333-444455556666",
    });
    expect(parseImportParam(["abc"])).toEqual({ open: true, listingId: null });
  });
});
