import { describe, expect, it } from "vitest";

import {
  averagePercent,
  clampPercent,
  dragHasFiles,
  dupReasonsText,
  formatDuration,
  parseAreaCell,
  parsePriceCell,
  parseRoomsCell,
  parseScope,
  percentTone,
  priceCellText,
  scopeOptions,
  splitDroppedFiles,
} from "../incomplete-model";

const agent = { isTeamLead: false, isManager: false };
const lead = { isTeamLead: true, isManager: false };
const manager = { isTeamLead: false, isManager: true };

describe("scope", () => {
  it("Би / Баг / Оффис — эрхээр", () => {
    expect(scopeOptions(agent)).toEqual(["me"]);
    expect(scopeOptions(lead)).toEqual(["me", "team"]);
    expect(scopeOptions(manager)).toEqual(["me", "team", "office"]);
  });
  it("эрхгүй харагдац «Би» болно", () => {
    expect(parseScope("office", agent)).toBe("me");
    expect(parseScope("office", lead)).toBe("me");
    expect(parseScope("team", lead)).toBe("team");
    expect(parseScope(["office"], manager)).toBe("office");
    expect(parseScope("junk", manager)).toBe("me");
  });
});

describe("percent", () => {
  it("өнгө, хязгаар", () => {
    expect(percentTone(10)).toBe("low");
    expect(percentTone(40)).toBe("mid");
    expect(percentTone(80)).toBe("high");
    expect(clampPercent(120)).toBe(100);
    expect(clampPercent(-3)).toBe(0);
    expect(clampPercent(Number.NaN)).toBe(0);
  });
  it("дундаж", () => {
    expect(averagePercent([])).toBeNull();
    expect(averagePercent([{ percent: 50 }, { percent: 101 }])).toBe(75);
  });
});

describe("мөр доторх засвар", () => {
  it("талбай: '81,47' → 81.47, хоосон → null, сөрөг → алдаа", () => {
    expect(parseAreaCell("81,47")).toEqual({ ok: true, value: 81.47 });
    expect(parseAreaCell(" ")).toEqual({ ok: true, value: null });
    expect(parseAreaCell("-5").ok).toBe(false);
    expect(parseAreaCell("abc").ok).toBe(false);
  });
  it("өрөө: бүхэл 0–100", () => {
    expect(parseRoomsCell("3")).toEqual({ ok: true, value: 3 });
    expect(parseRoomsCell("2.5").ok).toBe(false);
    expect(parseRoomsCell("101").ok).toBe(false);
  });
  it("үнэ: сая-аар, том тоо бол бүтэн дүн", () => {
    expect(parsePriceCell("350")).toEqual({ ok: true, value: 350_000_000 });
    expect(parsePriceCell("2,5")).toEqual({ ok: true, value: 2_500_000 });
    expect(parsePriceCell("350000000")).toEqual({ ok: true, value: 350_000_000 });
    expect(parsePriceCell("")).toEqual({ ok: true, value: null });
    expect(parsePriceCell("үнэ").ok).toBe(false);
  });
  it("үнийн оролтын харагдац (сая)", () => {
    expect(priceCellText(350_000_000)).toBe("350");
    expect(priceCellText(2_500_000)).toBe("2.5");
    expect(priceCellText(null)).toBe("");
  });
});

describe("чирж оруулах", () => {
  it("зураг (HEIC оролцуулан) ба бусад", () => {
    const files = [
      { name: "a.jpg", type: "image/jpeg" },
      { name: "IMG_1.HEIC", type: "" },
      { name: "doc.pdf", type: "application/pdf" },
    ];
    const r = splitDroppedFiles(files);
    expect(r.images.map((f) => f.name)).toEqual(["a.jpg", "IMG_1.HEIC"]);
    expect(r.rejected).toBe(1);
  });
  it("файлтай чирэлт", () => {
    expect(dragHasFiles(["text/plain", "Files"])).toBe(true);
    expect(dragHasFiles(["text/plain"])).toBe(false);
    expect(dragHasFiles(null)).toBe(false);
  });
});

describe("бусад", () => {
  it("хугацаа", () => {
    expect(formatDuration(45_000)).toBe("45 с");
    expect(formatDuration(95_000)).toBe("1 мин 35 с");
    expect(formatDuration(120_000)).toBe("2 мин");
    expect(formatDuration(null)).toBe("—");
  });
  it("давхардлын шалтгаан", () => {
    expect(dupReasonsText(["owner_phone", "zzz"])).toBe("Эзний утас ижил, Ижил төстэй");
    expect(dupReasonsText([])).toBe("Ижил төстэй");
  });
});
