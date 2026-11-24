import { describe, expect, it } from "vitest";

import {
  brokerageApproveSchema,
  brokerageFileSchema,
  confirmFieldsSchema,
  contactUpdateSchema,
  duplicateFlagSchema,
  importListingSchema,
  ownerInputSchema,
  ownerSetSchema,
  publishPropertySchema,
  quickCreateSchema,
  resolveDuplicateSchema,
  uiEventSchema,
  brokerageUpdateSchema,
  brokerageCreateSchema,
  brokerageFileRowSchema,
  cancelDealSchema,
  contactCreateSchema,
  decideRequestSchema,
  logCallSchema,
  mediaRowSchema,
  propertyCreateSchema,
  propertyStatusSchema,
  propertyUpdateSchema,
  requirementCreateSchema,
  setSettingSchema,
  showingOutcomeSchema,
  showingRecordSchema,
  showingScheduleSchema,
  taskCreateSchema,
  videoLinkSchema,
} from "@/lib/crm2/schemas";
import { zodErrorText } from "@/lib/crm2/result";

const ID = "6c50ca17-3ded-4620-8035-d043578ecdd7";
const ID2 = "931b4a39-a38a-442c-9170-ea573522efd0";

function firstError(r: { success: boolean; error?: unknown }): string {
  if (r.success) return "";
  return zodErrorText(r.error as Parameters<typeof zodErrorText>[0]);
}

describe("propertyCreateSchema", () => {
  it("хамгийн бага: зөвхөн ангилал", () => {
    expect(propertyCreateSchema.safeParse({ category: "rent" }).success).toBe(true);
  });

  it("маягтын мөр утгыг тоо/null болгоно, хамгаалагдсан баганыг хасна", () => {
    const r = propertyCreateSchema.safeParse({
      category: "sale",
      price: "350 000 000",
      rooms: "3",
      area_m2: "",
      location_text: "  Зайсан ",
      status: "active",
      code: "P999",
      activated_at: "2026-01-01",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.price).toBe(350000000);
    expect(r.data.rooms).toBe(3);
    expect(r.data.area_m2).toBeNull();
    expect(r.data.location_text).toBe("Зайсан");
    expect("status" in r.data).toBe(false);
    expect("code" in r.data).toBe(false);
    expect("activated_at" in r.data).toBe(false);
  });

  it("ангилалгүй бол монгол алдаа", () => {
    const r = propertyCreateSchema.safeParse({});
    expect(r.success).toBe(false);
    expect(firstError(r)).toBe("Ангиллыг сонгоно уу.");
  });

  it("хязгаар: өрөө, давхар, он", () => {
    expect(propertyCreateSchema.safeParse({ category: "rent", rooms: 101 }).success).toBe(false);
    expect(propertyCreateSchema.safeParse({ category: "rent", rooms: 2.5 }).success).toBe(false);
    expect(propertyCreateSchema.safeParse({ category: "rent", floor: -11 }).success).toBe(false);
    expect(propertyCreateSchema.safeParse({ category: "rent", year_in_use: 1899 }).success).toBe(false);
    expect(propertyCreateSchema.safeParse({ category: "rent", floor: 10, building_floors: 9 }).success).toBe(false);
  });

  it("pin: өргөрөг, уртраг хамт", () => {
    expect(propertyCreateSchema.safeParse({ category: "rent", lat: 47.9 }).success).toBe(false);
    expect(propertyCreateSchema.safeParse({ category: "rent", lat: 47.9, lng: 106.9 }).success).toBe(true);
    expect(propertyCreateSchema.safeParse({ category: "rent", lat: 95, lng: 106.9 }).success).toBe(false);
  });

  it("м²-ийн үнэ бол хэмжээ заавал", () => {
    expect(propertyCreateSchema.safeParse({ category: "sale", price_basis: "per_m2", price: 3_000_000 }).success).toBe(false);
    expect(
      propertyCreateSchema.safeParse({ category: "sale", price_basis: "per_m2", price: 3_000_000, area_m2: 80 }).success
    ).toBe(true);
  });

  it("талбарын тайлбарыг UTF-8 байтаар хязгаарлана (DB: pg_column_size)", () => {
    const cyr = "ж".repeat(1990);
    // 6 × 1990 кирилл ≈ 12000 тэмдэгт боловч ~24000 байт — DB-ийн 16000 байтаас давна.
    const six = Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((k) => [k, cyr]));
    expect(propertyCreateSchema.safeParse({ category: "rent", field_notes: six }).success).toBe(false);
    const three = Object.fromEntries(["a", "b", "c"].map((k) => [k, cyr]));
    expect(propertyCreateSchema.safeParse({ category: "rent", field_notes: three }).success).toBe(true);
    // Латин үсэг 1 байт — 6 × 1990 зөвшөөрнө.
    const latin = Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((k) => [k, "x".repeat(1990)]));
    expect(propertyCreateSchema.safeParse({ category: "rent", field_notes: latin }).success).toBe(true);
  });

  it("онцлог түлхүүрийн хэлбэр", () => {
    expect(propertyCreateSchema.safeParse({ category: "rent", features: ["parking", "pets"] }).success).toBe(true);
    expect(propertyCreateSchema.safeParse({ category: "rent", features: ["Зогсоол"] }).success).toBe(false);
  });

  it("төсөл нэрээр + хувийн талбар", () => {
    const r = propertyCreateSchema.safeParse({
      category: "rent",
      project_name: "Хан-Уул резиденс",
      private: { owner_contact_id: ID, showing_instructions: "Жижүүрээс түлхүүр" },
    });
    expect(r.success).toBe(true);
  });
});

describe("propertyUpdateSchema", () => {
  it("хоосон patch зөвшөөрнө, зөвхөн өгсөн талбар", () => {
    const r = propertyUpdateSchema.safeParse({ price: 1000 });
    expect(r.success).toBe(true);
    if (r.success) expect(Object.keys(r.data).filter((k) => r.data[k as keyof typeof r.data] !== undefined)).toEqual(["price"]);
  });
  it("pin-ийн нэгийг л өгвөл алдаа; хоёуланг null бол цэвэрлэнэ", () => {
    expect(propertyUpdateSchema.safeParse({ lat: 47.9 }).success).toBe(false);
    expect(propertyUpdateSchema.safeParse({ lat: null, lng: null }).success).toBe(true);
    expect(propertyUpdateSchema.safeParse({ lat: "", lng: "" }).success).toBe(true);
  });
});

describe("propertyStatusSchema", () => {
  it("төлөв enum", () => {
    expect(propertyStatusSchema.safeParse({ property_id: ID, status: "sold", reason: "Гэрээ хийгдсэн" }).success).toBe(true);
    expect(propertyStatusSchema.safeParse({ property_id: ID, status: "closed" }).success).toBe(false);
    expect(propertyStatusSchema.safeParse({ property_id: "x", status: "sold" }).success).toBe(false);
  });
});

describe("медиа, файлын зам", () => {
  it("crm2-media: office/property/file", () => {
    expect(mediaRowSchema.safeParse({ property_id: ID, storage_path: `${ID2}/${ID}/a1b2.jpg` }).success).toBe(true);
    expect(mediaRowSchema.safeParse({ property_id: ID, storage_path: `${ID2}/${ID}/../x.jpg` }).success).toBe(false);
    expect(mediaRowSchema.safeParse({ property_id: ID, storage_path: `${ID2}/x.jpg` }).success).toBe(false);
  });
  it("crm2-docs: office/brokerage/contract/file", () => {
    expect(brokerageFileRowSchema.safeParse({ contract_id: ID, storage_path: `${ID2}/brokerage/${ID}/f.pdf` }).success).toBe(true);
    expect(brokerageFileRowSchema.safeParse({ contract_id: ID, storage_path: `${ID2}/${ID}/f.pdf` }).success).toBe(false);
  });
  it("бичлэгийн холбоос https", () => {
    expect(videoLinkSchema.safeParse({ property_id: ID, external_url: "https://youtu.be/x" }).success).toBe(true);
    expect(videoLinkSchema.safeParse({ property_id: ID, external_url: "http://youtu.be/x" }).success).toBe(false);
  });
});

describe("brokerageCreateSchema", () => {
  it("огноо, шимтгэлийн хувь", () => {
    expect(
      brokerageCreateSchema.safeParse({ property_id: ID, start_date: "2026-11-01", end_date: "2027-10-31", commission_type: "percent", commission_value: "3" })
        .success
    ).toBe(true);
    expect(brokerageCreateSchema.safeParse({ property_id: ID, start_date: "2026-11-01", end_date: "2026-10-01" }).success).toBe(false);
    expect(brokerageCreateSchema.safeParse({ property_id: ID, commission_type: "percent", commission_value: 150 }).success).toBe(false);
    expect(brokerageCreateSchema.safeParse({ property_id: ID, start_date: "2026-02-30" }).success).toBe(false);
  });
});

describe("contactCreateSchema", () => {
  it("нэр заавал, дугаар шалгана", () => {
    expect(contactCreateSchema.safeParse({ full_name: "Бат", phones: [{ phone: "9911 2233" }] }).success).toBe(true);
    expect(contactCreateSchema.safeParse({ full_name: "  ", phones: [] }).success).toBe(false);
    expect(contactCreateSchema.safeParse({ full_name: "Бат", phones: [{ phone: "12" }] }).success).toBe(false);
    const r = contactCreateSchema.safeParse({ full_name: "Бат" });
    expect(r.success && r.data.phones).toEqual([]);
  });
});

describe("requirementCreateSchema", () => {
  it("муж, зарах бол нийт дүн", () => {
    expect(requirementCreateSchema.safeParse({ contact_id: ID, budget_min: 10, budget_max: 5 }).success).toBe(false);
    expect(requirementCreateSchema.safeParse({ contact_id: ID, rooms_min: 3, rooms_max: 2 }).success).toBe(false);
    expect(requirementCreateSchema.safeParse({ contact_id: ID, category: "sale", price_period: "month" }).success).toBe(false);
    expect(
      requirementCreateSchema.safeParse({ contact_id: ID, category: "rent", price_period: "month", districts: ["Хан-Уул"] }).success
    ).toBe(true);
  });
});

describe("logCallSchema", () => {
  it("УБ-ын цагийг ISO болгоно, ирээдүйн цаг хориотой", () => {
    const r = logCallSchema.safeParse({ property_id: ID, contact_id: ID2, occurred_at: "2026-11-13T10:30" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.occurred_at).toBe("2026-11-13T02:30:00.000Z");
    expect(logCallSchema.safeParse({ property_id: ID, contact_id: ID2, occurred_at: "2999-01-01T10:00" }).success).toBe(false);
  });
  it("дараагийн алхмын хугацаа төрөлгүй бол алдаа", () => {
    const r = logCallSchema.safeParse({ property_id: ID, contact_id: ID2, next_action_due: "2026-11-20T10:00" });
    expect(r.success).toBe(false);
    expect(
      logCallSchema.safeParse({ property_id: ID, contact_id: ID2, next_action: "call_back", next_action_due: "2026-11-20T10:00" })
        .success
    ).toBe(true);
    expect(logCallSchema.safeParse({ property_id: ID, contact_id: ID2, next_action: "visit" }).success).toBe(false);
  });
});

describe("үзүүлэлт", () => {
  it("товлох — цаг заавал", () => {
    expect(showingScheduleSchema.safeParse({ deal_id: ID, scheduled_at: "2026-11-20T15:00" }).success).toBe(true);
    expect(showingScheduleSchema.safeParse({ deal_id: ID }).success).toBe(false);
    expect(showingScheduleSchema.safeParse({ deal_id: ID, scheduled_at: "маргааш" }).success).toBe(false);
  });
  it("«үзүүлсэн» бодит цаг заавал, ирээдүй хориотой", () => {
    expect(showingOutcomeSchema.safeParse({ activity_id: ID, outcome: "shown" }).success).toBe(false);
    expect(
      showingOutcomeSchema.safeParse({ activity_id: ID, outcome: "shown", occurred_at: "2026-11-01T10:00", feedback: "Таалагдсан" }).success
    ).toBe(true);
    expect(showingOutcomeSchema.safeParse({ activity_id: ID, outcome: "no_show" }).success).toBe(true);
    expect(showingOutcomeSchema.safeParse({ activity_id: ID, outcome: "scheduled" }).success).toBe(false);
    expect(showingRecordSchema.safeParse({ deal_id: ID, occurred_at: "2999-01-01T10:00" }).success).toBe(false);
  });
});

describe("cancelDealSchema", () => {
  it("«other» бол тайлбар заавал", () => {
    expect(cancelDealSchema.safeParse({ deal_id: ID, reason_code: "price" }).success).toBe(true);
    const r = cancelDealSchema.safeParse({ deal_id: ID, reason_code: "other" });
    expect(r.success).toBe(false);
    expect(firstError(r)).toBe("«Бусад» шалтгааны тайлбарыг бичнэ үү.");
    expect(cancelDealSchema.safeParse({ deal_id: ID, reason_code: "other", reason: "Гэр бүлийн шалтгаан" }).success).toBe(true);
  });
});

describe("taskCreateSchema", () => {
  it("холбоосгүй ажил хориотой", () => {
    expect(taskCreateSchema.safeParse({ kind: "call_back" }).success).toBe(false);
    expect(taskCreateSchema.safeParse({ kind: "call_back", contact_id: ID }).success).toBe(true);
    expect(taskCreateSchema.safeParse({ kind: "brokerage_renewal", brokerage_id: ID, due_at: "2026-12-01T09:00" }).success).toBe(true);
  });
});

describe("decideRequestSchema", () => {
  it("татгалзахад тайлбар заавал", () => {
    expect(decideRequestSchema.safeParse({ request_id: ID, approve: true }).success).toBe(true);
    expect(decideRequestSchema.safeParse({ request_id: ID, approve: false }).success).toBe(false);
    expect(decideRequestSchema.safeParse({ request_id: ID, approve: false, note: "Үндэслэлгүй" }).success).toBe(true);
  });
});

describe("setSettingSchema", () => {
  it("мэдэгдэх түлхүүр л", () => {
    expect(setSettingSchema.safeParse({ key: "media.max_images", value: 30 }).success).toBe(true);
    expect(setSettingSchema.safeParse({ key: "deal.cancel_reasons", value: { other: "Бусад" } }).success).toBe(true);
    expect(setSettingSchema.safeParse({ key: "unknown.key", value: 1 }).success).toBe(false);
  });
});

describe("тоон талбарын таслал (гомдол: «81,47» → 8147)", () => {
  it("бутархайг таслалаар бичсэнийг зөв уншина", () => {
    const r = requirementCreateSchema.safeParse({ contact_id: ID, area_min: "81,47", area_max: "120,5" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.area_min).toBe(81.47);
    expect(r.data.area_max).toBe(120.5);
  });

  it("мянгатын таслалыг хэвээр ойлгоно", () => {
    const r = requirementCreateSchema.safeParse({ contact_id: ID, budget_min: "1,500", budget_max: "250,000,000" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.budget_min).toBe(1500);
    expect(r.data.budget_max).toBe(250_000_000);
  });

  it("хөрөнгийн хэмжээ, үнэд мөн адил", () => {
    const r = propertyCreateSchema.safeParse({ category: "sale", area_m2: "81,47", price: "350,000,000" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.area_m2).toBe(81.47);
    expect(r.data.price).toBe(350_000_000);
  });

  it("таниагүй тоон бичвэрт монгол алдаа", () => {
    const r = propertyCreateSchema.safeParse({ category: "sale", area_m2: "1,2.3" });
    expect(r.success).toBe(false);
    expect(firstError(r)).toContain("тоо байна");
  });
});

// ── Staff шуурхай бүртгэл (P1/P6/P7/P8/P11/P12) ───────────────────────────

const KEY = "0b6f3c1e-5a4d-4e2b-9c8f-7d6e5f4a3b2c";

describe("ownerInputSchema", () => {
  it("7 оронтой дугаар → «Дугаар 8 оронтой байх ёстой»", () => {
    const r = ownerInputSchema.safeParse({ phone: "9911223" });
    expect(r.success).toBe(false);
    expect(firstError(r)).toBe("Дугаар 8 оронтой байх ёстой");
  });
  it("+976, зай, зураастай дугаар зөв", () => {
    expect(ownerInputSchema.safeParse({ phone: "+976 9911-2233" }).success).toBe(true);
    expect(ownerInputSchema.safeParse({ phone: "99112233", full_name: "", source: "referral" }).success).toBe(true);
  });
  it("сонгосон харилцагч", () => {
    expect(ownerInputSchema.safeParse({ contact_id: ID }).data).toEqual({ contact_id: ID });
    expect(ownerInputSchema.safeParse({ contact_id: "x" }).success).toBe(false);
  });
  it("«Бусад» эх сурвалжид тайлбар заавал; тайлбар ≤ 200", () => {
    expect(ownerInputSchema.safeParse({ phone: "99112233", source: "other" }).success).toBe(false);
    expect(ownerInputSchema.safeParse({ phone: "99112233", source: "other", source_note: "Найз" }).success).toBe(true);
    expect(ownerInputSchema.safeParse({ phone: "99112233", source_note: "x".repeat(201) }).success).toBe(false);
  });
  it("хүлээгдэж буй эзнийг цэвэрлэх", () => {
    expect(ownerSetSchema.safeParse({ clear: true }).success).toBe(true);
    expect(ownerSetSchema.safeParse({ clear: false }).success).toBe(false);
  });
});

describe("quickCreateSchema", () => {
  const base = { property: { category: "rent", client_key: KEY } };
  it("client_key заавал, source анхдагч manual", () => {
    expect(quickCreateSchema.safeParse({ property: { category: "rent" } }).success).toBe(false);
    const r = quickCreateSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data?.property.source).toBe("manual");
    expect(quickCreateSchema.safeParse({ property: { ...base.property, source: "listing" } }).success).toBe(false);
  });
  it("давхар ба м²-ийн дүрэм бүрэн формтой ижил", () => {
    expect(quickCreateSchema.safeParse({ property: { ...base.property, floor: 19, building_floors: 18 } }).success).toBe(false);
    expect(quickCreateSchema.safeParse({ property: { ...base.property, price: 1, price_basis: "per_m2" } }).success).toBe(false);
  });
  it("эзэн, хувийн тэмдэглэл, шинэ талбарууд", () => {
    const r = quickCreateSchema.safeParse({
      property: { ...base.property, project_name: "River Garden", parking_spaces: "2", rent_advance_months: 1, unconfirmed: ["price", "project"] },
      owner: { phone: "9911 2233", source: "walk_in" },
      private: { owner_note: "Оройн 6-аас хойш", showing_instructions: "Жижүүрт хэлнэ" },
    });
    expect(r.success).toBe(true);
    expect(r.data?.property.parking_spaces).toBe(2);
    expect(quickCreateSchema.safeParse({ ...base, owner: { phone: "123" } }).success).toBe(false);
    expect(quickCreateSchema.safeParse({ ...base, owner: null }).success).toBe(true);
    expect(quickCreateSchema.safeParse({ property: { ...base.property, parking_spaces: 51 } }).success).toBe(false);
    expect(quickCreateSchema.safeParse({ property: { ...base.property, rent_deposit_months: 25 } }).success).toBe(false);
    expect(quickCreateSchema.safeParse({ property: { ...base.property, unconfirmed: ["owner"] } }).success).toBe(false);
  });
});

describe("propertyCreate/Update: эх сурвалж, unconfirmed", () => {
  it("засахад source орохгүй (хасагдана), unconfirmed зөвхөн хүчинтэй түлхүүр", () => {
    const r = propertyUpdateSchema.safeParse({ source: "paste", unconfirmed: ["price"] });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty("source");
    expect(r.data?.unconfirmed).toEqual(["price"]);
    expect(propertyUpdateSchema.safeParse({ unconfirmed: ["status"] }).success).toBe(false);
    expect(propertyUpdateSchema.safeParse({ unconfirmed: Array(41).fill("price") }).success).toBe(false);
  });
  it("шинээр: source, client_key", () => {
    const r = propertyCreateSchema.safeParse({ category: "sale", source: "paste", client_key: KEY });
    expect(r.data).toMatchObject({ source: "paste", client_key: KEY });
    expect(propertyCreateSchema.safeParse({ category: "sale", source: "listing" }).success).toBe(false);
  });
});

describe("гэрээ (P7)", () => {
  it("шинэ талбарууд", () => {
    const r = brokerageUpdateSchema.safeParse({
      contract_id: ID,
      no_special_terms: true,
      signer_differs: true,
      signer_note: "Эхнэр нь, итгэмжлэлтэй",
      file_at_office: true,
      prefilled: ["commission", "end_date"],
    });
    expect(r.success).toBe(true);
    expect(brokerageUpdateSchema.safeParse({ contract_id: ID, signer_note: "x".repeat(501) }).success).toBe(false);
    expect(brokerageUpdateSchema.safeParse({ contract_id: ID, prefilled: ["terms"] }).success).toBe(false);
    expect(brokerageApproveSchema.safeParse({ contract_id: ID, file_checked: true }).data?.file_checked).toBe(true);
  });
  it("файлын төрөл ба хязгаарлагдсан зам", () => {
    const uuidName = `${ID2}.pdf`;
    expect(brokerageFileRowSchema.safeParse({ contract_id: ID, storage_path: `${ID2}/brokerage/${ID}/f.pdf` }).data?.kind).toBe("contract");
    expect(
      brokerageFileRowSchema.safeParse({ contract_id: ID, kind: "ownership", storage_path: `${ID2}/brokerage/${ID}/restricted/${uuidName}` }).success
    ).toBe(true);
    expect(brokerageFileRowSchema.safeParse({ contract_id: ID, kind: "ownership", storage_path: `${ID2}/brokerage/${ID}/f.pdf` }).success).toBe(false);
    expect(
      brokerageFileRowSchema.safeParse({ contract_id: ID, kind: "id", storage_path: `${ID2}/brokerage/${ID}/restricted/passport.pdf` }).success
    ).toBe(false);
    expect(
      brokerageFileRowSchema.safeParse({ contract_id: ID, kind: "contract", storage_path: `${ID2}/brokerage/${ID}/restricted/${uuidName}` }).success
    ).toBe(false);
    expect(brokerageFileSchema.safeParse({ contract_id: ID, kind: "other" }).success).toBe(true);
    expect(brokerageFileSchema.safeParse({ contract_id: ID, kind: "passport" }).success).toBe(false);
  });
});

describe("харилцагч: эх сурвалж, зөвшөөрөл", () => {
  it("create ба update", () => {
    expect(contactCreateSchema.safeParse({ full_name: "Бат", source: "referral", source_note: "Дорж", consent: "verbal" }).success).toBe(true);
    expect(contactUpdateSchema.safeParse({ contact_id: ID, source: "Bad Code" }).success).toBe(false);
    expect(contactUpdateSchema.safeParse({ contact_id: ID, consent: "maybe" }).success).toBe(false);
    expect(contactUpdateSchema.safeParse({ contact_id: ID, source: "", consent: "declined" }).data).toMatchObject({
      source: null,
      consent: "declined",
    });
  });
});

describe("uiEventSchema", () => {
  it("зөвшөөрөгдсөн үйл явдал, тоон meta", () => {
    expect(
      uiEventSchema.safeParse({
        event: "quick_save",
        flow: "quick",
        duration_ms: 42000,
        first_input_ms: 3000,
        taps: 27,
        fields_filled: 9,
        meta: { photos: 8, offline: false },
      }).success
    ).toBe(true);
    expect(uiEventSchema.safeParse({ event: "owner_phone", flow: "quick" }).success).toBe(false);
    expect(uiEventSchema.safeParse({ event: "quick_save", meta: { phone: "99112233" } }).success).toBe(false);
    expect(uiEventSchema.safeParse({ event: "quick_save", meta: { phone: 99112233 } }).success).toBe(false);
    expect(uiEventSchema.safeParse({ event: "quick_save", flow: "other" }).success).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`k${i}`, i]));
    expect(uiEventSchema.safeParse({ event: "quick_save", meta: many }).success).toBe(false);
    expect(uiEventSchema.safeParse({ event: "quick_save", duration_ms: -1 }).success).toBe(false);
  });
});

describe("давхардал, импорт, баталгаажуулалт, нийтлэх", () => {
  it("duplicateFlagSchema: тусдаа бол шалтгаан заавал", () => {
    expect(duplicateFlagSchema.safeParse({ property_id: ID, token: ID2, kind: "access" }).success).toBe(true);
    expect(duplicateFlagSchema.safeParse({ property_id: ID, token: ID2, kind: "distinct" }).success).toBe(false);
    expect(duplicateFlagSchema.safeParse({ property_id: ID, token: ID2, kind: "distinct", note: "Өөр давхар" }).success).toBe(true);
    expect(duplicateFlagSchema.safeParse({ property_id: ID, token: "abc", kind: "access" }).success).toBe(false);
    expect(resolveDuplicateSchema.safeParse({ flag_id: ID, status: "duplicate" }).success).toBe(true);
    expect(resolveDuplicateSchema.safeParse({ flag_id: ID, status: "open" }).success).toBe(false);
  });
  it("import, confirm, publish", () => {
    expect(importListingSchema.safeParse({ listing_id: ID, client_key: KEY }).success).toBe(true);
    expect(confirmFieldsSchema.safeParse({ property_id: ID, keys: [] }).success).toBe(false);
    expect(confirmFieldsSchema.safeParse({ property_id: ID, keys: ["price", "lat"] }).success).toBe(true);
    expect(confirmFieldsSchema.safeParse({ property_id: ID, keys: ["status"] }).success).toBe(false);
    expect(publishPropertySchema.safeParse({ property_id: ID, link_listing: ID2, replace_photos: true }).data).toMatchObject({
      link_listing: ID2,
      replace_photos: true,
    });
    expect(publishPropertySchema.safeParse({ property_id: ID, link_listing: "" }).data?.link_listing).toBeNull();
  });
});
