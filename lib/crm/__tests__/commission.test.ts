import { describe, expect, it } from "vitest";

import {
  calcCommission,
  calcMonthlyPmCommission,
  classifyLeaseDuration,
  diffCommissionRows,
  isAboveThreshold,
  monthsBetween,
  netBaseAmount,
  policyCodeForTxnType,
  suggestRentalFee,
  type CommissionPolicyPayload,
  type RoleAssignment,
} from "@/lib/crm/commission";

/** 5 журмын жишээ тооцоо (DESIGN §11.1 — commission.test.ts мөр). */

const SAL_PAYLOAD: CommissionPolicyPayload = {
  threshold: { amount: 300_000_000, op: ">=" },
  stacking: true,
  total_cap_pct: 60,
  roles: [
    { role: "sourcing", rate_below_pct: 10, rate_above_pct: 8 },
    { role: "listing", rate_below_pct: 10, rate_above_pct: 8 },
    { role: "contract", rate_below_pct: 10, rate_above_pct: 8 },
    { role: "selling", rate_below_pct: 25, rate_above_pct: 20 },
  ],
};

function a(agent: string, role: RoleAssignment["role"], splitPct?: number | null): RoleAssignment {
  return { agentProfileId: agent, role, splitPct: splitPct ?? null, refId: `${agent}-${role}` };
}

describe("commission — босгын оператор (F-456)", () => {
  it("'>=': зааг дээрх үнэ дээд шатлалд, '>' бол доод шатлалд", () => {
    expect(isAboveThreshold(300_000_000, { amount: 300_000_000, op: ">=" })).toBe(true);
    expect(isAboveThreshold(300_000_000, { amount: 300_000_000, op: ">" })).toBe(false);
    expect(isAboveThreshold(300_000_000.01, { amount: 300_000_000, op: ">" })).toBe(true);
    expect(isAboveThreshold(299_999_999, { amount: 300_000_000, op: ">=" })).toBe(false);
  });

  it("зааг дээрх үнэд хувь операторын дагуу солигдоно", () => {
    const base = 10_000_000;
    // '>=' — 300 сая нь дээд шатлал (8%).
    const gte = calcCommission({
      policyCode: "PMC-SAL-POL-001",
      payload: SAL_PAYLOAD,
      assignments: [a("a1", "sourcing")],
      baseAmount: base,
      price: 300_000_000,
    });
    expect(gte.rows[0].appliedRatePct).toBe(8);
    expect(gte.rows[0].amount).toBe(800_000);
    // '>' — 300 сая нь доод шатлал (10%).
    const gt = calcCommission({
      policyCode: "PMC-SAL-POL-001",
      payload: { ...SAL_PAYLOAD, threshold: { amount: 300_000_000, op: ">" } },
      assignments: [a("a1", "sourcing")],
      baseAmount: base,
      price: 300_000_000,
    });
    expect(gt.rows[0].appliedRatePct).toBe(10);
    expect(gt.rows[0].amount).toBe(1_000_000);
  });
});

describe("commission — олон үүргийн stacking (F-457)", () => {
  const assignments = [a("a1", "sourcing"), a("a1", "selling"), a("a2", "listing")];

  it("stacking ON: нэг агентын бүх үүрэг давхарлагдана", () => {
    const r = calcCommission({
      policyCode: "PMC-SAL-POL-001",
      payload: SAL_PAYLOAD,
      assignments,
      baseAmount: 1_000_000,
      price: 100_000_000,
    });
    const a1 = r.rows.filter((x) => x.agentProfileId === "a1");
    expect(a1).toHaveLength(2);
    expect(a1.reduce((s, x) => s + x.appliedRatePct, 0)).toBe(35); // 10 + 25
    expect(r.totalRatePct).toBe(45); // + a2-ийн 10
  });

  it("stacking OFF: хамгийн өндөр дүнтэй ганц үүрэг үлдэнэ", () => {
    const r = calcCommission({
      policyCode: "PMC-SAL-POL-001",
      payload: { ...SAL_PAYLOAD, stacking: false },
      assignments,
      baseAmount: 1_000_000,
      price: 100_000_000,
    });
    const a1 = r.rows.filter((x) => x.agentProfileId === "a1");
    expect(a1).toHaveLength(1);
    expect(a1[0].role).toBe("selling"); // 25% > 10%
    expect(a1[0].evidence.dropped_roles).toEqual(["sourcing"]);
    expect(r.totalRatePct).toBe(35);
  });
});

describe("commission — хамтын зуучлал (F-468)", () => {
  it("co-brokerage туг → стандарт selling хаагдана", () => {
    const payload: CommissionPolicyPayload = {
      threshold: { amount: 300_000_000, op: ">=" },
      stacking: true,
      total_cap_pct: 50,
      roles: [
        { role: "seller_side", rate_below_pct: 20, rate_above_pct: 15 },
        { role: "buyer_side", rate_below_pct: 20, rate_above_pct: 15 },
        { role: "selling", rate_below_pct: 25, rate_above_pct: 20 },
      ],
    };
    const r = calcCommission({
      policyCode: "PMC-SAL-BR-POL-001",
      payload,
      assignments: [a("a1", "seller_side"), a("a2", "buyer_side"), a("a3", "selling")],
      baseAmount: 2_000_000,
      price: 200_000_000,
    });
    expect(r.rows.some((x) => x.role === "selling")).toBe(false);
    expect(r.rows).toHaveLength(2);
    expect(r.notes.some((n) => n.includes("F-468"))).toBe(true);
    // Босгоос доогуур тул 20% + 20%.
    expect(r.totalRatePct).toBe(40);
  });

  it("үнийн босгоос хамаарсан 2 түвшний хуваарилалт", () => {
    const payload: CommissionPolicyPayload = {
      threshold: { amount: 300_000_000, op: ">=" },
      roles: [
        { role: "seller_side", rate_below_pct: 20, rate_above_pct: 15 },
        { role: "buyer_side", rate_below_pct: 20, rate_above_pct: 15 },
      ],
    };
    const above = calcCommission({
      policyCode: "PMC-SAL-BR-POL-001",
      payload,
      assignments: [a("a1", "seller_side"), a("a2", "buyer_side")],
      baseAmount: 1_000_000,
      price: 350_000_000,
    });
    expect(above.rows.every((x) => x.appliedRatePct === 15)).toBe(true);
  });
});

describe("commission — олон улсын 3 хувилбар (F-467)", () => {
  const INT_PAYLOAD: CommissionPolicyPayload = {
    variants: { intl_lead_gen: 10, deal_manager: 20, full_cycle: 25 },
    agent_total_cap_pct: 25,
  };

  it("тус тусдаа хувилбарууд зөв хувиар тооцогдоно", () => {
    const r = calcCommission({
      policyCode: "PMC-INT-SAL-POL-001",
      payload: INT_PAYLOAD,
      assignments: [a("a1", "intl_lead_gen"), a("a2", "deal_manager")],
      baseAmount: 1_000_000,
      price: 0,
    });
    expect(r.rows).toHaveLength(2);
    expect(r.rows.find((x) => x.agentProfileId === "a1")?.appliedRatePct).toBe(10);
    expect(r.rows.find((x) => x.agentProfileId === "a2")?.appliedRatePct).toBe(20);
  });

  it("нэг агент 2 хувилбарт → давхардуулахгүй, full_cycle нэг мөр", () => {
    const r = calcCommission({
      policyCode: "PMC-INT-SAL-POL-001",
      payload: INT_PAYLOAD,
      assignments: [a("a1", "intl_lead_gen"), a("a1", "deal_manager")],
      baseAmount: 1_000_000,
      price: 0,
    });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].appliedRatePct).toBe(25); // 10+20=30 БИШ
    expect(r.rows[0].evidence.variant).toBe("full_cycle");
  });

  it("хувилбар давхардуулбал (full_cycle тохируулаагүй) алдаа", () => {
    const r = calcCommission({
      policyCode: "PMC-INT-SAL-POL-001",
      payload: { variants: { intl_lead_gen: 10, deal_manager: 20 } },
      assignments: [a("a1", "intl_lead_gen"), a("a1", "deal_manager")],
      baseAmount: 1_000_000,
      price: 0,
    });
    expect(r.rows).toHaveLength(0);
    expect(r.errors.some((e) => e.includes("давхардуулах"))).toBe(true);
  });

  it("агентын нийт урамшуулал дээд хэмжээнээс хэтрэхгүй (clamp)", () => {
    const r = calcCommission({
      policyCode: "PMC-INT-SAL-POL-001",
      payload: { variants: { deal_manager: 30 }, agent_total_cap_pct: 25 },
      assignments: [a("a1", "deal_manager")],
      baseAmount: 1_000_000,
      price: 0,
    });
    expect(r.rows[0].appliedRatePct).toBe(25);
  });
});

describe("commission — нийлбэрийн cap (F-459)", () => {
  it("нийлбэр дээд хязгаараас хэтэрвэл түгжигдэнэ", () => {
    const r = calcCommission({
      policyCode: "PMC-SAL-POL-001",
      payload: { ...SAL_PAYLOAD, total_cap_pct: 40 },
      assignments: [a("a1", "sourcing"), a("a2", "listing"), a("a3", "contract"), a("a4", "selling")],
      baseAmount: 1_000_000,
      price: 100_000_000,
    });
    expect(r.totalRatePct).toBe(55); // 10+10+10+25
    expect(r.locked).toBe(true);
    expect(r.errors.some((e) => e.includes("F-459"))).toBe(true);
  });

  it("хязгаарт багтвал түгжигдэхгүй", () => {
    const r = calcCommission({
      policyCode: "PMC-SAL-POL-001",
      payload: SAL_PAYLOAD,
      assignments: [a("a1", "sourcing"), a("a4", "selling")],
      baseAmount: 1_000_000,
      price: 100_000_000,
    });
    expect(r.locked).toBe(false);
  });
});

describe("commission — replacement (F-414)", () => {
  it("дахин түрээслүүлэлт → бүх мөр 0₮", () => {
    const r = calcCommission({
      policyCode: "PMC-RENT-POL-001",
      payload: SAL_PAYLOAD,
      assignments: [a("a1", "sourcing"), a("a2", "selling")],
      baseAmount: 1_000_000,
      price: 1_000_000,
      flags: { replacement: true },
    });
    expect(r.rows).toHaveLength(2);
    expect(r.rows.every((x) => x.amount === 0 && x.appliedRatePct === 0)).toBe(true);
    expect(r.notes.some((n) => n.includes("F-414"))).toBe(true);
  });

  it("replacement төрөл RENT журамд буудаг", () => {
    expect(policyCodeForTxnType("replacement")).toBe("PMC-RENT-POL-001");
    expect(policyCodeForTxnType("sale")).toBe("PMC-SAL-POL-001");
    expect(policyCodeForTxnType("sale", { coBrokerage: true })).toBe("PMC-SAL-BR-POL-001");
    expect(policyCodeForTxnType("international_sale")).toBe("PMC-INT-SAL-POL-001");
  });
});

describe("commission — хамтарсан үүргийн split (F-458)", () => {
  const RENT_PAYLOAD: CommissionPolicyPayload = {
    stacking: true,
    roles: [{ role: "selling", rate_pct: 30 }],
  };

  it("split бүртгэгдсэн бол хувь тэнцүү хуваагдана", () => {
    const r = calcCommission({
      policyCode: "PMC-RENT-POL-001",
      payload: RENT_PAYLOAD,
      assignments: [a("a1", "selling", 60), a("a2", "selling", 40)],
      baseAmount: 1_000_000,
      price: 0,
    });
    expect(r.errors).toHaveLength(0);
    expect(r.rows.find((x) => x.agentProfileId === "a1")?.appliedRatePct).toBe(18); // 30×60%
    expect(r.rows.find((x) => x.agentProfileId === "a2")?.appliedRatePct).toBe(12); // 30×40%
  });

  it("split бүртгэгдээгүй бол алдаа + missing_split нотолгоо", () => {
    const r = calcCommission({
      policyCode: "PMC-RENT-POL-001",
      payload: RENT_PAYLOAD,
      assignments: [a("a1", "selling"), a("a2", "selling")],
      baseAmount: 1_000_000,
      price: 0,
    });
    expect(r.errors.some((e) => e.includes("F-458"))).toBe(true);
    expect(r.rows.every((x) => x.evidence.missing_split === true)).toBe(true);
    // Түр тэнцүү хуваарилалтаар тооцогдсон ч «Хянасан» руу DB guard хаана.
    expect(r.rows[0].appliedRatePct).toBe(15);
  });
});

describe("commission — хэсэгчилсэн орлого (F-464) + rollback diff (F-463)", () => {
  it("суурь пропорциор дүн тооцогдоно", () => {
    const half = calcCommission({
      policyCode: "PMC-RENT-POL-001",
      payload: { roles: [{ role: "selling", rate_pct: 30 }] },
      assignments: [a("a1", "selling")],
      baseAmount: 500_000, // нийт 1 сая хөлсний тал нь орж ирсэн
      price: 0,
    });
    expect(half.rows[0].amount).toBe(150_000);
  });

  it("үлдэгдэл орж ирэхэд нэмэлт мөр автомат (diff)", () => {
    const full = calcCommission({
      policyCode: "PMC-RENT-POL-001",
      payload: { roles: [{ role: "selling", rate_pct: 30 }] },
      assignments: [a("a1", "selling")],
      baseAmount: 1_000_000,
      price: 0,
    });
    const delta = diffCommissionRows(full.rows, [
      { agentProfileId: "a1", role: "selling", amount: 150_000, baseAmount: 500_000 },
    ]);
    expect(delta).toHaveLength(1);
    expect(delta[0].amount).toBe(150_000);
    expect(delta[0].baseAmount).toBe(500_000);
    expect(delta[0].evidence.supplement).toBe(true);
    // Бүрэн тооцогдсон бол нэмэлт мөр үүсэхгүй.
    expect(
      diffCommissionRows(full.rows, [
        { agentProfileId: "a1", role: "selling", amount: 300_000, baseAmount: 1_000_000 },
      ])
    ).toHaveLength(0);
  });
});

describe("commission — татварын дараах суурь (F-455)", () => {
  it("татварын хувийг хасаж цэвэр суурь гаргана", () => {
    expect(netBaseAmount(1_000_000, 10)).toBe(900_000);
    expect(netBaseAmount(1_000_000, 0)).toBe(1_000_000);
    expect(netBaseAmount(0, 10)).toBe(0);
    expect(netBaseAmount(-5, 10)).toBe(0);
  });
});

describe("commission — хугацааны шатлал (F-465/502)", () => {
  const TIERS = [
    { code: "12m_plus", min_months: 12, fee_pct: 100 },
    { code: "6_11m", min_months: 6, fee_pct: 70 },
    { code: "1_5m", min_months: 1, fee_pct: 50 },
  ];

  it("сарын тоо — Postgres age() семантик", () => {
    expect(monthsBetween("2026-01-01", "2027-01-01")).toBe(12);
    expect(monthsBetween("2026-01-01", "2026-12-31")).toBe(11); // өдөр хүрээгүй
    expect(monthsBetween("2026-01-01", "2026-07-01")).toBe(6);
    expect(monthsBetween("2026-01-01", "2026-06-30")).toBe(5);
    expect(monthsBetween("2026-01-15", "2026-02-14")).toBe(0);
    expect(monthsBetween("2026-01-15", "2026-02-15")).toBe(1);
  });

  it("зааг дээрх өдрүүд зөв ангилагдана (12+/6–11/1–5)", () => {
    expect(classifyLeaseDuration("2026-01-01", "2027-01-01", TIERS)).toBe("12m_plus");
    expect(classifyLeaseDuration("2026-01-01", "2026-12-31", TIERS)).toBe("6_11m");
    expect(classifyLeaseDuration("2026-01-01", "2026-07-01", TIERS)).toBe("6_11m");
    expect(classifyLeaseDuration("2026-01-01", "2026-06-30", TIERS)).toBe("1_5m");
    expect(classifyLeaseDuration("2026-01-01", "2026-02-01", TIERS)).toBe("1_5m");
    // 1 сар хүрэхгүй — шатлалд буухгүй.
    expect(classifyLeaseDuration("2026-01-01", "2026-01-20", TIERS)).toBe(null);
  });

  it("шатлалын хувиар хөлс санал болгоно", () => {
    expect(suggestRentalFee(2_000_000, TIERS[1])).toBe(1_400_000); // 70%
    expect(suggestRentalFee(2_000_000, null)).toBe(0);
  });
});

describe("commission — сарын PM хуваарилалт (F-466)", () => {
  it("цэвэр орлого × харьцаа", () => {
    expect(calcMonthlyPmCommission(1_500_000, 10)).toBe(150_000);
    expect(calcMonthlyPmCommission(0, 10)).toBe(0);
    expect(calcMonthlyPmCommission(1_500_000, 0)).toBe(0);
    expect(calcMonthlyPmCommission(-100, 10)).toBe(0);
    expect(calcMonthlyPmCommission(999_999, 12.5)).toBe(124_999.88); // 124999.875 → банкны бус энгийн round2
  });
});
