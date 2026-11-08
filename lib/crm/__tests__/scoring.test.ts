import { describe, expect, it } from "vitest";

import {
  assignLead,
  computeLeadScore,
  gradeFromScore,
  needProfileCompleteness,
  normalizeScoreFactors,
  normalizeScoreWeights,
  recontactDays,
  scoreWeightsTotal,
  DEFAULT_GRADE_THRESHOLDS,
  DEFAULT_RECONTACT_RANGES,
  DEFAULT_SCORE_WEIGHTS,
  SCORE_CRITERIA,
  type LeadScoreInput,
  type NeedProfileSnapshot,
  type ScoreWeights,
} from "@/lib/crm/scoring";
import { SCORE_CRITERION_LABEL } from "@/lib/constants-crm";

// ── §6.6: 100 онооны загвар, 6 шалгуур ────────────────────

const fullProfile: NeedProfileSnapshot = {
  goalId: "goal-live",
  locations: ["ХУД"],
  propertyTypes: ["apartment"],
  budgetMin: 400_000_000,
  budgetTarget: 450_000_000,
  budgetMax: 500_000_000,
  financing: "cash",
  roomsMin: 3,
  timeline: "0_30",
  mustHaves: ["лифт", "зогсоол", "сургуульд ойр"],
  dealBreakers: ["1 давхар"],
  decisionMakerId: "dm-self",
  decisionMakerInvolved: true,
  blockerId: "blocker-none",
  profileType: "buyer",
};

const fullInput: LeadScoreInput = {
  profile: fullProfile,
  activityCount30d: 10,
  lastContactDays: 1,
};

describe("computeLeadScore (§6.6)", () => {
  it("журмын жин 20/25/20/15/10/10 = 100", () => {
    expect(DEFAULT_SCORE_WEIGHTS).toEqual({
      need_clarity: 20,
      budget_financing: 25,
      timeline: 20,
      decision_maker: 15,
      engagement: 10,
      match_readiness: 10,
    });
    expect(scoreWeightsTotal(DEFAULT_SCORE_WEIGHTS)).toBe(100);
  });

  it("бүх шалгуур бүрэн бол 100 оноо, задаргаа нь жинтэй тэнцдэг", () => {
    const { score, breakdown } = computeLeadScore(fullInput);
    expect(score).toBe(100);
    for (const k of SCORE_CRITERIA) expect(breakdown[k]).toBe(DEFAULT_SCORE_WEIGHTS[k]);
  });

  it("хоосон оролт 0 оноотой", () => {
    expect(computeLeadScore({}).score).toBe(0);
  });

  it("задаргааны нийлбэр = нийт оноо", () => {
    const { score, breakdown } = computeLeadScore({
      profile: { ...fullProfile, financing: "loan", timeline: "3_12m", mustHaves: ["лифт"], decisionMakerInvolved: false },
      activityCount30d: 4,
      lastContactDays: 10,
    });
    const sum = Object.values(breakdown).reduce((a, b) => a + b, 0);
    expect(score).toBeCloseTo(sum, 5);
    expect(score).toBeLessThan(100);
  });

  it("шийдвэр гаргагч: оролцсон 15, зөвхөн тодорхой 7.5, тодорхойгүй 0", () => {
    const involved = computeLeadScore({ profile: fullProfile }).breakdown.decision_maker;
    const known = computeLeadScore({ profile: { ...fullProfile, decisionMakerInvolved: false } }).breakdown.decision_maker;
    const none = computeLeadScore({
      profile: { ...fullProfile, decisionMakerInvolved: null, decisionMakerId: null, decisionMaker: null },
    }).breakdown.decision_maker;
    expect([involved, known, none]).toEqual([15, 7.5, 0]);
  });

  it("эх сурвалж оноонд нөлөөлөхгүй (§6.6-д ийм шалгуур алга)", () => {
    const a = computeLeadScore({ ...fullInput, sourceQuality: 0 }).score;
    const b = computeLeadScore({ ...fullInput, sourceQuality: 1 }).score;
    expect(a).toBe(b);
  });

  it("заавал шаардлага 3-аас цөөн бол хэрэгцээний оноо бүрэн биш", () => {
    const three = computeLeadScore({ profile: fullProfile }).breakdown.need_clarity;
    const one = computeLeadScore({ profile: { ...fullProfile, mustHaves: ["лифт"] } }).breakdown.need_clarity;
    expect(three).toBe(20);
    expect(one).toBeLessThan(three);
  });

  it("профайлгүй үед бүрэн байдлын хувиар хэрэгцээ, тохируулгыг ойролцоолно", () => {
    const { breakdown } = computeLeadScore({ completenessPct: 50 });
    expect(breakdown.need_clarity).toBe(10);
    expect(breakdown.match_readiness).toBe(5);
    expect(breakdown.decision_maker).toBe(0);
  });

  it("хугацаа ойр байх тусам өндөр оноо", () => {
    const near = computeLeadScore({ timeline: "0_30" }).score;
    const mid = computeLeadScore({ timeline: "1_3m" }).score;
    const far = computeLeadScore({ timeline: "12m_plus" }).score;
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
  });

  it("тохиргооны өөр жинд өөр үр дүн гардаг (хувилбартай параметр)", () => {
    const heavyBudget: ScoreWeights = {
      need_clarity: 10,
      budget_financing: 50,
      timeline: 10,
      decision_maker: 10,
      engagement: 10,
      match_readiness: 10,
    };
    const partial: LeadScoreInput = { budgetMax: 100, budgetTarget: 90, financing: "cash" };
    expect(computeLeadScore(partial, heavyBudget).score).toBeGreaterThan(computeLeadScore(partial).score);
  });

  it("хуучин загварын жин (6 түлхүүр дутуу) ирвэл журмын анхдагчаар тооцно", () => {
    const legacy = { budget_fit: 25, timeline: 20, financing: 15, engagement: 20, source_quality: 10, profile_complete: 10 };
    expect(normalizeScoreWeights(legacy)).toEqual(DEFAULT_SCORE_WEIGHTS);
    expect(computeLeadScore(fullInput, legacy as unknown as ScoreWeights).score).toBe(100);
  });

  it("коэффициентийг тохиргооноос хэсэгчлэн дарж болно", () => {
    const f = normalizeScoreFactors({ timeline: { "1_3m": 1 } });
    expect(f.timeline["1_3m"]).toBe(1);
    expect(f.timeline["0_30"]).toBe(1);
    expect(computeLeadScore({ timeline: "1_3m" }, DEFAULT_SCORE_WEIGHTS, f).breakdown.timeline).toBe(20);
  });

  it("шалгуур бүр журмын нэртэй шошготой", () => {
    for (const k of SCORE_CRITERIA) expect(SCORE_CRITERION_LABEL[k]).toBeTruthy();
  });
});

// ── §6.6 босго 80/60/40 ───────────────────────────────────

describe("gradeFromScore (§6.6 жишиг босго)", () => {
  it("80/60/40 хил", () => {
    expect(gradeFromScore(100)).toBe("a");
    expect(gradeFromScore(80)).toBe("a");
    expect(gradeFromScore(79.9)).toBe("b");
    expect(gradeFromScore(60)).toBe("b");
    expect(gradeFromScore(59.9)).toBe("c");
    expect(gradeFromScore(40)).toBe("c");
    expect(gradeFromScore(39.9)).toBe("d");
    expect(gradeFromScore(0)).toBe("d");
  });

  it("тохиргооны босгоор өөрчлөгдөнө", () => {
    const strict = { a: 90, b: 70, c: 50 };
    expect(gradeFromScore(85, DEFAULT_GRADE_THRESHOLDS)).toBe("a");
    expect(gradeFromScore(85, strict)).toBe("b");
  });
});

// ── §6.5 эргэн холбогдох давтамж ──────────────────────────

describe("recontactDays (§6.5)", () => {
  it("ангиллын анхдагч давтамж", () => {
    expect(recontactDays("a")).toBe(3);
    expect(recontactDays("b")).toBe(7);
    expect(recontactDays("c")).toBe(21);
    expect(recontactDays("d")).toBe(60);
  });

  it("A ангилалд хэлцлийн хожуу шатанд илүү ойр", () => {
    expect(recontactDays("a", "negotiation")).toBe(1);
    expect(recontactDays("a", "qualified")).toBe(3);
  });

  it("шатны утга ангиллын мужаас гарахгүй", () => {
    const ranges = { ...DEFAULT_RECONTACT_RANGES, b: { ...DEFAULT_RECONTACT_RANGES.b, stage_days: { offer: 1 } } };
    expect(recontactDays("b", "offer", ranges)).toBe(7);
  });
});

// ── §6.7 профайлын бүрэн байдал ───────────────────────────

describe("needProfileCompleteness (§6.7)", () => {
  it("бүрэн профайл (3 заавал шаардлага, доод/зорилтот/дээд төсөв) 100%", () => {
    expect(needProfileCompleteness(fullProfile)).toBe(100);
  });

  it("заавал шаардлага 3-аас цөөн бол 100% хүрэхгүй", () => {
    const one = needProfileCompleteness({ ...fullProfile, mustHaves: ["лифт"] });
    const two = needProfileCompleteness({ ...fullProfile, mustHaves: ["лифт", "зогсоол"] });
    expect(one).toBeLessThan(two);
    expect(two).toBeLessThan(100);
  });

  it("«Саад байхгүй» хариулт (лавлах) бүрэн байдалд тооцогдоно", () => {
    const without = needProfileCompleteness({ ...fullProfile, blockerId: null, blocker: null });
    expect(without).toBeLessThan(100);
    expect(needProfileCompleteness({ ...fullProfile, blocker: null })).toBe(100);
  });

  it("доод төсөв дамжуулаагүй бол тооцоонд оролцохгүй, null бол дутуу", () => {
    const { budgetMin: _omit, ...rest } = fullProfile;
    void _omit;
    expect(needProfileCompleteness(rest)).toBe(100);
    expect(needProfileCompleteness({ ...fullProfile, budgetMin: null })).toBeLessThan(100);
  });

  it("хоосон профайл 0-д ойрхон, түрээслэгчид орох огноо нөлөөлдөг", () => {
    expect(needProfileCompleteness({})).toBeLessThan(5);
    const tenant = { ...fullProfile, profileType: "tenant" };
    expect(needProfileCompleteness({ ...tenant, moveInDate: "2026-12-01" })).toBeGreaterThan(
      needProfileCompleteness(tenant)
    );
  });

  it("заавал шаардлагын доод тоог тохиргоогоор өөрчилж болно", () => {
    const one = { ...fullProfile, mustHaves: ["лифт"] };
    expect(needProfileCompleteness(one, { mustHavesMin: 1 })).toBe(100);
  });
});

// ── Д-01: хуваарилалт ─────────────────────────────────────────────────────────────────

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
