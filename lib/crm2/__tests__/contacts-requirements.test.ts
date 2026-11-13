import { describe, expect, it } from "vitest";

import {
  budgetText,
  changedRequirementFields,
  lineFieldsOf,
  periodForCategory,
  rangeText,
  requirementFormFrom,
  requirementInputFromForm,
  requirementLines,
  requirementTitle,
  splitList,
  toRequirementData,
} from "@/lib/crm2/contacts-requirements";
import { requirementCreateSchema } from "@/lib/crm2/schemas";

const ROW = {
  id: "00000000-0000-4000-8000-000000000001",
  purpose: null,
  category: "rent",
  property_type: "apartment",
  budget_min: "1500000.00",
  budget_max: 2500000,
  currency: "MNT",
  price_period: "month",
  districts: ["Хан-Уул", "Сүхбаатар"],
  locations: ["Зайсан"],
  rooms_min: 2,
  rooms_max: 3,
  area_min: null,
  area_max: 80,
  move_in_from: "2026-12-01",
  move_in_note: "шинэ жилээс өмнө",
  required_features: ["parking"],
  must_haves: ["Сургуульд ойр"],
  notes: null,
  status: "active",
  version: 2,
};

describe("шаардлага — задлалт ба тойм", () => {
  it("мөр/snapshot-ыг (numeric мөрийг ч) шалгуур болгоно", () => {
    const d = toRequirementData(ROW as never);
    expect(d.budget_min).toBe(1500000);
    expect(d.category).toBe("rent");
    expect(d.districts).toEqual(["Хан-Уул", "Сүхбаатар"]);
    const empty = toRequirementData(null);
    expect(empty.currency).toBe("MNT");
    expect(empty.price_period).toBe("total");
    expect(empty.category).toBeNull();
    expect(toRequirementData({ category: "bogus", currency: "EUR" }).category).toBeNull();
  });

  it("муж ба төсвийн текст", () => {
    expect(rangeText(2, 3)).toBe("2–3");
    expect(rangeText(2, 2)).toBe("2");
    expect(rangeText(2, null)).toBe("2-аас дээш");
    expect(rangeText(null, 80, "м²")).toBe("80 м² хүртэл");
    expect(rangeText(null, null)).toBeNull();
    expect(budgetText({ budget_min: 1500000, budget_max: 2500000, currency: "MNT", price_period: "month" })).toBe(
      "1,500,000–2,500,000₮/сар"
    );
    expect(budgetText({ budget_min: null, budget_max: 150000, currency: "USD", price_period: "total" })).toBe("$150,000 хүртэл");
    expect(budgetText({ budget_min: 1000, budget_max: 2000, currency: "USD", price_period: "month" })).toBe("$1,000–2,000/сар");
    expect(budgetText({ budget_min: null, budget_max: null, currency: "MNT", price_period: "total" })).toBeNull();
  });

  it("гарчиг ба мөрүүд (тохиргооны нэрээр)", () => {
    const d = toRequirementData(ROW as never);
    const lookup = { types: { apartment: "Орон сууц" }, features: { parking: "Зогсоол" } };
    expect(requirementTitle(d, lookup)).toBe("Түрээслэх · Орон сууц");
    expect(requirementTitle({ ...d, purpose: "Гэр бүл" })).toBe("Гэр бүл");
    expect(requirementTitle(toRequirementData(null))).toBe("Шаардлага");
    const lines = requirementLines(d, lookup);
    const by = Object.fromEntries(lines.map((l) => [l.field, l.value]));
    expect(by.property_type).toBe("Орон сууц");
    expect(by.rooms).toBe("2–3");
    expect(by.area).toBe("80 м² хүртэл");
    expect(by.move_in).toBe("2026.12.01 · шинэ жилээс өмнө");
    expect(by.required_features).toBe("Зогсоол");
    expect(by.notes).toBeUndefined();
  });

  it("хувилбарын ялгаа (жагсаалтын дараалал үл хамаарна)", () => {
    const a = toRequirementData(ROW as never);
    const b = toRequirementData({ ...ROW, districts: ["Сүхбаатар", "Хан-Уул"], budget_max: 3000000, rooms_min: 1 } as never);
    const changed = changedRequirementFields(a, b);
    expect(changed).toEqual(["budget_max", "rooms_min"]);
    expect([...lineFieldsOf(changed)].sort()).toEqual(["budget", "rooms"]);
    expect(changedRequirementFields(a, a)).toEqual([]);
  });
});

describe("шаардлагын маягт", () => {
  it("жагсаалт задлах", () => {
    expect(splitList("Зайсан, Яармаг; Зайсан\n")).toEqual(["Зайсан", "Яармаг"]);
    expect(splitList("a, b\nc", /\n/)).toEqual(["a, b", "c"]);
  });

  it("ангилал солиход үнийн хугацаа", () => {
    expect(periodForCategory("sale", "month")).toBe("total");
    expect(periodForCategory("rent", "total")).toBe("month");
    expect(periodForCategory("lease", "total")).toBe("day");
    expect(periodForCategory("rent", "day")).toBe("day");
    expect(periodForCategory("", "month")).toBe("month");
  });

  it("мөр → маягт → action-ийн оролт → schema", () => {
    const form = requirementFormFrom(toRequirementData(ROW as never));
    expect(form.locations).toBe("Зайсан");
    expect(form.must_haves).toBe("Сургуульд ойр");
    expect(form.budget_min).toBe("1500000");
    const input = requirementInputFromForm({ ...form, area_min: "", must_haves: "Сургуульд ойр\nЛифттэй" });
    const parsed = requirementCreateSchema.safeParse({ contact_id: ROW.id, ...input });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.budget_min).toBe(1500000);
      expect(parsed.data.area_min).toBeNull();
      expect(parsed.data.must_haves).toEqual(["Сургуульд ойр", "Лифттэй"]);
      expect(parsed.data.locations).toEqual(["Зайсан"]);
      expect(parsed.data.purpose).toBeNull();
    }
  });

  it("зарах ангилалд үнийн хугацаа нийт болно", () => {
    const form = { ...requirementFormFrom(null), category: "sale" as const, price_period: "month" as const };
    expect(requirementInputFromForm(form).price_period).toBe("total");
    const empty = requirementInputFromForm(requirementFormFrom(null));
    expect(empty.category).toBeNull();
    expect(requirementCreateSchema.safeParse({ contact_id: ROW.id, ...empty }).success).toBe(true);
  });
});
