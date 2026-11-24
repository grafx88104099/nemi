import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CRM2_SETTING_DEFAULTS, CRM2_SETTING_KEYS, type Crm2SettingKey } from "@/lib/crm2/settings";
import {
  ACTIVATION_FIELD_VALUES,
  CRM_ROLES,
  DEFAULT_DECISIONS,
  SETTING_DESCRIPTION,
  SETTING_GROUPS,
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

const MIGRATIONS = path.resolve(__dirname, "../../../supabase/migrations");

/** Функцийн хамгийн сүүлийн тодорхойлолтын бие (миграцуудыг нэрээр эрэмбэлж, сүүлийнх). */
function latestFn(name: string): string {
  const re = new RegExp(`create (?:or replace )?function public\\.${name}\\b[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "g");
  let body: string | null = null;
  for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) {
    for (const m of fs.readFileSync(path.join(MIGRATIONS, f), "utf8").matchAll(re)) body = m[1];
  }
  if (body === null) throw new Error(`функц ${name} олдсонгүй`);
  return body;
}

const SET_SETTING = latestFn("crm2_set_setting");
const PILOT_A = "aaaaaaaa-1111-4111-8111-11111111111f";
const PILOT_B = "22222222-2222-4222-8222-222222222222";

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
        staffPicker: "array",
        commissionDefaults: "object",
        categoryHints: "object",
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
    const body = SET_SETTING;
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
    for (const k of [
      "property.visibility",
      "approvals.allow_self",
      "brokerage.on_expiry",
      "contact.foreign_deal",
      "staff.quick_add",
      "digest.scope",
      "brokerage.activation_mode",
    ] as const) {
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

describe("Staff шуурхай бүртгэлийн тохиргоо (20261124000200)", () => {
  const NEW_KEYS: Crm2SettingKey[] = [
    "property.category_hints",
    "property.duplicate_check",
    "property.min_images",
    "brokerage.default_term_months",
    "brokerage.default_commission",
    "brokerage.activation_mode",
    "brokerage.require_special_terms",
    "brokerage.require_ownership_doc",
    "contact.sources",
    "staff.quick_add",
    "staff.quick_add_pilot",
    "digest.scope",
    "digest.owner_days",
    "digest.pending_days",
    "ai.listing_parse",
  ];

  it("15 шинэ түлхүүр бүгд бүлэгтэй, тайлбартай", () => {
    const groups = new Map(SETTING_GROUPS.flatMap((g) => g.keys.map((k) => [k, g.id] as const)));
    for (const k of NEW_KEYS) {
      expect(CRM2_SETTING_KEYS, k).toContain(k);
      expect(groups.has(k), k).toBe(true);
      expect(SETTING_DESCRIPTION[k].length, k).toBeGreaterThan(10);
    }
    const quick = SETTING_GROUPS.find((g) => g.title === "Шуурхай бүртгэл ба сануулга");
    expect(quick?.keys.sort()).toEqual(
      [
        "staff.quick_add",
        "staff.quick_add_pilot",
        "digest.scope",
        "digest.owner_days",
        "digest.pending_days",
        "ai.listing_parse",
        "property.duplicate_check",
      ].sort()
    );
    expect(groups.get("contact.sources")).toBe("deals");
    for (const k of ["brokerage.default_commission", "brokerage.default_term_months", "brokerage.require_ownership_doc", "property.min_images"] as const) {
      expect(groups.get(k), k).toBe("staff");
    }
  });

  it("тоон хязгаар crm2_set_setting-тэй ижил", () => {
    for (const m of SET_SETTING.matchAll(/\('([a-z0-9_.]+)', (\d+), (\d+)\)/g)) {
      const ed = settingEditor(m[1] as Crm2SettingKey);
      expect(ed.kind, m[1]).toBe("number");
      if (ed.kind === "number") expect([ed.min, ed.max], m[1]).toEqual([Number(m[2]), Number(m[3])]);
    }
    expect(validateSettingValue("property.min_images", 0)).toBeNull();
    expect(validateSettingValue("property.min_images", 21)).toMatch(/0–20/);
    expect(validateSettingValue("brokerage.default_term_months", 0)).toMatch(/1–60/);
  });

  it("туршилтын агент: uuid, давхардалгүй, 20 хүртэл", () => {
    expect(settingEditor("staff.quick_add_pilot")).toEqual({ kind: "staffPicker", maxItems: 20 });
    expect(validateSettingValue("staff.quick_add_pilot", [])).toBeNull();
    expect(validateSettingValue("staff.quick_add_pilot", [PILOT_A, PILOT_B])).toBeNull();
    expect(validateSettingValue("staff.quick_add_pilot", ["not-a-uuid"])).toMatch(/буруу/);
    expect(validateSettingValue("staff.quick_add_pilot", [PILOT_A.toUpperCase()])).toMatch(/буруу/);
    expect(validateSettingValue("staff.quick_add_pilot", [5])).toMatch(/буруу/);
    expect(validateSettingValue("staff.quick_add_pilot", [PILOT_A, PILOT_A])).toMatch(/давхар/);
    const many = Array.from({ length: 21 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(validateSettingValue("staff.quick_add_pilot", many)).toMatch(/20/);
    expect(normalizeSettingValue("staff.quick_add_pilot", [` ${PILOT_A.toUpperCase()} `, PILOT_A])).toEqual([PILOT_A]);
    expect(sameSettingValue("staff.quick_add_pilot", [PILOT_A, PILOT_B], [PILOT_B, PILOT_A])).toBe(true);
    expect(settingValueText("staff.quick_add_pilot", [PILOT_A])).toBe("1 агент");
  });

  it("шимтгэлийн анхдагч: SQL-ийн regex ба хязгаар", () => {
    expect(settingEditor("brokerage.default_commission")).toEqual({ kind: "commissionDefaults" });
    expect(validateSettingValue("brokerage.default_commission", {})).toBeNull();
    expect(validateSettingValue("brokerage.default_commission", { sale: "percent:3.2", lease: "rent_x:1", rent: "fixed:500000" })).toBeNull();
    expect(validateSettingValue("brokerage.default_commission", { sale: "percent:101" })).toMatch(/100/);
    expect(validateSettingValue("brokerage.default_commission", { rent: "rent_x:13" })).toMatch(/0.1–12/);
    expect(validateSettingValue("brokerage.default_commission", { rent: "rent_x:0.05" })).toMatch(/0.1–12/);
    expect(validateSettingValue("brokerage.default_commission", { rent: "3%" })).toMatch(/буруу/);
    expect(validateSettingValue("brokerage.default_commission", { rent: "percent:3.333" })).toMatch(/буруу/);
    expect(validateSettingValue("brokerage.default_commission", { house: "percent:3" })).toMatch(/4 ангилл/);
    expect(normalizeSettingValue("brokerage.default_commission", { sale: " percent:3 ", rent: "" })).toEqual({ sale: "percent:3" });
    expect(settingValueText("brokerage.default_commission", {})).toBe("Урьдчилан бөглөхгүй");
    expect(settingValueText("brokerage.default_commission", { sale: "percent:3", lease: "rent_x:1", rent: "fixed:500000" })).toBe(
      "Зарах: 3%; Хөлслөх: сарын түрээсийн 1 дахин; Түрээслэх: 500 000 ₮"
    );
    // SQL-ийн regex ижил.
    expect(SET_SETTING).toContain("'^(percent|rent_x|fixed):[0-9]{1,10}(\\.[0-9]{1,2})?$'");
  });

  it("ангиллын тайлбар: 4 ангиллын дурын дэд олонлог, 80 тэмдэгт", () => {
    expect(settingEditor("property.category_hints")).toEqual({ kind: "categoryHints", maxLabel: 80 });
    expect(validateSettingValue("property.category_hints", {})).toBeNull();
    expect(validateSettingValue("property.category_hints", { lease: "Хоногоор" })).toBeNull();
    expect(validateSettingValue("property.category_hints", { other: "x" })).toMatch(/4 ангилал/);
    expect(validateSettingValue("property.category_hints", { rent: "x".repeat(81) })).toMatch(/1–80/);
    expect(validateSettingValue("property.category_hints", { rent: " " })).toMatch(/1–80/);
  });

  it("эх сурвалж: «other» заавал, анхдагч 10 код", () => {
    expect(settingEditor("contact.sources")).toMatchObject({ kind: "codeLabel", requiredCodes: ["other"] });
    expect(validateSettingValue("contact.sources", { digital: "Онлайн" })).toMatch(/other/);
    expect(Object.keys(CRM2_SETTING_DEFAULTS["contact.sources"])).toEqual([
      "digital",
      "referral",
      "prospecting",
      "walk_in",
      "open_house",
      "listing_inquiry",
      "personal_network",
      "international",
      "pm_cross",
      "other",
    ]);
  });

  it("идэвхжүүлэх шаардлагад owner_source, owner_name, unconfirmed", () => {
    for (const v of ["owner_source", "owner_name", "unconfirmed"]) expect(ACTIVATION_FIELD_VALUES).toContain(v);
    expect(validateSettingValue("property.activation_required", ["owner_source", "unconfirmed"])).toBeNull();
  });

  it("эзний шийдвэрт шинэ анхдагчууд орсон", () => {
    const keys = new Set(DEFAULT_DECISIONS.flatMap((d) => d.keys));
    for (const k of [
      "staff.quick_add_pilot",
      "brokerage.default_commission",
      "brokerage.default_term_months",
      "brokerage.activation_mode",
      "ai.listing_parse",
      "property.min_images",
      "brokerage.require_ownership_doc",
    ] as const) {
      expect(keys.has(k), k).toBe(true);
    }
  });
});
