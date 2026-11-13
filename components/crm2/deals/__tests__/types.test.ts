import { describe, expect, it } from "vitest";

import {
  activityEditFields,
  activityEditPatch,
  brokerageResponsibleOptions,
  callAgentOptions,
  dealTaskAssignee,
  dealUiSettings,
  workStaffOptions,
} from "@/components/crm2/deals/types";
import { CRM2_SETTING_DEFAULTS } from "@/lib/crm2/settings";
import type { Crm2StaffMember } from "@/lib/crm2/types";

const member = (id: string, roles: string[], team: string | null = null): Crm2StaffMember =>
  ({ profile_id: id, name: id.toUpperCase(), avatar_url: null, team_id: team, team_name: null, roles }) as unknown as Crm2StaffMember;

const directory = [
  member("a", ["agent"], "t1"),
  member("b", ["agent"], "t2"),
  member("lead", ["agent", "team_lead"], "t1"),
  member("fin", ["finance"]),
];

describe("агент сонгогч", () => {
  it("ажлын эрхтэй дүртэйг л жагсаана", () => {
    expect(workStaffOptions(directory, ["agent", "team_lead"]).map((s) => s.id)).toEqual(["a", "b", "lead"]);
  });

  it("дуудлагын агент: менежер бүгд, ахлагч өөрийн баг, агент сонгогчгүй", () => {
    const staff = workStaffOptions(directory, ["agent", "team_lead"]);
    const base = { profileId: "lead", isManager: false, isTeamLead: true, teamId: "t1" };
    expect(callAgentOptions(staff, base)?.map((s) => s.id)).toEqual(["a", "lead"]);
    expect(callAgentOptions(staff, { ...base, isManager: true })?.length).toBe(3);
    expect(callAgentOptions(staff, { ...base, isTeamLead: false })).toBeNull();
    expect(callAgentOptions(staff, null)).toBeNull();
  });

  it("ганцаараа багтай ахлагчид сонгогч хэрэггүй", () => {
    const staff = workStaffOptions([member("lead", ["team_lead"], "t9")], ["team_lead"]);
    expect(callAgentOptions(staff, { profileId: "lead", isManager: false, isTeamLead: true, teamId: "t9" })).toBeNull();
  });
});

describe("клиентийн тохиргоо", () => {
  it("цуцлах шалтгааныг сонголт болгоно, «other» багтана", () => {
    const ui = dealUiSettings(CRM2_SETTING_DEFAULTS);
    expect(ui.foreignDeal).toBe("deny");
    expect(ui.requireFeedback).toBe(true);
    expect(ui.cancelReasons.some((o) => o.value === "other")).toBe(true);
    expect(ui.openPropertyStatuses).toEqual(["active"]);
  });
});

describe("хэлцлийн ажлын хариуцагч", () => {
  const opts = [{ id: "a" }, { id: "lead" }];
  it("өөрийн хэлцэл → өөрөө; сонгогчид байгаа агент → тэр агент", () => {
    expect(dealTaskAssignee("me", "me", null)).toBe("me");
    expect(dealTaskAssignee("a", "lead", opts)).toBe("a");
  });
  it("өөр хүнд оноох эрхгүй бол өөр дээрээ", () => {
    expect(dealTaskAssignee("x", "me", null)).toBe("me");
    expect(dealTaskAssignee("x", "lead", opts)).toBe("lead");
  });
  it("хэлцлийн агент тодорхойгүй бол өөрөө", () => {
    expect(dealTaskAssignee(null, "me", opts)).toBe("me");
  });
});

describe("гэрээний хариуцагч сонгогч", () => {
  const staff = [
    { id: "me", name: "Би", teamId: "t1" },
    { id: "mate", name: "Багийн", teamId: "t1" },
    { id: "other", name: "Өөр баг", teamId: "t2" },
    { id: "listing", name: "Листлэгч", teamId: "t3" },
  ];
  const ids = (ctx: Parameters<typeof brokerageResponsibleOptions>[1]) =>
    brokerageResponsibleOptions(staff, ctx, ["listing", null, undefined]).map((s) => s.id);

  it("менежер — бүгд", () => {
    expect(ids({ profileId: "me", isManager: true, isTeamLead: false, teamId: "t1" })).toEqual(["me", "mate", "other", "listing"]);
  });

  it("ахлагч — баг + үүргийн агент; агент — өөрөө + үүргийн агент", () => {
    expect(ids({ profileId: "me", isManager: false, isTeamLead: true, teamId: "t1" })).toEqual(["me", "mate", "listing"]);
    expect(ids({ profileId: "me", isManager: false, isTeamLead: false, teamId: "t1" })).toEqual(["me", "listing"]);
    expect(ids(null)).toEqual(["listing"]);
  });
});

describe("дуудлага/үзүүлэлт засах", () => {
  it("төрөл, төлвөөр харагдах талбар", () => {
    expect(activityEditFields({ kind: "call", showing_status: null })).toEqual({ occurredAt: true, feedback: false, result: true, note: true });
    expect(activityEditFields({ kind: "showing", showing_status: "scheduled" })).toEqual({
      occurredAt: false,
      feedback: false,
      result: false,
      note: true,
    });
    expect(activityEditFields({ kind: "showing", showing_status: "shown" })).toEqual({ occurredAt: true, feedback: true, result: true, note: true });
    expect(activityEditFields({ kind: "showing", showing_status: "no_show" }).occurredAt).toBe(false);
  });

  const initial = {
    occurred_at: "2026-11-13T06:30:00Z", // УБ 14:30
    note: "Анхны",
    result: null,
    feedback: "Таалагдсан",
    agent_id: "a1",
  };

  it("өөрчлөгдөөгүй бол хоосон", () => {
    expect(
      activityEditPatch(initial, { occurredAt: "2026-11-13T14:30", note: " Анхны ", result: "", feedback: "Таалагдсан", agentId: "a1" })
    ).toEqual({});
    // Харагдаагүй талбар (undefined) хөндөгдөхгүй.
    expect(activityEditPatch(initial, {})).toEqual({});
  });

  it("зөвхөн өөрчлөгдсөн талбар; хоосолсон текст → null", () => {
    expect(
      activityEditPatch(initial, { occurredAt: "2026-11-13T15:00", note: "", result: "Үнэ асуусан", feedback: "Таалагдсан", agentId: "a2" })
    ).toEqual({ occurred_at: "2026-11-13T15:00", note: null, result: "Үнэ асуусан", agent_id: "a2" });
    // Хоосон цаг/агентыг илгээхгүй (заавал утгатай талбар).
    expect(activityEditPatch(initial, { occurredAt: "", agentId: "" })).toEqual({});
  });
});
