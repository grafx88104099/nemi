import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCORE_WEIGHTS,
  DEFAULT_WEEKLY_CYCLE,
  buildLastWeekSummary,
  classifyMove,
  coachingDue,
  computeWeeklyScore,
  detectAnomalies,
  formatMetricValue,
  gapRow,
  normalizeScoreWeights,
  normalizeWeeklyCycle,
  pickScoreWeights,
  planSubmitError,
  prefillItemsFromCarry,
  resolveTargets,
  reviewSubmitError,
  stageAdvances,
  summarizeMoves,
  weekConversions,
  type WeeklyValues,
} from "@/lib/crm/weekly-score";
import { CARD_TARGET_CODES } from "@/lib/constants-crm-weekly";

const W = DEFAULT_SCORE_WEIGHTS;

const fullTargets: WeeklyValues = {
  outbound_contacts: 20,
  meaningful_conversations: 10,
  new_leads: 2,
  owner_meetings: 1,
  buyer_meetings: 2,
  qualified_leads: 3,
  new_listings: 1,
  showings: 3,
  offers: 1,
  stage_advances: 4,
  closed_deals: 1,
  revenue: 5_000_000,
};

describe("§6.24 урсгалын хөдөлгөөн — алдсан хэлцэл ахилт биш", () => {
  it("closed_lost (sort_order өндөр) нь «Амжилтгүй хаагдсан», ахисан биш", () => {
    expect(classifyMove({ fromSort: 6, toSort: 11, toTerminal: "lost" })).toBe("lost");
    expect(classifyMove({ fromSort: 2, toSort: 4, toTerminal: null })).toBe("advanced");
    expect(classifyMove({ fromSort: 6, toSort: 4, toTerminal: null })).toBe("backward");
    expect(classifyMove({ fromSort: 9, toSort: 10, toTerminal: "won" })).toBe("won");
    expect(classifyMove({ fromSort: 3, toSort: 3, toTerminal: null })).toBe("none");
  });

  it("3 хэлцэл алдсан агентад шатны ахилт 0", () => {
    const s = summarizeMoves(["lost", "lost", "lost", "backward", "none"]);
    expect(s).toEqual({ advanced: 0, backward: 1, won: 0, lost: 3, none: 1 });
    expect(stageAdvances(s)).toBe(0);
    expect(stageAdvances(summarizeMoves(["advanced", "won", "lost"]))).toBe(2);
  });
});

describe("§6.25 100 оноот үнэлгээ", () => {
  it("бүх зорилт биелсэн, хугацаандаа 100%, чанар 100% → 100", () => {
    const s = computeWeeklyScore({
      actuals: { ...fullTargets, followup_on_time_pct: 100, crm_completeness_pct: 100 },
      targets: fullTargets,
      weights: W,
    });
    expect(s.total).toBe(100);
    expect(s.components.map((c) => c.points)).toEqual([20, 20, 20, 20, 10, 10]);
  });

  it("үйл ажиллагаагүй агент 0 оноо (хуучин алдаа: 20/100)", () => {
    const s = computeWeeklyScore({ actuals: {}, targets: fullTargets, weights: W });
    expect(s.total).toBe(0);
    expect(s.components.find((c) => c.key === "followup")?.points).toBeNull();
    expect(s.components.find((c) => c.key === "quality")?.points).toBeNull();
  });

  it("алдсан хэлцэл оноо өгөхгүй: хаалт 0, шатны ахилт 0", () => {
    const lostMoves = summarizeMoves(["lost", "lost", "lost"]);
    const s = computeWeeklyScore({
      actuals: { closed_deals: 0, revenue: 0, showings: 0, offers: 0, stage_advances: stageAdvances(lostMoves) },
      targets: fullTargets,
      weights: W,
    });
    expect(s.components.find((c) => c.key === "closing")?.points).toBe(0);
    expect(s.components.find((c) => c.key === "progress")?.points).toBe(0);
  });

  it("зорилтоос давсан нь 100%-иар хязгаарлагдана, хагас биелэлт хагас оноо", () => {
    const s = computeWeeklyScore({
      actuals: { qualified_leads: 9, new_listings: 0 },
      targets: { qualified_leads: 3, new_listings: 1 },
      weights: W,
    });
    expect(s.components.find((c) => c.key === "pipeline")?.points).toBe(10);
  });

  it("хамааралгүй хэсгийн жинг хувь тэнцүүлнэ (rescale) эсвэл 0 гэж тооцно (zero)", () => {
    const actuals: WeeklyValues = { ...fullTargets };
    const r = computeWeeklyScore({ actuals, targets: fullTargets, weights: W, naPolicy: "rescale" });
    expect(r.rescaled).toBe(true);
    expect(r.total).toBe(100);
    const z = computeWeeklyScore({ actuals, targets: fullTargets, weights: W, naPolicy: "zero" });
    expect(z.total).toBe(80);
  });

  it("хугацаандаа хувь ба чанарын хувь шууд жинд шилжинэ", () => {
    const s = computeWeeklyScore({
      actuals: { followup_on_time_pct: 75, crm_completeness_pct: 50 },
      targets: {},
      weights: W,
      naPolicy: "zero",
    });
    expect(s.components.find((c) => c.key === "followup")?.points).toBe(7.5);
    expect(s.components.find((c) => c.key === "quality")?.points).toBe(5);
  });

  it("жингийн тохиргоо: буруу утгыг нөөцөөр, шинэ агентын профайл", () => {
    expect(normalizeScoreWeights({ activity: "x" })).toEqual(W);
    expect(normalizeScoreWeights({ ...W, closing: 30, activity: 10 }).closing).toBe(30);
    const cycle = normalizeWeeklyCycle({
      new_agent: { enabled: true, days: 90, weights: { activity: 30, pipeline: 30, progress: 20, closing: 0, followup: 10, quality: 10 } },
    });
    expect(pickScoreWeights(W, cycle, "2026-10-01", "2026-11-09").profile).toBe("new_agent");
    expect(pickScoreWeights(W, cycle, "2026-01-01", "2026-11-09").profile).toBe("standard");
    expect(pickScoreWeights(W, cycle, null, "2026-11-09").profile).toBe("standard");
    expect(pickScoreWeights(W, normalizeWeeklyCycle({}), "2026-10-01", "2026-11-09").profile).toBe("standard");
  });
});

describe("зорилт ба зөрүү (§9.1)", () => {
  it("ноорог картын зорилт оноонд орохгүй, илгээсэн/батлагдсанд орно", () => {
    const d = DEFAULT_WEEKLY_CYCLE.defaultTargets;
    expect(resolveTargets({ showings: 1 }, "draft", d).showings).toBe(d.showings);
    expect(resolveTargets({ showings: 1 }, "submitted", d).showings).toBe(1);
    expect(resolveTargets({ showings: 1 }, "approved", d).showings).toBe(1);
    expect(resolveTargets(null, null, d)).toEqual(d);
  });

  it("зөрүү: бага байх тусмаа сайн үзүүлэлтэд эсрэгээр", () => {
    expect(gapRow(4, 5)).toEqual({ actual: 4, target: 5, gap: -1, pct: 80, met: false });
    expect(gapRow(2, 3, "lower").met).toBe(true);
    expect(gapRow(null, 3).met).toBeNull();
  });

  it("хуучин weekly_targets тохиргоог нөөц зорилтод буулгана", () => {
    const c = normalizeWeeklyCycle(null, { material: 30, qualified: 4, progress: 6, closings: 2 });
    expect(c.defaultTargets).toMatchObject({ meaningful_conversations: 30, qualified_leads: 4, stage_advances: 6, closed_deals: 2 });
    const c2 = normalizeWeeklyCycle({ default_targets: { qualified_leads: 5, bogus: 1 } }, { qualified: 4 });
    expect(c2.defaultTargets.qualified_leads).toBe(5);
    expect((c2.defaultTargets as Record<string, unknown>).bogus).toBeUndefined();
  });
});

describe("§6.30 Баасны өгөгдөл дараагийн Даваагийн картыг эхлүүлнэ", () => {
  it("шилжих 3 боломж → шилдэг хэлцэл ба тэргүүлэх ажил, давхардалгүй", () => {
    const items = prefillItemsFromCarry([
      { opportunity_id: "o1", text: "Гэрээ байгуулах" },
      { opportunity_id: "o1", text: "давхар" },
      { opportunity_id: null, text: "Шинэ листинг татах" },
      { opportunity_id: "o2", text: "" },
    ]);
    expect(items.filter((i) => i.kind === "top_deal").map((i) => i.opportunity_id)).toEqual(["o1", "o2"]);
    expect(items.filter((i) => i.kind === "priority").map((i) => i.text)).toEqual([
      "Гэрээ байгуулах",
      "Шинэ листинг татах",
      "Шилжсэн боломжийг урагшлуулах",
    ]);
    expect(items.filter((i) => i.kind === "priority").map((i) => i.position)).toEqual([1, 2, 3]);
  });

  it("өмнөх долоо хоногийн хураангуйн ноорог", () => {
    const text = buildLastWeekSummary({ showings: 2, offers: 1, closed_deals: 0 }, { showings: 3, closed_deals: 1 }, 64.5);
    expect(text).toContain("Үнэлгээ 64.5/100");
    expect(text).toContain("Үзлэг 2/3");
    expect(text).toContain("Үнийн санал 1");
    expect(text).toContain("Хаасан хэлцэл 0/1");
  });
});

describe("илгээх шалгалт", () => {
  const targets = Object.fromEntries(CARD_TARGET_CODES.map((c) => [c, 1])) as WeeklyValues;
  const ok = { targets, topDeals: 3, openOpportunities: 5, priorities: 3, commitment: "2 гэрээ байгуулна", summary: "Үзлэг 3/3" };

  it("картын заавал талбар", () => {
    expect(planSubmitError(ok, CARD_TARGET_CODES)).toBeNull();
    expect(planSubmitError({ ...ok, targets: { ...targets, offers: null } }, CARD_TARGET_CODES)).toContain("Үнийн санал");
    expect(planSubmitError({ ...ok, topDeals: 1 }, CARD_TARGET_CODES)).toContain("3");
    expect(planSubmitError({ ...ok, topDeals: 1, openOpportunities: 1 }, CARD_TARGET_CODES)).toBeNull();
    expect(planSubmitError({ ...ok, commitment: "" }, CARD_TARGET_CODES)).toContain("амлалт");
    expect(planSubmitError({ ...ok, priorities: 0 }, CARD_TARGET_CODES)).toContain("Тэргүүлэх");
  });

  it("дүн шинжилгээ: биелээгүйд тайлбар, хэтрэлтэд шалтгаан, сургамж, шилжих ажил", () => {
    const base = { missedNote: null, lessons: "Үнийн эсэргүүцэлд бэлдэх", overdueCount: 0, overdueReason: null, recoveryAction: null, carry: 2, unmetWithoutNote: 0 };
    expect(reviewSubmitError(base)).toBeNull();
    expect(reviewSubmitError({ ...base, unmetWithoutNote: 1 })).toContain("тайлбар");
    expect(reviewSubmitError({ ...base, overdueCount: 2 })).toContain("нөхөн сэргээх");
    expect(reviewSubmitError({ ...base, lessons: "" })).toContain("Сургамж");
    expect(reviewSubmitError({ ...base, carry: 0 })).toContain("шилжих");
  });
});

describe("хурлын дохио, дадлагажуулалт, хөрвөлт", () => {
  it("«Анхаарах» дохио", () => {
    const a = detectAnomalies({
      planStatus: null,
      lastWeekScore: 40,
      lastWeekActuals: { meaningful_conversations: 0, showings: 1 },
      lastWeekTargets: { showings: 4 },
      currentOverdue: 6,
      settings: DEFAULT_WEEKLY_CYCLE,
    });
    expect(a).toEqual(["no_plan", "low_score", "overdue", "no_activity", "target_gap"]);
    expect(
      detectAnomalies({
        planStatus: "approved",
        lastWeekScore: 90,
        lastWeekActuals: { meaningful_conversations: 5, showings: 4 },
        lastWeekTargets: { showings: 4 },
        currentOverdue: 0,
        settings: DEFAULT_WEEKLY_CYCLE,
      })
    ).toEqual([]);
  });

  it("N долоо хоног дараалан хэтэрвэл дадлагажуулалт", () => {
    const c = DEFAULT_WEEKLY_CYCLE.coaching;
    expect(coachingDue([{ overdue: 6, score: 70 }, { overdue: 5, score: 80 }], c)).toEqual({ due: true, reason: "overdue" });
    expect(coachingDue([{ overdue: 6, score: 70 }, { overdue: 1, score: 80 }], c).due).toBe(false);
    expect(coachingDue([{ overdue: 0, score: 30 }, { overdue: 0, score: 40 }], c)).toEqual({ due: true, reason: "score" });
    expect(coachingDue([{ overdue: 9, score: 10 }], c).due).toBe(false);
  });

  it("долоо хоногийн хөрвөлт", () => {
    expect(weekConversions({ outbound_contacts: 20, qualified_leads: 4, showings: 2, offers: 1, closed_deals: 0 }).map((c) => c.pct)).toEqual([
      20, 50, 50, 0,
    ]);
    expect(weekConversions({})[0].pct).toBeNull();
  });

  it("утгын формат", () => {
    expect(formatMetricValue("followup_on_time_pct", 87.4, String)).toBe("87%");
    expect(formatMetricValue("showings", null, String)).toBe("—");
    expect(formatMetricValue("revenue", 1500, (x) => `${x}₮`)).toBe("1500₮");
  });
});
