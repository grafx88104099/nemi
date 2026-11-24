import { describe, expect, it } from "vitest";

import {
  blockerLinks,
  canDeleteListings,
  confirmNameMatches,
  decideExistingAccount,
  defaultListingsChoice,
  historyTotal,
  isAlreadyRegisteredError,
  listingsChoiceError,
  mapRemovalError,
  moreCount,
  needsListingsChoice,
  normalizeConfirmName,
  parseRemovalCheck,
  removalOutcome,
  removalSummary,
  type RemovalCheck,
} from "@/lib/office/agent-removal";

const OFFICE = "931b4a39-a38a-442c-9170-ea573522efd0";
const AGENT = "11111111-1111-4111-8111-111111111111";
const T1 = { id: "22222222-2222-4222-8222-222222222222", name: "Бат" };

function check(over: Partial<RemovalCheck> = {}): RemovalCheck {
  return {
    agent: { id: AGENT, name: "Эгшиглэн", status: "active", office_id: OFFICE, has_login: true },
    staff: { id: "33333333-3333-4333-8333-333333333333", is_active: true, offboarding: false },
    blockers: [],
    has_history: false,
    history: {},
    listings: { total: 0, active: 0, linked: 0 },
    leads: 0,
    conversations: 0,
    projects: 0,
    viewings: 0,
    ...over,
  };
}

describe("parseRemovalCheck", () => {
  it("accepts the DB shape", () => {
    const raw = { ...check(), extra: 1 };
    expect(parseRemovalCheck(raw)?.agent.id).toBe(AGENT);
  });
  it("rejects malformed JSON", () => {
    expect(parseRemovalCheck(null)).toBeNull();
    expect(parseRemovalCheck({ agent: { id: AGENT } })).toBeNull();
  });
});

describe("confirm name", () => {
  it("ignores case, extra spaces and Unicode form", () => {
    expect(normalizeConfirmName("  Эгшиглэн   Бат ")).toBe("эгшиглэн бат");
    expect(confirmNameMatches("эгшиглэн", "Эгшиглэн")).toBe(true);
    expect(confirmNameMatches(" ЭГШИГЛЭН ", "Эгшиглэн")).toBe(true);
    // Ө/Ү — combining vs precomposed is unlikely on phones; NFC keeps them equal.
    expect(confirmNameMatches("Өлзий".normalize("NFD"), "Өлзий")).toBe(true);
  });
  it("rejects a different or empty name", () => {
    expect(confirmNameMatches("Эгшиг", "Эгшиглэн")).toBe(false);
    expect(confirmNameMatches("", "")).toBe(false);
    expect(confirmNameMatches("x", null)).toBe(false);
  });
});

describe("listings choice", () => {
  it("is needed only when there is something to move or delete", () => {
    expect(needsListingsChoice(check())).toBe(false);
    expect(needsListingsChoice(check({ listings: { total: 2, active: 1, linked: 0 } }))).toBe(true);
    expect(needsListingsChoice(check({ leads: 1 }))).toBe(true);
    expect(needsListingsChoice(check({ viewings: 1 }))).toBe(true);
  });

  it("defaults to transfer when a target exists, else delete", () => {
    const c = check({ listings: { total: 3, active: 3, linked: 0 } });
    expect(defaultListingsChoice(c, [T1])).toBe("transfer");
    expect(defaultListingsChoice(c, [])).toBe("delete");
    expect(defaultListingsChoice(check(), [T1])).toBeNull();
  });

  it("never deletes listings linked to a Staff property", () => {
    const c = check({ listings: { total: 2, active: 2, linked: 1 } });
    expect(canDeleteListings(c)).toBe(false);
    expect(defaultListingsChoice(c, [])).toBe("transfer");
    expect(listingsChoiceError(c, "delete", null, [T1])).toMatch(/Staff/);
  });

  it("validates the transfer target", () => {
    const c = check({ listings: { total: 1, active: 1, linked: 0 } });
    expect(listingsChoiceError(c, null, null, [T1])).toMatch(/сонгоно/);
    expect(listingsChoiceError(c, "transfer", null, [T1])).toMatch(/Хүлээн авах/);
    expect(listingsChoiceError(c, "transfer", AGENT, [T1])).toMatch(/Өөр/);
    expect(listingsChoiceError(c, "transfer", "44444444-4444-4444-8444-444444444444", [T1])).toMatch(/идэвхтэй/);
    expect(listingsChoiceError(c, "transfer", T1.id, [T1])).toBeNull();
    expect(listingsChoiceError(c, "delete", null, [])).toBeNull();
    expect(listingsChoiceError(check(), null, null, [])).toBeNull();
  });
});

describe("outcome and summary", () => {
  it("archives when CRM history exists, deletes otherwise", () => {
    expect(removalOutcome(check())).toBe("delete");
    expect(removalOutcome(check({ has_history: true, history: { crm2_deals: 2 } }))).toBe("archive");
    // No login → nothing to keep, only the agent card goes.
    expect(removalOutcome(check({ has_history: true, agent: { ...check().agent, has_login: false } }))).toBe("delete");
  });

  it("totals history rows", () => {
    expect(historyTotal(check({ history: { tasks: 3, crm2_history: 4 } }))).toBe(7);
  });

  it("describes a transfer with history", () => {
    const c = check({
      has_history: true,
      history: { crm2_history: 5 },
      listings: { total: 4, active: 3, linked: 0 },
      leads: 2,
      conversations: 1,
    });
    const lines = removalSummary(c, "transfer", T1.name).join("\n");
    expect(lines).toMatch(/4 зар \(3 идэвхтэй\) «Бат»-д шилжинэ/);
    expect(lines).toMatch(/2 лид мөн шилжинэ/);
    expect(lines).toMatch(/1 чат устна/);
    expect(lines).toMatch(/«\(хасагдсан\) Эгшиглэн»/);
    expect(lines).toMatch(/и-мэйл\/утас чөлөөлөгдөнө/);
  });

  it("describes a full delete", () => {
    const lines = removalSummary(check({ listings: { total: 1, active: 1, linked: 0 } }), "delete", null).join("\n");
    expect(lines).toMatch(/1 зар зураг/);
    expect(lines).toMatch(/бүрэн устна/);
    expect(lines).not.toMatch(/хасагдсан/);
  });
});

describe("blocker links", () => {
  it("links each open deal and property role to its Staff card", () => {
    const deals = {
      code: "deals",
      message: "Нээлттэй Staff хэлцэл 3",
      count: 3,
      items: [{ deal_id: "d1", deal_code: "D-0001", property_id: "p1", property_code: "S-0001" }],
    };
    expect(blockerLinks(deals)).toEqual([{ href: "/office/crm/staff/p1/deals/d1", label: "Хэлцэл D-0001 · S-0001" }]);
    expect(moreCount(deals)).toBe(2);

    const roles = {
      code: "property_roles",
      message: "Staff хөрөнгийн үүрэг 1",
      count: 1,
      items: [{ property_id: "p2", property_code: "S-0002", roles: ["listing", "photo"] }],
    };
    expect(blockerLinks(roles)).toEqual([{ href: "/office/crm/staff/p2", label: "S-0002 — листлэгч, зураг" }]);
    expect(moreCount(roles)).toBe(0);
  });

  it("sends CRM-setting blockers to staff settings and has no link for self/admin", () => {
    expect(blockerLinks({ code: "substitute", message: "x" })[0].href).toBe("/office/crm/settings/staff");
    expect(blockerLinks({ code: "self", message: "x" })).toEqual([]);
    expect(blockerLinks({ code: "admin", message: "x" })).toEqual([]);
  });
});

describe("mapRemovalError", () => {
  it("keeps the DB's Mongolian messages and hides technical ones", () => {
    expect(mapRemovalError("CRM: хасагдсан ажилтныг сэргээхгүй")).toBe("хасагдсан ажилтныг сэргээхгүй");
    expect(mapRemovalError("Нээлттэй Staff хэлцэл 2 — өөр агентад шилжүүлнэ үү.")).toMatch(/хэлцэл 2/);
    expect(mapRemovalError("canceling statement due to lock timeout")).toMatch(/завгүй/);
    expect(mapRemovalError('update or delete on table "profiles" violates foreign key constraint')).toMatch(/Холбоотой/);
    expect(mapRemovalError("permission denied for function office_remove_agent")).toMatch(/эрх/);
    expect(mapRemovalError("something odd")).toMatch(/Хасаж чадсангүй/);
    expect(mapRemovalError(undefined)).toMatch(/Хасаж чадсангүй/);
  });
});

describe("decideExistingAccount (add agent with an existing email)", () => {
  const OTHER = "55555555-5555-4555-8555-555555555555";

  it("converts a plain buyer", () => {
    expect(decideExistingAccount({ role: "buyer", officeId: null, agent: null }, OFFICE)).toEqual({ kind: "convert" });
  });

  it("refuses admins and office admins", () => {
    expect(decideExistingAccount({ role: "admin", officeId: null, agent: null }, OFFICE).kind).toBe("refuse");
    expect(decideExistingAccount({ role: "office_admin", officeId: OFFICE, agent: null }, OFFICE).kind).toBe("refuse");
  });

  it("refuses people of another office", () => {
    const r1 = decideExistingAccount({ role: "buyer", officeId: OTHER, agent: null }, OFFICE);
    expect(r1).toMatchObject({ kind: "refuse", error: expect.stringMatching(/өөр оффис/) });
    const r2 = decideExistingAccount(
      { role: "agent", officeId: null, agent: { id: "a", officeId: OTHER, status: "active" } },
      OFFICE
    );
    expect(r2).toMatchObject({ kind: "refuse", error: expect.stringMatching(/өөр оффисын агент/) });
  });

  it("refuses an office-less agent and an already active agent here", () => {
    expect(
      decideExistingAccount({ role: "agent", officeId: null, agent: { id: "a", officeId: null, status: "pending" } }, OFFICE)
    ).toMatchObject({ kind: "refuse", error: expect.stringMatching(/оффисгүй/) });
    expect(
      decideExistingAccount({ role: "agent", officeId: OFFICE, agent: { id: "a", officeId: OFFICE, status: "active" } }, OFFICE)
    ).toMatchObject({ kind: "refuse", error: expect.stringMatching(/идэвхтэй агент/) });
  });

  it("reactivates an inactive or pending agent of this office", () => {
    expect(
      decideExistingAccount({ role: "agent", officeId: OFFICE, agent: { id: "a1", officeId: OFFICE, status: "rejected" } }, OFFICE)
    ).toEqual({ kind: "reactivate", agentId: "a1" });
    expect(
      decideExistingAccount({ role: "buyer", officeId: null, agent: { id: "a2", officeId: OFFICE, status: "pending" } }, OFFICE)
    ).toEqual({ kind: "reactivate", agentId: "a2" });
  });

  it("refuses an account whose CRM staff row was removed", () => {
    expect(decideExistingAccount({ role: "buyer", officeId: null, agent: null, staffRemoved: true }, OFFICE).kind).toBe("refuse");
  });

  it("recognises Supabase's already-registered errors", () => {
    expect(isAlreadyRegisteredError("A user with this email address has already been registered")).toBe(true);
    expect(isAlreadyRegisteredError("Email rate limit exceeded")).toBe(false);
    expect(isAlreadyRegisteredError(undefined)).toBe(false);
  });
});
