import { describe, it, expect } from "vitest";

import { daysSince, isFresh, relativeDate, fmtDate, fmtDateTime } from "@/lib/format";

const NOW = new Date("2026-06-06T12:00:00Z");
const ago = (days: number, hours = 0) =>
  new Date(NOW.getTime() - days * 86_400_000 - hours * 3_600_000).toISOString();

describe("daysSince", () => {
  it("өнөөдрийн зар = 0 хоног", () => {
    expect(daysSince(ago(0), NOW)).toBe(0);
  });
  it("бүхэл хоногоор тоолно", () => {
    expect(daysSince(ago(5), NOW)).toBe(5);
    expect(daysSince(ago(1, 12), NOW)).toBe(1); // 1.5 хоног → 1
  });
});

describe("isFresh", () => {
  it("7 хоног дотор шинэ", () => {
    expect(isFresh(ago(0), 7, NOW)).toBe(true);
    expect(isFresh(ago(6), 7, NOW)).toBe(true);
  });
  it("7 хоног ба түүнээс хойш шинэ биш", () => {
    expect(isFresh(ago(7), 7, NOW)).toBe(false);
    expect(isFresh(ago(30), 7, NOW)).toBe(false);
  });
  it("босгыг тохируулж болно", () => {
    expect(isFresh(ago(10), 3, NOW)).toBe(false);
    expect(isFresh(ago(2), 3, NOW)).toBe(true);
  });
});

describe("relativeDate", () => {
  it("ойрын огноо", () => {
    expect(relativeDate(ago(0), NOW)).toBe("Өнөөдөр");
    expect(relativeDate(ago(1), NOW)).toBe("Өчигдөр");
    expect(relativeDate(ago(3), NOW)).toBe("3 хоногийн өмнө");
  });
  it("долоо хоног / сар / жил", () => {
    expect(relativeDate(ago(10), NOW)).toBe("1 долоо хоногийн өмнө");
    expect(relativeDate(ago(60), NOW)).toBe("2 сарын өмнө");
    expect(relativeDate(ago(400), NOW)).toBe("1 жилийн өмнө");
  });
});

describe("fmtDate", () => {
  it("монгол бүтэн огноо", () => {
    expect(fmtDate("2026-06-06T00:00:00")).toBe("2026 оны 6-р сарын 6");
  });
});

describe("fmtDateTime", () => {
  it("огноо + цаг (орон нутгийн), тэглэлттэй", () => {
    expect(fmtDateTime("2026-06-08T14:30:00")).toBe("2026.06.08 14:30");
    expect(fmtDateTime("2026-01-05T09:05:00")).toBe("2026.01.05 09:05");
  });
});
