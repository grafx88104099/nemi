import { describe, expect, it } from "vitest";

import {
  addWeeks,
  currentWeekStart,
  isIsoDate,
  normalizeWeekParam,
  parseHmMinutes,
  ubDateIso,
  ubDateTime,
  weekDays,
  weekEnd,
  weekLabel,
  weekShortLabel,
  weekStartOf,
} from "@/lib/crm/week";

describe("долоо хоногийн цонх (Даваа–Ням, УБ)", () => {
  it("УБ-ын огноо: UTC 16:30 = маргааш 00:30 УБ", () => {
    expect(ubDateIso(new Date("2026-11-08T16:30:00Z"))).toBe("2026-11-09");
    expect(ubDateIso(new Date("2026-11-08T15:59:00Z"))).toBe("2026-11-08");
  });

  it("Ням 23:30 УБ нь тухайн долоо хоногт, Даваа 00:10 УБ дараагийн долоо хоногт", () => {
    // 2026-11-08 Ням 23:30 УБ = 15:30 UTC
    expect(currentWeekStart(new Date("2026-11-08T15:30:00Z"))).toBe("2026-11-02");
    // 2026-11-09 Даваа 00:10 УБ = 2026-11-08 16:10 UTC (UTC-ээр Ням хэвээр)
    expect(currentWeekStart(new Date("2026-11-08T16:10:00Z"))).toBe("2026-11-09");
  });

  it("weekStartOf ба Даваа биш параметрийг хэвийн болгоно", () => {
    expect(weekStartOf("2026-11-12")).toBe("2026-11-09");
    expect(weekStartOf("2026-11-15")).toBe("2026-11-09");
    expect(weekStartOf("2026-11-09")).toBe("2026-11-09");
    expect(normalizeWeekParam("2026-11-13")).toBe("2026-11-09");
    const now = new Date("2026-11-10T02:00:00Z");
    expect(normalizeWeekParam("abc", now)).toBe("2026-11-09");
    expect(normalizeWeekParam("2026-02-30", now)).toBe("2026-11-09");
    expect(normalizeWeekParam(undefined, now)).toBe("2026-11-09");
  });

  it("огнооны туслахууд", () => {
    expect(isIsoDate("2026-11-09")).toBe(true);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(addWeeks("2026-11-09", -1)).toBe("2026-11-02");
    expect(weekEnd("2026-11-09")).toBe("2026-11-15");
    expect(weekDays("2026-12-28")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    expect(weekLabel("2026-11-09")).toBe("2026.11.09 – 11.15");
    expect(weekShortLabel("2026-11-30")).toBe("11-р сарын 30 – 12-р сарын 6");
  });
});

describe("HH:MM ба УБ-ын мөч", () => {
  it("HH:MM задлах, 24:00 = дараагийн өдрийн 00:00", () => {
    expect(parseHmMinutes("10:00")).toBe(600);
    expect(parseHmMinutes("24:00")).toBe(1440);
    expect(parseHmMinutes("24:30")).toBeNull();
    expect(parseHmMinutes("9:5")).toBeNull();
    expect(ubDateTime("2026-11-15", "24:00").toISOString()).toBe(ubDateTime("2026-11-16", "00:00").toISOString());
    expect(ubDateTime("2026-11-09", "10:00").toISOString()).toBe("2026-11-09T02:00:00.000Z");
  });
});
