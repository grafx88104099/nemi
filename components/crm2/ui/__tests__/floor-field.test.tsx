import { describe, expect, it } from "vitest";

import {
  floorBlurError,
  floorPreview,
  floorTextFromValues,
  floorValuesFromText,
  insertAtCaret,
  toggleLeadingMinus,
} from "@/components/crm2/staff/form/FloorField";
import { filterAgentRows, orderAgentRows } from "@/components/crm2/staff/form/AgentPicker";
import { undoSecondsLeft } from "@/components/crm2/ui/undo-snackbar";
import { convertPriceBasis, priceUnitFor, priceValueFromInput } from "@/components/crm2/staff/form/PriceField";

describe("FloorField helpers", () => {
  it("toggles a leading minus for basements (no minus key on the iOS keypad)", () => {
    expect(toggleLeadingMinus("1", 1)).toEqual({ value: "-1", caret: 2 });
    expect(toggleLeadingMinus("-1/9", 4)).toEqual({ value: "1/9", caret: 3 });
    expect(toggleLeadingMinus("", null)).toEqual({ value: "-", caret: 1 });
    expect(floorValuesFromText(toggleLeadingMinus("2/12", 0).value)).toEqual({ floor: "-2", building_floors: "12" });
  });

  it("shows the live preview for slash, space and dot separators", () => {
    expect(floorPreview("12/18")).toBe("12-р давхар / 18 давхартай");
    expect(floorPreview("12 18")).toBe("12-р давхар / 18 давхартай");
    expect(floorPreview("12.18")).toBe("12-р давхар / 18 давхартай");
    expect(floorPreview("12")).toBe("12-р давхар");
    expect(floorPreview("")).toBeNull();
  });

  it("maps text to form values and back", () => {
    expect(floorValuesFromText("12/18")).toEqual({ floor: "12", building_floors: "18" });
    expect(floorValuesFromText(" 5 ")).toEqual({ floor: "5", building_floors: "" });
    expect(floorValuesFromText("")).toEqual({ floor: "", building_floors: "" });
    expect(floorTextFromValues({ floor: "12", building_floors: "18" })).toBe("12/18");
    expect(floorTextFromValues({ floor: "3", building_floors: "" })).toBe("3");
    expect(floorTextFromValues({ floor: "", building_floors: "" })).toBe("");
  });

  it("keeps unreadable text in floor so nothing is lost", () => {
    expect(floorValuesFromText("12/18/3")).toEqual({ floor: "12/18/3", building_floors: "" });
  });

  it("validates on blur", () => {
    expect(floorBlurError("")).toBeNull();
    expect(floorBlurError("12/18")).toBeNull();
    expect(floorBlurError("20/9")).toBe("Давхар нь барилгын давхраас их байна");
    expect(floorBlurError("abc")).toMatch(/12\/18/);
  });

  it("inserts the separator at the caret", () => {
    expect(insertAtCaret("1218", 2, 2, "/")).toEqual({ value: "12/18", caret: 3 });
    expect(insertAtCaret("12", null, null, "/")).toEqual({ value: "12/", caret: 3 });
    expect(insertAtCaret("12x18", 2, 3, "/")).toEqual({ value: "12/18", caret: 3 });
  });

  it("previews basements", () => {
    expect(floorPreview("-1")).toBe("Газар доорх 1-р давхар");
    expect(floorPreview("-1/9")).toBe("Газар доорх 1-р давхар / 9 давхартай");
  });
});

describe("AgentPicker ordering", () => {
  const staff = [
    { profile_id: "c", name: "Цэцэг", team_id: "t2", team_name: "Б баг" },
    { profile_id: "b", name: "Бат", team_id: "t1", team_name: "А баг" },
    { profile_id: "me", name: "Миний нэр", team_id: "t1", team_name: "А баг" },
    { profile_id: "a", name: "Анар", team_id: "t1", team_name: "А баг" },
    { profile_id: "d", name: "Дулмаа", team_id: null, team_name: null },
  ];

  it("orders me, then my team, then the rest", () => {
    const rows = orderAgentRows(staff, "me", ["t1"], "b");
    expect(rows.map((r) => `${r.group}:${r.id}`)).toEqual(["me:me", "team:a", "team:b", "rest:d", "rest:c"]);
  });

  it("accepts member profile ids in teamIds", () => {
    const rows = orderAgentRows(staff, "me", ["c"], "");
    expect(rows.find((r) => r.id === "c")?.group).toBe("team");
  });

  it("keeps an unknown current value as an inactive row", () => {
    const rows = orderAgentRows(staff, "me", [], "gone");
    expect(rows[0]).toEqual({ id: "gone", name: "(идэвхгүй)", team: null, group: "inactive" });
  });

  it("filters by name and team but keeps me", () => {
    const rows = orderAgentRows(staff, "me", ["t1"], "");
    expect(filterAgentRows(rows, "дул").map((r) => r.id)).toEqual(["me", "d"]);
    expect(filterAgentRows(rows, "б баг").map((r) => r.id)).toEqual(["me", "c"]);
    expect(filterAgentRows(rows, "  ")).toHaveLength(rows.length);
  });
});

describe("UndoSnackbar countdown", () => {
  it("rounds the remaining seconds up", () => {
    expect(undoSecondsLeft(8000)).toBe(8);
    expect(undoSecondsLeft(7001)).toBe(8);
    expect(undoSecondsLeft(1)).toBe(1);
    expect(undoSecondsLeft(0)).toBe(0);
    expect(undoSecondsLeft(-5)).toBe(0);
  });
});

describe("PriceField helpers", () => {
  it("defaults to сая for MNT and to whole units for USD", () => {
    expect(priceUnitFor(null, "MNT")).toBe("сая");
    expect(priceUnitFor(350_000_000, "MNT")).toBe("сая");
    expect(priceUnitFor(2_500_000, "MNT")).toBe("сая");
    expect(priceUnitFor(25_000, "MNT")).toBe("none");
    expect(priceUnitFor(5_384_615, "MNT")).toBe("none");
    expect(priceUnitFor(null, "USD")).toBe("none");
  });

  it("turns the typed amount and unit into the full form value", () => {
    expect(priceValueFromInput("350", "сая")).toBe("350000000");
    expect(priceValueFromInput("2,5", "сая")).toBe("2500000");
    expect(priceValueFromInput("350000000", "none")).toBe("350000000");
    expect(priceValueFromInput("1.2", "тэрбум")).toBe("1200000000");
    expect(priceValueFromInput("", "сая")).toBe("");
    expect(priceValueFromInput("abc", "сая")).toBe("abc");
  });

  it("converts the price when the basis changes and the area is known", () => {
    expect(convertPriceBasis(350_000_000, "total", "per_m2", 65, "MNT")).toBe(5_384_615);
    expect(convertPriceBasis(5_000_000, "per_m2", "total", 70, "MNT")).toBe(350_000_000);
    expect(convertPriceBasis(1000, "total", "per_m2", 3, "USD")).toBe(333.33);
    expect(convertPriceBasis(350_000_000, "total", "per_m2", null, "MNT")).toBeNull();
    expect(convertPriceBasis(350_000_000, "total", "total", 65, "MNT")).toBe(350_000_000);
  });
});
