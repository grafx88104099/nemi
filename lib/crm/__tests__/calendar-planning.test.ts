import { describe, expect, it } from "vitest";

import {
  MAX_RANGE_DAYS,
  calendarHref,
  calendarPeopleParam,
  calendarPlanWeek,
  calendarRange,
  calendarViewRange,
  calendarViewTitle,
  normalizeCalendarDate,
  parseCalendarQuery,
  pinnedCalendarViews,
  shiftCalendarDate,
  ubDayEnd,
  ubDayStart,
} from "@/lib/crm/calendar-view";
import { weekDays } from "@/lib/crm/week";

// 7 хоногийн төлөвлөгөө ↔ календарь. 2026-11-09 = Даваа (УБ = UTC+8).
const WEEK = "2026-11-09";
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const PLAN = "33333333-3333-4333-8333-333333333333";

describe("төлөвлөгөөнд суулгасан (тогтмол 7 хоногийн) календарь", () => {
  it("зөвхөн 7 хоног ба жагсаалт; юу ч үлдэхгүй бол 7 хоног", () => {
    expect(pinnedCalendarViews()).toEqual(["week", "agenda"]);
    expect(pinnedCalendarViews(["day", "week", "month"])).toEqual(["week"]);
    expect(pinnedCalendarViews(["agenda"])).toEqual(["agenda"]);
    expect(pinnedCalendarViews(["month", "day"])).toEqual(["week"]);
    expect(pinnedCalendarViews(["week", "week", "agenda"])).toEqual(["week", "agenda"]);
  });

  it("жагсаалт ч тухайн 7 хоногийг (Даваа–Ням) харуулна", () => {
    const r = calendarViewRange("agenda", WEEK, true);
    expect(r.days).toEqual(weekDays(WEEK));
    expect(r.from).toBe(ubDayStart(WEEK).toISOString());
    expect(r.to).toBe(ubDayEnd("2026-11-15").toISOString());
    expect(calendarViewRange("week", WEEK, true)).toEqual(calendarRange("week", WEEK));
    // Суулгаагүй бол жагсаалт 14 хоног хэвээр.
    expect(calendarViewRange("agenda", WEEK)).toEqual(calendarRange("agenda", WEEK));
    expect(calendarViewRange("agenda", WEEK).days).toHaveLength(14);
  });

  it("гарчиг: суулгасан жагсаалтад ч 7 хоногийн шошго (сар дамжсан ч)", () => {
    expect(calendarViewTitle("agenda", WEEK, true)).toBe("11-р сарын 9–15");
    expect(calendarViewTitle("week", WEEK, true)).toBe("11-р сарын 9–15");
    expect(calendarViewTitle("agenda", WEEK)).toBe("11-р сарын 9–22");
    expect(calendarViewTitle("agenda", "2026-11-30", true)).toBe("11-р сарын 30 – 12-р сарын 6");
  });
});

describe("харагдаж буй 7 хоногийн картын төлөв", () => {
  it("харагдацын огнооны 7 хоногийн Даваа; сарын харагдацад null", () => {
    expect(calendarPlanWeek("week", "2026-11-11")).toBe(WEEK);
    expect(calendarPlanWeek("day", "2026-11-15")).toBe(WEEK); // Ням → тэр 7 хоногийн Даваа
    expect(calendarPlanWeek(null, "2026-11-15")).toBe(WEEK);
    expect(calendarPlanWeek("agenda", "2026-11-16")).toBe("2026-11-16");
    expect(calendarPlanWeek("month", "2026-11-11")).toBeNull();
  });
});

describe("холбоос: төлөвлөгөө → календарь → төлөвлөгөө", () => {
  it("«Календарь дээр харах» — тухайн 7 хоног, өөр хүнийх бол people", () => {
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

  it("агентын панель: өөрийн карт /week/<огноо>, гишүүнийх /team/<id>", () => {
    const self = { week: WEEK, planId: null, isSelf: true, canLead: false };
    expect(calendarHref.weekPlan("/agent/crm", self)).toBe(`/agent/crm/week/${WEEK}`);
    expect(calendarHref.weekPlan("/agent/crm", { ...self, planId: PLAN })).toBe(`/agent/crm/week/${WEEK}`);
    const member = { week: WEEK, planId: PLAN, isSelf: false, canLead: true };
    expect(calendarHref.weekPlan("/agent/crm", member)).toBe(`/agent/crm/team/${PLAN}`);
    expect(calendarHref.weekPlan("/agent/crm", { ...member, planId: null })).toBeNull();
    expect(calendarHref.weekPlan("/agent/crm", { ...member, canLead: false })).toBeNull();
  });

  it("оффисын панель: зөвхөн ахлагч, удирдлагад /office/crm/week/<id>", () => {
    const p = { week: WEEK, planId: PLAN, isSelf: false, canLead: true };
    expect(calendarHref.weekPlan("/office/crm", p)).toBe(`/office/crm/week/${PLAN}`);
    expect(calendarHref.weekPlan("/office/crm", { ...p, canLead: false })).toBeNull();
    expect(calendarHref.weekPlan("/office/crm", { ...p, planId: null })).toBeNull();
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
