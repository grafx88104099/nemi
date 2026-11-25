import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BROKERAGE_MAX_TERM_MONTHS,
  PUBLISH_CONFIRM_KEYS,
  UNCONFIRMABLE_KEYS,
  activationMissing,
  addMonthsIso,
  autoActivates,
  brokerageEndDateError,
  brokerageMaxEndDate,
  buildChecklist,
  checklistSettings,
  contractRegisterMissing,
  countContractFiles,
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
const MIGRATION_FILES = fs
  .readdirSync(MIGRATIONS)
  .filter((x) => x.endsWith(".sql"))
  .sort();

/** Функцийн ХАМГИЙН СҮҮЛИЙН тодорхойлолтын бие ($$ … $$) — labels.test.ts-тэй ижил. */
function latestFn(name: string): string {
  const re = new RegExp(`create (?:or replace )?function public\\.${name}\\b[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "g");
  let body: string | null = null;
  for (const f of MIGRATION_FILES) {
    for (const m of sql(f).matchAll(re)) body = m[1];
  }
  if (body === null) throw new Error(`функц ${name} олдсонгүй`);
  return body;
}

/** crm2_brokerage_missing-ийн array_append(v_missing, '<код>') дараалал. */
const appendedCodes = (body: string) => [...body.matchAll(/array_append\(v_missing, '([a-z_]+)'\)/g)].map((m) => m[1]);

const TODAY = "2026-11-24";
const ME = "aaaaaaaa-0000-4000-8000-000000000001";
const OWNER = "cccccccc-0000-4000-8000-000000000003";

/** Бүх зүйл бөглөгдсөн, бүртгэгдсэн (PMC тамгатай PDF) гэрээтэй, идэвхтэй, нийтлэгдээгүй хөрөнгө. */
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
      approved_at: null,
      registered_at: "2026-11-01T03:00:00Z",
      stamp_confirmed: true,
      owner_contact_id: OWNER,
      ownerNameUnverified: false,
      ownerSource: "referral",
      pdfCount: 1,
      nonPdfContractCount: 0,
      ownershipFileCount: 0,
    },
    imageCount: 5,
    listingAgentPublic: true,
    settings: checklistSettings(CRM2_SETTING_DEFAULTS),
    publicTextRisks: [],
    today: TODAY,
  };
}

/** Бүртгэхэд бэлэн ноорог: дуусах огноо, эзэн, нэг PDF (эхлэх огноог бүртгэл тавина). */
function draftContract(over: Partial<ChecklistContract> = {}): ChecklistContract {
  return {
    ...ready().contract!,
    status: "draft",
    start_date: null,
    approved_at: null,
    registered_at: null,
    stamp_confirmed: false,
    ...over,
  };
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
  it("хамгийн сүүлийн crm2_property_missing-ийн 'unconfirmed' жагсаалт = PUBLISH_CONFIRM_KEYS", () => {
    const m = /when 'unconfirmed' then coalesce[\s\S]*?array\[([\s\S]*?)\]/.exec(latestFn("crm2_property_missing"));
    expect(quoted(m?.[1] ?? "")).toEqual([...PUBLISH_CONFIRM_KEYS]);
  });
  it("crm2_brokerage_missing-ийн код бүр нэртэй, RPC stamp_unconfirmed нэмдэг", () => {
    const codes = appendedCodes(latestFn("crm2_brokerage_missing"));
    expect(codes).toEqual(["end_date", "end_date_past", "owner", "owner_name", "file", "file_not_pdf", "ownership_doc"]);
    for (const k of [...codes, "stamp_unconfirmed"]) expect(MISSING_ITEM_LABEL[k], k).toBeTruthy();
    expect(appendedCodes(latestFn("crm2_brokerage_register"))).toEqual(["stamp_unconfirmed"]);
  });
  it("crm2_property_has_valid_contract: approved_at ЭСВЭЛ registered_at", () => {
    const body = latestFn("crm2_property_has_valid_contract");
    expect(body).toMatch(/b\.approved_at is not null or b\.registered_at is not null/);
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
  it("хүчинтэй гэрээ: бүртгэгдсэн (эсвэл хуучин батлагдсан), өнөөдөр хугацаандаа", () => {
    const c = ready().contract!;
    expect(hasValidContract(ready())).toBe(true);
    // Хуучин урсгалаар батлагдсан (registered_at хоосон) ч хүчинтэй.
    expect(hasValidContract({ ...ready(), contract: { ...c, approved_at: "2026-11-02T00:00:00Z", registered_at: null } })).toBe(true);
    // Шинэ дүрмээр шилжүүлсэн (stamp_confirmed=false) ч хүчинтэй.
    expect(hasValidContract({ ...ready(), contract: { ...c, stamp_confirmed: false } })).toBe(true);
    expect(hasValidContract({ ...ready(), contract: { ...c, approved_at: null, registered_at: null } })).toBe(false);
    expect(hasValidContract({ ...ready(), contract: { ...c, end_date: "2026-11-23" } })).toBe(false);
    expect(hasValidContract({ ...ready(), contract: { ...c, start_date: "2026-11-25" } })).toBe(false);
    expect(hasValidContract({ ...ready(), contract: { ...c, start_date: null } })).toBe(false);
    for (const status of ["draft", "expired", "terminated"] as const) {
      expect(hasValidContract({ ...ready(), contract: { ...c, status } }), status).toBe(false);
    }
    expect(hasValidContract({ ...ready(), contract: null })).toBe(false);
  });
});

describe("contractRegisterMissing ≙ crm2_brokerage_missing (20261125000100)", () => {
  it("бүрэн ноорог → дутуугүй (эхлэх огноо, шимтгэл, нөхцөл, гарын үсэг зурагч шаардахгүй)", () => {
    expect(contractRegisterMissing({ ...ready(), contract: draftContract() })).toEqual([]);
  });
  it("PDF алга → file; зөвхөн зураг (хуучин) → file + file_not_pdf; PDF + зураг → file_not_pdf", () => {
    expect(contractRegisterMissing({ ...ready(), contract: draftContract({ pdfCount: 0 }) })).toEqual(["file"]);
    expect(contractRegisterMissing({ ...ready(), contract: draftContract({ pdfCount: 0, nonPdfContractCount: 2 }) })).toEqual([
      "file",
      "file_not_pdf",
    ]);
    expect(contractRegisterMissing({ ...ready(), contract: draftContract({ nonPdfContractCount: 1 }) })).toEqual(["file_not_pdf"]);
    // Өмчлөлийн баримт гэрээний PDF-ийг орлохгүй.
    expect(contractRegisterMissing({ ...ready(), contract: draftContract({ pdfCount: 0, ownershipFileCount: 1 }) })).toEqual(["file"]);
  });
  it("эзэн: гэрээний эсвэл хөрөнгийн эзэн (DB coalesce); brokerage.require_owner", () => {
    const noOwner = draftContract({ owner_contact_id: null });
    expect(contractRegisterMissing({ ...ready(), contract: noOwner })).toEqual([]);
    expect(contractRegisterMissing({ ...ready(), owner: null, contract: noOwner })).toEqual(["owner"]);
    expect(
      contractRegisterMissing({ ...ready(), owner: null, contract: noOwner, settings: { ...ready().settings, requireOwner: false } })
    ).toEqual([]);
    // Хувийн талбар харах эрхгүй бол эзнийг үнэлэхгүй (DB шалгана).
    expect(contractRegisterMissing({ ...ready(), owner: "hidden", contract: noOwner })).toEqual([]);
  });
  it("эзний нэр баталгаажаагүй → owner_name", () => {
    expect(contractRegisterMissing({ ...ready(), contract: draftContract({ ownerNameUnverified: true }) })).toEqual(["owner_name"]);
    expect(
      contractRegisterMissing({ ...ready(), owner: null, contract: draftContract({ owner_contact_id: null, ownerNameUnverified: true }) })
    ).toEqual(["owner"]);
  });
  it("дуусах огноо: хоосон → дутуу биш (цонх/RPC анхдагчаар тавина), өнгөрсөн → end_date_past, өнөөдөр → зөв", () => {
    // Сунгалтын ноорог (crm2_brokerage_renew end_date null) — RPC coalesce(…, өнөөдөр + default_term_months − 1).
    expect(contractRegisterMissing({ ...ready(), contract: draftContract({ end_date: null }) })).toEqual([]);
    expect(contractRegisterMissing({ ...ready(), contract: draftContract({ end_date: "2026-11-23" }) })).toEqual(["end_date_past"]);
    expect(contractRegisterMissing({ ...ready(), contract: draftContract({ end_date: TODAY }) })).toEqual([]);
  });
  it("бүгд дутуу → DB-ийн дараалал (array_append-ийн дараалал)", () => {
    const sqlOrder = appendedCodes(latestFn("crm2_brokerage_missing"));
    const s = { ...ready().settings, requireOwnershipDoc: true };
    const past = contractRegisterMissing({
      ...ready(),
      owner: null,
      settings: s,
      contract: draftContract({ end_date: "2026-01-01", owner_contact_id: null, pdfCount: 0, nonPdfContractCount: 1 }),
    });
    expect(past).toEqual(sqlOrder.filter((k) => k !== "end_date" && k !== "owner_name"));
    const named = contractRegisterMissing({
      ...ready(),
      settings: s,
      contract: draftContract({ end_date: null, ownerNameUnverified: true, pdfCount: 0, nonPdfContractCount: 1 }),
    });
    // Хоосон дуусах огноо бүртгэлд дутуу биш (RPC тавина) — 'end_date'-ийг зөвхөн цонх (contractMissing) нэмнэ.
    expect(named).toEqual(sqlOrder.filter((k) => k !== "end_date" && k !== "end_date_past" && k !== "owner"));
  });
  it("brokerage.require_ownership_doc", () => {
    const s = { ...ready().settings, requireOwnershipDoc: true };
    expect(contractRegisterMissing({ ...ready(), settings: s, contract: draftContract() })).toEqual(["ownership_doc"]);
    expect(contractRegisterMissing({ ...ready(), settings: s, contract: draftContract({ ownershipFileCount: 1 }) })).toEqual([]);
    // Тоо мэдэгдэхгүй (restricted харах эрхгүй, RLS нуудаг) → DB шалгана, дутуу гэж үзэхгүй; мөр ч гарахгүй.
    const unknown = { ...ready(), settings: s, contract: draftContract({ ownershipFileCount: null }) };
    expect(contractRegisterMissing(unknown)).toEqual([]);
    const rows = buildChecklist(withP(unknown, { status: "draft" })).groups.find((g) => g.group === "contract")!.items;
    expect(rows.some((x) => x.key === "ownership_doc")).toBe(false);
    const known = buildChecklist(withP({ ...unknown, contract: draftContract() }, { status: "draft" })).groups.find((g) => g.group === "contract")!.items;
    expect(known.find((x) => x.key === "ownership_doc")).toMatchObject({ done: false });
  });
  it("гэрээ байгуулсан агентыг шалгахгүй (бүртгэл өөрөө баталгаажуулна), эзний эх сурвалжийг ч", () => {
    const i = withP({ ...ready(), contract: draftContract({ ownerSource: null }) }, { contract_agent_id: null, unconfirmed: ["contract_agent_id"] });
    expect(contractRegisterMissing(i)).toEqual([]);
  });
  it("гэрээгүй бол хоосон ноорогт дутуу (эзэн хөрөнгөөс; дуусах огноог цонх анхдагчаар бөглөнө)", () => {
    const i = { ...ready(), contract: null };
    expect(contractRegisterMissing(i)).toEqual(["file"]);
    expect(contractRegisterMissing({ ...i, owner: null })).toEqual(["owner", "file"]);
    expect(contractRegisterMissing({ ...i, owner: { id: OWNER, nameUnverified: true, source: null } })).toEqual(["owner_name", "file"]);
  });
});

describe("гэрээний файлын тоо ба дуусах огноо", () => {
  it("countContractFiles: зөвхөн kind='contract' application/pdf нь гэрээний PDF", () => {
    expect(
      countContractFiles([
        { kind: "contract", mime_type: "application/pdf" },
        { kind: null, mime_type: "image/jpeg" },
        { kind: "contract", mime_type: "image/png" },
        { kind: "ownership", mime_type: "application/pdf" },
        { kind: "id", mime_type: "image/jpeg" },
        { kind: "other", mime_type: null },
      ])
    ).toEqual({ pdf: 1, nonPdf: 2, ownership: 1, other: 2 });
    expect(countContractFiles([{ kind: "contract", mime_type: "APPLICATION/PDF" }]).pdf).toBe(1);
    expect(countContractFiles([{ kind: "contract" }])).toEqual({ pdf: 0, nonPdf: 1, ownership: 0, other: 0 });
    expect(countContractFiles(null)).toEqual({ pdf: 0, nonPdf: 0, ownership: 0, other: 0 });
  });
  it("addMonthsIso ≙ Postgres date + interval 'N months' (сарын сүүлийг хавчина)", () => {
    expect(addMonthsIso("2026-11-25", 12)).toBe("2027-11-25");
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsIso("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsIso("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonthsIso("2026-12-15", 60)).toBe("2031-12-15");
    expect(addMonthsIso("2026-13-01", 1)).toBeNull();
    expect(addMonthsIso("x", 1)).toBeNull();
  });
  it("brokerageEndDateError: өнөөдрөөс 5 жилийн дотор (crm2_brokerage_register)", () => {
    expect(BROKERAGE_MAX_TERM_MONTHS).toBe(60);
    expect(brokerageMaxEndDate(TODAY)).toBe("2031-11-24");
    expect(latestFn("crm2_brokerage_register")).toContain("interval '60 months'");
    expect(brokerageEndDateError(TODAY, TODAY)).toBeNull();
    expect(brokerageEndDateError("2031-11-24", TODAY)).toBeNull();
    expect(brokerageEndDateError("2031-11-25", TODAY)).toBe("Дуусах огноо 5 жилээс хол байж болохгүй.");
    expect(brokerageEndDateError("2026-11-23", TODAY)).toBe("Дуусах огноо өнөөдрөөс өмнө байж болохгүй.");
    expect(brokerageEndDateError("", TODAY)).toBe("Дуусах огноо оруулна уу.");
    expect(brokerageEndDateError("2027-02-30", TODAY)).toBe("Дуусах огноо буруу (ОООО-СС-ӨӨ).");
    expect(brokerageEndDateError("2027/02/01", TODAY)).toBe("Дуусах огноо буруу (ОООО-СС-ӨӨ).");
    expect(brokerageEndDateError(null, TODAY)).toBe("Дуусах огноо оруулна уу.");
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
    expect(contract.items.find((i) => i.key === "contract_agent_id")).toMatchObject({
      done: false,
      required: true,
      target: { sheet: "contract", field: "contract_agent_id" },
    });
    expect(contract.items.find((i) => i.key === "contract_draft")).toMatchObject({
      done: false,
      label: "Гэрээ (PMC тамгатай PDF) бүртгэх",
      target: { sheet: "contract", field: "file" },
    });
  });
  it("«Гэрээ» бүлэг: бүртгэх алхам, батлах/шимтгэл/нөхцөлийн мөргүй", () => {
    const keysOf = (i: ChecklistInput) =>
      buildChecklist(i).groups.find((g) => g.group === "contract")!.items.map((x) => x.key);
    // «owner» мөр «Бүртгэл» бүлэгт аль хэдийн байгаа тул давхардахгүй (эзэн нуугдсан үед л «Гэрээ»-нд).
    expect(keysOf({ ...ready(), contract: null })).toEqual(["contract_draft", "end_date", "file", "contract_agent_id", "brokerage_contract"]);
    // Хуучин зурагтай ноорог: «PDF биш файлыг устгах» мөр нэмэгдэнэ.
    const legacy = buildChecklist(withP({ ...ready(), contract: draftContract({ pdfCount: 0, nonPdfContractCount: 2 }) }, { status: "draft" }));
    const items = legacy.groups.find((g) => g.group === "contract")!.items;
    expect(items.map((x) => x.key)).toEqual(["end_date", "file", "file_not_pdf", "contract_agent_id", "brokerage_contract"]);
    expect(items.find((x) => x.key === "file")).toMatchObject({ done: false, target: { sheet: "contract", field: "file" } });
    expect(items.find((x) => x.key === "file_not_pdf")).toMatchObject({ done: false, target: { sheet: "contract", field: "file" } });
    for (const gone of ["contract_submitted", "commission", "special_terms", "signer_authority", "defaults_unconfirmed", "start_date", "role_unconfirmed"]) {
      expect(keysOf({ ...ready(), contract: draftContract() }), gone).not.toContain(gone);
      expect(keysOf({ ...ready(), contract: null }), gone).not.toContain(gone);
    }
  });
  it("бүртгэгдсэн гэрээ: бүртгэлийн мөр бүгд дууссан (хуучин зурагтай ч)", () => {
    const i = { ...ready(), contract: { ...ready().contract!, pdfCount: 0, nonPdfContractCount: 2 } };
    const items = buildChecklist(i).groups.find((g) => g.group === "contract")!.items;
    expect(items.every((x) => x.done)).toBe(true);
    expect(items.some((x) => x.key === "file_not_pdf")).toBe(false);
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
  it("3. гэрээгүй → «Гэрээ бүртгэх» (PDF руу)", () => {
    const s = nextStep(withP({ ...ready(), contract: null }, { status: "draft" }));
    // contract_draft + file (дуусах огноог цонх анхдагчаар бөглөнө — тоологдохгүй)
    expect(s).toMatchObject({ label: "Гэрээ бүртгэх (2)", group: "contract", missingCount: 2, target: { sheet: "contract", field: "file" } });
  });
  it("4. ноорог гэрээ → «Гэрээ бүртгэх»", () => {
    const noPdf = withP({ ...ready(), contract: draftContract({ pdfCount: 0 }) }, { status: "draft" });
    expect(nextStep(noPdf)).toMatchObject({ label: "Гэрээ бүртгэх (1)", missingCount: 1, target: { sheet: "contract", field: "file" } });
    // Сунгалтын ноорог (дуусах огноо хоосон): зөвхөн PDF тоологдоно.
    const renewal = withP({ ...ready(), contract: draftContract({ end_date: null, pdfCount: 0 }) }, { status: "draft" });
    expect(nextStep(renewal)).toMatchObject({ label: "Гэрээ бүртгэх (1)", target: { field: "file" } });
    // PDF эхэнд: өнгөрсөн огноо ч дутуу байсан PDF руу чиглүүлнэ.
    const both = withP({ ...ready(), contract: draftContract({ end_date: "2026-01-01", pdfCount: 0 }) }, { status: "draft" });
    expect(nextStep(both)).toMatchObject({ label: "Гэрээ бүртгэх (2)", target: { field: "file" } });
    const endOnly = withP({ ...ready(), contract: draftContract({ end_date: "2026-01-01" }) }, { status: "draft" });
    expect(nextStep(endOnly)).toMatchObject({ label: "Гэрээ бүртгэх (1)", target: { field: "end_date" } });
    // Бүх зүйл бэлэн — зөвхөн тамгыг тэмдэглээд бүртгэнэ.
    expect(nextStep(withP({ ...ready(), contract: draftContract() }, { status: "draft" }))).toMatchObject({
      label: "Гэрээ бүртгэх",
      missingCount: 0,
      target: { sheet: "contract", field: "file" },
    });
  });
  it("5. бүртгэгдсэн, хөрөнгийн мэдээлэл дутуу → «Хөрөнгийн мэдээллийг гүйцээх» (нөхмөгц автоматаар идэвхжинэ)", () => {
    // «Бүртгэл» бүлгийн дутуу нь түрүүлж «Бүртгэл гүйцээх»; үлдсэн нь гэрээ байгуулсан агент г.м.
    const s = { ...ready().settings, activationRequired: [...ready().settings.activationRequired, "showing_instructions"] };
    const p = withP({ ...ready(), settings: s, showingInstructions: "" }, { status: "draft" });
    expect(nextStep(p)).toMatchObject({ label: "Бүртгэл гүйцээх (1 зүйл дутуу)", missingCount: 1 });
    const agent = withP(ready(), { status: "draft", contract_agent_id: null });
    expect(nextStep(agent)).toMatchObject({
      label: "Хөрөнгийн мэдээллийг гүйцээх (1)",
      group: "contract",
      target: { sheet: "contract", field: "contract_agent_id" },
    });
  });
  it("6. бүртгэгдсэн, мэдээлэл бүрэн ч ноорог (ховор) → «Хөрөнгийг идэвхжүүлэх»", () => {
    const p = withP(ready(), { status: "draft" });
    expect(nextStep(p)).toMatchObject({ label: "Хөрөнгийг идэвхжүүлэх", missingCount: 0, target: { sheet: "contract" } });
  });
  it("6b. гэрээ дууссан хөрөнгө: сунгалт (тэр төлөвөөс хойш бүртгэгдсэн) — ноорогтой адил автомат зам", () => {
    // ready(): registered_at 2026-11-01T03:00Z. Дууссаны ДАРАА бүртгэгдсэн сунгалт.
    const renewed = withP(ready(), { status: "contract_ended", status_changed_at: "2026-10-31T16:00:00Z", contract_agent_id: null });
    expect(nextStep(renewed)).toMatchObject({ label: "Хөрөнгийн мэдээллийг гүйцээх (1)", target: { field: "contract_agent_id" } });
    expect(nextStep(withP(renewed, { contract_agent_id: ME }))).toMatchObject({ label: "Хөрөнгийг идэвхжүүлэх" });
    // Хүчинтэй гэрээтэй байхад гараар «гэрээ дууссан» болгосон → автоматаар сэргэхгүй, алхам санал болгохгүй.
    const manual = withP(ready(), { status: "contract_ended", status_changed_at: "2026-11-10T00:00:00Z" });
    expect(nextStep(manual).label).toBe("Бүрэн");
    expect(autoActivates(renewed.property, renewed.contract)).toBe(true);
    expect(autoActivates(manual.property, manual.contract)).toBe(false);
    expect(autoActivates({ status: "draft" }, ready().contract)).toBe(true);
    expect(autoActivates({ status: "suspended" }, ready().contract)).toBe(false);
    expect(autoActivates({ status: "draft" }, null)).toBe(false);
    // Нэг гүйлгээнд (бүртгэл = төлөв өөрчлөлт) — тэнцүү агшин хүчинтэй.
    expect(autoActivates({ status: "contract_ended", status_changed_at: "2026-11-01T03:00:00Z" }, ready().contract)).toBe(true);
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
