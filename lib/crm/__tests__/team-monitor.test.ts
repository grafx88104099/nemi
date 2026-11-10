import { describe, expect, it } from "vitest";

import {
  MONITOR_METRIC_KEYS,
  countMemberLeads,
  countMemberOpportunities,
  groupTeamProgress,
  inTeamProgressScope,
  isAgentStaff,
  monitorPeriods,
  sumMonitorMetrics,
  type MonitorMetrics,
  type MonitorOwnedLead,
} from "@/lib/crm/team-monitor";

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

function metrics(p: Partial<MonitorMetrics> = {}): MonitorMetrics {
  return {
    registeredWeek: 0,
    registeredMonth: 0,
    openOwned: 0,
    newUncontacted: 0,
    firstContactOverdue: 0,
    nextStepOverdue: 0,
    noNextStep: 0,
    openOpps: 0,
    wonOpps: 0,
    ...p,
  };
}

describe("countMemberOpportunities", () => {
  it("нээлттэй ба хаагдсан (won) боломжийг тусад нь тоолно", () => {
    expect(countMemberOpportunities([{ state: "open" }, { state: "won" }, { state: "open" }, { state: "lost" }])).toEqual({
      openOpps: 2,
      wonOpps: 1,
    });
    expect(countMemberOpportunities([])).toEqual({ openOpps: 0, wonOpps: 0 });
  });
});

describe("sumMonitorMetrics", () => {
  it("бүх үзүүлэлтийг нэмнэ, хоосон бол 0", () => {
    expect(sumMonitorMetrics([])).toEqual(metrics());
    const total = sumMonitorMetrics([
      metrics({ registeredWeek: 1, openOwned: 3, nextStepOverdue: 1, openOpps: 2 }),
      metrics({ registeredWeek: 2, registeredMonth: 5, noNextStep: 4, wonOpps: 1 }),
    ]);
    expect(total).toEqual(
      metrics({ registeredWeek: 3, registeredMonth: 5, openOwned: 3, nextStepOverdue: 1, noNextStep: 4, openOpps: 2, wonOpps: 1 })
    );
  });

  it("гишүүний бусад талбарыг нийлбэрт оруулахгүй", () => {
    const total = sumMonitorMetrics([{ ...metrics({ openOwned: 1 }), profileId: "a" } as MonitorMetrics]);
    expect(Object.keys(total).sort()).toEqual([...MONITOR_METRIC_KEYS].sort());
  });
});

describe("isAgentStaff / inTeamProgressScope", () => {
  it("агент, ахлагч, профайлаараа агент бол агент", () => {
    expect(isAgentStaff(["agent"], "office_admin")).toBe(true);
    expect(isAgentStaff(["team_lead"], null)).toBe(true);
    expect(isAgentStaff([], "agent")).toBe(true);
    expect(isAgentStaff(["sales_director", "ceo"], "office_admin")).toBe(false);
    expect(isAgentStaff(null, null)).toBe(false);
  });

  const teams = new Set(["t1"]);
  it("бүртгэлтэй багийн гишүүн дүрээс үл хамааран орно", () => {
    expect(inTeamProgressScope({ teamId: "t1", roles: ["finance"], userRole: "office_admin" }, teams)).toBe(true);
  });
  it("багт ороогүй бол зөвхөн агент орно", () => {
    expect(inTeamProgressScope({ teamId: null, roles: ["agent"], userRole: "agent" }, teams)).toBe(true);
    expect(inTeamProgressScope({ teamId: null, roles: ["ceo"], userRole: "office_admin" }, teams)).toBe(false);
    // Устсан/үл мэдэгдэх баг — агент бол хуваарилагдаагүйд, бусад хасагдана.
    expect(inTeamProgressScope({ teamId: "gone", roles: ["agent"], userRole: "agent" }, teams)).toBe(true);
    expect(inTeamProgressScope({ teamId: "gone", roles: ["finance"], userRole: "office_admin" }, teams)).toBe(false);
  });
});

describe("groupTeamProgress", () => {
  type M = MonitorMetrics & { id: string; teamId: string | null };
  const m = (id: string, teamId: string | null, p: Partial<MonitorMetrics> = {}): M => ({ id, teamId, ...metrics(p) });
  const teams = [
    { id: "t1", name: "А" },
    { id: "t2", name: "Б" },
    { id: "t3", name: "В" },
  ];

  it("гишүүдийг багаар бүлэглэж, дарааллыг хадгална", () => {
    const g = groupTeamProgress(teams, [m("a", "t2"), m("b", "t1"), m("c", "t2"), m("d", null)]);
    expect(g.teams.map((t) => t.team.id)).toEqual(["t1", "t2", "t3"]);
    expect(g.teams.map((t) => t.members.map((x) => x.id))).toEqual([["b"], ["a", "c"], []]);
    expect(g.unassigned.members.map((x) => x.id)).toEqual(["d"]);
  });

  it("үл мэдэгдэх багийн гишүүн хуваарилагдаагүйд орно", () => {
    const g = groupTeamProgress(teams, [m("a", "gone")]);
    expect(g.unassigned.members.map((x) => x.id)).toEqual(["a"]);
    expect(g.teams.every((t) => t.members.length === 0)).toBe(true);
  });

  it("баг, хуваарилагдаагүй, оффисын нийт дүн; гишүүн бүр нэг л удаа", () => {
    const g = groupTeamProgress(teams, [
      m("a", "t1", { openOwned: 2, nextStepOverdue: 1 }),
      m("b", "t1", { openOwned: 1, wonOpps: 1 }),
      m("c", "t2", { registeredWeek: 4 }),
      m("d", null, { openOwned: 5, noNextStep: 2 }),
    ]);
    expect(g.teams[0].totals).toEqual(metrics({ openOwned: 3, nextStepOverdue: 1, wonOpps: 1 }));
    expect(g.teams[1].totals).toEqual(metrics({ registeredWeek: 4 }));
    expect(g.teams[2].totals).toEqual(metrics());
    expect(g.unassigned.totals).toEqual(metrics({ openOwned: 5, noNextStep: 2 }));
    expect(g.totals).toEqual(sumMonitorMetrics([...g.teams.map((t) => t.totals), g.unassigned.totals]));
    expect(g.totals).toEqual(metrics({ openOwned: 8, nextStepOverdue: 1, wonOpps: 1, registeredWeek: 4, noNextStep: 2 }));
  });

  it("баггүй оффист бүгд хуваарилагдаагүй", () => {
    const g = groupTeamProgress([], [m("a", null, { openOpps: 1 }), m("b", null)]);
    expect(g.teams).toEqual([]);
    expect(g.unassigned.members).toHaveLength(2);
    expect(g.totals.openOpps).toBe(1);
  });
});
