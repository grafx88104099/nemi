import { describe, expect, it } from "vitest";

import {
  DEFAULT_KPI_TARGETS,
  EMPTY_FOLLOWUP,
  QUALITY_CRITERIA,
  QUALITY_CRITERION_LABEL,
  agentConversions,
  agentRetention,
  activeAgentIds,
  auditScore,
  budgetForRange,
  budgetVariance,
  commissionQualityHold,
  followupKpis,
  forecastAccuracy,
  funnelSteps,
  monthRange,
  normalizeKpiTargets,
  normalizeQualitySettings,
  onTimeFollowupPct,
  pct,
  populationPassPct,
  previewBase,
  qualityEntityHref,
  qualityPoints,
  quarterRange,
  scoreByCriterion,
  sufficientPipelineThreshold,
  sumFollowup,
  sumFunnel,
  ubTodayIso,
  weekRange,
  type FollowupRow,
} from "@/lib/crm/quality";

describe("огноо (УБ)", () => {
  it("UTC 17:00 = УБ дараагийн өдөр", () => {
    expect(ubTodayIso(new Date("2026-11-08T17:00:00Z"))).toBe("2026-11-09");
    expect(ubTodayIso(new Date("2026-11-08T15:59:00Z"))).toBe("2026-11-08");
  });
  it("Даваа–Ням долоо хоног", () => {
    expect(weekRange("2026-11-08")).toEqual({ from: "2026-11-02", to: "2026-11-08" }); // Ням
    expect(weekRange("2026-11-09")).toEqual({ from: "2026-11-09", to: "2026-11-15" }); // Даваа
  });
  it("сар, улирал", () => {
    expect(monthRange("2026-02-14")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(quarterRange("2026-11-08")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
  });
});

describe("тохиргоо", () => {
  it("хоосон бол анхдагч, хүрээнээс гарвал хязгаарлана", () => {
    expect(normalizeQualitySettings(null).sample_per_criterion).toBe(10);
    expect(normalizeQualitySettings({ sample_per_criterion: 5000 }).sample_per_criterion).toBe(200);
    expect(normalizeQualitySettings({ commission_quality_min_pct: "75" }).commission_quality_min_pct).toBe(75);
  });
  it("KPI жишиг: §8.1-ийн анхдагч түвшин", () => {
    const t = normalizeKpiTargets({});
    expect(t).toEqual(DEFAULT_KPI_TARGETS);
    expect(t.overdue_max_pct).toBe(5);
    expect(t.showing_feedback_pct).toBe(95);
    expect(normalizeKpiTargets({ sufficient_pipeline_mnt: 0 }).sufficient_pipeline_mnt).toBeNull();
  });
});

describe("§6.29 чанарын аудит", () => {
  it("12 шалгуур, нэр бүгд монгол", () => {
    expect(QUALITY_CRITERIA).toHaveLength(12);
    for (const c of QUALITY_CRITERIA) expect(QUALITY_CRITERION_LABEL[c].label).toMatch(/[А-Яа-яӨөҮү]/);
  });
  it("оноо = тэнцсэн ÷ (тэнцсэн + тэнцээгүй); хамааралгүйг тооцохгүй", () => {
    const s = auditScore([
      { auto_result: "pass", result: "pass" },
      { auto_result: "pass", result: "pass" },
      { auto_result: "fail", result: "fail" },
      { auto_result: "fail", result: "na" },
    ]);
    expect(s).toMatchObject({ passed: 2, failed: 1, na: 1, open: 0 });
    expect(s.score).toBe(66.7);
  });
  it("хянаагүй мөр байвал эцсийн оноо гарахгүй, урьдчилсан оноо автомат дүнгээр", () => {
    const s = auditScore([
      { auto_result: "pass", result: null },
      { auto_result: "fail", result: null },
      { auto_result: "fail", result: "pass" },
    ]);
    expect(s.score).toBeNull();
    expect(s.open).toBe(2);
    expect(s.provisional).toBe(66.7);
  });
  it("шалгуур бүрээр задлана", () => {
    const by = scoreByCriterion([
      { criterion: "owner", auto_result: "pass", result: "pass" },
      { criterion: "owner", auto_result: "fail", result: "fail" },
      { criterion: "source", auto_result: "pass", result: "pass" },
    ]);
    expect(by.owner.score).toBe(50);
    expect(by.source.score).toBe(100);
    expect(by.data_use.score).toBeNull();
  });
  it("эзлэхүүний нийцэл ба 10 онооны хувиргалт", () => {
    const p = populationPassPct([
      { criterion: "owner", result: "pass" },
      { criterion: "owner", result: "pass" },
      { criterion: "grade", result: "fail" },
      { criterion: "next_step", result: "pass" },
    ]);
    expect(p).toBe(75);
    expect(qualityPoints(p, 10)).toBe(7.5);
    expect(qualityPoints(null, 10)).toBeNull();
    expect(populationPassPct([])).toBeNull();
  });
  it("§6.31 урамшууллын хяналт: зөвхөн босгоос доош үед", () => {
    expect(commissionQualityHold(79.9, 80)).toMatch(/79.9%/);
    expect(commissionQualityHold(80, 80)).toBeNull();
    expect(commissionQualityHold(null, 80)).toBeNull();
    expect(commissionQualityHold(10, 0)).toBeNull();
  });
  it("бүртгэл рүү очих холбоос панелиар", () => {
    expect(qualityEntityHref("crm_opportunities", "x", "/office/crm")).toBe("/office/crm/deals/x");
    expect(qualityEntityHref("crm_opportunities", "x", "/agent/crm")).toBe("/agent/crm/pipeline/x");
    expect(qualityEntityHref("crm_offers", "x", "/agent/crm")).toBeNull();
  });
});

describe("§8.1 эргэн холбогдох ажиллагааны KPI", () => {
  const row: FollowupRow = {
    ...EMPTY_FOLLOWUP,
    active_leads: 20,
    leads_with_next_step: 20,
    steps_total: 40,
    steps_overdue: 2,
    showings_total: 20,
    showings_feedback_ok: 19,
    offers_open: 4,
    offers_followed: 3,
    hot_leads: 5,
    hot_leads_on_freq: 5,
    material_total: 100,
    material_same_day: 94,
  };
  const k = Object.fromEntries(followupKpis(row, DEFAULT_KPI_TARGETS).map((x) => [x.code, x]));

  it("(1) дараагийн үйлдлийн огноотой идэвхтэй сэжим 100%", () => {
    expect(k.next_step_coverage.value).toBe(100);
    expect(k.next_step_coverage.status).toBe("ok");
  });
  it("(2) хугацаа хэтэрсэн 5%-иас бага: 2/40 = 5% → хангаагүй", () => {
    expect(k.overdue.value).toBe(5);
    expect(k.overdue.status).toBe("warn");
    const ok = followupKpis({ ...row, steps_overdue: 1 }, DEFAULT_KPI_TARGETS).find((x) => x.code === "overdue")!;
    expect(ok.value).toBe(2.5);
    expect(ok.status).toBe("ok");
  });
  it("(3) үзлэгийн эргэх холбоо 24 цагт 95%+: 19/20 = 95% → хангасан", () => {
    expect(k.showing_feedback.value).toBe(95);
    expect(k.showing_feedback.status).toBe("ok");
    expect(k.showing_feedback.label).toContain("24 цаг");
  });
  it("(4) идэвхтэй үнийн саналын эргэн холбогдолт 100%: 3/4 → хангаагүй", () => {
    expect(k.offer_followup.value).toBe(75);
    expect(k.offer_followup.status).toBe("warn");
  });
  it("(5) халуун сэжмийн давтамж", () => {
    expect(k.hot_lead_frequency.value).toBe(100);
  });
  it("(6) тухайн өдөрт нь бүртгэсэн 95%+: 94/100 → хангаагүй", () => {
    expect(k.same_day_logging.value).toBe(94);
    expect(k.same_day_logging.status).toBe("warn");
  });
  it("бүртгэлгүй бол «хамааралгүй», 0% биш", () => {
    const empty = followupKpis(EMPTY_FOLLOWUP, DEFAULT_KPI_TARGETS);
    expect(empty.every((x) => x.status === "na" && x.value === null)).toBe(true);
  });
  it("агентуудын нэгтгэл", () => {
    const s = sumFollowup([{ steps_total: 3, steps_overdue: 1 }, { steps_total: 2 }]);
    expect(s.steps_total).toBe(5);
    expect(s.steps_overdue).toBe(1);
  });
  it("§6.25.5 хугацаандаа хийсэн хувь: бүгд хоцорсон бол 0, алхамгүй бол хамааралгүй", () => {
    expect(onTimeFollowupPct({ steps_total: 4, steps_overdue: 4 })).toBe(0);
    expect(onTimeFollowupPct({ steps_total: 4, steps_overdue: 1 })).toBe(75);
    expect(onTimeFollowupPct({ steps_total: 0, steps_overdue: 0 })).toBeNull();
  });
});

describe("§8.2 10 шатлалын хөрвөлт", () => {
  const counts = sumFunnel([
    { s1: 60, s2: 50, s3: 30, s4: 25, s5: 20, s6: 12, s7: 10, s8: 8, s9: 6, s10: 5 },
    { s1: 40, s2: 30, s3: 20, s4: 15, s5: 10, s6: 8, s7: 5, s8: 2, s9: 2, s10: 1 },
  ]);
  it("алхам бүрийн тоо, өмнөх алхмаас хувь", () => {
    const steps = funnelSteps(counts);
    expect(steps).toHaveLength(10);
    expect(steps[0]).toMatchObject({ label: "Сэжим", count: 100, fromPrev: null });
    expect(steps[1]).toMatchObject({ label: "Утга бүхий холболт", count: 80, fromPrev: 80 });
    expect(steps[9]).toMatchObject({ label: "Хаалт", count: 6, fromFirst: 6 });
  });
  it("§8.3 хөрвөлтийн 4 үзүүлэлт", () => {
    expect(agentConversions(counts)).toEqual([50, 60, 50, 40]);
  });
  it("хоосон шатлалд хувь гарахгүй", () => {
    expect(agentConversions([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toEqual([null, null, null, null]);
  });
});

describe("§8.5 төсөв, төсөөлөл", () => {
  const budgets = [
    { month: "2026-10-01", amount: 31_000_000 },
    { month: "2026-11-01", amount: 30_000_000 },
    { month: "2026-11-01", amount: 9_000_000, branch_id: "b1" },
  ];
  it("сарын төсөв", () => {
    expect(budgetForRange(budgets, monthRange("2026-11-15"))).toBe(30_000_000);
    expect(budgetForRange(budgets, monthRange("2026-11-15"), "b1")).toBe(9_000_000);
  });
  it("хоёр сар дамнасан долоо хоног: хоногоор хувааж нэмнэ", () => {
    // 2026-10-26 (Даваа) … 2026-11-01 (Ням): 6 өдөр 10-р сар, 1 өдөр 11-р сар.
    expect(budgetForRange(budgets, weekRange("2026-10-28"))).toBe(6_000_000 + 1_000_000);
  });
  it("зөрүү ба биелэлт", () => {
    expect(budgetVariance(24_000_000, 30_000_000)).toEqual({ variance: -6_000_000, pct: 80, status: "warn" });
    expect(budgetVariance(31_000_000, 30_000_000).status).toBe("ok");
    expect(budgetVariance(5, 0).status).toBe("na");
  });
  it("төсөөллийн нарийвчлал", () => {
    expect(forecastAccuracy(90, 100)).toBe(90);
    expect(forecastAccuracy(130, 100)).toBe(70);
    expect(forecastAccuracy(300, 100)).toBe(0);
    expect(forecastAccuracy(0, 0)).toBe(100);
    expect(forecastAccuracy(10, 0)).toBe(0);
  });
  it("хангалттай урсгалын босго: тохиргоо → төсөв ÷ агент → алга", () => {
    expect(sufficientPipelineThreshold(5_000_000, 30_000_000, 6)).toEqual({ value: 5_000_000, source: "config" });
    expect(sufficientPipelineThreshold(null, 30_000_000, 6)).toEqual({ value: 5_000_000, source: "budget" });
    expect(sufficientPipelineThreshold(null, 0, 6)).toEqual({ value: null, source: "none" });
  });
});

describe("идэвхтэй агент, тогтвортой ажиллалт", () => {
  const staff = [
    { profile_id: "a", roles: ["agent"], is_active: true, hired_on: "2025-01-01", left_on: null },
    { profile_id: "b", roles: ["agent", "team_lead"], is_active: true, hired_on: "2026-11-01", left_on: null },
    { profile_id: "c", roles: ["agent"], is_active: false, hired_on: "2025-05-01", left_on: "2026-11-05" },
    { profile_id: "d", roles: ["finance"], is_active: true, hired_on: "2024-01-01", left_on: null },
    { profile_id: "e", roles: ["agent"], is_active: true, offboarding: true, hired_on: "2025-01-01", left_on: null },
  ];
  it("ажилгүй агент, санхүү, гарах урсгалтай нь идэвхтэйд орохгүй", () => {
    expect(activeAgentIds(staff, new Set(["a", "d", "e"]))).toEqual(["a"]);
  });
  it("улирлын тогтвортой ажиллалт", () => {
    const r = agentRetention(staff, quarterRange("2026-11-08"));
    expect(r).toMatchObject({ atStart: 3, left: 1, hired: 1, atEnd: 3 });
    expect(r.retentionPct).toBe(66.7);
  });
});

describe("урамшууллын урьдчилсан тооцоо", () => {
  it("баталгаажсан орлогогүй бол хүлээгдэж буй хөлсөөр, дутууг заана", () => {
    expect(previewBase(0, 4_000_000)).toEqual({ base: 4_000_000, gaps: ["verified_income"] });
    expect(previewBase(0, null)).toEqual({ base: 0, gaps: ["verified_income", "fee"] });
    expect(previewBase(3_000_000, 4_000_000)).toEqual({ base: 3_000_000, gaps: [] });
  });
  it("pct туслах", () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(1, 0)).toBeNull();
  });
});
