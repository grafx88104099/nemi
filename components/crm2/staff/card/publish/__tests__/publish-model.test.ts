import { describe, expect, it } from "vitest";

import { PUBLISH_CONFIRM_KEYS } from "@/lib/crm2/checklist";
import type { Crm2PublishLinkCandidate, Crm2PublishPreview } from "@/lib/crm2/types";

import {
  CONFIRM_KEY_LABEL,
  checkPublishTexts,
  defaultChoice,
  effectiveTexts,
  groupDigits,
  hasMaskedPhone,
  initialTexts,
  linkArgs,
  needsWatermark,
  normalizeChoice,
  publicTextFindings,
  publishChoices,
  publishDiffRows,
  riskMessage,
  splitDiff,
  textsToSend,
  unconfirmedRows,
  type ConfirmValueSource,
} from "../publish-model";
import { buildPublishReadiness, readinessCount } from "../readiness";

const LISTING_ID = "11111111-2222-4333-8444-555555555555";

function candidate(over: Partial<Crm2PublishLinkCandidate> = {}): Crm2PublishLinkCandidate {
  return {
    listing_id: LISTING_ID,
    title: "Зайсан 3 өрөө",
    description: "Нарлаг, дулаан байр.",
    status: "active",
    type: "Орон сууц",
    district: "ХУД",
    rooms: 3,
    area: 86,
    floor: "5/12",
    price: 450_000_000,
    year: 2018,
    parking: 1,
    features: ["parking", "furnished"],
    rent_advance_months: null,
    rent_deposit_months: null,
    has_location: true,
    photo_count: 7,
    owned_by_listing_agent: true,
    created_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

function preview(over: Partial<Crm2PublishPreview> = {}): Crm2PublishPreview {
  return {
    payload: {
      deal_type: "sale",
      type: "Орон сууц",
      district: "ХУД",
      rooms: 3,
      area: 86,
      floor: "5/12",
      price: 480_000_000,
      year: 2018,
      parking: 1,
      features: ["furnished", "parking"],
      rent_advance_months: null,
      rent_deposit_months: null,
      lat: 47.9,
      lng: 106.9,
      status: "active",
    },
    title: "ХУД, 3 өрөө, 86 м²",
    description: "CRM анхдагч тайлбар",
    link_mode: "link_only",
    warnings: [],
    link_candidate: candidate(),
    ...over,
  };
}

const diffOpts = {
  choice: "link" as const,
  title: "Зайсан 3 өрөө",
  description: "Нарлаг, дулаан байр.",
  defaultTitle: "ХУД, 3 өрөө, 86 м²",
  defaultDescription: "CRM анхдагч тайлбар",
  replacePhotos: false,
  imageCount: 10,
};

describe("нийтлэх горим (R21)", () => {
  it("link_only зөвхөн шинэчлэх, choice хоёр сонголт, new_only шинэ зар", () => {
    expect(publishChoices("link_only")).toEqual(["link"]);
    expect(publishChoices("choice")).toEqual(["link", "new"]);
    expect(publishChoices("new_only")).toEqual(["new"]);
    expect(publishChoices(null)).toEqual(["new"]);
    expect(defaultChoice("choice")).toBe("link");
  });

  it("горимд хүчингүй сонголтыг анхдагч руу буцаана", () => {
    expect(normalizeChoice("link_only", "new")).toBe("link");
    expect(normalizeChoice("new_only", "link")).toBe("new");
    expect(normalizeChoice("choice", "new")).toBe("new");
  });

  it("«Зургийг солих» зөвхөн холбох үед дамжина", () => {
    expect(linkArgs("link", candidate(), true)).toEqual({ link_listing: LISTING_ID, replace_photos: true });
    expect(linkArgs("link", candidate(), false)).toEqual({ link_listing: LISTING_ID, replace_photos: false });
    expect(linkArgs("new", candidate(), true)).toEqual({});
    expect(linkArgs("link", null, true)).toEqual({});
  });

  it("зураг хэвээр шинэчлэхэд тамга шаардлагагүй", () => {
    expect(needsWatermark("link", true, false)).toBe(false);
    expect(needsWatermark("link", true, true)).toBe(true);
    expect(needsWatermark("new", false, false)).toBe(true);
  });
});

describe("гарчиг, тайлбар", () => {
  const fallback = { title: "Анхдагч", description: "Анхдагч тайлбар" };

  it("шинэчлэхэд эх зарын текстээр, шинэ зарт CRM-ийн анхдагчаар эхэлнэ", () => {
    expect(initialTexts("link", preview(), fallback)).toEqual({ title: "Зайсан 3 өрөө", description: "Нарлаг, дулаан байр." });
    expect(initialTexts("new", preview(), fallback)).toEqual(fallback);
    expect(initialTexts("link", preview({ link_candidate: null }), fallback)).toEqual(fallback);
  });

  it("шинэчлэхэд өөрчлөөгүй текстийг дамжуулахгүй (DB хэвээр үлдээж утсыг нууна)", () => {
    const c = candidate();
    expect(textsToSend("link", { title: " Зайсан 3 өрөө ", description: "Нарлаг, дулаан байр." }, c)).toEqual({});
    expect(textsToSend("link", { title: "Шинэ гарчиг", description: "" }, c)).toEqual({ title: "Шинэ гарчиг" });
    expect(textsToSend("new", { title: " A ", description: " B " }, c)).toEqual({ title: "A", description: "B" });
  });

  it("хоосон оролт: шинэчлэхэд эх зарынх, шинэ зарт анхдагч", () => {
    const sources = { candidate: candidate(), defaultTitle: "DT", defaultDescription: "DD" };
    expect(effectiveTexts("link", { title: "", description: "" }, sources)).toEqual({
      title: "Зайсан 3 өрөө",
      description: "Нарлаг, дулаан байр.",
    });
    expect(effectiveTexts("new", { title: "", description: "" }, sources)).toEqual({ title: "DT", description: "DD" });
  });

  it("нуусан утасны тэмдгийг таньна", () => {
    expect(hasMaskedPhone("Холбогдох •••• ••••")).toBe(true);
    expect(hasMaskedPhone("Энгийн текст")).toBe(false);
    expect(hasMaskedPhone(null)).toBe(false);
  });
});

describe("бичвэрийн эрсдэл (findPublicTextRisks)", () => {
  it("утас хориглоно, тоот ба код сануулга", () => {
    const r = checkPublishTexts({ title: "3 өрөө байр", description: "Залгах: 9911 2233" });
    expect(r.description).toContain("phone");
    expect(r.blocking).toBe(true);
    expect(riskMessage(r.description)?.tone).toBe("error");

    const w = checkPublishTexts({ title: "45 тоот", description: "Орцны код 2580" });
    expect(w.blocking).toBe(false);
    expect(w.title).toContain("unit_no");
    expect(w.description).toContain("door_code");
    expect(riskMessage(w.title)?.tone).toBe("warning");
    expect(riskMessage([])).toBeNull();
  });

  it("үнэ («сая ₮»)-г утас гэж үзэхгүй", () => {
    expect(checkPublishTexts({ title: "Үнэ 95000000 ₮", description: "" }).blocking).toBe(false);
  });

  it("карт дээрх нийтийн талбаруудыг нэрээр нь буцаана", () => {
    const f = publicTextFindings({ advantages: "Эзэнтэй 88112233 утсаар", condition: "Шинэ", view_note: "12 тоот, цонх урд" });
    expect(f.map((x) => x.key)).toEqual(["advantages", "view_note"]);
    expect(f[0].risks).toContain("phone");
    expect(f[1].risks).toContain("unit_no");
  });
});

describe("баталгаажаагүй нийтийн утга", () => {
  const base: ConfirmValueSource = {
    unconfirmed: [],
    category: "sale",
    property_type: "apartment",
    district: "ХУД",
    location_text: "Зайсан",
    lat: 47.9,
    area_m2: 86,
    rooms: 3,
    floor: 5,
    building_floors: 12,
    price: 350_000_000,
    currency: "MNT",
    price_period: "total",
    price_basis: "total",
    year_in_use: 2018,
    features: ["parking"],
    parking_spaces: 2,
    rent_advance_months: null,
    rent_deposit_months: null,
    advantages: null,
    available_from: "2026-12-01",
  };

  it("үнийн 4 түлхүүрийг нэг мөрөнд, бусдыг PUBLISH_CONFIRM_KEYS дарааллаар", () => {
    const rows = unconfirmedRows(
      { ...base, unconfirmed: ["currency", "district", "price", "listing_agent_id", "notes", "features"] },
      { feature: (f) => (f === "parking" ? "Зогсоол" : f) }
    );
    expect(rows.map((r) => r.id)).toEqual(["district", "price", "features"]);
    expect(rows[1]).toMatchObject({ keys: ["price", "currency"], label: "Үнэ" });
    expect(rows[1].value).toContain("350 000 000 ₮");
    expect(rows[2].value).toBe("Зогсоол");
  });

  it("нийтэд хамааралгүй (агент, тэмдэглэл) түлхүүрийг харуулахгүй", () => {
    expect(unconfirmedRows({ ...base, unconfirmed: ["notes", "contract_agent_id"] })).toEqual([]);
  });

  it("утгыг уншигдахаар", () => {
    const rows = unconfirmedRows(
      { ...base, unconfirmed: ["area_m2", "lat", "available_from", "project", "category"] },
      { projectName: "Ривер Гарден", category: () => "Худалдах" }
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.value]));
    expect(byId).toEqual({
      category: "Худалдах",
      project: "Ривер Гарден",
      lat: "Цэг тавьсан",
      area_m2: "86 м²",
      available_from: "2026.12.01",
    });
  });

  it("нэр бүх PUBLISH_CONFIRM_KEYS-д бий", () => {
    for (const k of PUBLISH_CONFIRM_KEYS) expect(CONFIRM_KEY_LABEL[k]).toBeTruthy();
  });

  it("тоог зайгаар бүлэглэнэ", () => {
    expect(groupDigits(350000000)).toBe("350 000 000");
    expect(groupDigits(81.47)).toBe("81.47");
    expect(groupDigits(950)).toBe("950");
  });
});

describe("ялгааны хүснэгт", () => {
  it("гарчиг, тайлбар ОРНО; үнэ өөрчлөгдөнө; онцлогийн дараалал ялгаа биш", () => {
    const rows = publishDiffRows(preview(), diffOpts);
    const keys = rows.map((r) => r.key);
    expect(keys.slice(0, 2)).toEqual(["title", "description"]);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.title.changed).toBe(false);
    expect(byKey.description.changed).toBe(false);
    expect(byKey.price.changed).toBe(true);
    expect(byKey.features.changed).toBe(false);
    expect(byKey.photos).toMatchObject({ current: "7", next: "7", changed: false });
    // Худалдах зард түрээсийн мөр гарахгүй.
    expect(keys).not.toContain("rent_advance_months");
  });

  it("гарчгийг өөрчилбөл ялгаа гарна; «Зургийг солих» нь CRM-ийн тоогоор", () => {
    const rows = publishDiffRows(preview(), { ...diffOpts, title: "Шинэ гарчиг", replacePhotos: true, imageCount: 40 });
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.title).toMatchObject({ current: "Зайсан 3 өрөө", next: "Шинэ гарчиг", changed: true });
    expect(byKey.photos).toMatchObject({ next: "30", changed: true });
  });

  it("шинэ зар: одоогийн утгагүй, анхдагч гарчиг", () => {
    const rows = publishDiffRows(preview({ link_mode: "new_only", link_candidate: null }), {
      ...diffOpts,
      choice: "new",
      title: "",
      description: "",
    });
    expect(rows.every((r) => r.current === null && r.changed)).toBe(true);
    expect(rows[0].next).toBe("ХУД, 3 өрөө, 86 м²");
  });

  it("түрээсийн зарт урьдчилгаа, барьцаа мөр", () => {
    const p = preview();
    const rows = publishDiffRows(
      { ...p, payload: { ...p.payload, deal_type: "rent", rent_advance_months: 1, rent_deposit_months: 1 } },
      diffOpts
    );
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.rent_advance_months).toMatchObject({ current: "—", next: "1 сар", changed: true });
    expect(byKey.price.label).toBe("Үнэ (сард)");
  });

  it("splitDiff өөрчлөгдсөнийг тусгаарлана", () => {
    const { changed, same } = splitDiff(publishDiffRows(preview(), diffOpts));
    expect(changed.map((r) => r.key)).toEqual(["price"]);
    expect(same.length).toBeGreaterThan(5);
  });
});

describe("«Нийтлэхэд бэлэн» бүлэг", () => {
  it("гэрээ, идэвхтэй төлөв ба бүлгийн мөрийг тоолно", () => {
    const item = (key: string, done: boolean) => ({
      key,
      group: "publish" as const,
      label: key,
      done,
      required: true,
      auto: false,
      stage: "publish" as const,
      target: { sheet: "price" as const, field: null },
    });
    const readiness = buildPublishReadiness({
      checklist: {
        percent: 50,
        groups: [
          { group: "intake", items: [], done: 0, total: 0 },
          { group: "publish", items: [item("publish_price", true), item("publish_unconfirmed", false)], done: 1, total: 2 },
        ],
      },
      input: {
        property: {
          category: "sale",
          property_type: "apartment",
          project_id: null,
          district: "ХУД",
          location_text: null,
          lat: null,
          area_m2: 80,
          rooms: 3,
          floor: null,
          building_floors: null,
          price: 1,
          price_total: 1,
          currency: "MNT",
          price_period: "total",
          listing_agent_id: null,
          contract_agent_id: null,
          photo_agent_id: null,
          last_verified_at: null,
          unconfirmed: ["district"],
          status: "draft",
          listing_id: null,
          source_listing_id: null,
          published_at: null,
          features: [],
        },
        owner: null,
        ownerPending: false,
        contract: null,
        imageCount: 0,
        listingAgentPublic: true,
        settings: {
          activationRequired: [],
          minImages: 1,
          requireOwner: false,
          requireFile: false,
          requireSpecialTerms: false,
          requireOwnershipDoc: false,
          activationMode: "auto",
        },
        publicTextRisks: [],
      },
      property: {
        unconfirmed: ["district"],
        category: "sale",
        property_type: "apartment",
        district: "ХУД",
        location_text: null,
        lat: null,
        area_m2: 80,
        rooms: 3,
        floor: null,
        building_floors: null,
        price: 1,
        currency: "MNT",
        price_period: "total",
        price_basis: "total",
        year_in_use: null,
        features: [],
        parking_spaces: null,
        rent_advance_months: null,
        rent_deposit_months: null,
        advantages: "45 тоот",
        available_from: null,
      },
      canEdit: true,
    });
    expect(readiness.gates.map((g) => [g.key, g.done])).toEqual([
      ["contract", false],
      ["active", false],
    ]);
    expect(readiness.confirmRows.map((r) => r.id)).toEqual(["district"]);
    expect(readiness.textFindings[0]).toMatchObject({ key: "advantages", risks: ["unit_no"] });
    expect(readinessCount(readiness)).toEqual({ done: 1, total: 4 });
  });
});
