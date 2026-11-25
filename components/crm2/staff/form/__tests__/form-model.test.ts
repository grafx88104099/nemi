import { describe, expect, it } from "vitest";

import { propertyCreateSchema, propertyUpdateSchema } from "@/lib/crm2/schemas";
import type { Crm2PropertyRow } from "@/lib/crm2/types";

import * as formModel from "../form-model";
import {
  confirmFields,
  DEFAULT_PROPERTY_TYPE,
  fieldsFilled,
  fromCreateDraft,
  hasRentTerms,
  isUnconfirmed,
  normalizeUnconfirmed,
  operatingCostIsSimple,
  parseRecent,
  previewPerM2,
  pushRecent,
  recentDistrictsKey,
  toCreateDraft,
  unconfirmedKeyOf,
  validationInput,
  cleanFieldNotes,
  diffPayload,
  emptyPropertyForm,
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
    listing_id: null,
    published_at: null,
    published_by: null,
    media_synced_at: null,
    source: "manual",
    source_listing_id: null,
    client_key: null,
    unconfirmed: [],
    parking_spaces: null,
    rent_advance_months: null,
    rent_deposit_months: null,
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

describe("зуучлалын гэрээ (20261125000100: картаас PDF-ээр бүртгэнэ)", () => {
  it("бүрэн формд гэрээний туслах үлдээгүй", () => {
    for (const name of ["emptyBrokerageForm", "brokerageToForm", "brokerageHasInput", "brokeragePayload", "brokerageSubmitMissing"]) {
      expect(name in formModel).toBe(false);
    }
  });
  it("дутуу зүйлсийн өгүүлбэр", () => {
    expect(missingSentence(["owner", "end_date"])).toBe("эзэн, дуусах огноо");
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

describe("P1: анхдагч утга, шинэ талбар", () => {
  it("шинэ маягт: орон сууц, ₮/сар зардал, баталгаажаагүй хоосон", () => {
    const f = emptyPropertyForm(ME);
    expect(f.property_type).toBe(DEFAULT_PROPERTY_TYPE);
    expect(f.property_type).toBe("apartment");
    expect(operatingCostIsSimple(f)).toBe(true);
    expect(f.unconfirmed).toEqual([]);
    expect(f.parking_spaces).toBe("");
  });

  it("хөлслөх ангилал анхдагчаар сарын үнэ", () => {
    expect(withCategory(emptyPropertyForm(ME), "lease").price_period).toBe("month");
    expect(withCategory(emptyPropertyForm(ME), "sale").price_period).toBe("total");
  });

  it("зогсоол, түрээсийн нөхцөл, баталгаажаагүй жагсаалт payload-д", () => {
    const f: PropertyFormState = {
      ...withCategory(emptyPropertyForm(ME), "rent"),
      parking_spaces: "0",
      rent_advance_months: "1",
      rent_deposit_months: "2",
      unconfirmed: ["price", "bogus", "district", "price"],
    };
    const p = propertyPayload(f);
    expect(p.parking_spaces).toBe(0);
    expect(p.rent_advance_months).toBe(1);
    expect(p.rent_deposit_months).toBe(2);
    // UNCONFIRMABLE_KEYS-ийн дарааллаар, давхардал ба мэдэгдэхгүй түлхүүргүй.
    expect(p.unconfirmed).toEqual(["district", "price"]);
    expect(propertyCreateSchema.safeParse(p).success).toBe(true);
  });

  it("DB мөрөөс шинэ баганууд; өөрчлөөгүй бол diff хоосон", () => {
    const f = propertyToForm(row({ parking_spaces: 2, rent_advance_months: 1, rent_deposit_months: 0, unconfirmed: ["price", "area_m2"] }));
    expect(f.parking_spaces).toBe("2");
    expect(f.rent_deposit_months).toBe("0");
    expect(f.unconfirmed).toEqual(["area_m2", "price"]);
    expect(diffPayload(propertyPayload(f), propertyPayload(f))).toEqual({});
  });

  it("засахад баталгаажуулалт зөвхөн жагсаалтыг багасгана", () => {
    const before = propertyToForm(row({ unconfirmed: ["price", "area_m2"] }));
    const after = { ...before, unconfirmed: confirmFields(before.unconfirmed, ["price"]) };
    const diff = diffPayload(propertyPayload(before), propertyPayload(after));
    expect(diff).toEqual({ unconfirmed: ["area_m2"] });
    expect(propertyUpdateSchema.safeParse(diff).success).toBe(true);
  });

  it("түрээсийн нөхцөл зөвхөн түрээсийн ангилалд", () => {
    expect(hasRentTerms("rent")).toBe(true);
    expect(hasRentTerms("lease")).toBe(true);
    expect(hasRentTerms("managed_rent")).toBe(true);
    expect(hasRentTerms("sale")).toBe(false);
    expect(hasRentTerms("")).toBe(false);
  });

  it("хуучин $ эсвэл өдрийн зардал энгийн мөр биш", () => {
    expect(operatingCostIsSimple({ operating_cost_currency: "USD", operating_cost_period: "month" })).toBe(false);
    expect(operatingCostIsSimple({ operating_cost_currency: "MNT", operating_cost_period: "day" })).toBe(false);
  });
});

describe("баталгаажаагүй (автомат) утга", () => {
  it("маягтын түлхүүр → unconfirmed түлхүүр", () => {
    expect(unconfirmedKeyOf("project_name")).toBe("project");
    expect(unconfirmedKeyOf("project_id")).toBe("project");
    expect(unconfirmedKeyOf("lng")).toBe("lat");
    expect(unconfirmedKeyOf("price")).toBe("price");
    expect(unconfirmedKeyOf("pin_address")).toBeNull();
    expect(unconfirmedKeyOf("condition")).toBeNull();
  });
  it("өөрчилсөн талбарыг хасна, бусдыг үлдээнэ", () => {
    const list = ["project", "price", "lat"];
    expect(confirmFields(list, ["project_name"])).toEqual(["price", "lat"]);
    expect(confirmFields(list, ["lng", "price"])).toEqual(["project"]);
    expect(confirmFields(list, ["condition"])).toEqual(list);
    expect(isUnconfirmed(list, "project_id")).toBe(true);
    expect(isUnconfirmed(list, "area_m2")).toBe(false);
  });
  it("normalizeUnconfirmed: null → []", () => {
    expect(normalizeUnconfirmed(null)).toEqual([]);
  });
});

describe("blur шалгалт ба нийт ↔ м²", () => {
  it("маягтаас field-validation-ийн оролт", () => {
    const v = validationInput({
      ...withCategory(emptyPropertyForm(ME), "sale"),
      price: "350,000,000",
      area_m2: "81,47",
      floor: "9",
      building_floors: "5",
    });
    expect(v).toMatchObject({ category: "sale", price: 350000000, area_m2: 81.47, floor: 9, building_floors: 5, currency: "MNT" });
    expect(validationInput(emptyPropertyForm(ME)).category).toBeNull();
    expect(validationInput({ ...emptyPropertyForm(ME), price: "гурав" }).price).toBeNull();
  });
  it("нийт үнээс м²-ийн үнэ ба эсрэгээр", () => {
    expect(previewPerM2({ price: "350000000", area_m2: "70", price_basis: "total" })).toBe(5000000);
    expect(previewPerM2({ price: "5000000", area_m2: "", price_basis: "per_m2" })).toBe(5000000);
    expect(previewPerM2({ price: "350000000", area_m2: "", price_basis: "total" })).toBeNull();
    expect(previewTotal({ price: "5000000", area_m2: "70", price_basis: "per_m2" })).toBe(350000000);
  });
});

describe("сүүлийн дүүрэг", () => {
  it("эхэнд нэмж, давхардалгүй, 3 хүртэл", () => {
    expect(pushRecent([], "Хан-Уул")).toEqual(["Хан-Уул"]);
    expect(pushRecent(["А", "Б", "В"], "Б")).toEqual(["Б", "А", "В"]);
    expect(pushRecent(["А", "Б", "В"], "Г")).toEqual(["Г", "А", "Б"]);
    expect(pushRecent(["А"], "  ")).toEqual(["А"]);
  });
  it("localStorage-ийн утгыг шүүнэ (буруу JSON, жагсаалтад байхгүй дүүрэг)", () => {
    expect(parseRecent(null, ["А"])).toEqual([]);
    expect(parseRecent("{bad", ["А"])).toEqual([]);
    expect(parseRecent(JSON.stringify(["А", 5, "Х", "Б", "А"]), ["А", "Б"])).toEqual(["А", "Б"]);
  });
  it("хэрэглэгч бүрт тусдаа, crm2: угтвартай (гарахад устна)", () => {
    expect(recentDistrictsKey(ME)).toBe(`crm2:recent-districts:${ME}`);
  });
});

describe("хэмжилт: бөглөсөн талбар", () => {
  it("зөвхөн тоо", () => {
    expect(fieldsFilled(emptyPropertyForm(ME))).toBe(0);
    const f = { ...withCategory(emptyPropertyForm(ME), "rent"), price: "3000000", lat: 47.9, lng: 106.9, features: ["balcony"] };
    expect(fieldsFilled(f)).toBe(4);
  });
});

describe("утсан дээрх ноорог (P5)", () => {
  const owner = { id: OTHER, name: "Бат", code: "C001", phone: "99112233" };
  const parts = () => ({
    form: { ...withCategory(emptyPropertyForm(ME), "sale"), price: "350000000", address_detail: "3-р байр, 45 тоот", district: "Хан-Уул" },
    priv: { owner, owner_note: "Оройн 6-аас хойш", showing_instructions: "Түлхүүр жижүүрт" },
    links: [{ id: "l1", url: "https://youtu.be/x" }],
  });

  it("хаяг, эзэн зөвхөн хувийн хэсэгт; нийтийн хэсэгт ил бичигдэхгүй", () => {
    const d = toCreateDraft(parts());
    expect(d.form.address_detail).toBe("");
    expect(JSON.stringify(d.form)).not.toContain("тоот");
    expect(JSON.stringify(d.form)).not.toContain("99112233");
    expect(d.private.address_detail).toBe("3-р байр, 45 тоот");
    expect(d.private.owner).toEqual(owner);
    expect("brokerage" in d.form).toBe(false);
  });

  it("ноорог ↔ маягт буцаж ижил (бүрэн ↔ шуурхай нэг бичлэг)", () => {
    const p = parts();
    const d = toCreateDraft(p);
    const back = fromCreateDraft(JSON.parse(JSON.stringify(d.form)), JSON.parse(JSON.stringify(d.private)), ME);
    expect(back.form).toEqual(p.form);
    expect(back.priv).toEqual(p.priv);
    expect(back.links).toEqual(p.links);
    expect(back.quickPhone).toBeNull();
  });

  it("буруу/хуучин бичлэгийг аюулгүй уншина", () => {
    const back = fromCreateDraft(
      { category: "bogus", currency: "EUR", price_period: "week", lat: "47", lng: 106, features: ["parking", 3], unconfirmed: ["price", "x"], extra: 1 },
      { owner: { id: 5 }, address_detail: 7 },
      ME
    );
    expect(back.form.category).toBe("");
    expect(back.form.currency).toBe("MNT");
    expect(back.form.price_period).toBe("total");
    expect(back.form.lat).toBeNull();
    expect(back.form.lng).toBeNull();
    expect(back.form.features).toEqual(["parking"]);
    expect(back.form.unconfirmed).toEqual(["price"]);
    expect(back.form.address_detail).toBe("");
    expect(back.priv.owner).toBeNull();
    expect("extra" in back.form).toBe(false);
    expect(fromCreateDraft(null, null, ME).form).toEqual(emptyPropertyForm(ME));
  });

  it("шуурхай бүртгэлийн дугаар эзэн сонгогдтол хадгалагдана", () => {
    const back = fromCreateDraft({}, { owner_phone: " 9911 2233 " }, ME);
    expect(back.quickPhone).toBe("9911 2233");
    const p = parts();
    expect(toCreateDraft({ ...p, priv: { ...p.priv, owner: null } }, back.quickPhone).private.owner_phone).toBe("9911 2233");
    // Эзэн сонгосон бол дугаарыг дахин хадгалахгүй.
    expect(toCreateDraft(p, back.quickPhone).private.owner_phone).toBeUndefined();
  });

  it("утсан дээрх хуучин ноорогт үлдсэн гэрээний хэсгийг гэмтэлгүй хаяна", () => {
    const p = parts();
    const d = toCreateDraft(p);
    const oldForm = {
      ...JSON.parse(JSON.stringify(d.form)),
      brokerage: { number: "B010", commission_type: "percent", commission_value: "3", start_date: "2026-11-01" },
    };
    const oldPrivate = { ...JSON.parse(JSON.stringify(d.private)), brokerage_owner: owner, brokerage_owner_touched: true };
    const back = fromCreateDraft(oldForm, oldPrivate, ME);
    expect(back.form).toEqual(p.form);
    expect(back.priv).toEqual(p.priv);
    expect("brokerage" in back.form).toBe(false);
    expect(Object.keys(back).sort()).toEqual(["form", "links", "priv", "quickPhone"]);
    // Дахин хадгалахад хуучин түлхүүр үлдэхгүй.
    const again = toCreateDraft(back);
    expect(JSON.stringify(again)).not.toContain("brokerage");
    expect(JSON.stringify(again)).not.toContain("commission");
  });
});
