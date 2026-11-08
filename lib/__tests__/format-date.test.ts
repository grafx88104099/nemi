import { describe, it, expect } from "vitest";

import {
  daysSince,
  isFresh,
  relativeDate,
  fmtDate,
  fmtDateTime,
  fmtDateNum,
  fmtTime,
  fmtDayMonth,
  fmtShortDateTime,
  fmtDayWithWeekday,
} from "@/lib/format";

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
  it("монгол бүтэн огноо (УБ цагаар)", () => {
    expect(fmtDate("2026-06-05T16:00:00Z")).toBe("2026 оны 6-р сарын 6"); // УБ 00:00
    expect(fmtDate("2026-06-06")).toBe("2026 оны 6-р сарын 6"); // зөвхөн огноо
  });
});

describe("fmtDateTime", () => {
  it("огноо + цаг УБ-аар, тэглэлттэй — server-ийн цагийн бүсээс үл хамаарна", () => {
    expect(fmtDateTime("2026-06-08T06:30:00Z")).toBe("2026.06.08 14:30");
    expect(fmtDateTime("2026-01-05T01:05:00Z")).toBe("2026.01.05 09:05");
    expect(fmtDateTime(new Date("2026-01-05T01:05:00Z"))).toBe("2026.01.05 09:05");
  });
  it("UTC шөнө дунд УБ-д дараагийн өдөр болно", () => {
    expect(fmtDateTime("2026-03-31T20:15:00Z")).toBe("2026.04.01 04:15");
  });
});

describe("УБ-ын богино форматууд", () => {
  const iso = "2026-09-24T07:06:00Z"; // УБ 15:06, пүрэв
  it("тоон огноо, цаг, сар.өдөр", () => {
    expect(fmtDateNum(iso)).toBe("2026.09.24");
    expect(fmtTime(iso)).toBe("15:06");
    expect(fmtDayMonth(iso)).toBe("09.24");
    expect(fmtShortDateTime(iso)).toBe("09.24 15:06");
  });
  it("гарагтай огноо", () => {
    expect(fmtDayWithWeekday(iso)).toBe("9-р сарын 24, пүрэв");
    expect(fmtDayWithWeekday("2026-11-07T17:00:00Z")).toBe("11-р сарын 8, ням");
  });
});
