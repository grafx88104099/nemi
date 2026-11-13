import { describe, expect, it } from "vitest";

import {
  activityEditable,
  brokerageActions,
  brokerageChain,
  brokerageEndInfo,
  canCreateBrokerage,
  renewableExpired,
  canLogWith,
  classifyPhoneMatch,
  combineUbDateTime,
  dealStageOptions,
  defaultShownAt,
  firstParam,
  mapsHref,
  parseOfferParams,
  propertyStatusOptions,
  requirementSummary,
  verifiedAge,
} from "@/components/crm2/staff/card/logic";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

const match = (over: Partial<Parameters<typeof classifyPhoneMatch>[0]> = {}) => ({
  can_open: true,
  property_deal_id: null,
  property_deal_code: null,
  property_deal_stage: null,
  property_deal_agent_name: null,
  property_deal_can_log: false,
  ...over,
});

describe("S04 — дугаараар олдсон харилцагч", () => {
  it("энэ хөрөнгө дээр өөрийн хэлцэлтэй бол тэр хэлцэлд бүртгэнэ", () => {
    const a = classifyPhoneMatch(
      match({ property_deal_id: U1, property_deal_code: "D001", property_deal_stage: "contacted", property_deal_can_log: true }),
      { foreignDeal: "deny" }
    );
    expect(a).toEqual({ kind: "use_deal", dealId: U1, dealCode: "D001", stage: "contacted" });
    expect(canLogWith(a)).toBe(true);
  });

  it("хэлцлийг өөр агент хариуцдаг бол бүртгэхгүй, хэлцэл шилжүүлэх хүсэлт", () => {
    const a = classifyPhoneMatch(
      match({ can_open: false, property_deal_id: U1, property_deal_code: "D002", property_deal_agent_name: "Бат" }),
      { foreignDeal: "allow" }
    );
    expect(a).toEqual({ kind: "deal_transfer", dealId: U1, dealCode: "D002", agentName: "Бат" });
    expect(canLogWith(a)).toBe(false);
  });

  it("харах эрхтэй харилцагч — шинэ хэлцэл", () => {
    expect(classifyPhoneMatch(match(), { foreignDeal: "deny" })).toEqual({ kind: "use_contact" });
  });

  it("өөр агентын харилцагч: deny → шилжүүлэх хүсэлт, allow → өөр дээрээ", () => {
    const deny = classifyPhoneMatch(match({ can_open: false }), { foreignDeal: "deny" });
    expect(deny.kind).toBe("contact_transfer");
    expect(canLogWith(deny)).toBe(false);
    const allow = classifyPhoneMatch(match({ can_open: false }), { foreignDeal: "allow" });
    expect(allow.kind).toBe("use_foreign");
    expect(canLogWith(allow)).toBe(true);
  });
});

describe("хөрөнгийн төлөв", () => {
  it("ноорог → идэвхжүүлэх (шалтгаангүй), архивлах (шалтгаантай)", () => {
    expect(propertyStatusOptions("draft")).toEqual([
      { value: "active", label: "Идэвхжүүлэх", needsReason: false },
      { value: "archived", label: "Архивлах", needsReason: true },
    ]);
  });
  it("идэвхтэй → бүх шилжилтэд шалтгаан заавал", () => {
    const opts = propertyStatusOptions("active");
    expect(opts.map((o) => o.value)).toEqual(["suspended", "rented", "sold", "contract_ended", "archived"]);
    expect(opts.every((o) => o.needsReason)).toBe(true);
  });
  it("гэрээ дууссан → идэвхжүүлэхэд шалтгаангүй", () => {
    expect(propertyStatusOptions("contract_ended").find((o) => o.value === "active")?.needsReason).toBe(false);
  });
});

describe("хэлцлийн шат", () => {
  it("үзүүлэлтгүй бол «үзүүлсэн», «товлосон» идэвхгүй; баримт/төлбөр 2-р шатанд", () => {
    const opts = dealStageOptions("contacted", { hasScheduledShowing: false, hasShownShowing: false });
    const by = Object.fromEntries(opts.map((o) => [o.value, o]));
    expect(by.contacted.disabled).toBe(true);
    expect(by.shown.disabled).toBe(true);
    expect(by.reshow.disabled).toBe(true);
    expect(by.showing_scheduled.disabled).toBe(true);
    expect(by.negotiating.disabled).toBe(false);
    expect(by.confirmed.disabled).toBe(false);
    expect(by.documents.disabled).toBe(true);
    expect(by.awaiting_payment.disabled).toBe(true);
    expect(opts.some((o) => o.value === "closed" || o.value === "cancelled")).toBe(false);
  });
  it("бодит үзүүлэлттэй бол «үзүүлсэн» сонгогдоно", () => {
    const opts = dealStageOptions("showing_scheduled", { hasScheduledShowing: true, hasShownShowing: true });
    expect(opts.find((o) => o.value === "shown")?.disabled).toBe(false);
    expect(opts.find((o) => o.value === "showing_scheduled")?.disabled).toBe(true);
  });
});

describe("зуучлалын гэрээний үйлдэл", () => {
  const flags = { canEditDraft: true, canAttach: true, canDecide: true, canTerminate: true, canRenew: true };
  it("ноорог: засах, файл, илгээх, хаях", () => {
    const a = brokerageActions({ status: "draft", ...flags });
    expect(a).toMatchObject({ edit: true, submit: true, discard: true, upload: true, deleteFile: true });
    expect(a.approve || a.withdraw || a.terminate || a.renew).toBe(false);
  });
  it("илгээсэн: буцааж авах, батлах/татгалзах (эрхтэй бол)", () => {
    const a = brokerageActions({ status: "pending", ...flags });
    expect(a).toMatchObject({ withdraw: true, approve: true, reject: true, edit: false, deleteFile: false });
    const noDecide = brokerageActions({ status: "pending", ...flags, canDecide: false });
    expect(noDecide.approve || noDecide.reject).toBe(false);
  });
  it("батлагдсан: цуцлах, сунгах; дууссан: зөвхөн сунгах", () => {
    expect(brokerageActions({ status: "active", ...flags })).toMatchObject({ terminate: true, renew: true, edit: false });
    expect(brokerageActions({ status: "expired", ...flags })).toMatchObject({ terminate: false, renew: true, upload: false });
    expect(brokerageActions({ status: "terminated", ...flags })).toMatchObject({ renew: false, upload: false });
  });
  it("файлын дээд тоонд хүрвэл нэмэхгүй", () => {
    expect(brokerageActions({ status: "draft", ...flags }, { fileCount: 20, maxFiles: 20 }).upload).toBe(false);
  });
  it("шинэ гэрээ: хүчинтэй/ноорог гэрээгүй үед", () => {
    expect(canCreateBrokerage([], true)).toBe(true);
    // Дууссан гэрээг сунгана (хувилбар холбогдоно) — холбоогүй шинэ гэрээ санал болгохгүй.
    expect(canCreateBrokerage([{ id: "a", status: "expired" }, { id: "b", status: "terminated", previous_id: "a" }], true)).toBe(false);
    // Дууссан гэрээ аль хэдийн сунгагдаж, сунгалт нь мөн дууссан бол сүүлийнхийг сунгана.
    expect(canCreateBrokerage([{ id: "a", status: "expired" }, { id: "b", status: "expired", previous_id: "a" }], true)).toBe(false);
    // Зөвхөн цуцлагдсан түүхтэй бол шинэ гэрээ.
    expect(canCreateBrokerage([{ id: "a", status: "terminated" }], true)).toBe(true);
    expect(canCreateBrokerage([{ status: "active" }], true)).toBe(false);
    expect(canCreateBrokerage([{ status: "draft" }], true)).toBe(false);
    expect(canCreateBrokerage([], false)).toBe(false);
  });
  it("сунгах ёстой дууссан гэрээ — хамгийн шинэ, сунгалтгүй", () => {
    expect(renewableExpired([{ id: "a", status: "terminated" }])).toBeNull();
    expect(renewableExpired([{ id: "a", status: "expired" }])?.id).toBe("a");
    expect(
      renewableExpired([
        { id: "a", status: "expired", version: 1 },
        { id: "b", status: "expired", version: 2, previous_id: "a" },
      ])?.id
    ).toBe("b");
    // Цуцлагдсан сунгалт тооцогдохгүй — хуучныг дахин сунгана.
    expect(renewableExpired([{ id: "a", status: "expired" }, { id: "b", status: "terminated", previous_id: "a" }])?.id).toBe("a");
  });
  it("хувилбарын гинж хуучнаас шинэ рүү", () => {
    const chain = brokerageChain([
      { id: "b", version: 2, created_at: "2026-02-01" },
      { id: "a", version: 1, created_at: "2026-01-01" },
    ]);
    expect(chain.map((c) => c.id)).toEqual(["a", "b"]);
  });
  it("дуусах хоног", () => {
    const now = Date.parse("2026-11-13T02:00:00Z");
    expect(brokerageEndInfo("2026-11-20", now)).toMatchObject({ days: 7, tone: "rose" });
    expect(brokerageEndInfo("2026-12-01", now)).toMatchObject({ days: 18, tone: "amber" });
    expect(brokerageEndInfo("2027-03-01", now)?.tone).toBe("green");
    expect(brokerageEndInfo("2026-11-10", now)).toMatchObject({ days: -3, tone: "rose" });
    expect(brokerageEndInfo(null, now)).toBeNull();
  });
});

describe("огноо, цаг", () => {
  it("огноо + цаг → datetime-local", () => {
    expect(combineUbDateTime("2026-11-13", "14:30")).toBe("2026-11-13T14:30");
    expect(combineUbDateTime("2026-11-13", "")).toBeNull();
    expect(combineUbDateTime("2026-02-30", "10:00")).toBeNull();
    expect(combineUbDateTime("2026-11-13", "25:00")).toBeNull();
  });
  it("үзүүлсэн цагийн анхны утга: өнгөрсөн тов → товын цаг, ирээдүйн тов → одоо", () => {
    const now = Date.parse("2026-11-13T06:00:00Z"); // УБ 14:00
    expect(defaultShownAt("2026-11-13T03:00:00Z", now)).toBe("2026-11-13T11:00");
    expect(defaultShownAt("2026-11-14T03:00:00Z", now)).toBe("2026-11-13T14:00");
    expect(defaultShownAt(null, now)).toBe("2026-11-13T14:00");
  });
  it("эзэнтэй тулгаснаас хойшхи хоног", () => {
    const now = Date.parse("2026-11-13T00:00:00Z");
    expect(verifiedAge("2026-11-03T00:00:00Z", now)).toEqual({ days: 10, stale: false });
    expect(verifiedAge("2026-07-01T00:00:00Z", now)?.stale).toBe(true);
    expect(verifiedAge(null, now)).toBeNull();
  });
});

describe("бусад", () => {
  it("offer параметр: зөвхөн uuid", () => {
    expect(parseOfferParams({ offer_for: U1, origin: U2 })).toEqual({ contactId: U1, originDealId: U2 });
    expect(parseOfferParams({ offer_for: "x", origin: [U2, U1] })).toEqual({ contactId: null, originDealId: U2 });
    expect(firstParam(undefined)).toBeNull();
  });
  it("мөрийн засах эрх: гүйцэтгэгч эсвэл хэлцлийн засварлагч, хүчингүй бол үгүй", () => {
    const row = { agent_id: U1, deal_id: U2, voided_at: null };
    expect(activityEditable(row, U1, {})).toBe(true);
    expect(activityEditable(row, "other", { [U2]: true })).toBe(true);
    expect(activityEditable(row, "other", {})).toBe(false);
    expect(activityEditable({ ...row, voided_at: "2026-11-13T00:00:00Z" }, U1, { [U2]: true })).toBe(false);
  });
  it("шаардлагын товч текст", () => {
    expect(
      requirementSummary({
        category: "rent",
        budget_min: 1_500_000,
        budget_max: 2_000_000,
        currency: "MNT",
        price_period: "month",
        districts: ["Хан-Уул"],
        rooms_min: 2,
        rooms_max: 3,
      })
    ).toBe("Түрээслэх · 1,500,000₮–2,000,000₮/сар · Хан-Уул · 2–3 өрөө");
    expect(requirementSummary({})).toBe("Шаардлага");
    expect(requirementSummary({ budget_max: 500, currency: "USD" })).toBe("$500 хүртэл");
  });
  it("Google Maps холбоос", () => {
    expect(mapsHref(47.9, 106.9)).toBe("https://www.google.com/maps/search/?api=1&query=47.9,106.9");
    expect(mapsHref(null, 106.9)).toBeNull();
  });
});
