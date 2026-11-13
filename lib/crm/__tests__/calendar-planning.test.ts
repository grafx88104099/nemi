import { describe, expect, it } from "vitest";

import {
  MAX_RANGE_DAYS,
  calendarHref,
  calendarPeopleParam,
  calendarRange,
  normalizeCalendarDate,
  parseCalendarQuery,
  shiftCalendarDate,
} from "@/lib/crm/calendar-view";

// Календарийн холбоос ба ирээдүйн төлөвлөлт. 2026-11-09 = Даваа (УБ = UTC+8).
const WEEK = "2026-11-09";
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

describe("холбоос: календарь", () => {
  it("тодорхой 7 хоног, өөр хүнийх бол people", () => {
    expect(calendarHref.calendar("/agent/crm", WEEK, { view: "week" })).toBe(
      `/agent/crm/calendar?view=week&date=${WEEK}`
    );
    expect(calendarHref.calendar("/office/crm", WEEK, { view: "week", people: [U2] })).toBe(
      `/office/crm/calendar?view=week&date=${WEEK}&people=${U2}`
    );
    expect(calendarHref.calendar("/agent/crm", "2026-11-11", { view: "day", people: null })).toBe(
      "/agent/crm/calendar?view=day&date=2026-11-11"
    );
  });

  it("зөвхөн өөрийгөө харж байвал ?people= хасна", () => {
    expect(calendarPeopleParam([U1], U1)).toBeNull();
    expect(calendarPeopleParam([U2], U1)).toEqual([U2]);
    expect(calendarPeopleParam([U1, U2], U1)).toEqual([U1, U2]);
    const src = [U2];
    expect(calendarPeopleParam(src, U1)).not.toBe(src);
  });
});

describe("ирээдүйн төлөвлөлт: 7 хоног, сар руу чөлөөтэй", () => {
  const now = new Date("2026-11-11T04:00:00Z"); // УБ 12:00

  it("ирээдүйн огноо URL-аас хэвээр уншигдана", () => {
    expect(normalizeCalendarDate("2027-06-15", now)).toBe("2027-06-15");
    expect(parseCalendarQuery({ view: "month", date: "2027-06-15" }, now)).toEqual({
      view: "month",
      date: "2027-06-15",
      people: [],
    });
  });

  it("7 хоногоор, сараар урагш шилжинэ (он дамжсан ч)", () => {
    let d = WEEK;
    for (let i = 0; i < 8; i += 1) d = shiftCalendarDate("week", d, 1);
    expect(d).toBe("2027-01-04");
    expect(shiftCalendarDate("month", "2026-12-31", 2)).toBe("2027-02-28");
  });

  it("алс ирээдүйн сарын муж ч уншилтын дээд хязгаарт багтана", () => {
    const r = calendarRange("month", "2027-06-15");
    expect(r.days[0]).toBe("2027-05-31");
    expect(Date.parse(r.to) - Date.parse(r.from)).toBeLessThanOrEqual(MAX_RANGE_DAYS * 86_400_000);
  });
});
