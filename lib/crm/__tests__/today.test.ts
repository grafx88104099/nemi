import { describe, expect, it } from "vitest";

import {
  applySnoozes,
  canSnooze,
  clockLabel,
  dailyBlocks,
  dayCloseChecklist,
  DEFAULT_DAILY_NORMS,
  normalizeDailyNorms,
  normalizeRhythm,
  normalizeTodaySettings,
  pipelineRevenue,
  slaClock,
  snoozeError,
  sortTodayItems,
  stageBucket,
  ubDayBounds,
  ubHour,
  ubIso,
  ubWeekday,
  type TodayItem,
} from "@/lib/crm/today";

function item(p: Partial<TodayItem> & Pick<TodayItem, "kind" | "id">): TodayItem {
  return {
    key: `${p.kind}:${p.id}`,
    title: p.id,
    subtitle: null,
    href: "/",
    dueAt: null,
    dueDate: null,
    overdue: false,
    action: "open",
    contactId: null,
    leadId: null,
    opportunityId: null,
    grade: null,
    leadIsNew: false,
    phone: null,
    ...p,
  };
}

describe("УБ цаг", () => {
  it("Ням 23:30 УБ = Ням, Даваа 00:10 УБ = Даваа", () => {
    expect(ubWeekday(new Date("2026-11-08T15:30:00Z"))).toBe(7);
    expect(ubWeekday(new Date("2026-11-08T16:10:00Z"))).toBe(1);
    expect(ubIso(new Date("2026-11-08T16:10:00Z"))).toBe("2026-11-09");
    expect(ubHour(new Date("2026-11-09T01:00:00Z"))).toBe(9);
  });
  it("өдрийн хил UTC-аар", () => {
    expect(ubDayBounds("2026-11-09")).toEqual({ start: "2026-11-08T16:00:00.000Z", end: "2026-11-09T16:00:00.000Z" });
  });
});

describe("Өнөөдрийн дараалал (R16)", () => {
  it("эхний холболт → хэтэрсэн алхам → эргэх холбоо → даалгавар → өнөөдрийн алхам", () => {
    const sorted = sortTodayItems([
      item({ kind: "task", id: "t1", dueAt: "2026-11-09T02:00:00Z" }),
      item({ kind: "showing", id: "s1", dueAt: "2026-11-09T01:00:00Z" }),
      item({ kind: "lead_step", id: "l-today", dueDate: "2026-11-09" }),
      item({ kind: "lead_step", id: "l-over", dueDate: "2026-11-05", overdue: true }),
      item({ kind: "feedback", id: "f1", dueAt: "2026-11-08T01:00:00Z" }),
      item({ kind: "sla", id: "sla", dueAt: "2026-11-09T03:00:00Z" }),
      item({ kind: "task", id: "t-over", dueAt: "2026-11-07T02:00:00Z", overdue: true }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["sla", "l-over", "l-today", "f1", "t-over", "t1", "s1"]);
  });

  it("хойшлуулалт: эхний холболтыг хэзээ ч нуухгүй, хугацаа дууссан хойшлуулалт үйлчлэхгүй", () => {
    const now = new Date("2026-11-09T02:00:00Z");
    const items = [item({ kind: "sla", id: "a" }), item({ kind: "task", id: "b" }), item({ kind: "lead_step", id: "c" })];
    const r = applySnoozes(
      items,
      [
        { item_kind: "sla", item_id: "a", until: "2026-11-09T05:00:00Z" },
        { item_kind: "task", item_id: "b", until: "2026-11-09T05:00:00Z" },
        { item_kind: "lead_step", item_id: "c", until: "2026-11-09T01:00:00Z" },
      ],
      now
    );
    expect(r.visible.map((i) => i.id)).toEqual(["a", "c"]);
    expect(r.snoozed.map((i) => i.id)).toEqual(["b"]);
    expect(canSnooze("accept")).toBe(false);
  });

  it("хойшлуулах дүрэм тохиргооноос", () => {
    const s = normalizeTodaySettings({ snooze_hours: [3, 1, "24", 0, -2], snooze_max_per_day: 2 });
    expect(s.snoozeHours).toEqual([1, 3, 24]);
    expect(snoozeError("sla", 1, s, 0)).toMatch(/хойшлуулах боломжгүй/);
    expect(snoozeError("task", 5, s, 0)).toMatch(/жагсаалтаас/);
    expect(snoozeError("task", 3, s, 2)).toMatch(/дээд тоо/);
    expect(snoozeError("task", 3, s, 1)).toBeNull();
  });

  it("SLA тоолуур: Даваа 10:00 УБ сэжим, 10:15 хугацаа", () => {
    const due = "2026-11-09T02:15:00Z";
    expect(slaClock(due, new Date("2026-11-09T02:00:00Z"), 10)).toEqual({ minutesLeft: 15, overdue: false, tone: "green" });
    expect(slaClock(due, new Date("2026-11-09T02:07:00Z"), 10).tone).toBe("amber");
    const late = slaClock(due, new Date("2026-11-09T02:50:00Z"), 10);
    expect(late.overdue).toBe(true);
    expect(clockLabel(late.minutesLeft)).toBe("35 мин хэтэрсэн");
    expect(clockLabel(130)).toBe("2 ц 10 мин үлдсэн");
  });
});

describe("§6.22 / §6.23", () => {
  it("хэмнэл гариг бүрээр, хоосон утгыг шүүнэ", () => {
    const r = normalizeRhythm({ "1": ["Долоо хоногийн хурал", " ", 5], "6": "x" });
    expect(r[1]).toEqual(["Долоо хоногийн хурал"]);
    expect(r[6]).toEqual([]);
    expect(r[7]).toEqual([]);
  });

  it("4 блок нормтой, норм 0 бол шаардлагагүй", () => {
    const n = normalizeDailyNorms({ client_meaningful_contacts: 5, property_listings: 0, bogus: 3 });
    expect(n.client_meaningful_contacts).toBe(5);
    expect(n.prospecting_new_opps).toBe(DEFAULT_DAILY_NORMS.prospecting_new_opps);
    const b = dailyBlocks(
      { newOpportunities: 0, meaningfulContacts: 6, meetings: 0, showings: 1, listingsActivated: 0, closingActions: 2 },
      n
    );
    expect(b.map((x) => x.label)).toEqual(["Идэвхтэй хайлт", "Харилцагч", "Үл хөдлөх", "Хаалт"]);
    expect(b[0].metrics[0].met).toBe(false);
    expect(b[1].metrics[0].met).toBe(true);
    expect(b[2].metrics[1].met).toBe(true); // норм 0
  });

  it("өдрийн хаалтын шалгалт", () => {
    const c = dayCloseChecklist({ activitiesToday: 0, openWithoutNextStep: 2, remainingToday: 0, overdue: 1 });
    expect(c.map((x) => x.ok)).toEqual([false, false, true, false]);
    expect(c[1].hint).toBe("2 бүртгэлд огноо алга");
  });
});

describe("§8.3 урсгал, орлого", () => {
  it("шатны кодыг баганад буулгана (PL-1, PL-2)", () => {
    expect(stageBucket("interested")).toBe("showing");
    expect(stageBucket("showings")).toBe("showing");
    expect(stageBucket("payment_closing")).toBe("closing");
    expect(stageBucket("closing")).toBe("closing");
    expect(stageBucket("qualified")).toBeNull();
    expect(stageBucket("closed_won")).toBeNull();
  });

  it("хүлээгдэж буй ба жинлэсэн цэвэр хөлс; хөлсгүй боломжийг тусад нь тоолно", () => {
    const r = pipelineRevenue([
      { stageCode: "offer", probability: 60, expectedFee: 1_000_000, terminal: false },
      { stageCode: "contract", probability: 80, expectedFee: 2_000_000, terminal: false },
      { stageCode: "showing", probability: 40, expectedFee: null, terminal: false },
      { stageCode: "closed_won", probability: 100, expectedFee: 5_000_000, terminal: true },
    ]);
    expect(r).toEqual({ pending: 3_000_000, weighted: 2_200_000, missingFee: 1 });
  });
});

import { showBottomNav } from "@/lib/crm/today";

describe("UX-6 доод таб", () => {
  it("жагсаалт, самбарт харагдаж, картад нуугдана", () => {
    expect(showBottomNav("/agent/crm")).toBe(true);
    expect(showBottomNav("/agent/crm/leads")).toBe(true);
    expect(showBottomNav("/agent/crm/worklists/hot_stale")).toBe(true);
    expect(showBottomNav("/agent/crm/links")).toBe(true);
    expect(showBottomNav("/agent/crm/leads/123")).toBe(false);
    expect(showBottomNav("/agent/crm/week/2026-11-09/review")).toBe(false);
    expect(showBottomNav("/agent/listings")).toBe(false);
    expect(showBottomNav("/office/crm")).toBe(false);
  });
});
