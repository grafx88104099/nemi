import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  PUBLISH_CONFIRM_KEYS,
  UNCONFIRMABLE_KEYS,
  activationMissing,
  buildChecklist,
  checklistSettings,
  contractSubmitMissing,
  fieldStage,
  hasValidContract,
  nextStep,
  publishMissing,
  type ChecklistContract,
  type ChecklistInput,
} from "@/lib/crm2/checklist";
import { CHECKLIST_GROUPS, MISSING_ITEM_LABEL } from "@/lib/crm2/labels";
import { ACTIVATION_FIELD_VALUES } from "@/lib/crm2/settings-policies";
import { CRM2_SETTING_DEFAULTS } from "@/lib/crm2/settings";

const MIGRATIONS = path.resolve(__dirname, "../../../supabase/migrations");
const sql = (f: string) => fs.readFileSync(path.join(MIGRATIONS, f), "utf8");
const quoted = (s: string) => [...s.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);

const TODAY = "2026-11-24";
const ME = "aaaaaaaa-0000-4000-8000-000000000001";
const OWNER = "cccccccc-0000-4000-8000-000000000003";

/** Бүх зүйл бөглөгдсөн, батлагдсан гэрээтэй, идэвхтэй, нийтлэгдээгүй хөрөнгө. */
function ready(): ChecklistInput {
  return {
    property: {
      category: "rent",
      property_type: "apartment",
      project_id: "dddddddd-0000-4000-8000-000000000004",
      district: "Хан-Уул",
      location_text: "Зайсан, River Garden",
      address_detail: "3-р блок",
      lat: 47.9,
      area_m2: 80,
      rooms: 3,
      floor: 12,
      building_floors: 18,
      year_in_use: 2020,
      price: 2_500_000,
      price_total: 2_500_000,
      currency: "MNT",
      price_period: "month",
      listing_agent_id: ME,
      contract_agent_id: ME,
      photo_agent_id: ME,
      last_verified_at: "2026-11-20T00:00:00Z",
      unconfirmed: [],
      status: "active",
      listing_id: null,
      source_listing_id: null,
      published_at: null,
      advantages: "Нартай",
      features: ["parking"],
    },
    owner: { id: OWNER, nameUnverified: false, source: "referral" },
    ownerPending: false,
    showingInstructions: "Жижүүрт хэлнэ",
    contract: {
      status: "active",
      start_date: "2026-11-01",
      end_date: "2027-11-01",
      approved_at: "2026-11-02T00:00:00Z",
      commission_type: "fixed",
      commission_value: 2_500_000,
      owner_contact_id: OWNER,
      ownerNameUnverified: false,
      ownerSource: "referral",
      terms: null,
      no_special_terms: true,
      signer_differs: false,
      signer_note: null,
      prefilled: [],
      fileCount: 1,
      ownershipFileCount: 0,
      file_at_office: false,
    },
    imageCount: 5,
    listingAgentPublic: true,
    settings: checklistSettings(CRM2_SETTING_DEFAULTS),
    publicTextRisks: [],
    today: TODAY,
  };
}

function draftContract(over: Partial<ChecklistContract> = {}): ChecklistContract {
  return { ...ready().contract!, status: "draft", approved_at: null, ...over };
}

function withP(input: ChecklistInput, p: Partial<ChecklistInput["property"]>): ChecklistInput {
  return { ...input, property: { ...input.property, ...p } };
}

describe("DB-тэй ижил жагсаалт", () => {
  it("UNCONFIRMABLE_KEYS = 0100-ийн crm2_properties_unconfirmed_chk", () => {
    const m = /crm2_properties_unconfirmed_chk check \([\s\S]*?array\[([\s\S]*?)\]/.exec(sql("20261124000100_crm2_staff_columns.sql"));
    expect([...UNCONFIRMABLE_KEYS]).toEqual(quoted(m?.[1] ?? ""));
  });
  it("PUBLISH_CONFIRM_KEYS = 0600-ийн crm2_publish_confirm_keys (дараалал ч)", () => {
    const m = /function public\.crm2_publish_confirm_keys[\s\S]*?array\[([\s\S]*?)\]/.exec(sql("20261124000600_crm2_publish_payload.sql"));
    expect([...PUBLISH_CONFIRM_KEYS]).toEqual(quoted(m?.[1] ?? ""));
    const removed = UNCONFIRMABLE_KEYS.filter((k) => !(PUBLISH_CONFIRM_KEYS as readonly string[]).includes(k));
    expect(removed.sort()).toEqual(["contract_agent_id", "listing_agent_id", "notes", "photo_agent_id"]);
  });
  it("0300 crm2_property_missing-ийн 'unconfirmed' жагсаалт = PUBLISH_CONFIRM_KEYS", () => {
    const m = /when 'unconfirmed' then coalesce[\s\S]*?array\[([\s\S]*?)\]/.exec(sql("20261124000300_crm2_owner_contract_rules.sql"));
    expect(quoted(m?.[1] ?? "")).toEqual([...PUBLISH_CONFIRM_KEYS]);
  });
  it("activationMissing тохиргооны бүх сонголтыг таньдаг", () => {
    const empty = withP(ready(), {
      project_id: null,
      district: null,
      location_text: "",
      address_detail: "",
      lat: null,
      area_m2: null,
      rooms: null,
      floor: null,
      price: null,
      year_in_use: null,
      property_type: null,
      listing_agent_id: null,
      contract_agent_id: null,
      photo_agent_id: null,
      unconfirmed: ["district"],
    });
    const all: ChecklistInput = {
      ...empty,
      owner: null,
      showingInstructions: "",
      imageCount: 0,
      settings: { ...empty.settings, activationRequired: [...ACTIVATION_FIELD_VALUES] },
    };
    expect(activationMissing(all)).toEqual([...ACTIVATION_FIELD_VALUES]);
    for (const k of ACTIVATION_FIELD_VALUES) expect(MISSING_ITEM_LABEL[k], k).toBeTruthy();
  });
});

describe("activationMissing ≙ crm2_property_missing", () => {
  it("бүрэн бол дутуугүй", () => {
    expect(activationMissing(ready())).toEqual([]);
  });
  it("анхдагч шаардлага + үнийн хугацаа + хүчинтэй гэрээ", () => {
    const i = withP({ ...ready(), contract: null }, { location_text: " ", price: null, category: "sale", price_period: "month" });
    expect(activationMissing(i)).toEqual(["location_text", "price", "price_period", "brokerage_contract"]);
  });
  it("min_images, owner_source, owner_name, unconfirmed", () => {
    const base = ready();
    const s = { ...base.settings, activationRequired: ["images", "owner_source", "owner_name", "unconfirmed"], minImages: 3 };
    expect(activationMissing({ ...base, settings: s, imageCount: 2 })).toEqual(["images"]);
    expect(activationMissing({ ...base, settings: s, imageCount: 3 })).toEqual([]);
    expect(activationMissing({ ...base, settings: s, owner: { id: OWNER, nameUnverified: true, source: null } })).toEqual([
      "owner_source",
      "owner_name",
    ]);
    expect(activationMissing({ ...base, settings: s, owner: null })).toEqual(["owner_source", "owner_name"]);
    // notes / агентын үүрэг баталгаажаагүй байх нь 'unconfirmed'-д тооцогдохгүй.
    expect(activationMissing(withP({ ...base, settings: s }, { unconfirmed: ["notes", "listing_agent_id"] }))).toEqual([]);
    expect(activationMissing(withP({ ...base, settings: s }, { unconfirmed: ["price"] }))).toEqual(["unconfirmed"]);
  });
  it("хувийн талбар харах эрхгүй бол эзний шаардлагыг үнэлэхгүй", () => {
    const base = ready();
    const s = { ...base.settings, activationRequired: ["owner", "owner_source", "showing_instructions"] };
    expect(activationMissing({ ...base, settings: s, owner: "hidden", showingInstructions: "hidden" })).toEqual([]);
  });
  it("хүчинтэй гэрээ: батлагдсан, өнөөдөр хугацаандаа", () => {
    expect(hasValidContract(ready())).toBe(true);
    expect(hasValidContract({ ...ready(), contract: { ...ready().contract!, end_date: "2026-11-23" } })).toBe(false);
    expect(hasValidContract({ ...ready(), contract: { ...ready().contract!, start_date: "2026-11-25" } })).toBe(false);
    expect(hasValidContract({ ...ready(), contract: { ...ready().contract!, status: "pending" } })).toBe(false);
    expect(hasValidContract({ ...ready(), contract: { ...ready().contract!, approved_at: null } })).toBe(false);
  });
});

describe("contractSubmitMissing ≙ crm2_brokerage_missing (20261124000300)", () => {
  it("бүрэн ноорог → дутуугүй", () => {
    expect(contractSubmitMissing({ ...ready(), contract: draftContract() })).toEqual([]);
  });
  it("ноорогийн шинэ шаардлагууд", () => {
    const base = ready();
    const s = { ...base.settings, requireOwnershipDoc: true };
    const c = draftContract({
      start_date: null,
      end_date: "2026-11-01",
      commission_value: null,
      ownerNameUnverified: true,
      terms: "",
      no_special_terms: false,
      signer_differs: true,
      signer_note: " ",
      prefilled: ["commission"],
      fileCount: 0,
      ownershipFileCount: 0,
      file_at_office: true,
    });
    const i = withP({ ...base, settings: s, contract: c }, { contract_agent_id: null });
    expect(contractSubmitMissing(i)).toEqual([
      "start_date",
      "end_date_past",
      "commission",
      "file",
      "owner_name",
      "special_terms",
      "signer_authority",
      "defaults_unconfirmed",
      "ownership_doc",
      "role_unconfirmed",
    ]);
  });
  it("«гэрээ оффист үлдсэн» файлын шаардлагыг ХЭЗЭЭ Ч хангахгүй", () => {
    const i = { ...ready(), contract: draftContract({ fileCount: 0, file_at_office: true }) };
    expect(contractSubmitMissing(i)).toContain("file");
  });
  it("ноорогт зөвхөн гэрээний файл; илгээсэнд аль ч файл", () => {
    const onlyOwnership = { fileCount: 0, ownershipFileCount: 1, otherFileCount: 0 };
    expect(contractSubmitMissing({ ...ready(), contract: draftContract(onlyOwnership) })).toContain("file");
    expect(contractSubmitMissing({ ...ready(), contract: draftContract({ ...onlyOwnership, status: "pending" }) })).toEqual([]);
  });
  it("гэрээ байгуулсан агент баталгаажаагүй → role_unconfirmed (зөвхөн ноорогт)", () => {
    const i = withP({ ...ready(), contract: draftContract() }, { unconfirmed: ["contract_agent_id"] });
    expect(contractSubmitMissing(i)).toEqual(["role_unconfirmed"]);
    expect(contractSubmitMissing({ ...i, contract: draftContract({ status: "pending" }) })).toEqual([]);
  });
  it("эзний эх сурвалжийг гэрээ шаардахгүй (DB-тэй ижил)", () => {
    const i = { ...ready(), contract: draftContract({ ownerSource: null }) };
    expect(contractSubmitMissing(i)).not.toContain("owner_source");
  });
  it("гэрээгүй бол хоосон ноорогт дутуу (эзэн хөрөнгөөс)", () => {
    const i = { ...ready(), contract: null };
    expect(contractSubmitMissing(i)).toEqual(["start_date", "end_date", "commission", "file", "special_terms"]);
    expect(contractSubmitMissing({ ...i, owner: null })).toContain("owner");
  });
});

describe("publishMissing ≙ crm2_publish_blockers (төлөв, гэрээнээс бусад)", () => {
  it("бүрэн бол саадгүй", () => {
    expect(publishMissing(ready())).toEqual([]);
  });
  it("бүх саад", () => {
    const i = withP(
      { ...ready(), imageCount: 0, listingAgentPublic: false, publicTextRisks: ["phone", "unit_no"] },
      { currency: "USD", price_period: "day", price_total: 0, district: null, area_m2: null, unconfirmed: ["rooms"] }
    );
    expect(publishMissing(i)).toEqual([
      "publish_currency",
      "publish_period",
      "publish_price",
      "publish_district",
      "publish_area",
      "publish_images",
      "agent_public",
      "publish_unconfirmed",
      "public_text_phone",
    ]);
  });
  it("min_images ба 'notes' баталгаажаагүй нь саад биш", () => {
    const s = { ...ready().settings, minImages: 3 };
    expect(publishMissing({ ...ready(), settings: s, imageCount: 2 })).toEqual(["publish_images"]);
    expect(publishMissing({ ...ready(), settings: { ...s, minImages: 0 }, imageCount: 0 })).toEqual([]);
    expect(publishMissing(withP(ready(), { unconfirmed: ["notes", "listing_agent_id"] }))).toEqual([]);
    expect(publishMissing(withP(ready(), { category: "sale", price_period: "total" }))).toEqual([]);
    expect(publishMissing(withP(ready(), { category: "lease", price_period: "month" }))).toEqual([]);
  });
});

describe("buildChecklist", () => {
  it("4 бүлэг, бүрэн бол 100%", () => {
    const c = buildChecklist(ready());
    expect(c.groups.map((g) => g.group)).toEqual([...CHECKLIST_GROUPS]);
    expect(c.percent).toBe(100);
    const keys = c.groups.flatMap((g) => g.items.map((i) => i.key));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("баталгаажаагүй утга дууссанд тооцогдохгүй, «автомат» тэмдэгтэй", () => {
    const c = buildChecklist(withP(ready(), { unconfirmed: ["price", "district"] }));
    const items = c.groups.flatMap((g) => g.items);
    const price = items.find((i) => i.key === "price")!;
    expect(price).toMatchObject({ done: false, auto: true, group: "intake", target: { sheet: "price", field: "price" } });
    expect(items.find((i) => i.key === "district")).toMatchObject({ done: false, auto: true });
    expect(items.find((i) => i.key === "publish_unconfirmed")).toMatchObject({ done: false, target: { sheet: "confirm" } });
    expect(c.percent).toBeLessThan(100);
  });
  it("гэрээний агент «Гэрээ» бүлэгт (эхлэхэд биш)", () => {
    const c = buildChecklist(withP({ ...ready(), contract: null }, { contract_agent_id: null }));
    const intake = c.groups.find((g) => g.group === "intake")!;
    const contract = c.groups.find((g) => g.group === "contract")!;
    expect(intake.items.some((i) => i.key === "contract_agent_id")).toBe(false);
    expect(contract.items.find((i) => i.key === "role_unconfirmed")).toMatchObject({ done: false, target: { sheet: "contract", field: "contract_agent_id" } });
    expect(contract.items.find((i) => i.key === "contract_draft")).toMatchObject({ done: false });
  });
  it("эзэн хүлээгдэж буй, хувийн нуугдсан", () => {
    const pending = buildChecklist({ ...ready(), ownerPending: true });
    expect(pending.groups[0].items[0]).toMatchObject({ key: "owner_pending", done: false, target: { sheet: "owner" } });
    const hidden = buildChecklist({ ...ready(), owner: "hidden", ownerPending: true, showingInstructions: "hidden" });
    const keys = hidden.groups.filter((g) => g.group !== "contract").flatMap((g) => g.items.map((i) => i.key));
    for (const k of ["owner", "owner_source", "owner_pending", "showing_instructions"]) expect(keys).not.toContain(k);
    // Гэрээний эзэн гэрээн дээр (гэрээг харах эрхтэнд) хэвээр.
    expect(hidden.groups.find((g) => g.group === "contract")!.items.some((i) => i.key === "owner")).toBe(true);
    expect(nextStep({ ...ready(), owner: "hidden", ownerPending: true }).label).toBe("Нийтлэх");
  });
  it("нийтийн бичвэрт тоот/код → сануулга мөр (заавал биш)", () => {
    const c = buildChecklist({ ...ready(), publicTextRisks: ["door_code"] });
    const pub = c.groups.find((g) => g.group === "publish")!;
    expect(pub.items.find((i) => i.key === "public_text_private")).toMatchObject({ required: false, done: false });
    expect(pub.items.find((i) => i.key === "public_text_phone")).toMatchObject({ done: true });
  });
});

describe("nextStep — 9 төлөв", () => {
  it("1. эзэн хүлээгдэж буй", () => {
    expect(nextStep({ ...ready(), ownerPending: true, contract: null })).toMatchObject({
      label: "Эзнийг шалгах",
      group: "intake",
      target: { sheet: "owner" },
    });
  });
  it("2. бүртгэл дутуу", () => {
    const s = nextStep(withP({ ...ready(), contract: null }, { location_text: null, price: null, status: "draft" }));
    expect(s).toMatchObject({ label: "Бүртгэл гүйцээх (2 зүйл дутуу)", group: "intake", missingCount: 2 });
    expect(s.target).toEqual({ sheet: "location", field: "location_text" });
  });
  it("3. гэрээгүй", () => {
    const s = nextStep(withP({ ...ready(), contract: null }, { status: "draft" }));
    expect(s).toMatchObject({ label: "Гэрээ байгуулах (6)", group: "contract", missingCount: 6, target: { sheet: "contract", field: "start_date" } });
  });
  it("4. ноорог гэрээ", () => {
    const p = withP({ ...ready(), contract: draftContract({ commission_value: null }) }, { status: "draft" });
    expect(nextStep(p)).toMatchObject({ label: "Гэрээг батлуулахаар илгээх (1)", target: { field: "commission_value" } });
    expect(nextStep(withP({ ...ready(), contract: draftContract() }, { status: "draft" })).label).toBe("Гэрээг батлуулахаар илгээх");
  });
  it("5. илгээсэн", () => {
    const p = withP({ ...ready(), contract: draftContract({ status: "pending" }) }, { status: "draft" });
    expect(nextStep(p).label).toBe("Гэрээ батлагдахыг хүлээж байна");
  });
  it("6. батлагдсан, хөрөнгө ноорог (гар горим)", () => {
    const p = withP({ ...ready(), settings: { ...ready().settings, activationMode: "manual" } }, { status: "draft" });
    expect(nextStep(p)).toMatchObject({ label: "Хөрөнгийг идэвхжүүлэх", target: { sheet: "contract" } });
  });
  it("7. идэвхтэй, нийтлэхэд дутуу", () => {
    expect(nextStep({ ...ready(), listingAgentPublic: false, imageCount: 0 })).toMatchObject({
      label: "Нийтлэхэд бэлдэх (2)",
      group: "publish",
      target: { sheet: "photos" },
    });
  });
  it("8. идэвхтэй, нийтлээгүй", () => {
    expect(nextStep(ready())).toMatchObject({ label: "Нийтлэх", target: { sheet: "publish" } });
  });
  it("9. бүрэн (нийтэлсэн, эсвэл хаагдсан төлөв)", () => {
    expect(nextStep(withP(ready(), { listing_id: "x", published_at: "2026-11-24T00:00:00Z" })).label).toBe("Бүрэн");
    expect(nextStep(withP({ ...ready(), ownerPending: true }, { status: "sold" })).label).toBe("Бүрэн");
  });
});

describe("fieldStage", () => {
  const s = checklistSettings(CRM2_SETTING_DEFAULTS);
  it("анхдагч тохиргоогоор", () => {
    expect(fieldStage("category", s)).toBe("start");
    expect(fieldStage("location_text", s)).toBe("start");
    expect(fieldStage("price", s)).toBe("start");
    expect(fieldStage("contract_agent_id", s)).toBe("contract");
    expect(fieldStage("owner", s)).toBe("contract");
    expect(fieldStage("district", s)).toBe("publish");
    expect(fieldStage("area_m2", s)).toBe("publish");
    expect(fieldStage("year_in_use", s)).toBeNull();
    expect(fieldStage("lat", { ...s, activationRequired: ["pin"] })).toBe("start");
    expect(fieldStage("district", { ...s, activationRequired: ["district"] })).toBe("start");
    expect(fieldStage("owner", { ...s, requireOwner: false })).toBeNull();
  });
});
