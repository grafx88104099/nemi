import { describe, expect, it } from "vitest";
import { getRedirectUrl, unstable_getResponseFromNextConfig } from "next/experimental/testing/server";

import nextConfig from "@/next.config";
import { crmNavItems, fallbackCrm2Context } from "@/components/crm2/shell/menu";
import type { Crm2Context } from "@/lib/crm2/types";

const ME = "11111111-1111-4111-8111-111111111111";

function ctx(p: Partial<Crm2Context> = {}): Crm2Context {
  return {
    profileId: ME,
    officeId: "o1",
    staffId: "s1",
    roles: ["agent"],
    teamId: null,
    isMember: true,
    isManager: false,
    isTeamLead: false,
    isOfficeAdmin: false,
    canWork: true,
    canApprove: false,
    hasFinance: false,
    canManageSettings: false,
    canManageAccessSettings: false,
    ...p,
  };
}

const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe("CRM цэс", () => {
  it("агент: үндсэн 4 + хувийн тохиргоо, зурагны дарааллаар", () => {
    const { primary, secondary } = crmNavItems("agent", ctx(), { canOpenTeam: false });
    expect(labels(primary)).toEqual(["Staff", "Харилцагчид", "Миний ажил", "Хүлээлгийн үйлчлүүлэгч", "Тохиргоо"]);
    expect(primary.map((i) => i.href)).toEqual([
      "/agent/crm/staff",
      "/agent/crm/contacts",
      "/agent/crm/my-work",
      "/agent/crm/waitlist",
      "/agent/crm/settings",
    ]);
    expect(labels(secondary)).toEqual(["Календарь"]);
  });

  it("менежер: бүх 7 хэсэг, оффист тохиргоотой", () => {
    const { primary } = crmNavItems("office", ctx({ isManager: true, roles: ["sales_director"] }), { canOpenTeam: true });
    expect(labels(primary)).toEqual([
      "Staff",
      "Харилцагчид",
      "Миний ажил",
      "Хүлээлгийн үйлчлүүлэгч",
      "Санхүү",
      "Тайлан",
      "Тохиргоо",
    ]);
  });

  it("оффисын энгийн агентад санхүү, тайлан, тохиргоо харагдахгүй", () => {
    const { primary } = crmNavItems("office", ctx(), { canOpenTeam: false });
    expect(labels(primary)).toEqual(["Staff", "Харилцагчид", "Миний ажил", "Хүлээлгийн үйлчлүүлэгч"]);
  });

  it("санхүүгийн эрхтэнд санхүү ба тайлан; ахлагчид тайлан", () => {
    expect(labels(crmNavItems("office", ctx({ hasFinance: true }), { canOpenTeam: false }).primary)).toEqual(
      expect.arrayContaining(["Санхүү", "Тайлан"])
    );
    const lead = labels(crmNavItems("agent", ctx({ isTeamLead: true }), { canOpenTeam: true }).primary);
    expect(lead).toContain("Тайлан");
    expect(lead).not.toContain("Санхүү");
  });

  it("туслах: Миний баг (панелиар ялгаатай зам), Батлах зөвхөн батлах эрхтэнд", () => {
    const agent = crmNavItems("agent", ctx({ canApprove: true }), { canOpenTeam: true }).secondary;
    expect(agent.map((i) => i.href)).toEqual(["/agent/crm/calendar", "/agent/crm/team/monitor", "/agent/crm/approvals"]);
    expect(agent[1].matchPrefix).toBe("/agent/crm/team");
    const office = crmNavItems("office", ctx(), { canOpenTeam: true }).secondary;
    expect(office.map((i) => i.href)).toEqual(["/office/crm/calendar", "/office/crm/teams"]);
  });

  it("батлах эрхгүй гишүүнд өөрийн хүсэлтийн холбоос (нөөц дүрээр бол үгүй)", () => {
    const member = crmNavItems("agent", ctx(), { canOpenTeam: false, canOpenRequests: true }).secondary;
    expect(member.map((i) => [i.label, i.href])).toEqual([
      ["Календарь", "/agent/crm/calendar"],
      ["Миний хүсэлт", "/agent/crm/approvals"],
    ]);
    const approver = crmNavItems("office", ctx({ canApprove: true }), { canOpenTeam: false, canOpenRequests: true }).secondary;
    expect(labels(approver)).toEqual(["Календарь", "Батлах"]);
    expect(labels(crmNavItems("agent", ctx(), { canOpenTeam: false }).secondary)).toEqual(["Календарь"]);
  });

  it("crm2_my_context уншигдаагүй үед дүрээр хамгийн бага эрх, батлахгүй", () => {
    const f = fallbackCrm2Context({ profileId: ME, officeId: "o1", staffId: "s1", roles: ["ceo"], teamId: null });
    expect(f).toMatchObject({ isMember: true, isManager: true, canApprove: false, hasFinance: false });
    expect(fallbackCrm2Context({ profileId: ME, officeId: "o1", staffId: "s1", roles: ["team_lead"], teamId: "t" }).isTeamLead).toBe(
      true
    );
  });
});

async function redirectOf(path: string): Promise<string | null> {
  const res = await unstable_getResponseFromNextConfig({ url: `https://nemi.test${path}`, nextConfig });
  if (res.status !== 307) return null;
  const url = getRedirectUrl(res);
  return url ? url.replace("https://nemi.test", "") : null;
}

describe("хуучин CRM-ийн хуудасны чиглүүлэлт", () => {
  it.each([
    ["/agent/leads", "/agent/crm/contacts"],
    ["/agent/leads/abc", "/agent/crm/contacts"],
    ["/agent/crm/leads/abc", "/agent/crm/contacts"],
    ["/office/crm/leads", "/office/crm/contacts"],
    ["/agent/crm/listings", "/agent/crm/staff"],
    ["/office/crm/properties/p1", "/office/crm/staff"],
    ["/agent/crm/pipeline/o1", "/agent/crm/staff"],
    ["/office/crm/pipeline", "/office/crm/staff"],
    ["/office/crm/deals/o1", "/office/crm/staff"],
    ["/agent/crm/transactions", "/agent/crm/staff"],
    ["/agent/crm/pool", "/agent/crm/staff"],
    ["/agent/crm/links", "/agent/crm/staff"],
    ["/office/crm/disputes", "/office/crm/staff"],
    ["/office/crm/contacts/merge", "/office/crm/contacts"],
    ["/agent/crm/commissions/c1", "/agent/crm/finance"],
    ["/office/crm/rentals/invoices/1/print", "/office/crm/finance"],
    ["/office/crm/aml", "/office/crm/finance"],
    ["/office/crm/quality/kpi", "/office/crm/reports"],
    ["/office/crm/vitals", "/office/crm/reports"],
    ["/agent/crm/worklists/vitals", "/agent/crm/reports"],
    ["/agent/crm/worklists/leaderboard", "/agent/crm/reports"],
    ["/agent/crm/worklists", "/agent/crm/my-work"],
    ["/agent/crm/worklists/abc", "/agent/crm/my-work"],
    ["/agent/crm/week", "/agent/crm/calendar"],
    ["/office/crm/week/p1/review", "/office/crm/calendar"],
    ["/agent/crm/team/123", "/agent/crm/team/monitor"],
    ["/office/crm/settings/zones", "/office/crm/settings"],
    ["/office/crm/settings/budget", "/office/crm/settings"],
    ["/c/tok", "/"],
    ["/q/code", "/"],
  ])("%s → %s", async (from, to) => {
    expect(await redirectOf(from)).toBe(to);
  });

  it("хайлтын параметр дамжина", async () => {
    expect(await redirectOf("/agent/crm/leads?status=new")).toBe("/agent/crm/contacts?status=new");
  });

  it.each([
    "/agent/crm",
    "/agent/crm/staff",
    "/agent/crm/contacts/abc",
    "/office/crm/contacts",
    "/office/crm/finance",
    "/office/crm/reports",
    "/agent/crm/calendar",
    "/agent/crm/team/monitor",
    "/office/crm/teams",
    "/office/crm/teams/progress",
    "/office/crm/settings",
    "/office/crm/settings/staff",
    "/office/crm/settings/branches",
    "/office/crm/notifications",
    "/agent/listings",
    // Шинэ CRM-ийн дэлгэцүүд.
    "/agent/crm/staff/new",
    "/office/crm/staff/abc",
    "/agent/crm/staff/abc/edit",
    "/office/crm/staff/abc/deals/def",
    "/office/crm/contacts/abc",
    "/agent/crm/my-work",
    "/office/crm/waitlist",
    "/agent/crm/finance",
    "/agent/crm/reports",
    "/agent/crm/approvals",
    "/office/crm/approvals",
    "/agent/crm/settings",
    "/office/crm/settings/policies",
    "/office/crm/calendar",
    "/office/crm/teams/abc",
  ])("дахин ашигласан зам чиглүүлэгдэхгүй: %s", async (path) => {
    expect(await redirectOf(path)).toBeNull();
  });
});
