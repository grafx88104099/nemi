import { describe, expect, it } from "vitest";

import { brokerageCreateSchema, propertyCreateSchema, propertyUpdateSchema } from "@/lib/crm2/schemas";
import type { Crm2BrokerageRow, Crm2PropertyRow } from "@/lib/crm2/types";

import {
  brokerageHasInput,
  brokeragePayload,
  brokerageSubmitMissing,
  brokerageToForm,
  cleanFieldNotes,
  diffPayload,
  emptyBrokerageForm,
  emptyPropertyForm,
  fieldErrors,
  missingSentence,
  omitKey,
  ownerPhones,
  parseFieldNotes,
  parseNumberInput,
  previewTotal,
  pricePeriodMismatch,
  pricePeriodOptions,
  privatePayload,
  projectChange,
  projectForCreate,
  propertyInputErrors,
  propertyPayload,
  propertyToForm,
  sameAgentConflict,
  swap,
  videoLinkError,
  withCategory,
  type PropertyFormState,
} from "../form-model";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";

function row(over: Partial<Crm2PropertyRow> = {}): Crm2PropertyRow & { project: { id: string; name: string } | null } {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    office_id: "55555555-5555-4555-8555-555555555555",
    code: "P001",
    category: "rent",
    property_type: "apartment",
    status: "active",
    status_reason: null,
    status_changed_at: "2026-11-01T00:00:00Z",
    activated_at: "2026-11-01T00:00:00Z",
    project_id: PROJECT,
    district: "Хан-Уул",
    location_text: "Зайсан",
    address_detail: null,
    lat: 47.9,
    lng: 106.9,
    pin_address: "Зайсан, УБ",
    area_m2: 82.5,
    rooms: 3,
    floor: 5,
    building_floors: 12,
    price: 3500000,
    currency: "MNT",
    price_period: "month",
    price_basis: "total",
    price_total: 3500000,
    year_in_use: 2018,
    operating_cost: 250000,
    operating_cost_currency: "MNT",
    operating_cost_period: "month",
    operating_cost_note: null,
    condition: "Шинэ засвартай",
    view_note: null,
    notes: null,
    advantages: null,
    features: ["balcony", "parking"],
    field_notes: { price: "3.5 сая, тохирно", junk: 5 },
    available_from: "2026-12-01",
    availability_note: null,
    listing_agent_id: ME,
    contract_agent_id: ME,
    photo_agent_id: null,
    brokerage_end_date: "2027-11-01",
    last_verified_at: null,
    last_verified_by: null,
    search_text: "",
    created_by: ME,
    created_at: "2026-11-01T00:00:00Z",
    updated_by: null,
    updated_at: "2026-11-01T00:00:00Z",
    project: { id: PROJECT, name: "Зайсан Хилл" },
    ...over,
  };
}

describe("parseNumberInput", () => {
  it("зай, таслалыг хасаж тоо болгоно; хоосон → null; буруу → бичвэр", () => {
    expect(parseNumberInput("1,250,000")).toBe(1250000);
    expect(parseNumberInput(" 82.5 ")).toBe(82.5);
    expect(parseNumberInput("3 500 000")).toBe(3500000);
    expect(parseNumberInput("")).toBeNull();
    expect(parseNumberInput("  ")).toBeNull();
    expect(parseNumberInput("гурав")).toBe("гурав");
  });
});

describe("field notes", () => {
  it("зөвхөн хоосон биш текст утгыг авна", () => {
    expect(parseFieldNotes({ price: "a", rooms: "", junk: 5, list: ["x"] })).toEqual({ price: "a" });
    expect(parseFieldNotes(null)).toEqual({});
    expect(parseFieldNotes(["x"])).toEqual({});
  });
  it("тайрч, хоосныг хасна", () => {
    expect(cleanFieldNotes({ rooms: "  ", price: " 3 сая " })).toEqual({ price: "3 сая" });
  });
});

describe("emptyPropertyForm / propertyPayload", () => {
  it("шинэ маягт: листлэгч ба гэрээ хийсэн агент = өөрөө", () => {
    const f = emptyPropertyForm(ME);
    expect(f.listing_agent_id).toBe(ME);
    expect(f.contract_agent_id).toBe(ME);
    expect(f.photo_agent_id).toBe("");
    expect(f.currency).toBe("MNT");
  });

  it("хоосон текстийг null, тоог тоо, онцлогийг эрэмбэлсэн болгоно", () => {
    const f: PropertyFormState = {
      ...emptyPropertyForm(ME),
      category: "sale",
      price: "350,000,000",
      rooms: "3",
      notes: "   ",
      features: ["parking", "balcony", "parking"],
      field_notes: { price: " тохиролцоно ", rooms: "" },
    };
    const p = propertyPayload(f);
    expect(p.price).toBe(350000000);
    expect(p.rooms).toBe(3);
    expect(p.notes).toBeNull();
    expect(p.photo_agent_id).toBeNull();
    expect(p.features).toEqual(["balcony", "parking"]);
    expect(p.field_notes).toEqual({ price: "тохиролцоно" });
    expect(p.lat).toBeNull();
  });

  it("шинэ хөрөнгийн оролт схемийн шалгалтыг давна", () => {
    const f = withCategory({ ...emptyPropertyForm(ME), location_text: "Зайсан", price: "3500000" }, "rent");
    const input = { ...propertyPayload(f), ...projectForCreate({ ...f, project_name: "Шинэ хотхон" }) };
    const parsed = propertyCreateSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.price_period).toBe("month");
      expect(parsed.data.project_name).toBe("Шинэ хотхон");
    }
  });

  it("ангилалгүй, м²-ийн үнэ хэмжээгүй бол талбарын алдаа", () => {
    const f = { ...emptyPropertyForm(ME), price: "12000", price_basis: "per_m2" as const, floor: "9", building_floors: "5" };
    const errs = propertyInputErrors(propertyPayload(f));
    expect(errs.category).toBe("Ангиллыг сонгоно уу.");
    expect(errs.area_m2).toMatch(/хэмжээ/);
    expect(errs.floor).toMatch(/Давхар/);
    expect(propertyInputErrors(propertyPayload({ ...f, category: "rent", area_m2: "40", floor: "3" }))).toEqual({});
  });
});

describe("propertyToForm ↔ diffPayload", () => {
  it("DB мөрийг уншаад өөрчлөөгүй бол diff хоосон", () => {
    const f = propertyToForm(row());
    expect(f.area_m2).toBe("82.5");
    expect(f.project_name).toBe("Зайсан Хилл");
    expect(f.field_notes).toEqual({ price: "3.5 сая, тохирно" });
    expect(diffPayload(propertyPayload(f), propertyPayload(f))).toEqual({});
    expect(projectChange(f, f)).toEqual({});
  });

  it("зөвхөн өөрчлөгдсөн талбар; өргөрөг/уртраг хамт", () => {
    const before = propertyToForm(row());
    const after = { ...before, price: "3,800,000", lat: 47.95, features: ["parking", "balcony"] };
    const diff = diffPayload(propertyPayload(before), propertyPayload(after));
    expect(diff).toEqual({ price: 3800000, lat: 47.95, lng: 106.9 });
    expect(propertyUpdateSchema.safeParse(diff).success).toBe(true);
  });

  it("цэг арилгахад хоёулаа null", () => {
    const before = propertyToForm(row());
    const diff = diffPayload(propertyPayload(before), propertyPayload({ ...before, lat: null, lng: null }));
    expect(diff).toEqual({ lat: null, lng: null });
  });
});

describe("төсөл", () => {
  const base = propertyToForm(row());
  it("шинэ хөрөнгө: сонгосон id эсвэл нэр", () => {
    expect(projectForCreate({ ...base, project_id: PROJECT })).toEqual({ project_id: PROJECT });
    expect(projectForCreate({ ...base, project_id: null, project_name: "  Шинэ " })).toEqual({ project_name: "Шинэ" });
    expect(projectForCreate({ ...base, project_id: null, project_name: "" })).toEqual({});
  });
  it("засах: хасах, солих, ижил нэрийг дахин бичих", () => {
    expect(projectChange(base, { ...base, project_name: "", project_id: null })).toEqual({ project_id: null });
    expect(projectChange(base, { ...base, project_name: "Өөр", project_id: OTHER })).toEqual({ project_id: OTHER });
    expect(projectChange(base, { ...base, project_name: "Өөр хотхон", project_id: null })).toEqual({ project_name: "Өөр хотхон" });
    expect(projectChange(base, { ...base, project_name: "зайсан  хилл", project_id: null })).toEqual({});
    const none = { ...base, project_name: "", project_id: null };
    expect(projectChange(none, none)).toEqual({});
  });
});

describe("ангилал ба үнийн хугацаа", () => {
  it("ангилалд тохирох сонголт (одоогийнх үлдэнэ)", () => {
    expect(pricePeriodOptions("sale")).toEqual(["total"]);
    expect(pricePeriodOptions("rent", "total")).toEqual(["month", "day", "total"]);
    expect(pricePeriodOptions("lease")).toEqual(["total", "month", "day"]);
    expect(pricePeriodOptions("")).toEqual(["total", "month", "day"]);
  });
  it("таарахгүй эсэх", () => {
    expect(pricePeriodMismatch("sale", "month")).toBe(true);
    expect(pricePeriodMismatch("rent", "total")).toBe(true);
    expect(pricePeriodMismatch("lease", "total")).toBe(false);
    expect(pricePeriodMismatch("", "total")).toBe(false);
  });
  it("ангилал солиход хугацааг тааруулна", () => {
    const f = emptyPropertyForm(ME);
    expect(withCategory(f, "rent").price_period).toBe("month");
    expect(withCategory(withCategory(f, "rent"), "sale").price_period).toBe("total");
    const lease = { ...withCategory(f, "lease"), price_period: "month" as const };
    expect(withCategory(lease, "managed_rent").price_period).toBe("month");
  });
  it("м²-ийн үнээр нийт дүн", () => {
    expect(previewTotal({ price: "12,000", area_m2: "80", price_basis: "per_m2" })).toBe(960000);
    expect(previewTotal({ price: "12000", area_m2: "", price_basis: "per_m2" })).toBeNull();
    expect(previewTotal({ price: "5000", area_m2: "", price_basis: "total" })).toBe(5000);
  });
});

describe("sameAgentConflict", () => {
  const p = { listing_agent_id: ME, contract_agent_id: ME, photo_agent_id: null };
  it("тохиргоо зөвшөөрвөл үргэлж null", () => {
    expect(sameAgentConflict(p, true)).toBeNull();
  });
  it("давхардсан үүргийг заана", () => {
    expect(sameAgentConflict(p, false)).toBe("contract_agent_id");
    expect(sameAgentConflict({ listing_agent_id: ME, contract_agent_id: OTHER, photo_agent_id: OTHER }, false)).toBe("photo_agent_id");
    expect(sameAgentConflict({ listing_agent_id: ME, contract_agent_id: OTHER, photo_agent_id: null }, false)).toBeNull();
  });
});

describe("хувийн талбар", () => {
  it("эзний id, хоосон текст → null", () => {
    expect(privatePayload({ owner: { id: OTHER, name: "Бат" }, owner_note: " ", showing_instructions: "Түлхүүр жижүүрт" })).toEqual({
      owner_contact_id: OTHER,
      owner_note: null,
      showing_instructions: "Түлхүүр жижүүрт",
    });
  });
  it("шинэ эзний дугаарыг давхардалгүй болгоно", () => {
    expect(ownerPhones(["9911 2233", "", "99112233", "+976 8811 2233"])).toEqual([{ phone: "9911 2233" }, { phone: "+976 8811 2233" }]);
  });
});

describe("зуучлалын гэрээ", () => {
  it("бөглөсөн эсэх", () => {
    expect(brokerageHasInput(emptyBrokerageForm())).toBe(false);
    expect(brokerageHasInput(emptyBrokerageForm(), 1)).toBe(true);
    expect(brokerageHasInput({ ...emptyBrokerageForm(), end_date: "2027-01-01" })).toBe(true);
  });

  it("оролт ба схем", () => {
    const f = { ...emptyBrokerageForm(), start_date: "2026-11-13", end_date: "2027-11-12", commission_type: "percent" as const, commission_value: "3" };
    const p = brokeragePayload(f, OTHER);
    expect(p).toMatchObject({ number: null, owner_contact_id: OTHER, commission_type: "percent", commission_value: 3, responsible_agent_id: null });
    expect(brokerageCreateSchema.safeParse({ property_id: OTHER, ...p }).success).toBe(true);
    const bad = brokerageCreateSchema.safeParse({ property_id: OTHER, ...p, end_date: "2026-01-01", commission_value: 150 });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const errs = fieldErrors(bad.error);
      expect(errs.end_date).toMatch(/Дуусах огноо/);
      expect(errs.commission_value).toMatch(/100/);
    }
  });

  it("илгээхэд дутуу зүйлс (DB-ийн түлхүүртэй ижил)", () => {
    const opts = { ownerId: null, fileCount: 0, requireOwner: true, requireFile: true, today: "2026-11-13" };
    expect(brokerageSubmitMissing(emptyBrokerageForm(), opts)).toEqual(["start_date", "end_date", "commission", "owner", "file"]);
    const f = { ...emptyBrokerageForm(), start_date: "2026-01-01", end_date: "2026-11-12", commission_type: "fixed" as const, commission_value: "2000000" };
    expect(brokerageSubmitMissing(f, { ...opts, ownerId: OTHER, fileCount: 1 })).toEqual(["end_date_past"]);
    expect(brokerageSubmitMissing({ ...f, end_date: "2026-11-13" }, { ...opts, ownerId: OTHER, fileCount: 1 })).toEqual([]);
    expect(brokerageSubmitMissing({ ...f, end_date: "2026-12-01" }, { ...opts, requireOwner: false, requireFile: false })).toEqual([]);
    expect(missingSentence(["owner", "file"])).toBe("эзэн, гэрээний файл");
  });

  it("DB мөрийг маягт болгоно", () => {
    const c = {
      number: "B007",
      start_date: "2026-11-01",
      end_date: null,
      terms: null,
      commission_type: "percent",
      commission_value: 2.5,
      commission_currency: "USD",
      commission_note: null,
      responsible_agent_id: ME,
    } as unknown as Crm2BrokerageRow;
    expect(brokerageToForm(c)).toEqual({
      number: "B007",
      start_date: "2026-11-01",
      end_date: "",
      terms: "",
      commission_type: "percent",
      commission_value: "2.5",
      commission_currency: "USD",
      commission_note: "",
      responsible_agent_id: ME,
    });
  });
});

describe("жижиг туслахууд", () => {
  it("swap", () => {
    expect(swap([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    const same = [1, 2];
    expect(swap(same, 1, 2)).toBe(same);
    expect(swap(same, -1, 0)).toBe(same);
  });
  it("videoLinkError", () => {
    expect(videoLinkError("", 0, 5)).toMatch(/оруулна/);
    expect(videoLinkError("http://youtu.be/x", 0, 5)).toMatch(/https/);
    expect(videoLinkError("https://youtu.be/x", 5, 5)).toMatch(/5 хүртэл/);
    expect(videoLinkError(" https://youtu.be/x ", 0, 5)).toBeNull();
  });
  it("omitKey", () => {
    const o = { a: "1", b: "2" };
    expect(omitKey(o, "a")).toEqual({ b: "2" });
    expect(omitKey(o, "z")).toBe(o);
  });
});
