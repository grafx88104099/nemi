import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACTIVITY_KINDS,
  ACTIVITY_KIND_LABEL,
  BROKERAGE_STATUSES,
  BROKERAGE_STATUS_LABEL,
  BROKERAGE_STATUS_TONE,
  COMMISSION_TYPES,
  COMMISSION_TYPE_LABEL,
  CRM_ROLE_LABEL,
  DEAL_STAGES,
  DEAL_STAGE_LABEL,
  DEAL_STAGE_TONE,
  MEDIA_KINDS,
  MEDIA_KIND_LABEL,
  MISSING_ITEM_LABEL,
  PRICE_BASES,
  PRICE_BASIS_LABEL,
  PRICE_PERIODS,
  PRICE_PERIOD_LABEL,
  PROPERTY_CATEGORIES,
  PROPERTY_CATEGORY_LABEL,
  PROPERTY_CATEGORY_TONE,
  PROPERTY_STATUSES,
  PROPERTY_STATUS_GROUPS,
  PROPERTY_STATUS_LABEL,
  PROPERTY_STATUS_TONE,
  PROPERTY_TRANSITIONS,
  RECORD_STATUSES,
  RECORD_STATUS_LABEL,
  REQUEST_KINDS,
  REQUEST_KIND_LABEL,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABEL,
  SHOWING_STATUSES,
  SHOWING_STATUS_LABEL,
  SHOWING_STATUS_TONE,
  TASK_KINDS,
  TASK_KIND_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  canTransitionProperty,
  categoryLabel,
  codeKind,
  statusChangeNeedsReason,
} from "@/lib/crm2/labels";
import { CRM2_SETTING_DEFAULTS, CRM2_SETTING_KEYS, CRM2_SETTING_LABEL, parseCrm2Settings } from "@/lib/crm2/settings";

/**
 * Монгол нэр, тогтмол нь миграцийн enum, анхдагч тохиргоо, шилжилтийн дүрэмтэй
 * тохирч байгааг миграцийн SQL-ээс уншиж шалгана (DB-д холбогдохгүй).
 */
const SQL = fs.readFileSync(
  path.resolve(__dirname, "../../../supabase/migrations/20261113000100_crm2_foundation.sql"),
  "utf8"
);

function sqlEnum(name: string): string[] {
  const m = new RegExp(`create type public\\.${name}\\s+as enum \\(([^)]*)\\)`, "i").exec(SQL);
  if (!m) throw new Error(`enum ${name} олдсонгүй`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;

describe("enum бүр монгол нэртэй (миграцитай тааруулав)", () => {
  const cases: [string, readonly string[], Record<string, string>][] = [
    ["crm2_property_category", PROPERTY_CATEGORIES, PROPERTY_CATEGORY_LABEL],
    ["crm2_property_status", PROPERTY_STATUSES, PROPERTY_STATUS_LABEL],
    ["crm2_price_period", PRICE_PERIODS, PRICE_PERIOD_LABEL],
    ["crm2_media_kind", MEDIA_KINDS, MEDIA_KIND_LABEL],
    ["crm2_brokerage_status", BROKERAGE_STATUSES, BROKERAGE_STATUS_LABEL],
    ["crm2_commission_type", COMMISSION_TYPES, COMMISSION_TYPE_LABEL],
    ["crm2_record_status", RECORD_STATUSES, RECORD_STATUS_LABEL],
    ["crm2_deal_stage", DEAL_STAGES, DEAL_STAGE_LABEL],
    ["crm2_activity_kind", ACTIVITY_KINDS, ACTIVITY_KIND_LABEL],
    ["crm2_showing_status", SHOWING_STATUSES, SHOWING_STATUS_LABEL],
    ["crm2_price_basis", PRICE_BASES, PRICE_BASIS_LABEL],
    ["crm2_task_kind", TASK_KINDS, TASK_KIND_LABEL],
    ["crm2_task_status", TASK_STATUSES, TASK_STATUS_LABEL],
    ["crm2_request_kind", REQUEST_KINDS, REQUEST_KIND_LABEL],
    ["crm2_request_status", REQUEST_STATUSES, REQUEST_STATUS_LABEL],
  ];

  it("15 enum бүгд хамрагдсан", () => {
    const all = [...SQL.matchAll(/create type public\.(crm2_\w+)\s+as enum/gi)].map((m) => m[1]);
    expect(all.sort()).toEqual(cases.map((c) => c[0]).sort());
  });

  it.each(cases)("%s: утга, дараалал, нэр", (name, values, labels) => {
    expect([...values]).toEqual(sqlEnum(name));
    for (const v of values) expect(nonEmpty(labels[v]), `${name}.${v}`).toBe(true);
    expect(Object.keys(labels).sort()).toEqual([...values].sort());
  });

  it("өнгөний (tone) газрын зураг бүрэн", () => {
    for (const [values, tones] of [
      [PROPERTY_STATUSES, PROPERTY_STATUS_TONE],
      [PROPERTY_CATEGORIES, PROPERTY_CATEGORY_TONE],
      [DEAL_STAGES, DEAL_STAGE_TONE],
      [SHOWING_STATUSES, SHOWING_STATUS_TONE],
      [BROKERAGE_STATUSES, BROKERAGE_STATUS_TONE],
    ] as [readonly string[], Record<string, string>][]) {
      for (const v of values) expect(tones[v], v).toBeTruthy();
    }
  });

  it("crm_role бүр нэртэй", () => {
    const m = /^\s+crm_role:\s*$([\s\S]*?);/m.exec(fs.readFileSync(path.resolve(__dirname, "../../../types/database.ts"), "utf8"));
    const roles = [...(m?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
    expect(roles.length).toBeGreaterThan(5);
    for (const r of roles) expect(nonEmpty(CRM_ROLE_LABEL[r as keyof typeof CRM_ROLE_LABEL]), r).toBe(true);
  });
});

describe("хөрөнгийн төлөв", () => {
  it("харагдацын бүлэг төлөв бүрийг яг нэг удаа хамарна", () => {
    const grouped = Object.values(PROPERTY_STATUS_GROUPS).flat().sort();
    expect(grouped).toEqual([...PROPERTY_STATUSES].sort());
    expect([...PROPERTY_STATUS_GROUPS.archive].sort()).toEqual(["archived", "contract_ended"]);
  });

  it("шилжилт crm2_property_transition_ok()-той ижил", () => {
    const body = /create function public\.crm2_property_transition_ok[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(SQL)?.[1] ?? "";
    const rules = new Map<string, string[]>();
    for (const m of body.matchAll(/when '(\w+)'\s+then p_to in \(([^)]*)\)/g)) {
      rules.set(m[1], [...m[2].matchAll(/'(\w+)'/g)].map((x) => x[1]));
    }
    expect([...rules.keys()].sort()).toEqual([...PROPERTY_STATUSES].sort());
    for (const from of PROPERTY_STATUSES) {
      expect([...PROPERTY_TRANSITIONS[from]].sort(), from).toEqual([...(rules.get(from) ?? [])].sort());
      for (const to of PROPERTY_STATUSES) {
        expect(canTransitionProperty(from, to)).toBe(rules.get(from)?.includes(to) ?? false);
      }
    }
  });

  it("идэвхжүүлэлт (ноорог/гэрээ дууссан → идэвхтэй) шалтгаангүй", () => {
    expect(statusChangeNeedsReason("draft", "active")).toBe(false);
    expect(statusChangeNeedsReason("contract_ended", "active")).toBe(false);
    expect(statusChangeNeedsReason("suspended", "active")).toBe(true);
    expect(statusChangeNeedsReason("active", "sold")).toBe(true);
  });
});

describe("тохиргоо", () => {
  const defaults = new Map<string, unknown>();
  const body = /create function public\.crm2_setting_default[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(SQL)?.[1] ?? "";
  for (const m of body.matchAll(/when '([a-z0-9_.]+)'\s+then '([^\n]*)'\s*$/gm)) defaults.set(m[1], JSON.parse(m[2]));

  it("түлхүүрүүд crm2_setting_keys()-тэй ижил", () => {
    const keys = /create function public\.crm2_setting_keys[\s\S]*?array\[([\s\S]*?)\]/.exec(SQL)?.[1] ?? "";
    const list = [...keys.matchAll(/'([a-z0-9_.]+)'/g)].map((x) => x[1]);
    expect([...CRM2_SETTING_KEYS].sort()).toEqual(list.sort());
  });

  it("анхдагч утга crm2_setting_default()-тэй ижил", () => {
    expect(defaults.size).toBe(CRM2_SETTING_KEYS.length);
    for (const key of CRM2_SETTING_KEYS) expect(CRM2_SETTING_DEFAULTS[key], key).toEqual(defaults.get(key));
  });

  it("түлхүүр бүр монгол нэртэй", () => {
    for (const key of CRM2_SETTING_KEYS) expect(nonEmpty(CRM2_SETTING_LABEL[key]), key).toBe(true);
  });

  it("parseCrm2Settings: буруу/дутуу утгад анхдагч, зөвийг хадгална", () => {
    const s = parseCrm2Settings({
      "media.max_images": 10,
      "media.max_videos": "x",
      "property.districts": ["Баянгол", 5],
      "property.category_labels": { rent: "Урт хугацааны түрээс" },
      "brokerage.remind_days_before": [14, "7"],
    });
    expect(s["media.max_images"]).toBe(10);
    expect(s["media.max_videos"]).toBe(5);
    expect(s["property.districts"]).toEqual(["Баянгол"]);
    expect(s["property.category_labels"].rent).toBe("Урт хугацааны түрээс");
    expect(s["property.category_labels"].sale).toBe("Зарах");
    expect(s["brokerage.remind_days_before"]).toEqual([14]);
    expect(parseCrm2Settings(null)).toEqual(CRM2_SETTING_DEFAULTS);
  });

  it("ангиллын нэрийг тохиргоогоор дарна", () => {
    expect(categoryLabel("rent")).toBe("Түрээслэх");
    expect(categoryLabel("rent", { rent: "Сарын түрээс" })).toBe("Сарын түрээс");
    expect(categoryLabel("lease", { lease: "  " })).toBe("Хөлслөх");
  });
});

describe("идэвхжүүлэх дутуу зүйлийн нэр crm2_missing_text()-тэй ижил", () => {
  it("бүх код ба нэр", () => {
    const body = /create function public\.crm2_missing_text[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(SQL)?.[1] ?? "";
    const pairs = [...body.matchAll(/when '(\w+)' then '([^']+)'/g)].map((m) => [m[1], m[2]] as const);
    expect(pairs.length).toBeGreaterThan(10);
    for (const [k, v] of pairs) expect(MISSING_ITEM_LABEL[k], k).toBe(v);
    expect(Object.keys(MISSING_ITEM_LABEL).sort()).toEqual(pairs.map((p) => p[0]).sort());
  });
});

describe("codeKind", () => {
  it("угтвараар төрөл", () => {
    expect(codeKind("P001")).toBe("property");
    expect(codeKind("C012")).toBe("contact");
    expect(codeKind("D7")).toBe("deal");
    expect(codeKind("B001")).toBe("brokerage");
    expect(codeKind("X1")).toBeNull();
    expect(codeKind(null)).toBeNull();
  });
});
