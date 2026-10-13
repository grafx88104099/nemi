import { describe, expect, it } from "vitest";

import {
  assignLead,
  computeLeadScore,
  gradeFromScore,
  needProfileCompleteness,
  DEFAULT_GRADE_THRESHOLDS,
  DEFAULT_SCORE_WEIGHTS,
  type LeadScoreInput,
  type ScoreWeights,
} from "@/lib/crm/scoring";

// ── F-112: 100 онооны загвар ──────────────────────────────

const fullInput: LeadScoreInput = {
  budgetMax: 500_000_000,
  budgetTarget: 450_000_000,
  financing: "cash",
  timeline: "0_30",
  activityCount30d: 10,
  lastContactDays: 1,
  sourceQuality: 1,
  completenessPct: 100,
};

describe("computeLeadScore (F-112)", () => {
  it("бүх шалгуур дээд утгатай бол 100 оноо, задаргаа нь жинтэй тэнцдэг", () => {
    const { score, breakdown } = computeLeadScore(fullInput);
    expect(score).toBe(100);
    expect(breakdown.budget_fit).toBe(DEFAULT_SCORE_WEIGHTS.budget_fit);
    expect(breakdown.timeline).toBe(DEFAULT_SCORE_WEIGHTS.timeline);
    expect(breakdown.financing).toBe(DEFAULT_SCORE_WEIGHTS.financing);
    expect(breakdown.engagement).toBe(DEFAULT_SCORE_WEIGHTS.engagement);
    expect(breakdown.source_quality).toBe(DEFAULT_SCORE_WEIGHTS.source_quality);
    expect(breakdown.profile_complete).toBe(DEFAULT_SCORE_WEIGHTS.profile_complete);
  });

  it("хоосон оролт 0 оноотой", () => {
    const { score } = computeLeadScore({});
    expect(score).toBe(0);
  });

  it("задаргааны нийлбэр = нийт оноо", () => {
    const { score, breakdown } = computeLeadScore({
      budgetMax: 100,
      financing: "loan",
      timeline: "3_12m",
      activityCount30d: 4,
      lastContactDays: 10,
      sourceQuality: 0.5,
      completenessPct: 60,
    });
    const sum = Object.values(breakdown).reduce((a, b) => a + b, 0);
    expect(score).toBeCloseTo(sum, 5);
  });

  it("тохиргооны өөр жинд өөр үр дүн гардаг (versioned параметр)", () => {
    const heavyBudget: ScoreWeights = {
      budget_fit: 60,
      timeline: 10,
      financing: 10,
      engagement: 10,
      source_quality: 5,
      profile_complete: 5,
    };
    const a = computeLeadScore(fullInput, DEFAULT_SCORE_WEIGHTS);
    const b = computeLeadScore(fullInput, heavyBudget);
    expect(a.score).toBe(100);
    expect(b.score).toBe(100);
    const partial: LeadScoreInput = { budgetMax: 100, budgetTarget: 90 };
    expect(computeLeadScore(partial, heavyBudget).score).toBeGreaterThan(
      computeLeadScore(partial, DEFAULT_SCORE_WEIGHTS).score
    );
  });

  it("хугацаа ойртох тусам оноо өсдөг", () => {
    const near = computeLeadScore({ timeline: "0_30" }).score;
    const mid = computeLeadScore({ timeline: "1_3m" }).score;
    const far = computeLeadScore({ timeline: "12m_plus" }).score;
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
  });
});

// ── F-113: босго 80/60/40 ─────────────────────────────────

describe("gradeFromScore (F-113)", () => {
  it("80/60/40 босгын зааг дээр зөв ангилдаг", () => {
    expect(gradeFromScore(100)).toBe("a");
    expect(gradeFromScore(80)).toBe("a");
    expect(gradeFromScore(79.9)).toBe("b");
    expect(gradeFromScore(60)).toBe("b");
    expect(gradeFromScore(59.9)).toBe("c");
    expect(gradeFromScore(40)).toBe("c");
    expect(gradeFromScore(39.9)).toBe("d");
    expect(gradeFromScore(0)).toBe("d");
  });

  it("тохиргоот босго өөрчлөгдөхөд шинэ оролтод шинэ ангилал өгдөг (хуучин оноо өөрчлөгдөхгүй)", () => {
    const strict = { a: 90, b: 70, c: 50 };
    expect(gradeFromScore(85, DEFAULT_GRADE_THRESHOLDS)).toBe("a");
    expect(gradeFromScore(85, strict)).toBe("b");
    // Оноо өөрөө босгоос хамаардаггүй — зөвхөн ангилал өөрчлөгддөг.
    expect(computeLeadScore(fullInput).score).toBe(100);
  });
});

// ── F-159: профайлын бүрэн байдал ─────────────────────────

describe("needProfileCompleteness (F-159)", () => {
  it("бүрэн профайл 100%", () => {
    expect(
      needProfileCompleteness({
        goalId: "g",
        locations: ["ХУД"],
        propertyTypes: ["apartment"],
        budgetMax: 500,
        budgetTarget: 450,
        financing: "cash",
        roomsMin: 2,
        timeline: "0_30",
        mustHaves: ["лифт"],
        dealBreakers: ["1 давхар"],
        decisionMaker: "өөрөө",
        blocker: "үнэ",
        profileType: "buyer",
      })
    ).toBe(100);
  });

  it("хоосон профайл 0-д ойрхон, түрээслэгчид орох огноо нөлөөлдөг (F-152)", () => {
    expect(needProfileCompleteness({})).toBeLessThan(5);
    const base = {
      goalId: "g",
      locations: ["ХУД"],
      propertyTypes: ["apartment"],
      budgetMax: 500,
      financing: "cash",
      timeline: "0_30",
      mustHaves: ["лифт"],
      profileType: "tenant" as const,
    };
    const without = needProfileCompleteness(base);
    const withDate = needProfileCompleteness({ ...base, moveInDate: "2026-10-01" });
    expect(withDate).toBeGreaterThan(without);
  });
});

// ── F-126 / Д-01: хуваарилалт ─────────────────────────────

describe("assignLead (F-126, Д-01)", () => {
  const candidates = ["p1", "p2", "p3"];

  it("ажлын бус цагт queue горимд дараалалд ордог", () => {
    const r = assignLead({ mode: "round_robin", candidates, isWorkHours: false });
    expect(r).toEqual({ ownerId: null, queued: true });
  });

  it("round_robin: cursor-ын дараагийнхыг сонгож, төгсгөлд эхэнд эргэдэг", () => {
    expect(assignLead({ mode: "round_robin", candidates, cursor: "p1", isWorkHours: true }).ownerId).toBe("p2");
    expect(assignLead({ mode: "round_robin", candidates, cursor: "p3", isWorkHours: true }).ownerId).toBe("p1");
    expect(assignLead({ mode: "round_robin", candidates, cursor: null, isWorkHours: true }).ownerId).toBe("p1");
  });

  it("duty_shift: жижүүрүүдээс бага ачаалалтайг; жижүүргүй бол round-robin fallback", () => {
    const r = assignLead({
      mode: "duty_shift",
      candidates,
      dutyNow: ["p2", "p3"],
      loads: { p2: 5, p3: 1 },
      isWorkHours: true,
    });
    expect(r.ownerId).toBe("p3");
    const fallback = assignLead({ mode: "duty_shift", candidates, dutyNow: [], cursor: "p1", isWorkHours: true });
    expect(fallback.ownerId).toBe("p2");
  });

  it("rule_based: эхний таарсан дүрмийн кандидатаас; таараагүй бол round-robin", () => {
    const rules = [
      { when: { source: "facebook" }, assign_to: ["p3"] },
      { when: {}, assign_to: ["p1"] },
    ];
    const hit = assignLead({
      mode: "rule_based",
      candidates,
      rules,
      lead: { sourceCode: "facebook" },
      isWorkHours: true,
    });
    expect(hit.ownerId).toBe("p3");
    const generic = assignLead({
      mode: "rule_based",
      candidates,
      rules,
      lead: { sourceCode: "walk_in" },
      isWorkHours: true,
    });
    expect(generic.ownerId).toBe("p1");
  });

  it("load_capped: босго дүүрсэн агентад оноохгүй; бүгд дүүрвэл дараалалд", () => {
    const r = assignLead({
      mode: "load_capped",
      candidates,
      loads: { p1: 10, p2: 3, p3: 10 },
      loadCap: 10,
      isWorkHours: true,
    });
    expect(r.ownerId).toBe("p2");
    const full = assignLead({
      mode: "load_capped",
      candidates,
      loads: { p1: 10, p2: 10, p3: 10 },
      loadCap: 10,
      isWorkHours: true,
    });
    expect(full).toEqual({ ownerId: null, queued: true });
  });

  it("кандидатгүй үед оноохгүй, дараалалд ч орохгүй", () => {
    const r = assignLead({ mode: "round_robin", candidates: [], isWorkHours: true });
    expect(r.ownerId).toBeNull();
    expect(r.queued).toBe(false);
  });
});
