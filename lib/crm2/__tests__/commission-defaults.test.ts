import { describe, expect, it } from "vitest";

import {
  applyCommissionDefault,
  commissionDefaultError,
  formatCommissionDefault,
  parseCommissionDefault,
  suspiciousCommission,
} from "@/lib/crm2/commission-defaults";

const settings = {
  "brokerage.default_commission": { sale: "percent:3.2", rent: "rent_x:1", managed_rent: "percent:12", lease: "fixed:500000" },
};

describe("parseCommissionDefault", () => {
  it("зөв хэлбэр", () => {
    expect(parseCommissionDefault("percent:3")).toEqual({ kind: "percent", value: 3 });
    expect(parseCommissionDefault("rent_x:1.5")).toEqual({ kind: "rent_x", value: 1.5 });
    expect(parseCommissionDefault("fixed:500000")).toEqual({ kind: "fixed", value: 500000 });
  });
  it("DB-ийн дүрмээр буруу → null", () => {
    for (const bad of ["", "3", "percent:", "percent:3%", "percent:101", "rent_x:0", "rent_x:12.5", "fixed:-1", "percent:3.333", "x:1"]) {
      expect(parseCommissionDefault(bad), bad).toBeNull();
    }
    expect(parseCommissionDefault(null)).toBeNull();
    expect(commissionDefaultError("percent:101")).toMatch(/100/);
    expect(commissionDefaultError("rent_x:20")).toMatch(/0.1–12/);
    expect(commissionDefaultError("abc")).toMatch(/жишээ/);
    expect(commissionDefaultError("percent:3")).toBeNull();
  });
  it("буцааж бичих", () => {
    expect(formatCommissionDefault({ kind: "percent", value: 3 })).toBe("percent:3");
    expect(formatCommissionDefault({ kind: "percent", value: 2.5 })).toBe("percent:2.5");
    expect(formatCommissionDefault({ kind: "rent_x", value: 1.25 })).toBe("rent_x:1.25");
    expect(parseCommissionDefault(formatCommissionDefault({ kind: "fixed", value: 750000 }))).toEqual({ kind: "fixed", value: 750000 });
  });
});

describe("applyCommissionDefault", () => {
  const monthMnt = { price_total: 2_500_000, currency: "MNT", price_period: "month" };

  it("rent_x: төгрөгийн сарын нийт түрээс → тогтмол дүн + тайлбар", () => {
    expect(applyCommissionDefault("rent", monthMnt, settings)).toEqual({
      commission_type: "fixed",
      commission_value: 2_500_000,
      commission_note: "сарын түрээсийн 1 дахин",
      prefilledKey: "commission",
    });
    const half = applyCommissionDefault("rent", { ...monthMnt, price_total: 1_234_567 }, { "brokerage.default_commission": { rent: "rent_x:0.5" } });
    expect(half?.commission_value).toBe(617_284);
    expect(half?.commission_note).toBe("сарын түрээсийн 0.5 дахин");
  });

  it("rent_x: м²-ийн үнэ, өдрийн/нийт хугацаа, доллар, үнэгүй → null", () => {
    expect(applyCommissionDefault("rent", { ...monthMnt, price_basis: "per_m2" }, settings)).toBeNull();
    expect(applyCommissionDefault("rent", { ...monthMnt, price_period: "day" }, settings)).toBeNull();
    expect(applyCommissionDefault("rent", { ...monthMnt, price_period: "total" }, settings)).toBeNull();
    expect(applyCommissionDefault("rent", { ...monthMnt, currency: "USD" }, settings)).toBeNull();
    expect(applyCommissionDefault("rent", { ...monthMnt, price_total: null }, settings)).toBeNull();
    expect(applyCommissionDefault("rent", { ...monthMnt, price_total: 0 }, settings)).toBeNull();
  });

  it("percent ба fixed үнээс үл хамаарна", () => {
    expect(applyCommissionDefault("sale", { price_total: null, currency: "USD", price_period: "total" }, settings)).toMatchObject({
      commission_type: "percent",
      commission_value: 3.2,
      commission_note: null,
    });
    expect(applyCommissionDefault("lease", monthMnt, settings)).toMatchObject({ commission_type: "fixed", commission_value: 500000 });
  });

  it("тохиргоо хоосон, ангилалгүй, буруу утга → null", () => {
    expect(applyCommissionDefault("sale", monthMnt, { "brokerage.default_commission": {} })).toBeNull();
    expect(applyCommissionDefault(null, monthMnt, settings)).toBeNull();
    expect(applyCommissionDefault("sale", monthMnt, { "brokerage.default_commission": { sale: "percent:300" } })).toBeNull();
  });
});

describe("suspiciousCommission", () => {
  it("хувь ≥ 50, түрээсэд 100%", () => {
    expect(suspiciousCommission("percent", 100, "rent")).toMatch(/1 дахин/);
    expect(suspiciousCommission("percent", 100, "lease")).toMatch(/1 дахин/);
    expect(suspiciousCommission("percent", 60, "sale")).toMatch(/өндөр/);
    expect(suspiciousCommission("percent", 50, "sale")).toMatch(/өндөр/);
    expect(suspiciousCommission("percent", 3.2, "sale")).toBeNull();
    expect(suspiciousCommission("percent", 12, "managed_rent")).toBeNull();
    expect(suspiciousCommission("fixed", 5_000_000, "rent")).toBeNull();
    expect(suspiciousCommission("percent", null, "rent")).toBeNull();
  });
});
