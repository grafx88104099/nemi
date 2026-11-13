import { describe, expect, it } from "vitest";

import {
  CALENDAR_LOCK_REASON,
  addMonths,
  allDayRange,
  blockEnd,
  calendarHref,
  calendarRange,
  calendarTitle,
  canDropOnDay,
  canEditTask,
  canViewCalendar,
  daySegment,
  dragRange,
  eventColorKey,
  eventMovability,
  isAllDayLike,
  itemDays,
  layoutAllDay,
  layoutDay,
  monthGrid,
  moveToDay,
  moveToSlot,
  normalizeAllDayRange,
  normalizeCalendarDate,
  normalizeCalendarView,
  overlapsRange,
  personIdsIn,
  pointerMinute,
  shiftCalendarDate,
  snapInstant,
  snapMinutes,
  sortCalendarItems,
  taskMovability,
  timedSegmentsOnDay,
  ubAt,
  ubDay,
  ubDayEnd,
  ubDayStart,
  ubMinuteOfDay,
  type CalendarViewer,
} from "@/lib/crm/calendar-view";
import { fmtMonthYear, fmtTimeRange, fmtWeekdayShort } from "@/lib/format";

// Бүх оролт бодит UTC агшин; УБ = UTC+8. 2026-11-09 = Даваа.
const DAY = "2026-11-11"; // Лхагва

/** УБ-ын ханын цаг → ISO (жишээ: ub("2026-11-11", "09:30")). */
function ub(day: string, hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  return ubAt(day, h * 60 + m).toISOString();
}

function item(key: string, start: string, end: string, allDay = false) {
  return { key, start, end, allDay };
}

describe("Улаанбаатарын өдөр", () => {
  it("УБ-ын шөнө дунд UTC 16:00-д солигдоно", () => {
    expect(ubDay("2026-11-10T15:59:59.999Z")).toBe("2026-11-10");
    expect(ubDay("2026-11-10T16:00:00.000Z")).toBe("2026-11-11");
    expect(ubDayStart(DAY).toISOString()).toBe("2026-11-10T16:00:00.000Z");
    expect(ubDayEnd(DAY).toISOString()).toBe("2026-11-11T16:00:00.000Z");
  });

  it("ubAt ба ubMinuteOfDay нь УБ-ын ханын цагаар", () => {
    expect(ub(DAY, "09:30")).toBe("2026-11-11T01:30:00.000Z");
    expect(ubAt(DAY, 1440).toISOString()).toBe(ubDayEnd(DAY).toISOString());
    expect(ubMinuteOfDay("2026-11-11T01:30:00Z")).toBe(9 * 60 + 30);
    expect(ubMinuteOfDay("2026-11-10T16:00:00Z")).toBe(0);
    expect(ubMinuteOfDay("2026-11-10T15:59:00Z")).toBe(1439);
  });

  it("сар нэмэхэд сарын сүүлийн өдөрт тааруулна", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });
});

describe("харагдацын тор", () => {
  it("7 хоног Даваагаас эхэлж, уншилтын муж нь УБ-ын өдрийн хилээр", () => {
    const r = calendarRange("week", "2026-11-15"); // Ням
    expect(r.days[0]).toBe("2026-11-09");
    expect(r.days[6]).toBe("2026-11-15");
    expect(r.from).toBe("2026-11-08T16:00:00.000Z");
    expect(r.to).toBe("2026-11-15T16:00:00.000Z");
  });

  it("өдрийн муж", () => {
    const r = calendarRange("day", DAY);
    expect(r.days).toEqual([DAY]);
    expect(Date.parse(r.to) - Date.parse(r.from)).toBe(86_400_000);
  });

  it("сарын тор: Даваагаас, өмнөх/дараагийн сарын өдрүүдтэй", () => {
    const g = monthGrid(DAY);
    expect(g.month).toBe("2026-11");
    expect(g.first).toBe("2026-11-01");
    expect(g.last).toBe("2026-11-30");
    expect(g.weeks[0][0]).toBe("2026-10-26"); // 11-01 = Ням
    expect(g.weeks.at(-1)?.at(-1)).toBe("2026-12-06");
    expect(g.weeks).toHaveLength(6);
    expect(g.weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("4 мөртэй сар ба fixedWeeks", () => {
    // 2027-02-01 = Даваа, 28 өдөр.
    expect(monthGrid("2027-02-10").weeks).toHaveLength(4);
    expect(monthGrid("2027-02-10", { fixedWeeks: true }).weeks).toHaveLength(6);
  });

  it("сарын муж 62 хоногоос бага", () => {
    const r = calendarRange("month", "2026-11-20");
    expect(r.days).toHaveLength(42);
    expect(Date.parse(r.to) - Date.parse(r.from)).toBeLessThanOrEqual(62 * 86_400_000);
  });

  it("өмнөх/дараагийн хуудас ба шошго", () => {
    expect(shiftCalendarDate("day", DAY, -1)).toBe("2026-11-10");
    expect(shiftCalendarDate("week", DAY, 1)).toBe("2026-11-18");
    expect(shiftCalendarDate("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(calendarTitle("week", DAY)).toBe("11-р сарын 9–15");
    expect(calendarTitle("month", DAY)).toBe("2026 оны 11-р сар");
    expect(calendarTitle("day", DAY)).toBe("11-р сарын 11, лхагва");
  });

  it("URL параметрийг хэвийн болгоно", () => {
    expect(normalizeCalendarView("month")).toBe("month");
    expect(normalizeCalendarView("year")).toBe("week");
    expect(normalizeCalendarView(undefined, "day")).toBe("day");
    const now = new Date("2026-11-10T16:30:00Z"); // УБ 11-11 00:30
    expect(normalizeCalendarDate("2026-02-30", now)).toBe("2026-11-11");
    expect(normalizeCalendarDate("2026-12-01", now)).toBe("2026-12-01");
  });
});

describe("15 минутын алхам ба чирэх", () => {
  it("snapMinutes", () => {
    expect(snapMinutes(7)).toBe(0);
    expect(snapMinutes(8)).toBe(15);
    expect(snapMinutes(29, 15, "floor")).toBe(15);
    expect(snapMinutes(16, 15, "ceil")).toBe(30);
    expect(snapMinutes(-7)).toBe(0);
    expect(Object.is(snapMinutes(-7), 0)).toBe(true);
  });

  it("snapInstant нь УБ-ын өдөр дотор тааруулна", () => {
    expect(snapInstant(ub(DAY, "09:08")).toISOString()).toBe(ub(DAY, "09:15"));
    expect(snapInstant(ub(DAY, "09:22"), 15, "floor").toISOString()).toBe(ub(DAY, "09:15"));
    // 23:55 УБ → шөнө дунд (дараагийн өдрийн 00:00).
    expect(snapInstant(ub(DAY, "23:55")).toISOString()).toBe(ubDayEnd(DAY).toISOString());
  });

  it("pointerMinute: пикселийг минут болгож өдөрт багтаана", () => {
    expect(pointerMinute(0, 1440)).toBe(0);
    expect(pointerMinute(600, 1440)).toBe(600);
    expect(pointerMinute(607, 1440)).toBe(600);
    expect(pointerMinute(-20, 1440)).toBe(0);
    expect(pointerMinute(5000, 1440)).toBe(1425);
    expect(pointerMinute(100, 0)).toBe(0);
  });

  it("dragRange: зөөхөд үргэлжлэх хугацаа хадгалагдана", () => {
    const r = { start: ub(DAY, "10:00"), end: ub(DAY, "11:00") };
    expect(dragRange(r, 37, "move")).toEqual({ start: ub(DAY, "10:30"), end: ub(DAY, "11:30") });
    expect(dragRange(r, 22, "resize-end")).toEqual({ start: r.start, end: ub(DAY, "11:15") });
    expect(dragRange(r, -45, "resize-start")).toEqual({ start: ub(DAY, "09:15"), end: r.end });
  });

  it("dragRange: сунгахад хамгийн багадаа нэг алхам үлдэнэ", () => {
    const r = { start: ub(DAY, "10:00"), end: ub(DAY, "11:00") };
    expect(dragRange(r, -120, "resize-end")).toEqual({ start: r.start, end: ub(DAY, "10:15") });
    expect(dragRange(r, 120, "resize-start")).toEqual({ start: ub(DAY, "10:45"), end: r.end });
  });

  it("шөнө дунд дамнан зөөнө (УБ 23:30 → маргааш 00:30)", () => {
    const r = { start: ub(DAY, "23:00"), end: ub(DAY, "23:45") };
    const moved = dragRange(r, 90, "move");
    expect(ubDay(moved.start)).toBe("2026-11-12");
    expect(moved.start).toBe(ub("2026-11-12", "00:30"));
  });

  it("moveToSlot ба moveToDay", () => {
    const r = { start: ub(DAY, "10:00"), end: ub(DAY, "11:30") };
    expect(moveToSlot(r, "2026-11-13", 14 * 60 + 7)).toEqual({
      start: ub("2026-11-13", "14:00"),
      end: ub("2026-11-13", "15:30"),
    });
    expect(moveToDay(r, "2026-11-09")).toEqual({ start: ub("2026-11-09", "10:00"), end: ub("2026-11-09", "11:30") });
    const allDay = allDayRange(DAY, "2026-11-12");
    expect(moveToDay(allDay, "2026-11-20")).toEqual(allDayRange("2026-11-20", "2026-11-21"));
  });

  it("blockEnd: хугацаагүй зүйл УБ-ын шөнө дундаас хэтрэхгүй", () => {
    expect(blockEnd(ub(DAY, "10:00"), 30)).toBe(ub(DAY, "10:30"));
    expect(blockEnd(ub(DAY, "23:50"), 30)).toBe(ubDayEnd(DAY).toISOString());
    // UTC-ээр өдрийн дунд (15:40Z) ч УБ-аар 23:40 — УБ-ын шөнө дундаар тайрна.
    expect(blockEnd("2026-11-11T15:40:00Z", 60)).toBe("2026-11-11T16:00:00.000Z");
  });

  it("бүтэн өдрийн муж УБ-ын өдрийн хилээр", () => {
    expect(allDayRange(DAY)).toEqual({ start: "2026-11-10T16:00:00.000Z", end: "2026-11-11T16:00:00.000Z" });
    expect(allDayRange(DAY, "2026-11-01")).toEqual(allDayRange(DAY));
    // 09:00–17:00 → тухайн өдөр бүтнээр; 00:00 дуусгавар нь тэр өдрийг оруулахгүй.
    expect(normalizeAllDayRange({ start: ub(DAY, "09:00"), end: ub(DAY, "17:00") })).toEqual(allDayRange(DAY));
    expect(normalizeAllDayRange({ start: ub(DAY, "00:00"), end: ub("2026-11-13", "00:00") })).toEqual(
      allDayRange(DAY, "2026-11-12")
    );
    // Тэг урттай → 1 өдөр.
    expect(normalizeAllDayRange({ start: ub(DAY, "00:00"), end: ub(DAY, "00:00") })).toEqual(allDayRange(DAY));
  });
});

describe("өдрийн хэрчим (шөнө дунд дамнасан)", () => {
  const night = item("e:night", ub(DAY, "23:00"), ub("2026-11-12", "01:30"));

  it("УБ 23:00–01:30 нь хоёр өдөрт хуваагдана", () => {
    const a = daySegment(night, DAY);
    const b = daySegment(night, "2026-11-12");
    expect(a).toMatchObject({ startMin: 1380, endMin: 1440, continuesBefore: false, continuesAfter: true });
    expect(b).toMatchObject({ startMin: 0, endMin: 90, continuesBefore: true, continuesAfter: false });
    expect(daySegment(night, "2026-11-13")).toBeNull();
    expect(itemDays(night)).toEqual([DAY, "2026-11-12"]);
  });

  it("UTC-ээр нэг өдөр ч УБ-аар өөр өдөр (UTC 15:00–17:00 = УБ 23:00–01:00)", () => {
    const it2 = item("e:utc", "2026-11-11T15:00:00Z", "2026-11-11T17:00:00Z");
    expect(itemDays(it2)).toEqual([DAY, "2026-11-12"]);
    expect(daySegment(it2, DAY)?.startMin).toBe(1380);
    expect(daySegment(it2, "2026-11-12")?.endMin).toBe(60);
  });

  it("шөнө дунд яг дуусвал дараагийн өдөрт орохгүй", () => {
    const late = item("e:late", ub(DAY, "22:00"), ubDayEnd(DAY).toISOString());
    expect(itemDays(late)).toEqual([DAY]);
    expect(daySegment(late, "2026-11-12")).toBeNull();
    expect(daySegment(late, DAY)).toMatchObject({ endMin: 1440, continuesAfter: false });
  });

  it("олон өдөр дамнасан цагтай зүйл дундах өдрийг бүтнээр эзэлнэ", () => {
    const long = item("e:long", ub(DAY, "18:00"), ub("2026-11-13", "09:00"));
    expect(itemDays(long)).toEqual([DAY, "2026-11-12", "2026-11-13"]);
    expect(daySegment(long, "2026-11-12")).toMatchObject({ startMin: 0, endMin: 1440, continuesBefore: true, continuesAfter: true });
    expect(isAllDayLike(long)).toBe(true);
    expect(isAllDayLike(night)).toBe(false);
  });

  it("тэг урттай зүйл эхлэлээрээ өдөрт орно", () => {
    const point = item("p", ub(DAY, "12:00"), ub(DAY, "12:00"));
    expect(daySegment(point, DAY)).toMatchObject({ startMin: 720, endMin: 720 });
    expect(overlapsRange(point, ubDayStart(DAY).toISOString(), ubDayEnd(DAY).toISOString())).toBe(true);
  });

  it("сарын нүдний цагтай зүйлс бүтэн өдрийнхийг алгасаж эрэмбэлэгдэнэ", () => {
    const list = [
      item("b", ub(DAY, "14:00"), ub(DAY, "15:00")),
      item("ad", allDayRange(DAY).start, allDayRange(DAY).end, true),
      item("a", ub(DAY, "09:00"), ub(DAY, "10:00")),
      night,
    ];
    expect(timedSegmentsOnDay(list, DAY).map((s) => s.item.key)).toEqual(["a", "b", "e:night"]);
    expect(timedSegmentsOnDay(list, "2026-11-12").map((s) => s.item.key)).toEqual(["e:night"]);
  });
});

describe("layoutDay (Google Calendar маягийн давхцал)", () => {
  const at = (key: string, from: string, to: string) => item(key, ub(DAY, from), ub(DAY, to));
  const pick = (r: ReturnType<typeof layoutDay>) =>
    Object.fromEntries(r.map((s) => [s.item.key, { column: s.column, columns: s.columns, span: s.span, left: s.left, width: s.width }]));

  it("давхцахгүй зүйл бүтэн өргөнтэй", () => {
    const r = pick(layoutDay([at("a", "09:00", "10:00"), at("b", "10:00", "11:00")], DAY));
    expect(r.a).toEqual({ column: 0, columns: 1, span: 1, left: 0, width: 1 });
    expect(r.b).toEqual({ column: 0, columns: 1, span: 1, left: 0, width: 1 });
  });

  it("хоёр давхцсан зүйл тал талдаа", () => {
    const r = pick(layoutDay([at("a", "09:00", "11:00"), at("b", "10:00", "12:00")], DAY));
    expect(r.a).toMatchObject({ column: 0, columns: 2, width: 0.5, left: 0 });
    expect(r.b).toMatchObject({ column: 1, columns: 2, width: 0.5, left: 0.5 });
  });

  it("урт зүйл зүүн тийш, богинонууд баруун баганыг дахин ашиглана", () => {
    const r = pick(
      layoutDay([at("long", "09:00", "13:00"), at("x", "09:00", "10:00"), at("y", "10:30", "11:30")], DAY)
    );
    expect(r.long).toMatchObject({ column: 0, columns: 2 });
    expect(r.x).toMatchObject({ column: 1, columns: 2 });
    expect(r.y).toMatchObject({ column: 1, columns: 2 });
  });

  it("сул баганаар баруун тийш сунана", () => {
    // a, b, c гурвуулаа 09:00-д давхцана; d нь зөвхөн a-тай давхцаж b, c-гийн баганыг эзэлнэ.
    const r = pick(
      layoutDay(
        [at("a", "09:00", "12:00"), at("b", "09:00", "10:00"), at("c", "09:00", "10:00"), at("d", "10:30", "11:30")],
        DAY
      )
    );
    expect(r.a).toMatchObject({ column: 0, columns: 3, span: 1 });
    expect(r.d).toMatchObject({ column: 1, columns: 3, span: 2 });
    expect(r.d.width).toBeCloseTo(2 / 3);
    expect(r.d.left).toBeCloseTo(1 / 3);
    expect(r.c).toMatchObject({ column: 2, span: 1 });
  });

  it("салангид бөөгнөрөл тус тусдаа баганатай", () => {
    const r = pick(
      layoutDay([at("a", "09:00", "10:00"), at("b", "09:30", "10:30"), at("c", "14:00", "15:00")], DAY)
    );
    expect(r.a.columns).toBe(2);
    expect(r.b.columns).toBe(2);
    expect(r.c).toMatchObject({ columns: 1, width: 1 });
  });

  it("богино зүйлийг хамгийн бага өндрөөр давхцуулна", () => {
    // 09:00–09:05 ба 09:10–09:30: minMinutes = 15 → эхнийх 09:15 хүртэл эзэлж давхцана.
    const items = [at("a", "09:00", "09:05"), at("b", "09:10", "09:30")];
    expect(pick(layoutDay(items, DAY)).b.columns).toBe(2);
    expect(pick(layoutDay(items, DAY, { minMinutes: 5 })).b.columns).toBe(1);
  });

  it("шөнө дунд дамнасан зүйл хоёр өдөрт тус тусын давхцалтай", () => {
    const night = item("night", ub(DAY, "23:00"), ub("2026-11-12", "01:00"));
    const early = item("early", ub("2026-11-12", "00:30"), ub("2026-11-12", "02:00"));
    const late = item("late", ub(DAY, "22:00"), ub(DAY, "22:30"));
    const d1 = pick(layoutDay([night, early, late], DAY));
    expect(Object.keys(d1).sort()).toEqual(["late", "night"]);
    expect(d1.night.columns).toBe(1);
    const d2 = layoutDay([night, early, late], "2026-11-12");
    expect(d2.map((s) => s.item.key)).toEqual(["night", "early"]);
    expect(d2[0]).toMatchObject({ startMin: 0, endMin: 60, continuesBefore: true, columns: 2 });
    expect(d2[1]).toMatchObject({ startMin: 30, column: 1 });
  });

  it("бүтэн өдрийн ба 24 цагаас урт зүйлийг цагийн торонд оруулахгүй", () => {
    const r = layoutDay(
      [
        item("ad", allDayRange(DAY).start, allDayRange(DAY).end, true),
        item("long", ub("2026-11-10", "08:00"), ub("2026-11-12", "08:00")),
        at("a", "09:00", "10:00"),
      ],
      DAY
    );
    expect(r.map((s) => s.item.key)).toEqual(["a"]);
  });

  it("тодорхой (deterministic) эрэмбэ — оролтын дарааллаас үл хамаарна", () => {
    const list = [at("b", "09:00", "10:00"), at("a", "09:00", "10:00"), at("c", "09:00", "11:00")];
    const r1 = pick(layoutDay(list, DAY));
    const r2 = pick(layoutDay([...list].reverse(), DAY));
    expect(r1).toEqual(r2);
    expect(r1.c.column).toBe(0); // урт нь түрүүнд
    expect(r1.a.column).toBe(1);
    expect(r1.b.column).toBe(2);
  });
});

describe("layoutAllDay (бүтэн өдрийн мөр)", () => {
  const week = calendarRange("week", DAY).days; // 11-09 … 11-15

  it("олон өдрийн зурвас ба эгнээ", () => {
    const a = allDayRange("2026-11-10", "2026-11-12");
    const b = allDayRange("2026-11-11");
    const c = allDayRange("2026-11-13", "2026-11-14");
    const { placements, lanes } = layoutAllDay(
      [item("a", a.start, a.end, true), item("b", b.start, b.end, true), item("c", c.start, c.end, true)],
      week
    );
    const by = Object.fromEntries(placements.map((p) => [p.item.key, p]));
    expect(by.a).toMatchObject({ startCol: 1, span: 3, lane: 0 });
    expect(by.b).toMatchObject({ startCol: 2, span: 1, lane: 1 });
    expect(by.c).toMatchObject({ startCol: 4, span: 2, lane: 0 });
    expect(lanes).toBe(2);
  });

  it("7 хоногийн хилээс давсан зурвасыг тайрч, үргэлжлэлийг тэмдэглэнэ", () => {
    const r = allDayRange("2026-11-07", "2026-11-10");
    const { placements } = layoutAllDay([item("x", r.start, r.end, true)], week);
    expect(placements[0]).toMatchObject({ startCol: 0, span: 2, continuesBefore: true, continuesAfter: false });
    const r2 = allDayRange("2026-11-15", "2026-11-18");
    expect(layoutAllDay([item("y", r2.start, r2.end, true)], week).placements[0]).toMatchObject({
      startCol: 6,
      span: 1,
      continuesAfter: true,
    });
  });

  it("24 цагаас урт цагтай зүйл бүтэн өдрийн мөрөнд, богино нь үгүй", () => {
    const long = item("long", ub("2026-11-10", "18:00"), ub("2026-11-12", "09:00"));
    const short = item("short", ub(DAY, "09:00"), ub(DAY, "10:00"));
    const { placements } = layoutAllDay([long, short], week);
    expect(placements.map((p) => p.item.key)).toEqual(["long"]);
    expect(placements[0]).toMatchObject({ startCol: 1, span: 3 });
  });

  it("мужаас гадуурх зүйл орохгүй", () => {
    const r = allDayRange("2026-11-20");
    expect(layoutAllDay([item("z", r.start, r.end, true)], week).placements).toEqual([]);
    expect(layoutAllDay([item("z", r.start, r.end, true)], [])).toEqual({ placements: [], lanes: 0 });
  });
});

describe("эрх (DB-ийн толь)", () => {
  const agent: CalendarViewer = { profileId: "me", roles: ["agent"], teamId: "t1" };
  const lead: CalendarViewer = { profileId: "me", roles: ["agent", "team_lead"], teamId: "t1" };
  const manager: CalendarViewer = { profileId: "me", roles: ["ceo"], teamId: null };

  it("canViewCalendar: өөрөө, ахлагч багаа, менежер бүгдийг", () => {
    const mate = { profileId: "p2", teamId: "t1" };
    const other = { profileId: "p3", teamId: "t2" };
    expect(canViewCalendar(agent, { profileId: "me", teamId: null })).toBe(true);
    expect(canViewCalendar(agent, mate)).toBe(false);
    expect(canViewCalendar(lead, mate)).toBe(true);
    expect(canViewCalendar(lead, other)).toBe(false);
    expect(canViewCalendar(lead, { ...mate, isActive: false })).toBe(false);
    expect(canViewCalendar({ ...lead, teamId: null }, { profileId: "p4", teamId: null })).toBe(false);
    expect(canViewCalendar(manager, other)).toBe(true);
    // marketing, finance нь crm_staff-ийг уншдаг ч календарийг харахгүй.
    expect(canViewCalendar({ profileId: "me", roles: ["marketing", "finance"], teamId: null }, other)).toBe(false);
  });

  it("canEditTask", () => {
    expect(canEditTask(agent, { created_by: "x", responsible_id: "me" })).toBe(true);
    expect(canEditTask(agent, { created_by: "me", responsible_id: "x" })).toBe(true);
    expect(canEditTask(lead, { created_by: "x", responsible_id: "p2" })).toBe(false);
    expect(canEditTask({ ...agent, userRole: "office_admin" }, { created_by: "x", responsible_id: "y" })).toBe(true);
  });

  it("эх сурвалж бүрийн зөөх боломж", () => {
    expect(eventMovability({ can_edit: true, masked: false })).toEqual({ canMove: true, canResize: true, lockedReason: null });
    expect(eventMovability({ can_edit: false, masked: true }).lockedReason).toBe(CALENDAR_LOCK_REASON.masked);
    expect(eventMovability({ can_edit: false, masked: false }).lockedReason).toBe(CALENDAR_LOCK_REASON.notOwner);

    expect(taskMovability(agent, { created_by: "x", responsible_id: "me", status: "pending" }).canMove).toBe(true);
    expect(taskMovability(agent, { created_by: "x", responsible_id: "me", status: "completed" }).lockedReason).toBe(
      CALENDAR_LOCK_REASON.taskDone
    );
    expect(taskMovability(lead, { created_by: "x", responsible_id: "p2", status: "pending" }).lockedReason).toBe(
      CALENDAR_LOCK_REASON.noRights
    );
  });

  it("зөөх боломжтой зүйлийг аль ч өдөр рүү буулгана", () => {
    expect(canDropOnDay({ source: "task", canMove: true }, "2026-11-01", DAY)).toBe(true);
    expect(canDropOnDay({ source: "event", canMove: true }, "2026-11-10", DAY)).toBe(true);
    expect(canDropOnDay({ source: "showing", canMove: false }, DAY, DAY)).toBe(false);
  });
});

describe("холбоос ба нэгтгэл", () => {
  it("агент ба оффисын холбоос", () => {
    expect(calendarHref.deal("/agent/crm", "p1", "d1")).toBe("/agent/crm/staff/p1/deals/d1");
    expect(calendarHref.deal("/office/crm", "p1", "d1")).toBe("/office/crm/staff/p1/deals/d1");
    expect(calendarHref.property("/agent/crm", "p1")).toBe("/agent/crm/staff/p1");
    expect(calendarHref.contact("/office/crm", "c1")).toBe("/office/crm/contacts/c1");
    expect(calendarHref.task("/agent/crm", "t1")).toBe("/agent/tasks/t1");
    expect(calendarHref.task("/office/crm", "t1")).toBe("/office/tasks/t1");
    expect(calendarHref.calendar("/agent/crm", DAY)).toBe("/agent/crm/calendar?date=2026-11-11");
    expect(calendarHref.calendar("/office/crm")).toBe("/office/crm/calendar");
  });

  it("өнгө, хүмүүс, эрэмбэ", () => {
    expect(eventColorKey("call", false)).toBe("call");
    expect(eventColorKey("call", true)).toBe("busy");
    expect(personIdsIn(["a", "b", "a", null, "x"], ["b", "a"])).toEqual(["a", "b"]);
    const ad = allDayRange(DAY);
    const sorted = sortCalendarItems([
      item("t2", ub(DAY, "09:00"), ub(DAY, "09:30")),
      item("t1", ub(DAY, "09:00"), ub(DAY, "10:00")),
      item("ad", ad.start, ad.end, true),
      item("early", ub(DAY, "08:00"), ub(DAY, "08:30")),
    ]);
    expect(sorted.map((s) => s.key)).toEqual(["ad", "early", "t1", "t2"]);
  });

  it("мужтай давхцах эсэх (end exclusive)", () => {
    const from = ubDayStart(DAY).toISOString();
    const to = ubDayEnd(DAY).toISOString();
    expect(overlapsRange(item("a", ub("2026-11-10", "23:00"), from), from, to)).toBe(false);
    expect(overlapsRange(item("b", ub("2026-11-10", "23:00"), ub(DAY, "00:15")), from, to)).toBe(true);
    expect(overlapsRange(item("c", to, ub("2026-11-12", "01:00")), from, to)).toBe(false);
  });
});

describe("format.ts нэмэлт", () => {
  it("гарагийн богино нэр, он сар, цагийн муж (УБ)", () => {
    expect(fmtWeekdayShort(ub("2026-11-09", "00:30"))).toBe("Да");
    expect(fmtWeekdayShort("2026-11-08T16:30:00Z")).toBe("Да"); // UTC-ээр ням
    expect(fmtWeekdayShort(ub("2026-11-15", "12:00"))).toBe("Ня");
    expect(fmtMonthYear("2026-11-30T16:30:00Z")).toBe("2026 оны 12-р сар");
    expect(fmtTimeRange(ub(DAY, "09:00"), ub(DAY, "10:30"))).toBe("09:00–10:30");
    expect(fmtTimeRange(ub(DAY, "23:00"), ub("2026-11-12", "01:00"))).toBe("23:00–01:00");
  });
});
