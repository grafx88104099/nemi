import { describe, expect, it } from "vitest";

import { fromCreateDraft } from "@/components/crm2/staff/form/form-model";
import { parseListingText } from "@/lib/crm2/listing-text";

import {
  afterSave,
  applyProjectHints,
  applySourceText,
  canSave,
  confirmKeys,
  districtChips,
  emptyQuickState,
  filterRecentProjects,
  mergeParsed,
  mergeProjectSuggestions,
  otherDrafts,
  ownerIsFinal,
  parseRecentProjects,
  priceNeedsCheck,
  priceSummary,
  pushRecentProject,
  quickPayload,
  restoreQuick,
  setCategory,
  setTyped,
  toDraftForm,
  toDraftPrivate,
  type PasteContext,
} from "../quick-model";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const KEY = "33333333-3333-4333-8333-333333333333";
const ctx: PasteContext = {
  me: ME,
  panel: "agent",
  typeKeys: ["apartment", "house", "office", "commercial", "land", "garage", "other"],
  projects: [{ id: "44444444-4444-4444-8444-444444444444", name: "Ривер Гарден" }],
};

describe("emptyQuickState", () => {
  it("defaults to apartment, me as listing agent and no contract agent", () => {
    const s = emptyQuickState(ME, "agent");
    expect(s.form.property_type).toBe("apartment");
    expect(s.form.listing_agent_id).toBe(ME);
    expect(s.form.contract_agent_id).toBe("");
    expect(s.form.unconfirmed).toEqual([]);
  });

  it("marks the defaulted listing agent unconfirmed in the office panel", () => {
    expect(emptyQuickState(ME, "office").form.unconfirmed).toEqual(["listing_agent_id"]);
  });

  it("requires only a category to save", () => {
    const s = emptyQuickState(ME, "agent");
    expect(canSave(s.form)).toBe(false);
    expect(canSave(setCategory(s, "sale").form)).toBe(true);
  });
});

describe("setCategory / setTyped", () => {
  it("lease defaults to a monthly period", () => {
    expect(setCategory(emptyQuickState(ME, "agent"), "lease").form.price_period).toBe("month");
    expect(setCategory(emptyQuickState(ME, "agent"), "sale").form.price_period).toBe("total");
  });

  it("typing a value confirms it and records it as typed", () => {
    let s = emptyQuickState(ME, "office");
    s = setTyped(s, "listing_agent_id", OTHER);
    expect(s.form.unconfirmed).not.toContain("listing_agent_id");
    expect(s.meta.typed).toContain("listing_agent_id");
  });
});

describe("mergeParsed (paste)", () => {
  it("fills only empty fields and never overwrites typed values", () => {
    let s = emptyQuickState(ME, "agent");
    s = setTyped(s, "area_m2", "60");
    s = setTyped(s, "rooms", "2");
    const r = mergeParsed(s, { area_m2: 81.47, rooms: 3, floor: 12, building_floors: 18, district: "Хан-Уул" }, ctx);
    expect(r.state.form.area_m2).toBe("60");
    expect(r.state.form.rooms).toBe("2");
    expect(r.state.form.floor).toBe("12");
    expect(r.state.form.building_floors).toBe("18");
    expect(r.state.form.district).toBe("Хан-Уул");
    expect(r.filled).toEqual(expect.arrayContaining(["floor", "building_floors", "district"]));
    expect(r.filled).not.toContain("area_m2");
    expect(r.state.form.unconfirmed).toEqual(expect.arrayContaining(["floor", "building_floors", "district"]));
    expect(r.state.form.unconfirmed).not.toContain("area_m2");
  });

  it("may replace the untouched default type but not a chosen one", () => {
    const s = emptyQuickState(ME, "agent");
    expect(mergeParsed(s, { property_type: "house" }, ctx).state.form.property_type).toBe("house");
    const typed = setTyped(s, "property_type", "apartment");
    expect(mergeParsed(typed, { property_type: "house" }, ctx).state.form.property_type).toBe("apartment");
  });

  it("puts the whole price group into unconfirmed without blocking save", () => {
    let s = setCategory(emptyQuickState(ME, "agent"), "sale");
    s = mergeParsed(s, { price: 350_000_000, currency: "MNT", price_basis: "total", price_period: "total" }, ctx).state;
    expect(s.form.price).toBe("350000000");
    expect(priceNeedsCheck(s.form)).toBe(true);
    expect(s.form.unconfirmed).toEqual(expect.arrayContaining(["price", "currency", "price_basis", "price_period"]));
    expect(canSave(s.form)).toBe(true);
    expect(priceSummary(s.form)).toBe("350 сая · нийт · ₮");
    const ok = confirmKeys(s, ["price", "currency", "price_basis", "price_period"]);
    expect(priceNeedsCheck(ok.form)).toBe(false);
  });

  it("skips the price group when the agent already typed a price", () => {
    const s = setTyped(emptyQuickState(ME, "agent"), "price", "200000000");
    const r = mergeParsed(s, { price: 350_000_000, currency: "USD" }, ctx);
    expect(r.price).toBe(false);
    expect(r.state.form.price).toBe("200000000");
    expect(r.state.form.currency).toBe("MNT");
  });

  it("does not take a category the agent picked", () => {
    const s = setCategory(emptyQuickState(ME, "agent"), "rent");
    expect(mergeParsed(s, { category: "sale" }, ctx).state.form.category).toBe("rent");
  });

  it("matches a known project by id, otherwise keeps a free-text name", () => {
    const s = emptyQuickState(ME, "agent");
    const a = mergeParsed(s, { project_id: ctx.projects[0].id }, ctx).state.form;
    expect(a.project_id).toBe(ctx.projects[0].id);
    expect(a.project_name).toBe("Ривер Гарден");
    expect(a.unconfirmed).toContain("project");
    const b = mergeParsed(s, { project_name: "Шинэ хотхон" }, ctx).state.form;
    expect(b.project_id).toBeNull();
    expect(b.project_name).toBe("Шинэ хотхон");
  });

  it("never puts a pasted phone into any field", () => {
    const text = "Зайсанд 3 өрөө 81,47м2 12/18 давхарт 350 сая. Холбогдох 9911 2233";
    const parsed = parseListingText(text, { districts: ["Хан-Уул"], projects: [], featureKeys: [] });
    const r = mergeParsed(emptyQuickState(ME, "agent"), parsed.fields, ctx);
    const withRest = applySourceText(r.state, parsed.restMasked);
    expect(JSON.stringify(withRest.form)).not.toContain("99112233");
    expect(JSON.stringify(withRest.form)).not.toContain("9911 2233");
    expect(parsed.phones).toContain("99112233");
  });
});

describe("applySourceText", () => {
  it("fills empty notes and source_text (≤2000), leaves typed notes", () => {
    const long = "а".repeat(2500);
    const s = applySourceText(emptyQuickState(ME, "agent"), long);
    expect(s.form.field_notes.source_text).toHaveLength(2000);
    expect(s.form.notes).toHaveLength(2000);
    expect(s.form.unconfirmed).toContain("notes");
    const typed = applySourceText(setTyped(emptyQuickState(ME, "agent"), "notes", "миний"), "зарын бичвэр");
    expect(typed.form.notes).toBe("миний");
    expect(typed.form.field_notes.source_text).toBe("зарын бичвэр");
  });
});

describe("project hints and recents", () => {
  it("fills empty district and building floors as unconfirmed", () => {
    const s = applyProjectHints(emptyQuickState(ME, "agent"), { district: "Хан-Уул", building_floors: 16 }, ["Хан-Уул"]);
    expect(s.form.district).toBe("Хан-Уул");
    expect(s.form.building_floors).toBe("16");
    expect(s.form.unconfirmed).toEqual(expect.arrayContaining(["district", "building_floors"]));
  });

  it("never overwrites a typed district and ignores off-list districts", () => {
    const typed = setTyped(emptyQuickState(ME, "agent"), "district", "Баянгол");
    expect(applyProjectHints(typed, { district: "Хан-Уул", building_floors: null }, ["Хан-Уул", "Баянгол"]).form.district).toBe("Баянгол");
    expect(applyProjectHints(emptyQuickState(ME, "agent"), { district: "Хаа нэг", building_floors: null }, ["Хан-Уул"]).form.district).toBe("");
  });

  it("keeps 20 recent projects, newest first, and filters by folded text", () => {
    let list = parseRecentProjects("not json");
    for (let i = 0; i < 25; i++) list = pushRecentProject(list, { id: `p${i}`, name: `Төсөл ${i}`, district: null });
    expect(list).toHaveLength(20);
    expect(list[0].id).toBe("p24");
    list = pushRecentProject(list, { id: "p10", name: "Төсөл 10", district: "Хан-Уул" });
    expect(list[0]).toEqual({ id: "p10", name: "Төсөл 10", district: "Хан-Уул" });
    expect(parseRecentProjects(JSON.stringify(list))).toHaveLength(20);
    expect(filterRecentProjects([{ id: "a", name: "Ривер Гарден", district: null }], "ривер")).toHaveLength(1);
    expect(filterRecentProjects([{ id: "a", name: "Ривер Гарден", district: null }], "зайсан")).toHaveLength(0);
  });

  it("merges remote suggestions with cached ones without duplicates", () => {
    const m = mergeProjectSuggestions([{ key: "a", label: "A" }], [
      { id: "a", name: "A", district: null },
      { id: "b", name: "B", district: "Хан-Уул" },
    ]);
    expect(m.map((x) => x.key)).toEqual(["a", "b"]);
  });

  it("district chips: current, project, then recent; on-list only, ≤4", () => {
    const d = ["А", "Б", "В", "Г", "Д"];
    expect(districtChips({ current: "", projectDistrict: "Б", recent: ["В", "Б", "Х", "Г", "Д"], districts: d })).toEqual(["Б", "В", "Г", "Д"]);
  });
});

describe("draft round trip", () => {
  it("quick → full form keeps values and the owner phone only in the private part", () => {
    let s = setCategory(emptyQuickState(ME, "agent"), "sale");
    s = setTyped(s, "area_m2", "81.47");
    s = setTyped(s, "address_detail", "3-р орц 45 тоот");
    const owner = { phone: "9911 2233", name: "", source: null, sourceGuessed: false, sourceNote: "", chosenContactId: null, allowDuplicate: false };
    const pub = toDraftForm(s);
    const priv = toDraftPrivate(s, owner);
    expect(JSON.stringify(pub)).not.toContain("9911");
    expect(JSON.stringify(pub)).not.toContain("тоот");
    expect(priv.owner_phone).toBe("9911 2233");
    const full = fromCreateDraft(pub, priv, ME);
    expect(full.form.category).toBe("sale");
    expect(full.form.area_m2).toBe("81.47");
    expect(full.form.address_detail).toBe("3-р орц 45 тоот");
    expect(full.quickPhone).toBe("9911 2233");
    const back = restoreQuick(pub, priv, ME);
    expect(back.state.form.area_m2).toBe("81.47");
    expect(back.state.meta.typed).toContain("area_m2");
    expect(back.owner?.phone).toBe("9911 2233");
    expect(back.state.form.address_detail).toBe("3-р орц 45 тоот");
  });

  it("keeps the full form's private fields and its chosen owner", () => {
    const stored = { owner: { id: OTHER, name: "Х", phone: "88112233" }, owner_note: "оройн 6-аас" };
    const r = restoreQuick({}, stored, ME);
    expect(r.owner?.chosenContactId).toBe(OTHER);
    expect(r.privateRest.owner_note).toBe("оройн 6-аас");
    const priv = toDraftPrivate(r.state, r.owner, r.privateRest);
    expect(priv.owner_note).toBe("оройн 6-аас");
    expect(priv.owner_phone).toBeUndefined();
  });
});

describe("quickPayload", () => {
  it("sends client_key and source, never a contract agent, and pasted keys as unconfirmed", () => {
    let s = setCategory(emptyQuickState(ME, "agent"), "sale");
    s = mergeParsed(s, { rooms: 3, price: 350_000_000, currency: "MNT", price_basis: "total" }, ctx).state;
    s = { ...s, form: { ...s.form, contract_agent_id: ME } };
    const { payload } = quickPayload(s, { clientKey: KEY, source: "paste", owner: null });
    const p = payload.property as Record<string, unknown>;
    expect(p.client_key).toBe(KEY);
    expect(p.source).toBe("paste");
    expect(p.contract_agent_id).toBeUndefined();
    expect(p.rooms).toBe(3);
    expect(p.price).toBe(350_000_000);
    expect(p.unconfirmed).toEqual(expect.arrayContaining(["rooms", "price"]));
  });

  it("skips a short owner phone instead of failing the save", () => {
    const s = setCategory(emptyQuickState(ME, "agent"), "rent");
    const r = quickPayload(s, { clientKey: KEY, source: "manual", owner: { phone: "991122" } });
    expect(r.ownerSkipped).toBe(true);
    expect(r.payload.owner).toBeUndefined();
    const ok = quickPayload(s, { clientKey: KEY, source: "manual", owner: { phone: "99112233", source: "referral" } });
    expect(ok.payload.owner).toEqual({ phone: "99112233", source: "referral" });
  });
});

describe("after save", () => {
  it("redirects to ?sheet=next only when nothing needs attention", () => {
    expect(afterSave({ ownerFinal: true, duplicates: 0 })).toEqual({ kind: "redirect", sheet: "next" });
    expect(afterSave({ ownerFinal: false, duplicates: 0 })).toMatchObject({ kind: "notice", sheet: "owner", ownerPending: true });
    expect(afterSave({ ownerFinal: true, duplicates: 2 })).toMatchObject({ kind: "notice", sheet: "next", duplicates: 2 });
  });

  it("owner finality", () => {
    expect(ownerIsFinal("created")).toBe(true);
    expect(ownerIsFinal(null)).toBe(true);
    expect(ownerIsFinal("foreign")).toBe(false);
    expect(ownerIsFinal("needs_choice")).toBe(false);
    expect(ownerIsFinal("created", true)).toBe(false);
  });

  it("other drafts exclude the current and deleted ones", () => {
    const list = [
      { clientKey: "a", savedAt: 1, titleHint: "", photoCount: 0, status: "editing" as const },
      { clientKey: "b", savedAt: 3, titleHint: "", photoCount: 2, status: "editing" as const },
      { clientKey: "c", savedAt: 2, titleHint: "", photoCount: 0, status: "editing" as const, deletedAt: 5 },
    ];
    expect(otherDrafts(list, "a").map((d) => d.clientKey)).toEqual(["b"]);
  });
});
