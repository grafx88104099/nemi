import { describe, expect, it } from "vitest";

import {
  buildWorklists,
  normalizeWorklistSettings,
  vitalsMatrix,
  vitalsTone,
  worklistCounts,
  worklistLabel,
  type WorklistLead,
} from "@/lib/crm/worklists";
import { normalizeLeaderboardSettings, periodRange, rankLeaderboard } from "@/lib/crm/leaderboard";

const now = new Date("2026-11-09T04:00:00Z"); // Даваа 12:00 УБ
const today = "2026-11-09";

function lead(p: Partial<WorklistLead> & Pick<WorklistLead, "id">): WorklistLead {
  return {
    contactId: `c-${p.id}`,
    contactName: p.id,
    phone: null,
    ownerId: "u1",
    grade: null,
    status: "active",
    createdAt: "2026-11-01T00:00:00Z",
    firstContactAt: "2026-11-01T01:00:00Z",
    firstContactDueAt: null,
    lastContactAt: "2026-11-08T01:00:00Z",
    nextStep: null,
    nextStepDate: null,
    attempts: 0,
    ...p,
  };
}

describe("Ажлын жагсаалт (R15)", () => {
  const s = normalizeWorklistSettings({ hot_stale_days: 3, few_attempts_max: 3, showing_no_feedback_hours: 24 });

  it("сэжим зөв жагсаалтад орно", () => {
    const lists = buildWorklists(
      [
        lead({ id: "new1", status: "new", firstContactAt: null, firstContactDueAt: "2026-11-09T03:00:00Z", attempts: 1 }),
        lead({ id: "hot", grade: "a", lastContactAt: "2026-11-05T00:00:00Z" }),
        lead({ id: "hotFresh", grade: "a", lastContactAt: "2026-11-08T00:00:00Z" }),
        lead({ id: "warm", grade: "b", lastContactAt: "2026-10-20T00:00:00Z" }),
        lead({ id: "over", nextStep: "Залгах", nextStepDate: "2026-11-07" }),
        lead({ id: "noReach", firstContactAt: null, status: "active", attempts: 3 }),
        lead({ id: "closed", status: "inactive", grade: "a", lastContactAt: "2026-10-01T00:00:00Z" }),
      ],
      [
        { id: "sh-old", opportunityId: "o1", contactId: "c9", contactName: "Б", phone: null, ownerId: "u1", doneAt: "2026-11-07T00:00:00Z" },
        { id: "sh-new", opportunityId: "o2", contactId: "c8", contactName: "В", phone: null, ownerId: "u1", doneAt: "2026-11-09T00:00:00Z" },
      ],
      s,
      now,
      today
    );
    expect(lists.new_uncontacted.map((e) => e.id)).toEqual(["new1"]);
    expect(lists.new_uncontacted[0].reason).toBe("Эхний холболтын хугацаа хэтэрсэн");
    expect(lists.few_attempts.map((e) => e.id)).toEqual(["new1"]);
    expect(lists.hot_stale.map((e) => e.id)).toEqual(["hot"]);
    expect(lists.warm_stale.map((e) => e.id)).toEqual(["warm"]);
    expect(lists.overdue_steps.map((e) => e.id)).toEqual(["over"]);
    expect(lists.showing_no_feedback.map((e) => e.id)).toEqual(["sh-old"]);
    expect(lists.showing_no_feedback[0].href).toBe("/agent/crm/pipeline/o1");
    expect(worklistCounts(lists).hot_stale).toBe(1);
  });

  it("оффисын панелийн холбоос, идэвхгүй болгосон жагсаалт", () => {
    const s2 = normalizeWorklistSettings({ disabled: ["warm_stale", "bogus"] });
    const lists = buildWorklists(
      [lead({ id: "warm", grade: "b", lastContactAt: "2026-10-01T00:00:00Z" })],
      [{ id: "sh", opportunityId: "o1", contactId: "c", contactName: "x", phone: null, ownerId: null, doneAt: "2026-11-01T00:00:00Z" }],
      s2,
      now,
      today,
      "/office/crm"
    );
    expect(lists.warm_stale).toHaveLength(0);
    expect(lists.showing_no_feedback[0].href).toBe("/office/crm/deals/o1");
    expect(s2.disabled).toEqual(["warm_stale"]);
  });

  it("шошго тохиргооны босготой", () => {
    expect(worklistLabel("few_attempts", s).label).toBe("3-аас цөөн оролдлого");
    expect(worklistLabel("hot_stale", normalizeWorklistSettings({ hot_stale_days: 5 })).label).toBe("Халуун — 5+ хоног");
  });
});

describe("Эрүүл мэндийн самбар (R20)", () => {
  it("эзэмшигч бүрээр тоолж, босгоор өнгө өгнө", () => {
    const s = normalizeWorklistSettings({ vitals_warn: 2, vitals_alert: 4 });
    const lists = buildWorklists(
      [
        lead({ id: "a", ownerId: "u1", nextStepDate: "2026-11-01" }),
        lead({ id: "b", ownerId: "u1", nextStepDate: "2026-11-02" }),
        lead({ id: "c", ownerId: "u2", nextStepDate: "2026-11-02" }),
        lead({ id: "d", ownerId: null, status: "new", firstContactAt: null }),
      ],
      [],
      s,
      now,
      today
    );
    const rows = vitalsMatrix(lists, [
      { id: "u1", name: "Анар", teamId: "t1", branchId: null },
      { id: "u2", name: "Бат", teamId: "t1", branchId: null },
      { id: "u3", name: "Гэрэл", teamId: "t1", branchId: null },
    ]);
    const u1 = rows.find((r) => r.ownerId === "u1")!;
    expect(u1.counts.overdue_steps).toBe(2);
    expect(rows.find((r) => r.ownerId === "u3")!.total).toBe(0);
    expect(rows.find((r) => r.ownerId === "")!.ownerName).toBe("Эзэмшигчгүй");
    expect(vitalsTone(2, s)).toBe("amber");
    expect(vitalsTone(4, s)).toBe("rose");
    expect(vitalsTone(1, s)).toBe("green");
  });

  it("босго урвуу ирвэл засна", () => {
    const s = normalizeWorklistSettings({ vitals_warn: 9, vitals_alert: 3 });
    expect([s.vitalsWarn, s.vitalsAlert]).toEqual([3, 9]);
  });
});

describe("Тэргүүлэгчид (R22)", () => {
  const base = { team_id: null, branch_id: null };
  it("зөвхөн шалгагдах үр дүнгээр, тэнцвэл ижил байр", () => {
    const s = normalizeLeaderboardSettings({ weights: { meaningful_contact: 1, showing_done: 3, offer: 5, contract: 8, closed_won: 13 } });
    const rows = rankLeaderboard(
      [
        { ...base, agent_id: "a", agent_name: "Анар", meaningful_contacts: 10, showings_done: 0, offers: 0, contracts: 0, closed_won: 0 },
        { ...base, agent_id: "b", agent_name: "Бат", meaningful_contacts: 0, showings_done: 0, offers: 0, contracts: 0, closed_won: 1 },
        { ...base, agent_id: "c", agent_name: "Гэрэл", meaningful_contacts: 1, showings_done: 3, offer: 0, offers: 0, contracts: 0, closed_won: 0 } as never,
        { ...base, agent_id: "d", agent_name: "Дорж", meaningful_contacts: 0, showings_done: 0, offers: 0, contracts: 0, closed_won: 0 },
      ],
      s
    );
    expect(rows.map((r) => [r.name, r.points, r.rank])).toEqual([
      ["Бат", 13, 1],
      ["Анар", 10, 2],
      ["Гэрэл", 10, 2],
    ]);
  });

  it("буруу жинг анхдагчаар орлуулна, 0 оноотойг тохиргоогоор харуулна", () => {
    const s = normalizeLeaderboardSettings({ weights: { offer: -4, contract: "x" }, show_zero: true, tv_refresh_sec: 5 });
    expect(s.weights.offer).toBe(5);
    expect(s.tvRefreshSec).toBe(120);
    const rows = rankLeaderboard(
      [{ ...base, agent_id: "d", agent_name: "Дорж", meaningful_contacts: 0, showings_done: 0, offers: 0, contracts: 0, closed_won: 0 }],
      s
    );
    expect(rows).toHaveLength(1);
  });

  it("хугацаа УБ-аар: долоо хоног Даваагаас, сар 1-нээс", () => {
    expect(periodRange("week", new Date("2026-11-08T15:30:00Z"))).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(periodRange("week", new Date("2026-11-08T16:30:00Z"))).toEqual({ from: "2026-11-09", to: "2026-11-09" });
    expect(periodRange("month", new Date("2026-11-08T16:30:00Z"))).toEqual({ from: "2026-11-01", to: "2026-11-09" });
  });
});
