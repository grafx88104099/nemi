import { describe, expect, it } from "vitest";

import { validateSettingValue } from "@/lib/crm2/settings-policies";

import * as editorModel from "../editor-model";
import {
  settingNotes,
  staffPickerView,
  staffRowText,
  toggleStaffId,
  writeCategoryHint,
} from "../editor-model";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const GONE = "44444444-4444-4444-8444-444444444444";

const staff = [
  { profile_id: B, name: "Болд", team_name: "Баг 1" },
  { profile_id: A, name: "Анар", team_name: null },
  { profile_id: C, name: "Цэцэг", team_name: "Баг 2" },
];

describe("staff picker", () => {
  it("lists selected in order, marks unknown ids inactive, sorts available by name", () => {
    const v = staffPickerView(staff, [C, GONE], "");
    expect(v.selected).toEqual([
      { id: C, name: "Цэцэг", team: "Баг 2", inactive: false },
      { id: GONE, name: "Идэвхгүй ажилтан", team: null, inactive: true },
    ]);
    expect(v.available.map((s) => s.name)).toEqual(["Анар", "Болд"]);
  });

  it("searches by name or team (folded)", () => {
    expect(staffPickerView(staff, [], "баг 1").available.map((s) => s.profile_id)).toEqual([B]);
    expect(staffPickerView(staff, [], "АНАР").available.map((s) => s.profile_id)).toEqual([A]);
  });

  it("matches ids case-insensitively", () => {
    expect(staffPickerView(staff, [A.toUpperCase()], "").selected[0].inactive).toBe(false);
  });

  it("toggles, lowercases and respects the maximum", () => {
    expect(toggleStaffId([], A.toUpperCase(), 20)).toEqual([A]);
    expect(toggleStaffId([A, B], A, 20)).toEqual([B]);
    expect(toggleStaffId([A, B], C, 2)).toEqual([A, B]);
    expect(validateSettingValue("staff.quick_add_pilot", toggleStaffId([A], B, 20))).toBeNull();
  });

  it("formats name · team", () => {
    expect(staffRowText("Болд", "Баг 1")).toBe("Болд · Баг 1");
    expect(staffRowText("Анар", null)).toBe("Анар");
  });
});

describe("commission defaults (retired 20261125000100)", () => {
  it("the editor helpers are gone — agents no longer fill commission", () => {
    for (const name of ["readCommissionRow", "writeCommissionRow", "commissionRowError", "commissionRowPreview", "commissionKindsFor"]) {
      expect(name in editorModel).toBe(false);
    }
  });
});

describe("category hints", () => {
  it("sets and clears a hint", () => {
    const m = writeCategoryHint({ rent: "Сарын түрээсээр" }, "sale", "Нийт үнээр");
    expect(m).toEqual({ rent: "Сарын түрээсээр", sale: "Нийт үнээр" });
    expect(writeCategoryHint(m, "rent", "  ")).toEqual({ sale: "Нийт үнээр" });
    expect(validateSettingValue("property.category_hints", writeCategoryHint({}, "lease", "x"))).toBeNull();
    expect(validateSettingValue("property.category_hints", {})).toBeNull();
  });
});

describe("setting notes", () => {
  const base = { "staff.quick_add": "off", "staff.quick_add_pilot": [], "digest.scope": "pilot", "ai.listing_parse": false };

  it("quick add always says shared posts open quick add; warns when pilot has nobody", () => {
    expect(settingNotes("staff.quick_add", base, { aiKeyConfigured: false }).map((n) => n.tone)).toEqual(["info"]);
    const pilot = settingNotes("staff.quick_add", { ...base, "staff.quick_add": "pilot" }, { aiKeyConfigured: false });
    expect(pilot.some((n) => n.tone === "warn")).toBe(true);
    const withList = settingNotes("staff.quick_add", { ...base, "staff.quick_add": "pilot", "staff.quick_add_pilot": [A] }, { aiKeyConfigured: false });
    expect(withList.some((n) => n.tone === "warn")).toBe(false);
  });

  it("pilot list keeps the full-form note", () => {
    const n = settingNotes("staff.quick_add_pilot", base, { aiKeyConfigured: false });
    expect(n[0].text).toContain("«Бүрэн форм»");
  });

  it("digest pilot without a list warns", () => {
    expect(settingNotes("digest.scope", base, { aiKeyConfigured: false })[0]?.tone).toBe("warn");
    expect(settingNotes("digest.scope", { ...base, "digest.scope": "all" }, { aiKeyConfigured: false })).toEqual([]);
  });

  it("AI: privacy warning always; key state is a boolean only", () => {
    const off = settingNotes("ai.listing_parse", base, { aiKeyConfigured: false });
    expect(off[0].tone).toBe("warn");
    expect(off[1].text).toContain("тохируулаагүй");
    const onNoKey = settingNotes("ai.listing_parse", { ...base, "ai.listing_parse": true }, { aiKeyConfigured: false });
    expect(onNoKey[1].tone).toBe("warn");
    const withKey = settingNotes("ai.listing_parse", base, { aiKeyConfigured: true });
    expect(withKey[1].text).toBe("Сервер дээр AI-ийн түлхүүр тохируулсан.");
  });

  it("no note for the retired commission key or plain settings", () => {
    expect(settingNotes("brokerage.default_commission", base, { aiKeyConfigured: false })).toEqual([]);
    expect(settingNotes("property.visibility", base, { aiKeyConfigured: false })).toEqual([]);
  });
});
