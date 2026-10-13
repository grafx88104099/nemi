import { describe, expect, it } from "vitest";

import { checkGate, checkRequirement, type GateRequirement, type GateSnapshot } from "@/lib/crm/gates";

const G1: GateRequirement[] = [
  { checkerKind: "need_profile_complete", params: { min_pct: 100 } },
  { checkerKind: "next_step_set" },
];

const G4: GateRequirement[] = [
  { checkerKind: "kyc_verified" },
  { checkerKind: "aml_not_held" },
  { checkerKind: "docs_complete", params: { min_pct: 50 } },
];

describe("checkGate — G1 (профайлын бүрдэл)", () => {
  it("профайл дутуу бол унаж, дутуу шаардлагын монгол жагсаалт буцаадаг (F-354)", () => {
    const res = checkGate(G1, { needProfileCompletePct: 60, nextStepSet: true });
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual(["Хэрэгцээний профайл бүрэн"]);
  });

  it("бүрэн профайл + дараагийн алхам → тэнцдэг", () => {
    const res = checkGate(G1, { needProfileCompletePct: 100, nextStepSet: true });
    expect(res.ok).toBe(true);
    expect(res.missing).toEqual([]);
  });

  it("min_pct параметр босгыг өөрчилдөг (тохиргоо = өгөгдөл, D4)", () => {
    const reqs: GateRequirement[] = [{ checkerKind: "need_profile_complete", params: { min_pct: 80 } }];
    expect(checkGate(reqs, { needProfileCompletePct: 85 }).ok).toBe(true);
    expect(checkGate(reqs, { needProfileCompletePct: 75 }).ok).toBe(false);
  });
});

describe("checkGate — G4 (KYC + AML)", () => {
  const okSnapshot: GateSnapshot = { kycStatus: "verified", amlHold: false, docsCompletePct: 60 };

  it("kyc ≠ verified → унадаг (edd/suspended/pending бүгд)", () => {
    for (const kyc of ["pending", "edd", "suspended"] as const) {
      const res = checkGate(G4, { ...okSnapshot, kycStatus: kyc });
      expect(res.ok).toBe(false);
      expect(res.missing).toContain("KYC баталгаажсан");
    }
  });

  it("идэвхтэй AML hold → унадаг (Д-12)", () => {
    const res = checkGate(G4, { ...okSnapshot, amlHold: true });
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual(["МУТСТ түгжээгүй"]);
  });

  it("бүх шаардлага хангагдвал тэнцдэг", () => {
    expect(checkGate(G4, okSnapshot).ok).toBe(true);
  });

  it("хэд хэдэн дутуу — бүгд жагсаалтад ордог", () => {
    const res = checkGate(G4, { kycStatus: "pending", amlHold: true, docsCompletePct: 10 });
    expect(res.missing).toEqual(["KYC баталгаажсан", "МУТСТ түгжээгүй", "Баримтын бүрдэл 100%"]);
  });
});

describe("checkRequirement — аюулгүй тал руу", () => {
  it("мэдэгдэхгүй (undefined) утга ДУТУУ гэж тооцогддог", () => {
    expect(checkRequirement({ checkerKind: "owner_set" }, {})).toBe(false);
    expect(checkRequirement({ checkerKind: "payment_proof" }, {})).toBe(false);
    expect(checkRequirement({ checkerKind: "kyc_verified" }, {})).toBe(false);
    expect(checkRequirement({ checkerKind: "docs_complete" }, {})).toBe(false);
  });

  it("aml_not_held нь undefined үед тэнцдэг — DB талын definer шалгалт эцэслэнэ", () => {
    expect(checkRequirement({ checkerKind: "aml_not_held" }, {})).toBe(true);
    expect(checkRequirement({ checkerKind: "aml_not_held" }, { amlHold: true })).toBe(false);
  });

  it("үл мэдэх checker_kind — дутуу гэж үзнэ (аюулгүй тал)", () => {
    const res = checkGate([{ checkerKind: "unknown_checker" as never }], {});
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual(["unknown_checker"]);
  });

  it("хоосон шаардлагын жагсаалт — гейт тэнцдэг", () => {
    expect(checkGate([], {}).ok).toBe(true);
  });
});
