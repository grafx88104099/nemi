import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CRM2_SETTING_DEFAULTS, CRM2_SETTING_KEYS, type Crm2SettingKey } from "@/lib/crm2/settings";
import {
  ACTIVATION_FIELD_VALUES,
  CRM_ROLES,
  DEFAULT_DECISIONS,
  SETTING_DESCRIPTION,
  canEditSetting,
  groupedSettingKeys,
  isDefaultSetting,
  normalizeSettingValue,
  sameSettingValue,
  settingEditor,
  settingLockReason,
  settingValueText,
  validateSettingValue,
} from "@/lib/crm2/settings-policies";

const SQL = fs.readFileSync(
  path.resolve(__dirname, "../../../supabase/migrations/20261113000100_crm2_foundation.sql"),
  "utf8"
);

describe("тохиргооны дэлгэцийн бүтэц", () => {
  it("түлхүүр бүр яг нэг бүлэгт, тайлбартай", () => {
    const grouped = groupedSettingKeys();
    expect([...grouped].sort()).toEqual([...CRM2_SETTING_KEYS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
    for (const k of CRM2_SETTING_KEYS) expect(SETTING_DESCRIPTION[k]?.trim().length, k).toBeGreaterThan(10);
  });

  it("засварлагчийн төрөл анхдагч утгын төрөлтэй таарна", () => {
    for (const key of CRM2_SETTING_KEYS) {
      const def = CRM2_SETTING_DEFAULTS[key];
      const ed = settingEditor(key);
      const shape = Array.isArray(def) ? "array" : typeof def;
      const want = {
        boolean: "boolean",
        number: "number",
        choice: "string",
        numberList: "array",
        multi: "array",
        stringList: "array",
        codeLabel: "object",
      }[ed.kind];
      expect(shape, key).toBe(want);
    }
  });

  it("анхдагч утга бүр шалгалтыг давна, анхдагч гэж танигдана", () => {
    for (const key of CRM2_SETTING_KEYS) {
      const def = CRM2_SETTING_DEFAULTS[key];
      expect(validateSettingValue(key, def), key).toBeNull();
      expect(isDefaultSetting(key, def), key).toBe(true);
      expect(settingValueText(key, def).length, key).toBeGreaterThan(0);
    }
  });

  it("тоймын шийдвэрүүд бодит түлхүүр заана", () => {
    for (const d of DEFAULT_DECISIONS) {
      expect(d.keys.length).toBeGreaterThan(0);
      for (const k of d.keys) expect(CRM2_SETTING_KEYS).toContain(k);
    }
  });

  it("crm_role жагсаалт types/database.ts-тэй ижил", () => {
    const m = /^\s+crm_role:\s*$([\s\S]*?);/m.exec(fs.readFileSync(path.resolve(__dirname, "../../../types/database.ts"), "utf8"));
    const roles = [...(m?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
    expect([...CRM_ROLES].sort()).toEqual(roles.sort());
  });

  it("сонголтын жагсаалт crm2_set_setting-ийн зөвшөөрөгдсөн утгатай ижил", () => {
    const body = /create function public\.crm2_set_setting[\s\S]*?\$\$([\s\S]*?)\$\$;/.exec(SQL)?.[1] ?? "";
    const arr = (key: string) => {
      const m = new RegExp(`p_key = '${key.replace(".", "\\.")}' then array\\[([\\s\\S]*?)\\]`).exec(body);
      return [...(m?.[1] ?? "").matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    };
    const opts = (key: Crm2SettingKey) => {
      const ed = settingEditor(key);
      return ed.kind === "multi" ? ed.options.map((o) => o.value).sort() : [];
    };
    expect(arr("property.activation_required")).toEqual([...ACTIVATION_FIELD_VALUES].sort());
    expect(opts("property.activation_required")).toEqual([...ACTIVATION_FIELD_VALUES].sort());
    expect(opts("property.agent_direct_statuses")).toEqual(arr("property.agent_direct_statuses"));
    expect(opts("deal.open_property_statuses")).toEqual(arr("deal.open_property_statuses"));
    for (const k of ["property.visibility", "approvals.allow_self", "brokerage.on_expiry", "contact.foreign_deal"] as const) {
      const ed = settingEditor(k);
      const m = new RegExp(`when '${k.replace(".", "\\.")}' then array\\[([^\\]]*)\\]`).exec(body);
      const sqlValues = [...(m?.[1] ?? "").matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
      expect(ed.kind === "choice" ? ed.options.map((o) => o.value).sort() : [], k).toEqual(sqlValues);
    }
  });
});

describe("утгын шалгалт", () => {
  it("тоо: бүхэл, хязгаартай", () => {
    expect(validateSettingValue("media.max_images", 40)).toBeNull();
    expect(validateSettingValue("media.max_images", 0)).toMatch(/1–200/);
    expect(validateSettingValue("docs.max_file_mb", 21)).toMatch(/1–20/);
    expect(validateSettingValue("activity.edit_window_hours", 1.5)).toMatch(/Бүхэл/);
    expect(validateSettingValue("activity.edit_window_hours", Number.NaN)).toMatch(/Тоо/);
  });

  it("сануулгын хоног: 0–365 бүхэл, 20 хүртэл; жигдрүүлэхэд давхардалгүй буурахаар", () => {
    expect(validateSettingValue("brokerage.remind_days_before", [])).toBeNull();
    expect(validateSettingValue("brokerage.remind_days_before", [400])).toMatch(/0–365/);
    expect(validateSettingValue("brokerage.remind_days_before", Array.from({ length: 21 }, (_, i) => i))).toMatch(/20/);
    expect(normalizeSettingValue("brokerage.remind_days_before", [1, 30, 7, 30])).toEqual([30, 7, 1]);
  });

  it("дүр: системийн админд батлах/санхүүгийн эрх олгохгүй; хоосон байж болохгүй жагсаалт", () => {
    expect(validateSettingValue("roles.approve", ["ceo", "sysadmin"])).toMatch(/Системийн админ/);
    expect(validateSettingValue("roles.finance", ["sysadmin"])).toMatch(/Системийн админ/);
    expect(validateSettingValue("roles.work", ["sysadmin"])).toBeNull();
    expect(validateSettingValue("roles.work", [])).toMatch(/нэгийг/);
    expect(validateSettingValue("roles.finance", [])).toBeNull();
    expect(validateSettingValue("deal.open_property_statuses", [])).toMatch(/нэгийг/);
    expect(validateSettingValue("deal.open_property_statuses", ["sold"])).toMatch(/зөвшөөрөгдөөгүй/);
  });

  it("дүүрэг: хоосон биш, давхардалгүй, зайгүй", () => {
    expect(validateSettingValue("property.districts", [])).toMatch(/нэг/);
    expect(validateSettingValue("property.districts", ["А", "А"])).toMatch(/давхардсан/);
    expect(validateSettingValue("property.districts", [" А"])).toMatch(/зайгүй/);
    expect(normalizeSettingValue("property.districts", [" А ", "", "Б"])).toEqual(["А", "Б"]);
  });

  it("код/нэр: кодын хэлбэр, ангиллын 4 код, «other» заавал", () => {
    expect(validateSettingValue("property.types", { apartment: "Орон сууц", "Bad-Code": "x" })).toMatch(/код буруу/);
    expect(validateSettingValue("property.types", { apartment: " " })).toMatch(/1–80/);
    expect(validateSettingValue("property.category_labels", { rent: "Т", sale: "З" })).toMatch(/ангиллын/);
    expect(validateSettingValue("deal.cancel_reasons", { price: "Үнэ" })).toMatch(/other/);
    expect(validateSettingValue("deal.cancel_reasons", { price: "Үнэ", other: "Бусад" })).toBeNull();
    expect(normalizeSettingValue("property.features", { parking: " Зогсоол " })).toEqual({ parking: "Зогсоол" });
  });

  it("сонголт", () => {
    expect(validateSettingValue("property.visibility", "team")).toBeNull();
    expect(validateSettingValue("property.visibility", "everyone")).toMatch(/Сонголт/);
    expect(validateSettingValue("deal.auto_advance", "true")).toMatch(/Тийм/);
  });
});

describe("харьцуулалт ба текст", () => {
  it("жагсаалтын дараалал, объектын түлхүүрийн дараалал харьцуулалтад нөлөөлөхгүй", () => {
    expect(sameSettingValue("roles.approve", ["ceo", "ops_qc"], ["ops_qc", "ceo"])).toBe(true);
    expect(sameSettingValue("property.features", { a: "1", b: "2" }, { b: "2", a: "1" })).toBe(true);
    expect(sameSettingValue("property.districts", ["А", "Б"], ["Б", "А"])).toBe(false);
    expect(isDefaultSetting("approvals.team_lead", false)).toBe(false);
  });

  it("утгын текст", () => {
    expect(settingValueText("approvals.team_lead", true)).toBe("Тийм");
    expect(settingValueText("media.max_image_mb", 15)).toBe("15 МБ");
    expect(settingValueText("brokerage.remind_days_before", [1, 30, 7])).toBe("30, 7, 1 хоног");
    expect(settingValueText("brokerage.remind_days_before", [])).toBe("Сануулахгүй");
    expect(settingValueText("property.visibility", "office")).toBe("Оффисын бүх ажилтан");
    expect(settingValueText("roles.finance", ["finance"])).toBe("Санхүү");
    expect(settingValueText("property.agent_direct_statuses", [])).toBe("Байхгүй");
  });
});

describe("засах эрх", () => {
  const admin = { canManageSettings: true, canManageAccessSettings: false };
  const ceo = { canManageSettings: true, canManageAccessSettings: true };
  const agent = { canManageSettings: false, canManageAccessSettings: false };
  it("roles.* ба approvals.* — зөвхөн CEO", () => {
    expect(canEditSetting("roles.approve", admin)).toBe(false);
    expect(canEditSetting("approvals.allow_self", admin)).toBe(false);
    expect(canEditSetting("media.max_images", admin)).toBe(true);
    expect(canEditSetting("roles.approve", ceo)).toBe(true);
    expect(canEditSetting("media.max_images", agent)).toBe(false);
    expect(canEditSetting("media.max_images", null)).toBe(false);
    expect(settingLockReason("roles.work", admin)).toMatch(/гүйцэтгэх захирал/);
    expect(settingLockReason("media.max_images", ceo)).toBeNull();
    expect(settingLockReason("media.max_images", agent)).toBeTruthy();
  });
});
