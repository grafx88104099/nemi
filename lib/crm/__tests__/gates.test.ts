import { describe, expect, it } from "vitest";

import {
  checkGate,
  checkRequirement,
  gateRequirementLabel,
  type GateRequirement,
  type GateSnapshot,
} from "@/lib/crm/gates";
import { GATES, GATE_CHECKER_KINDS, GATE_CHECKER_LABEL, GATE_LABEL } from "@/lib/constants-crm";

const G1: GateRequirement[] = [
  { checkerKind: "need_profile_complete", params: { min_pct: 100 } },
  { checkerKind: "next_step_set" },
];

const G4: GateRequirement[] = [
  { checkerKind: "kyc_verified" },
  { checkerKind: "aml_not_held" },
  { checkerKind: "docs_complete", params: { min_pct: 50 } },
];

describe("checkGate — Шалгуур хангасан (профайлын бүрдэл)", () => {
  it("профайл дутуу бол унаж, дутуу шаардлагын монгол жагсаалт буцаадаг (F-354)", () => {
    const res = checkGate(G1, { needProfileCompletePct: 60, nextStepSet: true });
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual(["Хэрэгцээний профайл бүрэн бөглөгдсөн"]);
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

describe("checkGate — Гэрээ (KYC + МУТСТ)", () => {
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
    expect(res.missing).toEqual(["KYC баталгаажсан", "МУТСТ түгжээгүй", "Баримт бичгийн бүрдэл 50%"]);
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

  it("үл мэдэх checker_kind — дутуу гэж үзнэ, дотоод код дэлгэцэнд гарахгүй", () => {
    const res = checkGate([{ checkerKind: "unknown_checker" as never }], {});
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual(["Тодорхойгүй шаардлага"]);
  });

  it("хоосон шаардлагын жагсаалт — гейт тэнцдэг", () => {
    expect(checkGate([], {}).ok).toBe(true);
  });
});

describe("PRO-001 v2.1 шатны шалгуурууд (§6.13, §6.14)", () => {
  const cases: Array<[GateRequirement["checkerKind"], keyof GateSnapshot]> = [
    ["meaningful_contact", "meaningfulContact"],
    ["match_suggested", "matchSuggested"],
    ["showing_logged", "showingLogged"],
    ["interest_confirmed", "interestConfirmed"],
    ["counter_recorded", "counterRecorded"],
    ["offer_accepted", "offerAccepted"],
    ["meeting_scheduled", "meetingScheduled"],
    ["price_analysis", "priceAnalysisDone"],
    ["property_active", "propertyActive"],
    ["showing_on_property", "showingOnProperty"],
  ];

  it.each(cases)("%s: зөвхөн true үед хангагдана", (kind, field) => {
    expect(checkRequirement({ checkerKind: kind }, {})).toBe(false);
    expect(checkRequirement({ checkerKind: kind }, { [field]: false })).toBe(false);
    expect(checkRequirement({ checkerKind: kind }, { [field]: true })).toBe(true);
  });

  it("Гэрээ: KYC + харилцагчийн зөвшөөрөл хамт", () => {
    const reqs: GateRequirement[] = [{ checkerKind: "kyc_verified" }, { checkerKind: "offer_accepted" }];
    expect(checkGate(reqs, { kycStatus: "verified" }).missing).toEqual(["Харилцагч нөхцөлийг хүлээн зөвшөөрсөн"]);
    expect(checkGate(reqs, { kycStatus: "verified", offerAccepted: true }).ok).toBe(true);
  });
});

describe("шошго — журмын нэр томьёо, дотоод кодгүй", () => {
  it("шаардлага бүр шошготой", () => {
    for (const k of GATE_CHECKER_KINDS) expect(GATE_CHECKER_LABEL[k]).toBeTruthy();
  });

  it("шалгуурын нэрэнд G0–G6 код, «гейт» үг байхгүй", () => {
    for (const g of GATES) {
      expect(GATE_LABEL[g]).not.toMatch(/Gd|гейт|Гейт/);
      expect(GATE_LABEL[g].startsWith("Шилжих шалгуур")).toBe(true);
    }
  });

  it("баримтын бүрдлийн шошго тохиргооны хувийг харуулна", () => {
    expect(gateRequirementLabel("docs_complete", { min_pct: 50 })).toBe("Баримт бичгийн бүрдэл 50%");
    expect(gateRequirementLabel("docs_complete")).toBe("Баримт бичгийн бүрдэл 100%");
    expect(gateRequirementLabel("next_step_set")).toBe("Дараагийн үйлдэл, огноо бүртгэгдсэн");
  });
});
