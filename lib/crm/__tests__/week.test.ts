import { describe, expect, it } from "vitest";

import {
  addWeeks,
  currentWeekStart,
  finalLockAt,
  hoursUntilLock,
  isIsoDate,
  meetingAt,
  normalizeWeekParam,
  normalizeWeeklySchedule,
  parseHmMinutes,
  planReminderAt,
  reviewAt,
  ubDateIso,
  ubDateTime,
  weekDays,
  weekEnd,
  weekLabel,
  weekPhase,
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

describe("хуваарь ба түгжээ (Ш8)", () => {
  const s = normalizeWeeklySchedule(null);

  it("HH:MM задлах, 24:00 = дараагийн өдрийн 00:00", () => {
    expect(parseHmMinutes("10:00")).toBe(600);
    expect(parseHmMinutes("24:00")).toBe(1440);
    expect(parseHmMinutes("24:30")).toBeNull();
    expect(parseHmMinutes("9:5")).toBeNull();
    expect(ubDateTime("2026-11-15", "24:00").toISOString()).toBe(ubDateTime("2026-11-16", "00:00").toISOString());
  });

  it("Даваа 10:00 УБ хурал, Баасан 16:00 урьдчилсан, Ням 24:00 эцсийн", () => {
    expect(meetingAt("2026-11-09", s).toISOString()).toBe("2026-11-09T02:00:00.000Z");
    expect(reviewAt("2026-11-09", s).toISOString()).toBe("2026-11-13T08:00:00.000Z");
    expect(finalLockAt("2026-11-09", s).toISOString()).toBe("2026-11-15T16:00:00.000Z");
    // 16 цагийн өмнөх сануулга = Ням 18:00 УБ
    expect(planReminderAt("2026-11-09", s).toISOString()).toBe("2026-11-08T10:00:00.000Z");
  });

  it("тохиргоо: offset, буруу утгыг нөөцөөр", () => {
    const c = normalizeWeeklySchedule({
      meeting: { weekday: 1, time: "09:30", duration_min: 45 },
      review: { weekday: 9, time: "xx" },
      final_lock_offset_hours: -6,
    });
    expect(c.meeting).toEqual({ weekday: 1, time: "09:30", durationMin: 45 });
    expect(c.review).toEqual({ weekday: 7, time: "16:00" });
    expect(finalLockAt("2026-11-09", c).toISOString()).toBe("2026-11-15T10:00:00.000Z");
  });

  it("үе шат: явагдаж буй → урьдчилсан → түгжигдсэн", () => {
    const wk = "2026-11-09";
    const mon = weekPhase(wk, new Date("2026-11-09T01:00:00Z"), s);
    expect(mon).toMatchObject({ isCurrent: true, meetingPassed: false, preliminary: false, finalLocked: false });
    const fri = weekPhase(wk, new Date("2026-11-13T09:00:00Z"), s);
    expect(fri).toMatchObject({ meetingPassed: true, preliminary: true, finalLocked: false });
    const nextMon = weekPhase(wk, new Date("2026-11-15T16:00:00Z"), s);
    expect(nextMon).toMatchObject({ isPast: true, preliminary: false, finalLocked: true });
    expect(hoursUntilLock(wk, new Date("2026-11-15T13:00:00Z"), s)).toBe(3);
  });
});
