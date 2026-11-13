import { describe, expect, it } from "vitest";

import {
  MONITOR_METRIC_KEYS,
  countMemberMetrics,
  groupTeamProgress,
  holdsPropertyRole,
  inTeamProgressScope,
  isAgentStaff,
  memberPropertyIds,
  monitorPeriods,
  sumMonitorMetrics,
  totalMonitorMetrics,
  type MemberPropertyIds,
  type MonitorActivity,
  type MonitorDeal,
  type MonitorMetrics,
  type MonitorProperty,
} from "@/lib/crm/team-monitor";

const now = new Date("2026-11-09T04:00:00Z"); // Даваа 12:00 УБ

function metrics(p: Partial<MonitorMetrics> = {}): MonitorMetrics {
  return {
    staffActive: 0,
    staffDraft: 0,
    openDeals: 0,
    callsWeek: 0,
    callsMonth: 0,
    showingsScheduled: 0,
    showingsShownMonth: 0,
    confirmedMonth: 0,
    cancelledMonth: 0,
    overdueTasks: 0,
    ...p,
  };
}

function prop(id: string, status: string, roles: Partial<MonitorProperty> = {}): MonitorProperty {
  return { id, status, listing_agent_id: null, contract_agent_id: null, photo_agent_id: null, ...roles };
}

const deal = (p: Partial<MonitorDeal> = {}): MonitorDeal => ({
  agent_id: "me",
  is_open: true,
  confirmed_at: null,
  cancelled_at: null,
  ...p,
});

const act = (p: Partial<MonitorActivity> = {}): MonitorActivity => ({
  agent_id: "me",
  kind: "call",
  occurred_at: "2026-11-09T01:00:00Z",
  showing_status: null,
  ...p,
});

const NO_PROPS: MemberPropertyIds = { active: [], draft: [] };

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

describe("Staff хөрөнгийн үүрэг", () => {
  it("3 үүргийн аль нэг нь бол үүрэгтэй", () => {
    expect(holdsPropertyRole(prop("p", "active", { listing_agent_id: "me" }), "me")).toBe(true);
    expect(holdsPropertyRole(prop("p", "active", { contract_agent_id: "me" }), "me")).toBe(true);
    expect(holdsPropertyRole(prop("p", "active", { photo_agent_id: "me" }), "me")).toBe(true);
    expect(holdsPropertyRole(prop("p", "active", { listing_agent_id: "x" }), "me")).toBe(false);
  });

  it("идэвхтэй ба ноорогийг ялгаж, бусад төлөвийг хасна", () => {
    const rows = [
      prop("a", "active", { listing_agent_id: "me", photo_agent_id: "me" }),
      prop("b", "draft", { contract_agent_id: "me" }),
      prop("c", "sold", { listing_agent_id: "me" }),
      prop("d", "active", { listing_agent_id: "x" }),
    ];
    expect(memberPropertyIds(rows, "me")).toEqual({ active: ["a"], draft: ["b"] });
  });
});

describe("countMemberMetrics", () => {
  const periods = monitorPeriods(now);
  const count = (input: Partial<Parameters<typeof countMemberMetrics>[0]>) =>
    countMemberMetrics({ propertyIds: NO_PROPS, deals: [], activities: [], tasks: [], periods, now, ...input });

  it("хоосон бол бүгд 0", () => {
    expect(count({})).toEqual(metrics());
  });

  it("хэлцэл: нээлттэй, энэ сард баталгаажсан/цуцлагдсан", () => {
    const m = count({
      deals: [
        deal(),
        deal({ is_open: true, confirmed_at: "2026-11-02T00:00:00Z" }),
        deal({ is_open: false, cancelled_at: "2026-11-05T00:00:00Z" }),
        deal({ is_open: false, cancelled_at: "2026-10-20T00:00:00Z" }),
      ],
    });
    expect(m.openDeals).toBe(2);
    expect(m.confirmedMonth).toBe(1);
    expect(m.cancelledMonth).toBe(1);
  });

  it("дуудлага долоо хоног/сараар, үзүүлэлт товлосон ба үзүүлсэн", () => {
    const m = count({
      activities: [
        act({ occurred_at: "2026-11-09T01:00:00Z" }),
        act({ occurred_at: "2026-11-03T01:00:00Z" }),
        act({ occurred_at: "2026-10-30T01:00:00Z" }),
        act({ kind: "showing", showing_status: "scheduled", occurred_at: null }),
        act({ kind: "showing", showing_status: "shown", occurred_at: "2026-11-04T01:00:00Z" }),
        act({ kind: "showing", showing_status: "cancelled", occurred_at: null }),
      ],
    });
    expect(m.callsWeek).toBe(1);
    expect(m.callsMonth).toBe(2);
    expect(m.showingsScheduled).toBe(1);
    expect(m.showingsShownMonth).toBe(1);
  });

  it("товлосон цаг өнгөрсөн ч «үзүүлсэн»-д тооцохгүй", () => {
    const m = count({ activities: [act({ kind: "showing", showing_status: "scheduled", occurred_at: null })] });
    expect(m.showingsShownMonth).toBe(0);
  });

  it("хугацаа хэтэрсэн ажил (хугацаагүйг хасна)", () => {
    const m = count({
      tasks: [
        { assignee_id: "me", due_at: "2026-11-08T00:00:00Z" },
        { assignee_id: "me", due_at: "2026-11-10T00:00:00Z" },
        { assignee_id: "me", due_at: null },
      ],
    });
    expect(m.overdueTasks).toBe(1);
  });

  it("Staff-ийн тоо гишүүний хөрөнгийн id-аас", () => {
    expect(count({ propertyIds: { active: ["a", "b"], draft: ["c"] } })).toMatchObject({ staffActive: 2, staffDraft: 1 });
  });
});

describe("sumMonitorMetrics / totalMonitorMetrics", () => {
  it("бүх үзүүлэлтийг нэмнэ, хоосон бол 0", () => {
    expect(sumMonitorMetrics([])).toEqual(metrics());
    expect(sumMonitorMetrics([metrics({ openDeals: 1, callsWeek: 2 }), metrics({ openDeals: 3 })])).toEqual(
      metrics({ openDeals: 4, callsWeek: 2 })
    );
  });

  it("гишүүний бусад талбарыг нийлбэрт оруулахгүй", () => {
    const total = sumMonitorMetrics([{ ...metrics({ openDeals: 1 }), profileId: "a" } as MonitorMetrics]);
    expect(Object.keys(total).sort()).toEqual([...MONITOR_METRIC_KEYS].sort());
  });

  it("нэг хөрөнгө дээр 2 гишүүн үүрэгтэй бол нийтэд нэг л удаа", () => {
    const total = totalMonitorMetrics([
      { ...metrics({ staffActive: 2, openDeals: 1 }), propertyIds: { active: ["a", "b"], draft: [] } },
      { ...metrics({ staffActive: 1, staffDraft: 1 }), propertyIds: { active: ["a"], draft: ["c"] } },
    ]);
    expect(total.staffActive).toBe(2);
    expect(total.staffDraft).toBe(1);
    expect(total.openDeals).toBe(1);
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
    expect(inTeamProgressScope({ teamId: "gone", roles: ["agent"], userRole: "agent" }, teams)).toBe(true);
    expect(inTeamProgressScope({ teamId: "gone", roles: ["finance"], userRole: "office_admin" }, teams)).toBe(false);
  });
});

describe("groupTeamProgress", () => {
  type M = MonitorMetrics & { id: string; teamId: string | null; propertyIds: MemberPropertyIds };
  const m = (id: string, teamId: string | null, p: Partial<MonitorMetrics> = {}, props = NO_PROPS): M => ({
    id,
    teamId,
    ...metrics(p),
    propertyIds: props,
  });
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

  it("баг, хуваарилагдаагүй, оффисын нийт дүн; Staff давхардалгүй", () => {
    const g = groupTeamProgress(teams, [
      m("a", "t1", { openDeals: 2, staffActive: 1 }, { active: ["p1"], draft: [] }),
      m("b", "t1", { openDeals: 1, staffActive: 1 }, { active: ["p1"], draft: [] }),
      m("c", "t2", { callsWeek: 4 }),
      m("d", null, { overdueTasks: 2, staffActive: 1 }, { active: ["p2"], draft: [] }),
    ]);
    expect(g.teams[0].totals).toEqual(metrics({ openDeals: 3, staffActive: 1 }));
    expect(g.teams[1].totals).toEqual(metrics({ callsWeek: 4 }));
    expect(g.teams[2].totals).toEqual(metrics());
    expect(g.unassigned.totals).toEqual(metrics({ overdueTasks: 2, staffActive: 1 }));
    expect(g.totals).toEqual(metrics({ openDeals: 3, callsWeek: 4, overdueTasks: 2, staffActive: 2 }));
  });

  it("баггүй оффист бүгд хуваарилагдаагүй", () => {
    const g = groupTeamProgress([], [m("a", null, { openDeals: 1 }), m("b", null)]);
    expect(g.teams).toEqual([]);
    expect(g.unassigned.members).toHaveLength(2);
    expect(g.totals.openDeals).toBe(1);
  });
});
