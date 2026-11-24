import { describe, expect, it } from "vitest";

import {
  buildQuickCreatePayload,
  issueField,
  rpcPropertyJson,
  sameOriginRequest,
  toQuickCreateResult,
  validateQuickCreate,
} from "@/lib/crm2/quick-payload";
import { quickCreateSchema } from "@/lib/crm2/schemas";

const KEY = "3f2b8c1e-7d4a-4b6e-9a1c-2d5e8f7a9b10";
const PROJECT = "0c9e7a51-2b3d-4f6a-8e1c-5d7b9a3f1e20";
const CONTACT = "6a1d2c3b-4e5f-4a7b-8c9d-0e1f2a3b4c5d";

describe("buildQuickCreatePayload", () => {
  it("хоосон утгыг хасна, тоон бичвэрийг тоо болгоно, schema-г давна", () => {
    const { payload, ownerSkipped } = buildQuickCreatePayload({
      clientKey: KEY,
      category: "sale",
      property_type: "apartment",
      district: "  ",
      location_text: "Зайсан",
      area_m2: "81,47",
      rooms: "3",
      floor: 12,
      building_floors: "18",
      price: "350000000",
      currency: "MNT",
      notes: "",
    });
    expect(ownerSkipped).toBe(false);
    expect(payload.property).toMatchObject({
      client_key: KEY,
      source: "manual",
      category: "sale",
      property_type: "apartment",
      location_text: "Зайсан",
      area_m2: 81.47,
      rooms: 3,
      floor: 12,
      building_floors: 18,
      price: 350_000_000,
    });
    expect(payload.property).not.toHaveProperty("district");
    expect(payload.property).not.toHaveProperty("notes");
    expect(payload.owner).toBeUndefined();
    expect(payload.private).toBeUndefined();
    expect(quickCreateSchema.safeParse(payload).success).toBe(true);
  });

  it("гэрээний агентыг хэзээ ч тавихгүй (unconfirmed-д ч)", () => {
    const { payload } = buildQuickCreatePayload({
      clientKey: KEY,
      category: "rent",
      listing_agent_id: CONTACT,
      unconfirmed: ["listing_agent_id", "contract_agent_id"],
    } as never);
    expect(payload.property).not.toHaveProperty("contract_agent_id");
    expect(payload.property.unconfirmed).toEqual(["listing_agent_id"]);
  });

  it("unconfirmed: зөвхөн зөвшөөрөгдсөн, утгатай түлхүүр, эрэмбэлсэн, давхардалгүй", () => {
    const { payload } = buildQuickCreatePayload({
      clientKey: KEY,
      category: "sale",
      price: 1000,
      project_name: "Ривер гарден",
      unconfirmed: ["price", "currency", "rooms", "project", "price", "bogus", "lat"],
    });
    // rooms, lat — утгагүй; bogus — жагсаалтад алга.
    expect(payload.property.unconfirmed).toEqual(["currency", "price", "project"]);
    expect(payload.property.project_name).toBe("Ривер гарден");
  });

  it("project_id байвал project_name илгээхгүй; цэгийн өргөрөг/уртраг хамт л", () => {
    const { payload } = buildQuickCreatePayload({
      clientKey: KEY,
      category: "sale",
      project_id: PROJECT,
      project_name: "Х",
      lat: 47.9,
      pin_address: "x",
    });
    expect(payload.property.project_id).toBe(PROJECT);
    expect(payload.property).not.toHaveProperty("project_name");
    expect(payload.property).not.toHaveProperty("lat");
    expect(payload.property).not.toHaveProperty("pin_address");
  });

  it("source: зөвхөн manual | paste | share; source_text → field_notes (≤2000)", () => {
    const long = "а".repeat(2500);
    const { payload } = buildQuickCreatePayload({ clientKey: KEY, category: "rent", source: "share", source_text: long });
    expect(payload.property.source).toBe("share");
    expect((payload.property.field_notes as Record<string, string>).source_text).toHaveLength(2000);
    const other = buildQuickCreatePayload({ clientKey: KEY, category: "rent", source: "listing" as never });
    expect(other.payload.property.source).toBe("manual");
  });

  it("эзэн: contact_id → зөвхөн id; бүтэн утас → цэвэрлэсэн; бүтэн биш утас → илгээхгүй (ownerSkipped)", () => {
    const linked = buildQuickCreatePayload({ clientKey: KEY, category: "rent" }, { owner: { contact_id: CONTACT } });
    expect(linked.payload.owner).toEqual({ contact_id: CONTACT });

    const phone = buildQuickCreatePayload(
      { clientKey: KEY, category: "rent" },
      { owner: { phone: " 9911 2233 ", full_name: " ", source: "referral", source_note: "", allow_duplicate: true } }
    );
    expect(phone.payload.owner).toEqual({ phone: "9911 2233", source: "referral", allow_duplicate: true });
    expect(quickCreateSchema.safeParse(phone.payload).success).toBe(true);

    const short = buildQuickCreatePayload({ clientKey: KEY, category: "rent" }, { owner: { phone: "991122" } });
    expect(short.ownerSkipped).toBe(true);
    expect(short.payload.owner).toBeUndefined();
  });

  it("хувийн тэмдэглэл зөвхөн утгатай үед", () => {
    const { payload } = buildQuickCreatePayload(
      { clientKey: KEY, category: "rent" },
      { owner_note: " Орой залгана ", showing_instructions: "" }
    );
    expect(payload.private).toEqual({ owner_note: "Орой залгана" });
  });
});

describe("validateQuickCreate", () => {
  it("зөв body → ok, rpcPropertyJson undefined түлхүүргүй", () => {
    const r = validateQuickCreate({ property: { category: "rent", client_key: KEY, rooms: "2" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const json = rpcPropertyJson(r.data.property);
    expect(json).toMatchObject({ category: "rent", client_key: KEY, rooms: 2, source: "manual" });
    expect(Object.values(json).includes(undefined)).toBe(false);
  });

  it("талбарын алдаа → field (property. угтваргүй)", () => {
    const r = validateQuickCreate({ property: { category: "rent", client_key: KEY, floor: 19, building_floors: 18 } });
    expect(r).toMatchObject({ ok: false, field: "floor" });
  });

  it("эзний утас 8-аас цөөн орон → owner.phone, монгол текст", () => {
    const r = validateQuickCreate({ property: { category: "rent", client_key: KEY }, owner: { phone: "9911223" } });
    expect(r).toEqual({ ok: false, error: "Дугаар 8 оронтой байх ёстой", field: "owner.phone" });
  });

  it("client_key дутуу / массив / null → алдаа", () => {
    expect(validateQuickCreate({ property: { category: "rent" } }).ok).toBe(false);
    expect(validateQuickCreate([]).ok).toBe(false);
    expect(validateQuickCreate(null).ok).toBe(false);
  });

  it("issueField", () => {
    expect(issueField(["property", "area_m2"])).toBe("area_m2");
    expect(issueField(["private", "owner_note"])).toBe("owner_note");
    expect(issueField(["owner", "phone"])).toBe("owner.phone");
    expect(issueField([])).toBeNull();
  });
});

describe("toQuickCreateResult", () => {
  it("хэлбэр зөв бол хэвийн болгоно, буруу бол null", () => {
    expect(toQuickCreateResult(null)).toBeNull();
    expect(toQuickCreateResult({ code: "P1" })).toBeNull();
    expect(toQuickCreateResult({ property_id: KEY, code: "P012" })).toEqual({
      property_id: KEY,
      code: "P012",
      replayed: false,
      owner: { status: "none" },
      duplicates: [],
    });
    const r = toQuickCreateResult({
      property_id: KEY,
      code: "P012",
      replayed: true,
      owner: { status: "pending_review", pending_saved: true },
      duplicates: [{ token: PROJECT, can_open: false }],
    });
    expect(r?.replayed).toBe(true);
    expect(r?.owner.status).toBe("pending_review");
    expect(r?.duplicates).toHaveLength(1);
  });
});

describe("sameOriginRequest", () => {
  const req = (headers: Record<string, string>) => new Request("https://nemi.mn/api/crm2/quick-create", { method: "POST", headers });
  it("ижил host → true; өөр host → false", () => {
    expect(sameOriginRequest(req({ host: "nemi.mn", origin: "https://nemi.mn" }))).toBe(true);
    expect(sameOriginRequest(req({ host: "nemi.mn", origin: "https://evil.example" }))).toBe(false);
    expect(sameOriginRequest(req({ host: "nemi.mn", origin: "https://nemi.mn.evil.example" }))).toBe(false);
  });
  it("proxy-ийн x-forwarded-host-ыг давуу", () => {
    expect(sameOriginRequest(req({ host: "internal:3000", "x-forwarded-host": "nemi.mn", origin: "https://nemi.mn" }))).toBe(true);
  });
  it("Origin байхгүй бол зөвхөн sec-fetch-site=same-origin; 'null' origin → false", () => {
    expect(sameOriginRequest(req({ host: "nemi.mn" }))).toBe(false);
    expect(sameOriginRequest(req({ host: "nemi.mn", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(sameOriginRequest(req({ host: "nemi.mn", origin: "null" }))).toBe(false);
  });
});
