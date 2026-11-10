import { describe, expect, it } from "vitest";

import { countMemberLeads, monitorPeriods, type MonitorOwnedLead } from "@/lib/crm/team-monitor";

const now = new Date("2026-11-09T04:00:00Z"); // Даваа 12:00 УБ

function lead(p: Partial<MonitorOwnedLead>): MonitorOwnedLead {
  return {
    status: "active",
    created_at: "2026-11-01T00:00:00Z",
    received_at: null,
    first_contact_at: "2026-11-01T01:00:00Z",
    first_contact_due_at: null,
    next_step: "Залгах",
    next_step_date: "2026-11-09",
    ...p,
  };
}

describe("monitorPeriods", () => {
  it("долоо хоног, сарыг УБ-ын цагаар тооцно", () => {
    const p = monitorPeriods(now);
    expect(p.todayIso).toBe("2026-11-09");
    expect(p.weekStart.toISOString()).toBe("2026-11-08T16:00:00.000Z");
    expect(p.monthStart.toISOString()).toBe("2026-10-31T16:00:00.000Z");
  });

  it("долоо хоног өмнөх сараас эхэлсэн бол since нь Даваа гараг", () => {
    const p = monitorPeriods(new Date("2026-11-01T04:00:00Z")); // Ням 12:00 УБ
    expect(p.since.toISOString()).toBe("2026-10-25T16:00:00.000Z");
    expect(p.monthStart.toISOString()).toBe("2026-10-31T16:00:00.000Z");
  });

  it("UTC-ээр өмнөх өдөр ч УБ-аар шинэ сар бол шинэ сарыг авна", () => {
    const p = monitorPeriods(new Date("2026-11-30T17:00:00Z")); // 12-р сарын 1, 01:00 УБ
    expect(p.todayIso).toBe("2026-12-01");
    expect(p.monthStart.toISOString()).toBe("2026-11-30T16:00:00.000Z");
  });
});

describe("countMemberLeads", () => {
  const periods = monitorPeriods(now);
  const count = (owned: MonitorOwnedLead[], registered: { created_at: string }[] = []) =>
    countMemberLeads(owned, registered, periods, now, 48);

  it("бүртгэлийг УБ-ын хугацааны хязгаараар тоолно", () => {
    const c = count([], [
      { created_at: "2026-11-08T16:00:00Z" }, // Даваа 00:00 УБ
      { created_at: "2026-11-08T15:59:59Z" }, // Ням 23:59 УБ
      { created_at: "2026-10-31T16:00:00Z" }, // 11-р сарын 1, 00:00 УБ
      { created_at: "2026-10-31T15:59:59Z" }, // 10-р сарын 31 УБ
    ]);
    expect(c.registeredWeek).toBe(1);
    expect(c.registeredMonth).toBe(3);
  });

  it("зөвхөн нээлттэй сэжмийг тоолно", () => {
    const c = count([
      lead({ status: "inactive", next_step_date: "2026-01-01" }),
      lead({ status: "recycled", next_step: null, next_step_date: null }),
      lead({ status: "archived", first_contact_at: null }),
    ]);
    expect(c).toMatchObject({ openOwned: 0, nextStepOverdue: 0, noNextStep: 0, newUncontacted: 0, firstContactOverdue: 0 });
  });

  it("өнөөдрийн алхам хэтрээгүй, өчигдрийнх хэтэрсэн", () => {
    expect(count([lead({ next_step_date: "2026-11-09" })]).nextStepOverdue).toBe(0);
    expect(count([lead({ next_step_date: "2026-11-08" })]).nextStepOverdue).toBe(1);
  });

  it("текстгүй эсвэл огноогүй алхмыг алхамгүйд тооцно", () => {
    expect(count([lead({ next_step: null, next_step_date: null })]).noNextStep).toBe(1);
    expect(count([lead({ next_step: "Залгах", next_step_date: null })]).noNextStep).toBe(1);
    expect(count([lead({ next_step: "  ", next_step_date: "2026-11-10" })]).noNextStep).toBe(1);
    expect(count([lead({})]).noNextStep).toBe(0);
  });

  it("эхний холболтын төлөв", () => {
    const fresh = { status: "new" as const, first_contact_at: null, created_at: "2026-11-09T03:00:00Z" };
    expect(count([lead({ ...fresh, first_contact_due_at: "2026-11-09T05:00:00Z" })])).toMatchObject({
      newUncontacted: 1,
      firstContactOverdue: 0,
    });
    expect(count([lead({ ...fresh, first_contact_due_at: "2026-11-09T03:30:00Z" })])).toMatchObject({
      newUncontacted: 1,
      firstContactOverdue: 1,
    });
    // Хугацаа тавигдаагүй ч босго давсан.
    expect(count([lead({ ...fresh, created_at: "2026-11-05T00:00:00Z", first_contact_due_at: null })]).firstContactOverdue).toBe(1);
    // Холбогдсон шинэ сэжим.
    expect(count([lead({ status: "new", first_contact_due_at: "2026-11-01T00:30:00Z" })])).toMatchObject({
      newUncontacted: 0,
      firstContactOverdue: 0,
    });
  });
});
