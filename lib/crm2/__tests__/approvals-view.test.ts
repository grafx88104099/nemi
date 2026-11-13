import { describe, expect, it } from "vitest";

import {
  approvedToast,
  parseRequestCalls,
  requestCallCounts,
  requestCallPropertyIds,
  requestTargetHref,
  requestTargetLabel,
  splitPending,
  storedCallsNotice,
} from "@/lib/crm2/approvals-view";
import { HIDDEN_CONTACT_LABEL } from "@/lib/crm2/labels";
import { crm2Paths } from "@/lib/crm2/paths";

describe("батлах дэлгэцийн хуваалт", () => {
  it("шийдвэрлэх / миний / бусад", () => {
    const items = [
      { id: "a", canDecide: true, mine: false },
      { id: "b", canDecide: false, mine: true },
      { id: "c", canDecide: true, mine: true },
      { id: "d", canDecide: false, mine: false },
      { id: "e", canDecide: false },
    ];
    const r = splitPending(items);
    expect(r.toDecide.map((x) => x.id)).toEqual(["a", "c"]);
    expect(r.mine.map((x) => x.id)).toEqual(["b"]);
    expect(r.others.map((x) => x.id)).toEqual(["d", "e"]);
  });

  it("хүсэлтийн объектын холбоос", () => {
    const p = crm2Paths("office");
    const base = { propertyId: null, contactId: null, dealId: null };
    expect(requestTargetHref({ kind: "property_status", target: { ...base, propertyId: "p1" } }, p)).toBe("/office/crm/staff/p1");
    expect(requestTargetHref({ kind: "deal_transfer", target: { ...base, propertyId: "p1", dealId: "d1" } }, p)).toBe(
      "/office/crm/staff/p1/deals/d1"
    );
    expect(requestTargetHref({ kind: "contact_transfer", target: { ...base, contactId: "c1" } }, crm2Paths("agent"))).toBe(
      "/agent/crm/contacts/c1"
    );
    expect(requestTargetHref({ kind: "deal_transfer", target: { ...base, dealId: "d1" } }, p)).toBeNull();
  });
});

describe("хүсэлтэд хадгалсан дуудлага", () => {
  const P1 = "11111111-1111-4111-8111-111111111111";
  const P2 = "22222222-2222-4222-8222-222222222222";
  const payload = {
    from_agent: "x",
    to_agent: "y",
    calls: [
      {
        property_id: P2,
        occurred_at: "2026-11-12T03:00:00Z",
        note: "Хоёр дахь",
        result: null,
        next_action: "showing",
        next_action_due: "2026-11-14T02:00:00Z",
        next_action_note: "Өглөө",
        logged_by: "y",
        recorded: { activity_id: "a", deal_id: "d9", task_id: null, deal_created: true, at: "2026-11-13T00:00:00Z" },
      },
      { property_id: P1, occurred_at: "2026-11-11T05:00:00Z", note: "  ", result: "Үнэ асуусан", next_action: "bogus", logged_by: "z" },
      { property_id: P1, occurred_at: "2026-11-12T01:00:00Z", recorded: { skipped: "Хэлцэл хаагдсан", at: "2026-11-13T00:00:00Z" } },
      "junk",
      null,
      { property_id: P1, note: "Цаггүй" },
    ],
  };

  it("цагийн дарааллаар, объект биш/цаггүй мөрийг алгасна", () => {
    const calls = parseRequestCalls(payload, new Map([[P1, "P001"]]), { y: "Саруул" });
    expect(calls.map((c) => c.occurredAt)).toEqual(["2026-11-11T05:00:00Z", "2026-11-12T01:00:00Z", "2026-11-12T03:00:00Z"]);
    const [first, second, third] = calls;
    expect(first).toMatchObject({ propertyId: P1, propertyCode: "P001", note: null, result: "Үнэ асуусан", nextAction: null, outcome: null });
    // Мэдэгдээгүй ажилтны нэр null.
    expect(first.loggedByName).toBeNull();
    expect(second.outcome).toEqual({ kind: "skipped", reason: "Хэлцэл хаагдсан" });
    // Харах эрхгүй хөрөнгө — код null.
    expect(third).toMatchObject({
      propertyCode: null,
      nextAction: "showing",
      nextActionDue: "2026-11-14T02:00:00Z",
      nextActionNote: "Өглөө",
      loggedByName: "Саруул",
      outcome: { kind: "recorded", dealId: "d9", dealCreated: true },
    });
    expect(requestCallCounts(calls)).toEqual({ recorded: 1, skipped: 1 });
  });

  it("payload буруу бол хоосон", () => {
    expect(parseRequestCalls(null, new Map(), {})).toEqual([]);
    expect(parseRequestCalls({ calls: "x" }, new Map(), {})).toEqual([]);
    expect(parseRequestCalls([1, 2], new Map(), {})).toEqual([]);
  });

  it("хөрөнгийн id-г давхардалгүй цуглуулна", () => {
    expect(requestCallPropertyIds(payload).sort()).toEqual([P1, P2].sort());
    expect(requestCallPropertyIds({})).toEqual([]);
  });
});

describe("хүсэлтийн объектын шошго", () => {
  const lookup = {
    propCode: new Map([["p1", "P001"]]),
    dealCode: new Map([["d1", "D001"]]),
    contactLabel: new Map([["c1", "C001 · Бат"]]),
  };

  it("харах эрхтэй объект", () => {
    expect(requestTargetLabel({ kind: "property_status", targetId: "p1", propertyId: "p1" }, lookup)).toEqual({
      label: "P001",
      visible: true,
    });
    expect(requestTargetLabel({ kind: "deal_transfer", targetId: "d1", propertyId: "p1" }, lookup)).toEqual({
      label: "P001 · D001",
      visible: true,
    });
    expect(requestTargetLabel({ kind: "contact_transfer", targetId: "c1", propertyId: null }, lookup)).toEqual({
      label: "C001 · Бат",
      visible: true,
    });
  });

  it("хүсэгч харах эрхгүй: хэлцэл — хөрөнгийн кодоор, харилцагч — эхний дуудлагын хөрөнгөөр", () => {
    expect(requestTargetLabel({ kind: "deal_transfer", targetId: "d2", propertyId: "p1" }, lookup)).toEqual({
      label: "P001 · Хэлцэл",
      visible: false,
    });
    expect(
      requestTargetLabel(
        { kind: "contact_transfer", targetId: "c2", propertyId: null, calls: [{ propertyCode: null }, { propertyCode: "P007" }] },
        lookup
      )
    ).toEqual({ label: `${HIDDEN_CONTACT_LABEL} · P007`, visible: false });
    expect(requestTargetLabel({ kind: "contact_transfer", targetId: "c2", propertyId: null }, lookup)).toEqual({
      label: HIDDEN_CONTACT_LABEL,
      visible: false,
    });
  });

  it("харах эрхгүй объектын холбоос: хэлцэл → хөрөнгийн карт, харилцагч → холбоосгүй", () => {
    const p = crm2Paths("agent");
    const base = { propertyId: null, contactId: null, dealId: null };
    expect(
      requestTargetHref({ kind: "deal_transfer", target: { ...base, propertyId: "p1", dealId: "d1", visible: false } }, p)
    ).toBe("/agent/crm/staff/p1");
    expect(requestTargetHref({ kind: "deal_transfer", target: { ...base, dealId: "d1", visible: false } }, p)).toBeNull();
    expect(requestTargetHref({ kind: "contact_transfer", target: { ...base, contactId: "c1", visible: false } }, p)).toBeNull();
    expect(requestTargetHref({ kind: "contact_transfer", target: { ...base, contactId: "c1", visible: true } }, p)).toBe(
      "/agent/crm/contacts/c1"
    );
  });
});

describe("шийдвэрийн цонхны тайлбар", () => {
  it("дуудлагагүй бол null (ерөнхий тайлбар)", () => {
    expect(storedCallsNotice("approve", 0)).toBeNull();
    expect(storedCallsNotice("reject", undefined)).toBeNull();
    expect(storedCallsNotice("cancel", 0, "X")).toBeNull();
  });

  it("дуудлагын тоо, объектын нэртэй", () => {
    expect(storedCallsNotice("approve", 2)).toContain("2 дуудлага");
    expect(storedCallsNotice("reject", 1)).toContain("1 дуудлага бүртгэгдэхгүй");
    const cancel = storedCallsNotice("cancel", 3, "P001 · Хэлцэл");
    expect(cancel).toContain("«P001 · Хэлцэл»");
    expect(cancel).toContain("3 дуудлага");
  });

  it("батлагдсаны мэдэгдэл: алгассан бол info", () => {
    const calls: string[] = [];
    const t = { success: (m: string) => calls.push(`s:${m}`), info: (m: string) => calls.push(`i:${m}`) };
    approvedToast(0, t);
    approvedToast(2, t);
    expect(calls[0]).toBe("s:Хүсэлт батлагдлаа");
    expect(calls[1]).toMatch(/^i:.*2 дуудлага алгассан/);
  });
});
