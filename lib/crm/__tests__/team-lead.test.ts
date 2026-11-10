import { describe, expect, it } from "vitest";

import {
  leadActionFor,
  leadChangeToast,
  parseProposeStatus,
  resolvePendingLead,
  staleProposalError,
} from "@/lib/crm/team-lead";

const ME = "11111111-1111-4111-8111-111111111111";
const ANNA = "22222222-2222-4222-8222-222222222222";
const BOLD = "33333333-3333-4333-8333-333333333333";
const names = new Map([
  [ME, "Би"],
  [ANNA, "Анна"],
]);
const nameOf = (id: string) => names.get(id);

describe("parseProposeStatus", () => {
  it("зөвхөн 'applied' нь шууд томилогдсон", () => {
    expect(parseProposeStatus("applied")).toBe("applied");
    expect(parseProposeStatus("pending")).toBe("pending");
  });

  it("танихгүй утгыг эрх идэвхжээгүй гэж үзнэ", () => {
    expect(parseProposeStatus(null)).toBe("pending");
    expect(parseProposeStatus("APPLIED")).toBe("pending");
  });
});

describe("resolvePendingLead", () => {
  const base = { pending_lead_profile_id: null, lead_proposed_by: null, lead_proposed_at: null };

  it("санал алга бол null", () => {
    expect(resolvePendingLead(base, nameOf, ME)).toBeNull();
  });

  it("нэрийг roster-оос шийдэж, санал болгогчийг тэмдэглэнэ", () => {
    const team = { pending_lead_profile_id: ANNA, lead_proposed_by: ME, lead_proposed_at: "2026-11-10T02:00:00Z" };
    expect(resolvePendingLead(team, nameOf, ME)).toEqual({
      profileId: ANNA,
      name: "Анна",
      proposedBy: { profileId: ME, name: "Би" },
      proposedAt: "2026-11-10T02:00:00Z",
      byViewer: true,
    });
    expect(resolvePendingLead(team, nameOf, ANNA)?.byViewer).toBe(false);
  });

  it("roster-д байхгүй бол ерөнхий нэр; санал болгогчгүй бол цуцлах эрхгүй", () => {
    const team = { ...base, pending_lead_profile_id: BOLD };
    expect(resolvePendingLead(team, nameOf, null)).toEqual({
      profileId: BOLD,
      name: "Хэрэглэгч",
      proposedBy: null,
      proposedAt: null,
      byViewer: false,
    });
  });
});

describe("leadActionFor", () => {
  const empty = { lead: null, brokenLead: null, pendingLead: null };

  it("оффисын админ шууд томилно, бусад нь санал болгоно", () => {
    expect(leadActionFor(ANNA, empty, true)).toBe("appoint");
    expect(leadActionFor(ANNA, empty, false)).toBe("propose");
  });

  it("одоогийн ахлагч, санал болгогдсон хүнд товч харуулахгүй", () => {
    expect(leadActionFor(ANNA, { ...empty, lead: { profileId: ANNA } }, true)).toBeNull();
    expect(leadActionFor(ANNA, { ...empty, pendingLead: { profileId: ANNA } }, true)).toBeNull();
    expect(leadActionFor(ANNA, { ...empty, pendingLead: { profileId: ANNA } }, false)).toBeNull();
  });

  it("санал хүлээгдэж байхад бусад гишүүнийг томилох/санал болгох боломжтой", () => {
    const team = { ...empty, pendingLead: { profileId: BOLD } };
    expect(leadActionFor(ANNA, team, true)).toBe("appoint");
    expect(leadActionFor(ANNA, team, false)).toBe("propose");
  });

  it("ахлагчаар бичигдсэн ч эрхгүй хүнийг зөвхөн оффисын админ засна", () => {
    const team = { ...empty, brokenLead: { profileId: ANNA } };
    expect(leadActionFor(ANNA, team, true)).toBe("appoint");
    expect(leadActionFor(ANNA, team, false)).toBeNull();
    expect(leadActionFor(BOLD, team, false)).toBe("propose");
  });
});

describe("leadChangeToast", () => {
  it("шууд томилсон эсвэл батлалтад илгээснийг ялгана", () => {
    expect(leadChangeToast("applied", "Анна")).toEqual({
      title: "Анна багийн ахлагч боллоо",
      description: "Ахлагчийн эрх тэр даруй идэвхжлээ.",
    });
    const pending = leadChangeToast("pending", "Анна");
    expect(pending.title).toBe("«Анна»-г ахлагчаар санал болголоо");
    expect(pending.description).toContain("Оффисын админ батласны дараа");
  });
});

describe("staleProposalError", () => {
  it("хуудсанд харсан санал хүлээгдэж байвал саадгүй", () => {
    expect(staleProposalError(ANNA, ANNA)).toBeNull();
  });

  it("хооронд нь өөр хүнээр солигдсон бол батлахгүй", () => {
    expect(staleProposalError(BOLD, ANNA)).toBe("Санал өөрчлөгдсөн байна. Хуудсаа шинэчилнэ үү.");
  });

  it("санал аль хэдийн шийдэгдсэн (батлагдсан, цуцлагдсан) бол амжилт гэж хэлэхгүй", () => {
    expect(staleProposalError(null, ANNA)).toBe("Санал аль хэдийн шийдэгдсэн байна.");
    expect(staleProposalError(undefined, ANNA)).toBe("Санал аль хэдийн шийдэгдсэн байна.");
    expect(staleProposalError(null)).toBe("Санал аль хэдийн шийдэгдсэн байна.");
  });

  it("хүлээгдэж буй саналыг өгөөгүй бол зөвхөн санал байгаа эсэхийг шалгана", () => {
    expect(staleProposalError(BOLD)).toBeNull();
    expect(staleProposalError(BOLD, null)).toBeNull();
  });
});
