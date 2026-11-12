import { describe, expect, it } from "vitest";

import {
  COLOR_BY_KEY,
  PERSON_COLORS,
  SOURCE_ICON,
  personColor,
} from "@/components/crm/calendar/colors";
import {
  AGENDA_DAYS,
  CALENDAR_DRAFT_KEY,
  CALENDAR_SOURCES,
  MAX_CALENDAR_PEOPLE,
  PERSON_COLOR_COUNT,
  agendaGroups,
  allDayRange,
  autoCalendarViews,
  calendarDraftItem,
  calendarFetchRange,
  calendarRange,
  calendarSearch,
  calendarShortcut,
  calendarTitle,
  clickCreateRange,
  dayRangeLabel,
  defaultCreateRange,
  dragCreateRange,
  dragMoveTimed,
  dropAllowed,
  formTimesToRange,
  hmOf,
  itemPersonId,
  itemTimeLabel,
  itemWhenLabel,
  layoutMonthWeek,
  parseCalendarQuery,
  parsePeopleParam,
  personColorIndex,
  rangeToFormTimes,
  shiftByDays,
  shiftCalendarDate,
  ubAt,
  ubDayEnd,
  ubDayStart,
  withFormAllDay,
  withFormStart,
  type CalendarColorKey,
  type EventFormTimes,
} from "@/lib/crm/calendar-view";
import { weekDays as weekDaysOf } from "@/lib/crm/week";

const COLOR_KEYS: CalendarColorKey[] = [
  "meeting",
  "call",
  "showing",
  "personal",
  "other",
  "task",
  "next_step",
  "opportunity_meeting",
  "viewing",
  "busy",
];

// Бүх оролт бодит UTC агшин; УБ = UTC+8. 2026-11-09 = Даваа, 2026-11-11 = Лхагва.
const DAY = "2026-11-11";
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

function ub(day: string, hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  return ubAt(day, h * 60 + m).toISOString();
}

function timed(key: string, day: string, from: string, to: string, endDay = day) {
  return { key, start: ub(day, from), end: ub(endDay, to), allDay: false };
}

function allDay(key: string, first: string, last = first) {
  return { key, ...allDayRange(first, last), allDay: true };
}

describe("жагсаалт (agenda) харагдац", () => {
  it("сонгосон өдрөөс 14 хоног, 14 хоногоор шилжинэ", () => {
    const r = calendarRange("agenda", DAY);
    expect(r.days).toHaveLength(AGENDA_DAYS);
    expect(r.days[0]).toBe(DAY);
    expect(r.days.at(-1)).toBe("2026-11-24");
    expect(r.from).toBe("2026-11-10T16:00:00.000Z");
    expect(r.to).toBe("2026-11-24T16:00:00.000Z");
    expect(shiftCalendarDate("agenda", DAY, 1)).toBe("2026-11-25");
    expect(shiftCalendarDate("agenda", DAY, -1)).toBe("2026-10-28");
  });

  it("гарчиг ба огнооны мужийн шошго", () => {
    expect(calendarTitle("agenda", DAY)).toBe("11-р сарын 11–24");
    expect(calendarTitle("agenda", "2026-11-25")).toBe("11-р сарын 25 – 12-р сарын 8");
    expect(dayRangeLabel(DAY, DAY)).toBe("11-р сарын 11");
    expect(dayRangeLabel("2026-12-28", "2027-01-10")).toBe("2026 оны 12-р сарын 28 – 2027 оны 1-р сарын 10");
  });
});

describe("автомат харагдац ба уншилтын муж", () => {
  it("утсанд жагсаалт, бусадд 7 хоног; зөвшөөрөгдөөгүй бол эхнийх", () => {
    expect(autoCalendarViews()).toEqual({ phone: "agenda", wide: "week" });
    expect(autoCalendarViews(["day", "week"])).toEqual({ phone: "day", wide: "week" });
    expect(autoCalendarViews(["month", "agenda"])).toEqual({ phone: "agenda", wide: "month" });
  });

  it("view = null бол 7 хоног + жагсаалтын нэгдэл", () => {
    const r = calendarFetchRange(null, "2026-11-15"); // Ням
    expect(r.days[0]).toBe("2026-11-09");
    expect(r.days.at(-1)).toBe("2026-11-28");
    expect(r.days).toHaveLength(20);
    expect(r.from).toBe(ubDayStart("2026-11-09").toISOString());
    expect(r.to).toBe(ubDayEnd("2026-11-28").toISOString());
    expect(calendarFetchRange("month", DAY)).toEqual(calendarRange("month", DAY));
  });

  it("сар + жагсаалтын нэгдэл ч 62 хоногоос хэтрэхгүй", () => {
    const r = calendarFetchRange(null, "2026-11-30", ["month", "agenda"]);
    expect(r.days[0]).toBe("2026-10-26");
    expect(r.days.at(-1)).toBe("2026-12-13");
    expect(Date.parse(r.to) - Date.parse(r.from)).toBeLessThanOrEqual(62 * 86_400_000);
  });
});

describe("URL төлөв", () => {
  const now = new Date("2026-11-10T17:00:00Z"); // УБ 11-11 01:00

  it("харагдац, огноо (УБ-ын өнөөдөр), хүмүүс", () => {
    expect(parseCalendarQuery({}, now)).toEqual({ view: null, date: DAY, people: [] });
    expect(parseCalendarQuery({ view: "agenda", date: "2026-02-30" }, now)).toEqual({ view: "agenda", date: DAY, people: [] });
    expect(parseCalendarQuery({ view: ["month", "day"], date: "2026-12-01" }, now).view).toBe("month");
  });

  it("URL-д байхгүй бол defaults", () => {
    const q = parseCalendarQuery({ view: "year" }, now, { view: "week", date: "2026-11-09" });
    expect(q.view).toBe("week");
    expect(q.date).toBe("2026-11-09");
  });

  it("people: буруу, давхардсаныг хасаж, жижиг үсэг, дээд тоо", () => {
    expect(parsePeopleParam(`${U1.toUpperCase()},bad, ${U1},${U2}`)).toEqual([U1, U2]);
    expect(parsePeopleParam(undefined)).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`);
    expect(parsePeopleParam(many.join(","))).toHaveLength(MAX_CALENDAR_PEOPLE);
  });

  it("calendarSearch бусад параметрийг хадгална", () => {
    expect(calendarSearch("tab=plans&view=week", { view: "month", date: DAY, people: null })).toBe(
      `?tab=plans&view=month&date=${DAY}`
    );
    expect(calendarSearch("view=week&people=x", { people: [] })).toBe("?view=week");
    expect(calendarSearch("", { view: null })).toBe("");
    expect(new URLSearchParams(calendarSearch("", { people: [U1, U2] })).get("people")).toBe(`${U1},${U2}`);
  });
});

describe("товчлол", () => {
  it("Google маягийн үсэг, сум", () => {
    expect(calendarShortcut({ key: "t" })).toEqual({ type: "today" });
    expect(calendarShortcut({ key: "d" })).toEqual({ type: "view", view: "day" });
    expect(calendarShortcut({ key: "w" })).toEqual({ type: "view", view: "week" });
    expect(calendarShortcut({ key: "m" })).toEqual({ type: "view", view: "month" });
    expect(calendarShortcut({ key: "a" })).toEqual({ type: "view", view: "agenda" });
    expect(calendarShortcut({ key: "j" })).toEqual({ type: "shift", step: 1 });
    expect(calendarShortcut({ key: "k" })).toEqual({ type: "shift", step: -1 });
    expect(calendarShortcut({ key: "ArrowRight" })).toEqual({ type: "shift", step: 1 });
    expect(calendarShortcut({ key: "ArrowLeft" })).toEqual({ type: "shift", step: -1 });
    expect(calendarShortcut({ key: "c" })).toEqual({ type: "create" });
  });

  it("кирилл байрлалд физик товчоор, модификатортой бол үгүй", () => {
    expect(calendarShortcut({ key: "е", code: "KeyT" })).toEqual({ type: "today" });
    expect(calendarShortcut({ key: "k", ctrlKey: true })).toBeNull();
    expect(calendarShortcut({ key: "T", shiftKey: true })).toBeNull();
    expect(calendarShortcut({ key: "x" })).toBeNull();
    expect(calendarShortcut({ key: "Enter", code: "Enter" })).toBeNull();
  });
});

describe("хүнээр өнгөлөх", () => {
  it("эзэн, эс бөгөөс сонгосон урилгатай хүн", () => {
    const it0 = { personId: "o", personIds: ["a"] };
    expect(itemPersonId(it0, ["a", "b"])).toBe("a");
    expect(itemPersonId(it0, ["o", "a"])).toBe("o");
    expect(itemPersonId(it0, ["z"])).toBe("o");
  });

  it("байрлалаар тогтвортой өнгө", () => {
    const order = Array.from({ length: 10 }, (_, i) => `p${i}`);
    expect(personColorIndex("p1", order)).toBe(1);
    expect(personColorIndex("p9", order)).toBe(9 % PERSON_COLOR_COUNT);
    expect(personColorIndex("none", order)).toBe(0);
  });

  it("өнгөний толь бүх түлхүүр, эх сурвалжийг хамарна", () => {
    for (const key of COLOR_KEYS) expect(COLOR_BY_KEY[key].block).toBeTruthy();
    for (const s of CALENDAR_SOURCES) expect(SOURCE_ICON[s]).toBeTruthy();
    expect(PERSON_COLORS).toHaveLength(PERSON_COLOR_COUNT);
    expect(personColor(-1)).toBe(PERSON_COLORS[PERSON_COLOR_COUNT - 1]);
  });
});

describe("дарж, чирж үүсгэх", () => {
  it("товшилт: 15 минутаар доош, 1 цаг, шөнө дундаас хэтрэхгүй", () => {
    expect(clickCreateRange(DAY, 9 * 60 + 37)).toEqual({ start: ub(DAY, "09:30"), end: ub(DAY, "10:30") });
    expect(clickCreateRange(DAY, 23 * 60 + 50)).toEqual({ start: ub(DAY, "23:45"), end: ubDayEnd(DAY).toISOString() });
  });

  it("чирэлт: аль ч чиглэлд, хамгийн багадаа 15 минут", () => {
    expect(dragCreateRange(DAY, 10 * 60 + 20, 9 * 60 + 5)).toEqual({ start: ub(DAY, "09:00"), end: ub(DAY, "10:30") });
    expect(dragCreateRange(DAY, 600, 600)).toEqual({ start: ub(DAY, "10:00"), end: ub(DAY, "10:15") });
  });

  it("«Үйл явдал нэмэх»: өнөөдөр дараагийн бүтэн цаг, бусад өдөр 09:00", () => {
    expect(defaultCreateRange(DAY, ub(DAY, "14:20"))).toEqual({ start: ub(DAY, "15:00"), end: ub(DAY, "16:00") });
    expect(defaultCreateRange(DAY, ub(DAY, "23:30"))).toEqual({ start: ub(DAY, "23:00"), end: ubDayEnd(DAY).toISOString() });
    expect(defaultCreateRange("2026-11-13", ub(DAY, "14:20"))).toEqual({
      start: ub("2026-11-13", "09:00"),
      end: ub("2026-11-13", "10:00"),
    });
  });

  it("үүсгэж буй түр зүйл зөөгдөхгүй", () => {
    const d = calendarDraftItem(allDayRange(DAY), true, U1);
    expect(d.key).toBe(CALENDAR_DRAFT_KEY);
    expect(d.allDay).toBe(true);
    expect(d.canMove).toBe(false);
    expect(d.personIds).toEqual([U1]);
  });
});

describe("цагийн торд зөөх", () => {
  const origin = { start: ub(DAY, "09:10"), end: ub(DAY, "10:10") };
  const grab = 9 * 60 + 30;

  it("хөдлөөгүй бол алхамд тааруулахгүй", () => {
    expect(dragMoveTimed(origin, DAY, grab, DAY, grab)).toEqual(origin);
  });

  it("шилжилтийг 15 минутаар тааруулна", () => {
    expect(dragMoveTimed(origin, DAY, grab, DAY, grab + 22)).toEqual({ start: ub(DAY, "09:25"), end: ub(DAY, "10:25") });
    expect(dragMoveTimed(origin, DAY, grab, DAY, grab + 23)).toEqual({ start: ub(DAY, "09:40"), end: ub(DAY, "10:40") });
  });

  it("өөр өдөр рүү (УБ-ын цаг хадгалагдана)", () => {
    expect(dragMoveTimed(origin, DAY, grab, "2026-11-12", grab)).toEqual({
      start: ub("2026-11-12", "09:10"),
      end: ub("2026-11-12", "10:10"),
    });
  });

  it("эхлэлийг өдрийн 00:00–23:45-д багтаана", () => {
    const late = { start: ub(DAY, "22:00"), end: ub(DAY, "23:00") };
    expect(dragMoveTimed(late, DAY, 22 * 60, DAY, 1440)).toEqual({
      start: ub(DAY, "23:45"),
      end: ub("2026-11-12", "00:45"),
    });
    const early = { start: ub(DAY, "01:00"), end: ub(DAY, "02:00") };
    expect(dragMoveTimed(early, DAY, 90, DAY, 0)).toEqual({ start: ub(DAY, "00:00"), end: ub(DAY, "01:00") });
  });

  it("өмнөх өдрөөс үргэлжилсэн зүйлийг хоёр дахь өдрөөс нь барьж зөөнө", () => {
    const night = { start: ub("2026-11-10", "23:00"), end: ub(DAY, "01:00") };
    expect(dragMoveTimed(night, DAY, 30, DAY, 90)).toEqual({ start: ub(DAY, "00:00"), end: ub(DAY, "02:00") });
  });

  it("шөнө дундын дараах хэсгээс барьж зөөхөд цаг гулсахгүй", () => {
    const night = { start: ub("2026-11-10", "23:30"), end: ub(DAY, "00:30") };
    // Зөвхөн өдрөөр: 23:30–00:30 хэвээр, нэг өдөр хойш.
    expect(dragMoveTimed(night, DAY, 15, "2026-11-12", 15)).toEqual({
      start: ub(DAY, "23:30"),
      end: ub("2026-11-12", "00:30"),
    });
    // 15 минут доош.
    expect(dragMoveTimed(night, DAY, 15, DAY, 30)).toEqual({ start: ub("2026-11-10", "23:45"), end: ub(DAY, "00:45") });
    const long = { start: ub("2026-11-10", "23:00"), end: ub(DAY, "01:00") };
    expect(dragMoveTimed(long, DAY, 30, DAY, 45)).toEqual({ start: ub("2026-11-10", "23:15"), end: ub(DAY, "01:15") });
    // Дээш: өмнөх өдөр рүү, зорилтот баганад дор хаяж 15 минут үлдэнэ.
    expect(dragMoveTimed(long, DAY, 30, DAY, 0)).toEqual({ start: ub("2026-11-10", "22:30"), end: ub(DAY, "00:30") });
    const short = { start: ub("2026-11-10", "23:00"), end: ub(DAY, "00:10") };
    expect(dragMoveTimed(short, DAY, 5, "2026-11-12", 5)).toEqual({ start: ub(DAY, "23:00"), end: ub("2026-11-12", "00:10") });
  });

  it("өдрөөр зөөх ба сэжмийн алхмын хориг", () => {
    expect(shiftByDays(allDayRange(DAY), DAY, "2026-11-13")).toEqual(allDayRange("2026-11-13"));
    expect(shiftByDays(origin, DAY, DAY)).toEqual(origin);
    const step = { source: "next_step" as const, canMove: true };
    expect(dropAllowed(step, allDayRange("2026-11-10"), DAY)).toBe(false);
    expect(dropAllowed(step, allDayRange(DAY), DAY)).toBe(true);
    expect(dropAllowed({ source: "event", canMove: true }, allDayRange("2026-11-01"), DAY)).toBe(true);
    expect(dropAllowed({ source: "event", canMove: false }, allDayRange(DAY), DAY)).toBe(false);
  });
});

describe("сарын 7 хоногийн мөр", () => {
  const week = weekDaysOf("2026-11-09");

  it("багтвал бүгд харагдана", () => {
    const l = layoutMonthWeek([timed("a", DAY, "09:00", "10:00"), timed("b", DAY, "11:00", "12:00")], week, 3);
    expect(l.cells[2].timed.map((s) => s.item.key)).toEqual(["a", "b"]);
    expect(l.cells[2].hidden).toBe(0);
    expect(l.cells[2].rowsTop).toBe(0);
  });

  it("багтахгүй бол сүүлийн мөр «+N»", () => {
    const items = ["a", "b", "c", "d"].map((k, i) => timed(k, DAY, `0${i + 1}:00`, `0${i + 1}:30`));
    const c = layoutMonthWeek(items, week, 3).cells[2];
    expect(c.timed).toHaveLength(2);
    expect(c.hidden).toBe(2);
  });

  it("зурвас доор цагтай зүйлс; давсан өдөрт «+N»", () => {
    const items = [allDay("bar", "2026-11-10", "2026-11-12"), ...["a", "b", "c"].map((k) => timed(k, DAY, "09:00", "09:30"))];
    const l = layoutMonthWeek(items, week, 3);
    expect(l.bars.map((b) => b.item.key)).toEqual(["bar"]);
    expect(l.cells[2]).toMatchObject({ rowsTop: 1, hidden: 2 });
    expect(l.cells[2].timed).toHaveLength(1);
    expect(l.cells[1]).toMatchObject({ rowsTop: 1, hidden: 0 });
  });

  it("эгнээ олон бол сүүлийн эгнээний зурвас нуугдана", () => {
    const items = ["w", "x", "y", "z"].map((k) => allDay(k, DAY));
    const l = layoutMonthWeek(items, week, 3);
    expect(l.bars).toHaveLength(2);
    expect(l.cells[2]).toMatchObject({ rowsTop: 2, hidden: 2 });
  });

  it("нэг өдөр давсан бол тэр өдрийг дайрсан сүүлийн эгнээний зурвас бүхэлдээ нуугдана", () => {
    const items = [
      allDay("b1", "2026-11-10", DAY),
      allDay("b2", "2026-11-10", DAY),
      allDay("b3", "2026-11-10", DAY),
      timed("t", DAY, "09:00", "10:00"),
    ];
    const l = layoutMonthWeek(items, week, 3);
    expect(l.bars.map((b) => b.item.key).sort()).toEqual(["b1", "b2"]);
    expect(l.cells[1]).toMatchObject({ rowsTop: 2, hidden: 1 });
    expect(l.cells[2]).toMatchObject({ rowsTop: 2, hidden: 2 });
  });

  it("зөвхөн нуусан зурвас дайрсан өдөрт ч «+N» гарна", () => {
    const items = [
      allDay("A", "2026-11-09", DAY),
      allDay("B", "2026-11-09", DAY),
      allDay("C", "2026-11-10", "2026-11-12"),
      timed("t", "2026-11-10", "09:00", "10:00"),
    ];
    const l = layoutMonthWeek(items, week, 3);
    expect(l.bars.map((b) => b.item.key).sort()).toEqual(["A", "B"]);
    expect(l.cells[1]).toMatchObject({ rowsTop: 2, hidden: 2 });
    expect(l.cells[2]).toMatchObject({ rowsTop: 2, hidden: 1 });
    expect(l.cells[3]).toMatchObject({ rowsTop: 0, timed: [], hidden: 1 });
    expect(l.cells[4]).toMatchObject({ rowsTop: 0, hidden: 0 });
    // Цагтай зүйл багтвал бүгд харагдаж, доор нь «+N».
    const withTimed = layoutMonthWeek([...items, timed("u", "2026-11-12", "09:00", "10:00")], week, 3);
    expect(withTimed.cells[3]).toMatchObject({ rowsTop: 0, hidden: 1 });
    expect(withTimed.cells[3].timed.map((s) => s.item.key)).toEqual(["u"]);
  });
});

describe("жагсаалтын бүлэглэл", () => {
  it("хоосон өдрийг алгасаж, бүтэн өдрийнхийг түрүүлж, шөнө дамнасныг хоёр өдөрт", () => {
    const items = [
      timed("night", DAY, "23:00", "01:00", "2026-11-12"),
      timed("t1", DAY, "10:00", "11:00"),
      allDay("ad", "2026-11-10", DAY),
    ];
    const g = agendaGroups(items, weekDaysOf("2026-11-09"));
    expect(g.map((x) => x.day)).toEqual(["2026-11-10", DAY, "2026-11-12"]);
    expect(g[1].entries.map((e) => e.item.key)).toEqual(["ad", "t1", "night"]);
    expect(g[1].entries[0].allDay).toBe(true);
    expect(g[2].entries[0]).toMatchObject({ allDay: false, continuesBefore: true, startMin: 0, endMin: 60 });
  });
});

describe("цагийн шошго", () => {
  const ev = { source: "event" as const, allDay: false, start: ub(DAY, "14:00"), end: ub(DAY, "15:30") };

  it("жижиг шошго", () => {
    expect(itemTimeLabel(ev)).toBe("14:00–15:30");
    expect(itemTimeLabel({ ...ev, source: "task" })).toBe("14:00");
    expect(itemTimeLabel({ ...ev, ...allDayRange(DAY), allDay: true })).toBe("Бүтэн өдөр");
  });

  it("дэлгэрэнгүйн шошго", () => {
    expect(itemWhenLabel(ev)).toBe("11-р сарын 11, лхагва · 14:00–15:30");
    expect(itemWhenLabel({ ...ev, source: "task" })).toBe("11-р сарын 11, лхагва · 14:00");
    expect(itemWhenLabel({ ...ev, ...allDayRange(DAY), allDay: true })).toBe("11-р сарын 11, лхагва");
    expect(itemWhenLabel({ ...ev, ...allDayRange(DAY, "2026-11-13"), allDay: true })).toBe("11-р сарын 11–13");
    expect(itemWhenLabel({ ...ev, end: ubDayEnd(DAY).toISOString(), start: ub(DAY, "23:00") })).toBe(
      "11-р сарын 11, лхагва · 23:00–00:00"
    );
    expect(itemWhenLabel({ ...ev, start: ub(DAY, "23:00"), end: ub("2026-11-12", "01:00") })).toBe(
      "11-р сарын 11, лхагва 23:00 – 11-р сарын 12, пүрэв 01:00"
    );
  });
});

describe("үйл явдлын маягтын цаг (УБ)", () => {
  const f: EventFormTimes = { allDay: false, startDay: DAY, startTime: "09:00", endDay: DAY, endTime: "10:30" };

  it("минут → HH:MM", () => {
    expect(hmOf(0)).toBe("00:00");
    expect(hmOf(605)).toBe("10:05");
    expect(hmOf(1440)).toBe("00:00");
  });

  it("муж → талбарууд", () => {
    expect(rangeToFormTimes(allDayRange(DAY, "2026-11-13"), true)).toMatchObject({
      allDay: true,
      startDay: DAY,
      endDay: "2026-11-13",
    });
    expect(rangeToFormTimes({ start: ub(DAY, "23:00"), end: ubDayEnd(DAY).toISOString() }, false)).toEqual({
      allDay: false,
      startDay: DAY,
      startTime: "23:00",
      endDay: "2026-11-12",
      endTime: "00:00",
    });
  });

  it("талбарууд → муж эсвэл алдаа", () => {
    expect(formTimesToRange(f)).toEqual({ range: { start: ub(DAY, "09:00"), end: ub(DAY, "10:30") } });
    expect(formTimesToRange({ ...f, endTime: "09:00" })).toEqual({ error: "Дуусах цаг эхлэх цагаас хойш байна." });
    expect(formTimesToRange({ ...f, endTime: "08:00" })).toEqual({ error: "Дуусах цаг эхлэх цагаас хойш байна." });
    expect(formTimesToRange({ ...f, startTime: "25:00" })).toEqual({ error: "Цаг буруу байна." });
    expect(formTimesToRange({ ...f, startDay: "2026-13-01" })).toEqual({ error: "Огноо буруу байна." });
    expect(formTimesToRange({ ...f, allDay: true, endDay: "2026-11-13" })).toEqual({ range: allDayRange(DAY, "2026-11-13") });
    expect(formTimesToRange({ ...f, allDay: true, endDay: "2026-11-10" })).toEqual({
      error: "Дуусах цаг эхлэх цагаас хойш байна.",
    });
    const long = formTimesToRange({ ...f, allDay: true, endDay: "2026-12-15" });
    expect("error" in long && long.error).toContain("31 хоног");
  });

  it("эхлэлийг солиход үргэлжлэх хугацаа хадгалагдана", () => {
    expect(withFormStart(f, DAY, "23:00")).toMatchObject({ startTime: "23:00", endDay: "2026-11-12", endTime: "00:30" });
    expect(withFormStart(f, "2026-11-12", "09:00")).toMatchObject({ endDay: "2026-11-12", endTime: "10:30" });
    const ad = { ...f, allDay: true, endDay: "2026-11-13" };
    expect(withFormStart(ad, "2026-11-20", "09:00")).toMatchObject({ startDay: "2026-11-20", endDay: "2026-11-22" });
    expect(withFormStart(f, "", "09:00")).toMatchObject({ startDay: "", endDay: DAY });
  });

  it("«Бүтэн өдөр»: шөнө дунд дуусах цагтайг тэр өдөр л болгоно, буцаахад сэргээнэ", () => {
    const night = rangeToFormTimes({ start: ub(DAY, "23:00"), end: ubDayEnd(DAY).toISOString() }, false);
    const ad = withFormAllDay(night, true);
    expect(ad).toMatchObject({ allDay: true, startDay: DAY, endDay: DAY });
    expect(formTimesToRange(ad)).toEqual({ range: allDayRange(DAY) });
    expect(withFormAllDay(ad, false)).toMatchObject({ allDay: false, endDay: "2026-11-12", endTime: "00:00" });
    expect(formTimesToRange(withFormAllDay(ad, false))).toEqual({
      range: { start: ub(DAY, "23:00"), end: ubDayEnd(DAY).toISOString() },
    });
    // Шөнө дундаас хойш дуусвал хоёр өдөр хэвээр; ердийн цагт өөрчлөхгүй.
    const late = { ...f, startTime: "22:00", endDay: "2026-11-12", endTime: "01:00" };
    expect(withFormAllDay(late, true)).toMatchObject({ endDay: "2026-11-12" });
    expect(withFormAllDay(f, true)).toMatchObject({ allDay: true, endDay: DAY });
    expect(withFormAllDay(f, false)).toBe(f);
  });
});
