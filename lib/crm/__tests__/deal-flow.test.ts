import { describe, expect, it } from "vitest";

import {
  DEFAULT_DEAL_FLOW,
  acceptanceEvidenceOk,
  avgPricePerM2,
  canAcceptOffer,
  canExportDeals,
  closingProgress,
  concessionPct,
  defaultOfferValidUntil,
  effectiveOfferStatus,
  isoAddDays,
  isoDiffDays,
  needsConcessionApproval,
  normalizeDealFlow,
  parseClosingChecks,
  pipelineSide,
  priceAnalysisError,
  relayDelayHours,
  scheduleRemaining,
  showingFeedbackError,
  showingFeedbackOverdue,
  showingNeedsReason,
  stageHealth,
} from "@/lib/crm/deal-flow";

const cfg = DEFAULT_DEAL_FLOW;

describe("normalizeDealFlow", () => {
  it("хоосон эсвэл буруу оролтод анхдагч", () => {
    expect(normalizeDealFlow(null)).toEqual(DEFAULT_DEAL_FLOW);
    expect(normalizeDealFlow([1, 2])).toEqual(DEFAULT_DEAL_FLOW);
  });
  it("migration-ы JSON-ыг уншина", () => {
    const c = normalizeDealFlow({
      material_concession_pct: 3,
      concession_approver_roles: ["ceo"],
      acceptance_evidence_required: false,
      stage_stale_days: { default: 20, showing: 4, bad: -1 },
      export_roles: [],
    });
    expect(c.materialConcessionPct).toBe(3);
    expect(c.concessionApproverRoles).toEqual(["ceo"]);
    expect(c.acceptanceEvidenceRequired).toBe(false);
    expect(c.stageStaleDays.default).toBe(20);
    expect(c.stageStaleDays.showing).toBe(4);
    expect(c.stageStaleDays.bad).toBeUndefined();
    expect(c.stageStaleDays.new).toBe(3);
    expect(c.exportRoles).toEqual(DEFAULT_DEAL_FLOW.exportRoles);
  });
  it("сөрөг тоо анхдагчаар солигдоно", () => {
    expect(normalizeDealFlow({ material_concession_pct: -2 }).materialConcessionPct).toBe(5);
  });
});

describe("огноо", () => {
  it("нэмэх, зөрүү", () => {
    expect(isoAddDays("2026-11-07", 3)).toBe("2026-11-10");
    expect(isoAddDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(isoDiffDays("2026-11-01", "2026-11-07")).toBe(6);
    expect(defaultOfferValidUntil("2026-11-07", cfg)).toBe("2026-11-10");
  });
});

describe("үнийн санал", () => {
  it("буултын хувь", () => {
    expect(concessionPct(500_000_000, 470_000_000)).toBe(6);
    expect(concessionPct(500_000_000, 520_000_000)).toBe(0);
    expect(concessionPct(null, 100)).toBeNull();
    expect(concessionPct(0, 100)).toBeNull();
  });
  it("материаллаг буулт тохиргооны босгоор", () => {
    expect(needsConcessionApproval(6, cfg)).toBe(true);
    expect(needsConcessionApproval(5, cfg)).toBe(false);
    expect(needsConcessionApproval(null, cfg)).toBe(false);
    expect(needsConcessionApproval(6, { ...cfg, materialConcessionPct: 10 })).toBe(false);
  });
  it("хүлээн зөвшөөрөх нөхцөл", () => {
    const base = { status: "open" as const, valid_until: "2026-11-10", concession_pct: 2, approval_status: "not_required" as const };
    expect(canAcceptOffer(base, cfg, "2026-11-07")).toEqual({ ok: true });
    expect(canAcceptOffer({ ...base, status: "countered" }, cfg, "2026-11-07")).toEqual({ ok: false, reason: "not_open" });
    expect(canAcceptOffer(base, cfg, "2026-11-11")).toEqual({ ok: false, reason: "expired" });
    expect(canAcceptOffer({ ...base, concession_pct: 8 }, cfg, "2026-11-07")).toEqual({
      ok: false,
      reason: "approval_required",
    });
    expect(canAcceptOffer({ ...base, concession_pct: 8, approval_status: "pending" }, cfg, "2026-11-07")).toEqual({
      ok: false,
      reason: "approval_pending",
    });
    expect(canAcceptOffer({ ...base, concession_pct: 8, approval_status: "approved" }, cfg, "2026-11-07")).toEqual({
      ok: true,
    });
  });
  it("хугацаа өнгөрсөн нээлттэй санал «Хугацаа дууссан»", () => {
    expect(effectiveOfferStatus({ status: "open", valid_until: "2026-11-01" }, "2026-11-07")).toBe("expired");
    expect(effectiveOfferStatus({ status: "accepted", valid_until: "2026-11-01" }, "2026-11-07")).toBe("accepted");
    expect(effectiveOfferStatus({ status: "open", valid_until: null }, "2026-11-07")).toBe("open");
  });
  it("зөвшөөрлийн нотолгоо", () => {
    expect(acceptanceEvidenceOk(cfg, false, "утсаар")).toBe(false);
    expect(acceptanceEvidenceOk(cfg, false, "Утсаар ярьж, үнэ болон хугацааг баталсан")).toBe(true);
    expect(acceptanceEvidenceOk(cfg, true, null)).toBe(true);
    expect(acceptanceEvidenceOk({ ...cfg, acceptanceEvidenceRequired: false }, false, null)).toBe(true);
  });
  it("саатал (цаг)", () => {
    expect(relayDelayHours("2026-11-07T01:00:00Z", "2026-11-07T04:30:00Z")).toBe(3.5);
    expect(relayDelayHours(null, "2026-11-07T04:30:00Z")).toBeNull();
    expect(relayDelayHours("2026-11-07T05:00:00Z", "2026-11-07T04:30:00Z")).toBe(0);
  });
});

describe("үзлэг", () => {
  it("сул тохиролд үндэслэл", () => {
    expect(showingNeedsReason("weak")).toBe(true);
    expect(showingNeedsReason(null)).toBe(true);
    expect(showingNeedsReason("none")).toBe(true);
    expect(showingNeedsReason("possible")).toBe(false);
    expect(showingNeedsReason("strong")).toBe(false);
  });
  it("эргэх холбоо: сонирхсон бол дараагийн үйлдэл + огноо", () => {
    const today = "2026-11-07";
    expect(showingFeedbackError({ feedbackCategory: null, interest: "maybe", nextAction: null, nextStepDate: null }, today)).toMatch(
      /ангилл/
    );
    expect(
      showingFeedbackError({ feedbackCategory: "price", interest: "interested", nextAction: null, nextStepDate: null }, today)
    ).toMatch(/дараагийн үйлдлийг/);
    expect(
      showingFeedbackError({ feedbackCategory: "price", interest: "interested", nextAction: "offer", nextStepDate: null }, today)
    ).toMatch(/огноо/);
    expect(
      showingFeedbackError(
        { feedbackCategory: "price", interest: "interested", nextAction: "offer", nextStepDate: "2026-11-08" },
        today
      )
    ).toBeNull();
    expect(
      showingFeedbackError(
        { feedbackCategory: "layout", interest: "not_interested", nextAction: null, nextStepDate: "2026-11-01" },
        today
      )
    ).toMatch(/өнгөрсөн/);
  });
  it("24 цагийн эргэх холбоо", () => {
    const now = new Date("2026-11-08T05:00:00Z");
    expect(showingFeedbackOverdue("2026-11-07T04:00:00Z", null, now, 24)).toBe(true);
    expect(showingFeedbackOverdue("2026-11-07T06:00:00Z", null, now, 24)).toBe(false);
    expect(showingFeedbackOverdue("2026-11-07T04:00:00Z", "2026-11-07T08:00:00Z", now, 24)).toBe(false);
  });
});

describe("картын заагч (R28)", () => {
  it("шатанд удсан ба хэтэрсэн алхам тусдаа", () => {
    const h = stageHealth(
      { stageCode: "offer", stageEnteredAt: "2026-10-20T03:00:00Z", nextStepDate: "2026-11-05", open: true },
      "2026-11-07",
      cfg
    );
    expect(h.daysInStage).toBe(18);
    expect(h.staleLimit).toBe(7);
    expect(h.stale).toBe(true);
    expect(h.nextStepOverdueDays).toBe(2);
    expect(h.nextStepMissing).toBe(false);
  });
  it("тодорхойгүй шат default босготой, хаагдсанд дохиогүй", () => {
    const h = stageHealth(
      { stageCode: "matched", stageEnteredAt: "2026-11-01", nextStepDate: null, open: true },
      "2026-11-07",
      cfg
    );
    expect(h.staleLimit).toBe(14);
    expect(h.stale).toBe(false);
    expect(h.nextStepMissing).toBe(true);
    const closed = stageHealth(
      { stageCode: "matched", stageEnteredAt: "2026-01-01", nextStepDate: "2026-01-02", open: false },
      "2026-11-07",
      cfg
    );
    expect(closed.stale).toBe(false);
    expect(closed.nextStepOverdueDays).toBe(0);
  });
});

describe("үнийн дүн шинжилгээ", () => {
  const comps = [
    { address: "Зайсан 1", price: 400_000_000, area_m2: 80 },
    { address: "Зайсан 2", price: 450_000_000, area_m2: 90 },
    { address: "Зайсан 3", price: 300_000_000, area_m2: 60 },
  ];
  it("жишгийн тоо тохиргооноос", () => {
    expect(priceAnalysisError(comps.slice(0, 2), 420_000_000, null, null, cfg)).toMatch(/3 жишиг/);
    expect(priceAnalysisError(comps, 420_000_000, 380_000_000, 460_000_000, cfg)).toBeNull();
    expect(priceAnalysisError(comps.slice(0, 2), 420_000_000, null, null, { ...cfg, priceAnalysisMinComparables: 2 })).toBeNull();
  });
  it("муж ба санал болгох үнэ", () => {
    expect(priceAnalysisError(comps, 0, null, null, cfg)).toMatch(/Санал болгох/);
    expect(priceAnalysisError(comps, 420_000_000, 500_000_000, 400_000_000, cfg)).toMatch(/муж буруу/);
    expect(priceAnalysisError(comps, 300_000_000, 380_000_000, 460_000_000, cfg)).toMatch(/доогуур/);
  });
  it("м² дундаж", () => {
    expect(avgPricePerM2(comps)).toBe(5_000_000);
    expect(avgPricePerM2([{ address: "x", price: 1 }])).toBeNull();
  });
});

describe("хаалтын босго", () => {
  it("parse + явц", () => {
    const checks = parseClosingChecks([
      { code: "contract", label: "Гэрээ", ok: true, hint: "" },
      { code: "payment", label: "Төлбөр", ok: false, hint: "x" },
      { bad: 1 },
      null,
    ]);
    expect(checks).toHaveLength(2);
    expect(closingProgress(checks)).toEqual({ done: 1, total: 2, ready: false });
    expect(closingProgress([])).toEqual({ done: 0, total: 0, ready: false });
    expect(parseClosingChecks("x")).toEqual([]);
  });
});

describe("бусад", () => {
  it("экспортын эрх тохиргооноос", () => {
    expect(canExportDeals(["agent"], cfg)).toBe(false);
    expect(canExportDeals(["agent", "finance"], cfg)).toBe(true);
  });
  it("хуваарийн үлдэгдэл", () => {
    expect(scheduleRemaining({ amount: 100, paid_amount: 40 })).toBe(60);
    expect(scheduleRemaining({ amount: 100, paid_amount: 140 })).toBe(0);
  });
  it("урсгалын тал", () => {
    expect(pipelineSide("PL-2")).toBe("listing");
    expect(pipelineSide("PL-1")).toBe("buyer");
  });
});
