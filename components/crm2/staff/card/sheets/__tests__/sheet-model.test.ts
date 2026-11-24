import { describe, expect, it } from "vitest";

import { emptyPropertyForm, type PropertyFormState } from "@/components/crm2/staff/form/form-model";
import { propertyUpdateSchema } from "@/lib/crm2/schemas";

import {
  SHEET_FORM_KEYS,
  changedKeys,
  isCardFieldSheet,
  mergeSheetDraft,
  mergeTextDraft,
  parseSheetParam,
  resolveSheet,
  roleLocked,
  sheetFieldId,
  sheetFieldKey,
  sheetPatch,
  splitPrivate,
  unconfirmedRows,
} from "../sheet-model";

const ME = "11111111-1111-4111-8111-111111111111";

function form(over: Partial<PropertyFormState> = {}): PropertyFormState {
  return { ...emptyPropertyForm(ME), category: "sale", ...over };
}

describe("?sheet= параметр", () => {
  it("мэдэгдэх утгуудыг л хүлээн авна", () => {
    for (const v of ["location", "size", "price", "roles", "owner", "details", "photos", "confirm", "checklist", "next", "contract", "publish"]) {
      expect(parseSheetParam(v)).toBe(v);
    }
    expect(parseSheetParam("drop table")).toBeNull();
    expect(parseSheetParam("")).toBeNull();
    expect(parseSheetParam(null)).toBeNull();
    expect(isCardFieldSheet("checklist")).toBe(false);
    expect(isCardFieldSheet("owner")).toBe(true);
  });

  it("next → дараагийн алхмын цонх ба талбар", () => {
    const next = { target: { sheet: "location" as const, field: "district" } };
    expect(resolveSheet("next", null, next)).toEqual({ sheet: "location", field: "district" });
    expect(resolveSheet("price", "price", next)).toEqual({ sheet: "price", field: "price" });
    expect(resolveSheet(null, "price", next)).toEqual({ sheet: null, field: null });
  });

  it("талбарын параметрийг шүүнэ", () => {
    const next = { target: { sheet: "checklist" as const, field: null } };
    expect(resolveSheet("size", "<script>", next).field).toBeNull();
    expect(resolveSheet("owner", "owner.source", next).field).toBe("owner.source");
  });
});

describe("талбарын id / алдааны талбар", () => {
  it("DB, checklist талбарыг цонхны оруулга руу", () => {
    expect(sheetFieldKey("project_id")).toBe("project_name");
    expect(sheetFieldKey("project")).toBe("project_name");
    expect(sheetFieldKey("lng")).toBe("lat");
    expect(sheetFieldKey("building_floors")).toBe("floor");
    expect(sheetFieldKey("currency")).toBe("price");
    expect(sheetFieldKey("owner.full_name")).toBe("owner");
    expect(sheetFieldKey("owner.source")).toBe("owner-source");
    expect(sheetFieldKey("district")).toBe("district");
    expect(sheetFieldId("owner.source")).toBe("cs-owner-source");
    expect(sheetFieldId("area_m2")).toBe("cs-area_m2");
  });
});

describe("sheetPatch — зөвхөн тухайн цонхны өөрчлөлт", () => {
  it("өөрчлөлтгүй бол хоосон", () => {
    const base = form({ district: "Хан-Уул", area_m2: "80" });
    for (const s of Object.keys(SHEET_FORM_KEYS) as (keyof typeof SHEET_FORM_KEYS)[]) {
      expect(sheetPatch(s, base, { ...base })).toEqual({});
    }
  });

  it("хэмжээний цонх бусад цонхны талбарыг илгээхгүй", () => {
    const base = form({ district: "Хан-Уул" });
    const next = { ...base, area_m2: "81,47", district: "Сүхбаатар", rooms: "3" };
    const patch = sheetPatch("size", base, next);
    expect(patch).toEqual({ area_m2: 81.47, rooms: 3 });
    expect(propertyUpdateSchema.safeParse(patch).success).toBe(true);
  });

  it("байршил: төсөл, цэг (өргөрөг+уртраг хамт)", () => {
    const base = form();
    const next = { ...base, project_name: "Шинэ хотхон", lat: 47.9, lng: 106.9 };
    const patch = sheetPatch("location", base, next) as Record<string, unknown>;
    expect(patch.project_name).toBe("Шинэ хотхон");
    expect(patch.lat).toBe(47.9);
    expect(patch.lng).toBe(106.9);
    expect(propertyUpdateSchema.safeParse(patch).success).toBe(true);
  });

  it("unconfirmed зөвхөн багасна", () => {
    const base = form({ district: "Хан-Уул", unconfirmed: ["district", "price"] });
    const next = { ...base, unconfirmed: ["price"] };
    expect(sheetPatch("location", base, next)).toEqual({ unconfirmed: ["price"] });
  });

  it("давхар > барилгын давхар — схем татгалзана", () => {
    const base = form();
    const patch = sheetPatch("size", base, { ...base, floor: "12", building_floors: "9" });
    expect(propertyUpdateSchema.safeParse(patch).success).toBe(false);
  });

  it("ангиллыг хоосон болгохгүй", () => {
    const base = form({ category: "sale" });
    const patch = sheetPatch("details", base, { ...base, category: "" }) as Record<string, unknown>;
    expect("category" in patch).toBe(false);
  });
});

describe("утсан дээрх ноорог", () => {
  it("хувийн талбарыг (байршлын дэлгэрэнгүй) тусад нь", () => {
    const { pub, priv } = splitPrivate({ district: "Хан-Уул", address_detail: "3-р байр 12 тоот" });
    expect(pub).toEqual({ district: "Хан-Уул" });
    expect(priv).toEqual({ address_detail: "3-р байр 12 тоот" });
  });

  it("зөвхөн агентын засварласан талбарыг сэргээнэ, бусад нь серверийн шинэ утгаар", () => {
    const keys = SHEET_FORM_KEYS.size;
    const server = form({ area_m2: "80", rooms: "2", unconfirmed: ["area_m2"] });
    // Ноорог: өрөөг 3 болгосон; талбай base-тэй ижил (засаагүй) боловч сервер дээр өөрчлөгдсөн.
    const part = { base: { area_m2: "75", rooms: "2" }, values: { area_m2: "75", rooms: "3" } };
    const res = mergeSheetDraft(server, part, keys);
    expect(res.restored).toEqual(["rooms"]);
    expect(res.form.rooms).toBe("3");
    expect(res.form.area_m2).toBe("80");
    expect(res.form.unconfirmed).toEqual(["area_m2"]);
  });

  it("сэргээсэн талбар баталгаажсанд тооцогдоно", () => {
    const server = form({ district: "Хан-Уул", unconfirmed: ["district"] });
    const part = { base: { district: "Хан-Уул" }, values: { district: "Баянзүрх" } };
    const res = mergeSheetDraft(server, part, SHEET_FORM_KEYS.location);
    expect(res.form.district).toBe("Баянзүрх");
    expect(res.form.unconfirmed).toEqual([]);
  });

  it("эвдэрсэн утгыг сэргээхгүй", () => {
    const server = form();
    const part = { base: { features: [] }, values: { features: "parking" } };
    expect(mergeSheetDraft(server, part, SHEET_FORM_KEYS.details).restored).toEqual([]);
  });

  it("серверийн утга нооргийнхтой ижил болсон бол сэргээгдсэнд тооцохгүй", () => {
    const server = form({ rooms: "3" });
    const part = { base: { rooms: "2" }, values: { rooms: "3" } };
    expect(mergeSheetDraft(server, part, SHEET_FORM_KEYS.size).restored).toEqual([]);
  });

  it("бичвэрийн хэсэг (эзний тэмдэглэл)", () => {
    const cur = { owner_note: "", showing_instructions: "Түлхүүр жижүүрт" };
    const part = { base: { owner_note: "", showing_instructions: "" }, values: { owner_note: "Үнэ тохирно", showing_instructions: "" } };
    const res = mergeTextDraft(cur, part);
    expect(res.values).toEqual({ owner_note: "Үнэ тохирно", showing_instructions: "Түлхүүр жижүүрт" });
    expect(res.restored).toEqual(["owner_note"]);
    expect(mergeTextDraft(cur, null).restored).toEqual([]);
    expect(changedKeys(part, ["owner_note", "showing_instructions"])).toEqual(["owner_note"]);
  });
});

describe("баталгаажаагүй утгын мөрүүд", () => {
  it("үнийн түлхүүрүүд нэг мөрөнд, бусад нь цонхтой", () => {
    const rows = unconfirmedRows(["district", "price", "currency", "price_period", "contract_agent_id", "listing_agent_id"]);
    expect(rows.map((r) => r.id)).toEqual(["price", "district", "contract_agent_id", "listing_agent_id"]);
    expect(rows[0]).toMatchObject({ keys: ["price", "currency", "price_period"], sheet: "price" });
    expect(rows.find((r) => r.id === "district")?.sheet).toBe("location");
    expect(rows.find((r) => r.id === "contract_agent_id")?.sheet).toBe("contract");
    expect(rows.find((r) => r.id === "listing_agent_id")?.sheet).toBe("roles");
    expect(unconfirmedRows([])).toEqual([]);
  });
});

describe("үүргийн түгжээ (одоогийн дүрэм)", () => {
  it("идэвхтэй, томилогдсон, ахлагч/менежер биш бол түгжинэ", () => {
    expect(roleLocked("active", ME, false)).toBe(true);
    expect(roleLocked("active", ME, true)).toBe(false);
    expect(roleLocked("draft", ME, false)).toBe(false);
    expect(roleLocked("active", null, false)).toBe(false);
  });
});
