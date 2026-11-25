import { describe, expect, it } from "vitest";

import { aiParseAllowed, isPilot, isUiEvent, quickAddEnabled, sharedToFullForm, staffNewScreen, UI_EVENTS } from "@/lib/crm2/feature-flags";
import { STAFF_SHARE_PATH, crm2Paths } from "@/lib/crm2/paths";
import { CRM2_SETTING_DEFAULTS, parseCrm2Settings } from "@/lib/crm2/settings";

const ME = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "bbbbbbbb-0000-4000-8000-000000000002";

const off = CRM2_SETTING_DEFAULTS;
const pilot = { ...off, "staff.quick_add": "pilot" as const, "staff.quick_add_pilot": [ME] };
const all = { ...off, "staff.quick_add": "all" as const };

describe("quickAddEnabled", () => {
  it("анхдагч (off) — хэнд ч нээгдэхгүй", () => {
    expect(quickAddEnabled(off, ME)).toBe(false);
  });
  it("pilot — зөвхөн жагсаалтын хүмүүст", () => {
    expect(quickAddEnabled(pilot, ME)).toBe(true);
    expect(quickAddEnabled(pilot, ME.toUpperCase())).toBe(true);
    expect(quickAddEnabled(pilot, OTHER)).toBe(false);
    expect(isPilot(pilot, null)).toBe(false);
  });
  it("all — бүгдэд", () => {
    expect(quickAddEnabled(all, ME)).toBe(true);
    expect(quickAddEnabled(all, OTHER)).toBe(true);
    expect(quickAddEnabled(all, null)).toBe(false);
  });
  it("DB-д түлхүүр байхгүй эсвэл буруу утга → off", () => {
    expect(quickAddEnabled(parseCrm2Settings({}), ME)).toBe(false);
    expect(quickAddEnabled(parseCrm2Settings({ "staff.quick_add": "yes" }), ME)).toBe(false);
    expect(quickAddEnabled({}, ME)).toBe(false);
    expect(quickAddEnabled(null, ME)).toBe(false);
  });
});

describe("staffNewScreen", () => {
  it("хуваалцсан зар + бүртгэх эрх + шуурхай нээлттэй → full=1 байсан ч quick", () => {
    expect(staffNewScreen(all, ME, { share: "abc" }, true)).toBe("quick");
    expect(staffNewScreen(pilot, ME, { share: "abc", full: "1" }, true)).toBe("quick");
    expect(staffNewScreen(all, ME, { share: ["abc"] }, true)).toBe("quick");
  });
  it("туршилтад ороогүй (эсвэл унтраастай) бол хуваалцсан зар ч бүрэн форм", () => {
    expect(staffNewScreen(off, ME, { share: "abc" }, true)).toBe("full");
    expect(staffNewScreen(pilot, OTHER, { share: "nosw" }, true)).toBe("full");
    expect(sharedToFullForm({ share: "abc" })).toBe(true);
    expect(sharedToFullForm({ share: " " })).toBe(false);
  });
  it("бүртгэх эрхгүй бол share нөлөөлөхгүй", () => {
    expect(staffNewScreen(off, ME, { share: "abc" }, false)).toBe("full");
  });
  it("full=1 → бүрэн форм (flag асаалттай ч)", () => {
    expect(staffNewScreen(all, ME, { full: "1" }, true)).toBe("full");
    expect(staffNewScreen(all, ME, { full: "1", draft: "k" }, true)).toBe("full");
  });
  it("flag-аар", () => {
    expect(staffNewScreen(pilot, ME, {}, true)).toBe("quick");
    expect(staffNewScreen(pilot, OTHER, {}, true)).toBe("full");
    expect(staffNewScreen(all, OTHER, { draft: "k" }, true)).toBe("quick");
    expect(staffNewScreen(off, ME, null, true)).toBe("full");
    expect(staffNewScreen(all, ME, { share: "" }, true)).toBe("quick");
    expect(staffNewScreen(off, ME, { share: " " }, true)).toBe("full");
  });
});

describe("aiParseAllowed", () => {
  it("оффисын зөвшөөрөл БА серверийн түлхүүр хоёулаа", () => {
    expect(aiParseAllowed(off, true)).toBe(false);
    expect(aiParseAllowed({ "ai.listing_parse": true }, false)).toBe(false);
    expect(aiParseAllowed({ "ai.listing_parse": true }, true)).toBe(true);
    expect(aiParseAllowed(null, true)).toBe(false);
  });
});

describe("UI_EVENTS", () => {
  it("DB-ийн event хэлбэр (^[a-z][a-z0-9_]{1,39}$), давхардалгүй", () => {
    for (const e of UI_EVENTS) expect(e).toMatch(/^[a-z][a-z0-9_]{1,39}$/);
    expect(new Set(UI_EVENTS).size).toBe(UI_EVENTS.length);
    expect(UI_EVENTS).toHaveLength(38);
    expect(isUiEvent("quick_save")).toBe(true);
    // 20261125000100: гэрээ бүртгэх / «Гэрээ буруу»; хуучин contract_submitted түүхэнд үлдэнэ.
    expect(isUiEvent("contract_registered")).toBe(true);
    expect(isUiEvent("contract_invalidated")).toBe(true);
    expect(isUiEvent("contract_submitted")).toBe(true);
    expect(isUiEvent("owner_phone_typed")).toBe(false);
  });
});

describe("Staff шинэ дэлгэцийн холбоос (paths)", () => {
  it("staffNew, staffIncomplete, staffShare, property sheet", () => {
    const a = crm2Paths("agent");
    const o = crm2Paths("office");
    expect(a.staffNew()).toBe("/agent/crm/staff/new");
    expect(a.staffNew({ full: 1, draft: "k1" })).toBe("/agent/crm/staff/new?full=1&draft=k1");
    expect(o.staffNew({ full: true })).toBe("/office/crm/staff/new?full=1");
    expect(a.staffNew({ share: "abc" })).toBe("/agent/crm/staff/new?share=abc");
    expect(a.staffIncomplete()).toBe("/agent/crm/staff/incomplete");
    expect(o.staffIncomplete({ scope: "team" })).toBe("/office/crm/staff/incomplete?scope=team");
    expect(a.staffShare).toBe(STAFF_SHARE_PATH);
    expect(o.staffShare).toBe("/agent/crm/staff/share");
    expect(a.property("p1", undefined, { sheet: "checklist" })).toBe("/agent/crm/staff/p1?sheet=checklist");
    expect(a.property("p1", "agreement", { sheet: "contract" })).toBe("/agent/crm/staff/p1?tab=agreement&sheet=contract");
  });
});
