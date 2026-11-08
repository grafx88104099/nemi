import { describe, expect, it } from "vitest";

import {
  DEFAULT_MATCH_THRESHOLDS,
  DEFAULT_MATCH_WEIGHTS,
  PROPERTY_TAG_GROUPS,
  buildMatchMessage,
  deliveryTier,
  isServiceCompatible,
  normalizePropertyTags,
  relevantPrice,
  normalizeMatchThresholds,
  normalizeMatchWeights,
  propertyFeatureTokens,
  propertyLocationTokens,
  scoreMatch,
  type MatchProfileInput,
  type MatchPropertyInput,
} from "@/lib/crm/matching";

const buyer: MatchProfileInput = {
  profileType: "buyer",
  locations: ["Хан-Уул"],
  propertyTypes: ["apartment"],
  budgetMax: 400_000_000,
  roomsMin: 2,
  areaMin: 50,
  timeline: "1_3m",
  mustHaves: ["Дуплекс биш", "Лифттэй", "Зогсоолтой"],
  niceToHaves: ["Сургууль ойрхон"],
  dealBreakers: ["1 давхар"],
};

const apartment: MatchPropertyInput = {
  serviceKind: "sale",
  propertyType: "apartment",
  price: 380_000_000,
  rooms: 3,
  areaM2: 72,
  status: "active",
  occupancy: null,
  locationTokens: ["Хан-Уул", "19 хороолол"],
  featureTokens: ["Лифттэй", "Зогсоолтой", "Сургууль ойрхон", "Дуплекс биш"],
};

describe("scoreMatch — жин 25/25/20/10/15/5 (F-250/251)", () => {
  it("бүрэн тохирсон объект 100 оноо авч, задаргаа 6 шалгуултай", () => {
    const res = scoreMatch(buyer, apartment);
    expect(res.score).toBe(100);
    expect(res.breakdown).toHaveLength(6);
    expect(res.breakdown.map((b) => b.weight)).toEqual([25, 25, 20, 10, 15, 5]);
    expect(res.strength).toBe("strong");
    expect(res.dealBreakerHit).toBe(false);
  });

  it("байршил зөрвөл 25 оноо алдана", () => {
    const res = scoreMatch(buyer, { ...apartment, locationTokens: ["Сүхбаатар"] });
    expect(res.score).toBe(75);
    expect(res.breakdown.find((b) => b.key === "location")?.earned).toBe(0);
  });

  it("жин тохиргоогоор өөрчлөгддөг (D4 — кодонд тогтмол утга эцсийн үнэн биш)", () => {
    const weights = { ...DEFAULT_MATCH_WEIGHTS, location: 50, budget: 0 };
    const res = scoreMatch(buyer, { ...apartment, locationTokens: ["Сүхбаатар"] }, { weights });
    expect(res.breakdown.find((b) => b.key === "location")?.weight).toBe(50);
    expect(res.breakdown.find((b) => b.key === "budget")?.earned).toBe(0);
  });
});

describe("scoreMatch — deal breaker (F-252)", () => {
  it("90+ оноотой ч таслах нөхцөл зөрчвөл strong биш, шалтгаан нь жагсдаг", () => {
    const res = scoreMatch(buyer, {
      ...apartment,
      featureTokens: [...apartment.featureTokens, "1 давхар"],
    });
    expect(res.score).toBeGreaterThanOrEqual(90);
    expect(res.dealBreakerHit).toBe(true);
    expect(res.dealBreakerReasons).toEqual(["1 давхар"]);
    expect(res.strength).toBe("weak");
  });
});

describe("scoreMatch — зэргэлдээ бүс (тохируулгат %)", () => {
  it("зэргэлдээ бүсэд байршлын оноо тохируулгат хувиар олгогдоно", () => {
    const res = scoreMatch(
      buyer,
      { ...apartment, locationTokens: ["Баянзүрх"] },
      { adjacentZones: { "Хан-Уул": ["Баянзүрх"] } }
    );
    // 25 × 50% = 12.5
    expect(res.breakdown.find((b) => b.key === "location")?.earned).toBe(12.5);
    expect(res.score).toBe(87.5);
  });

  it("adjacent_pct босго өөрчлөгдөхөд оноо дагана", () => {
    const res = scoreMatch(
      buyer,
      { ...apartment, locationTokens: ["Баянзүрх"] },
      {
        adjacentZones: { "Хан-Уул": ["Баянзүрх"] },
        thresholds: { ...DEFAULT_MATCH_THRESHOLDS, adjacent_pct: 80 },
      }
    );
    expect(res.breakdown.find((b) => b.key === "location")?.earned).toBe(20);
  });
});

describe("scoreMatch — төсөв (§6.9: дээд төсөв эсвэл харилцагч зөвшөөрсөн хэтрэлт)", () => {
  it("зөвшөөрөлгүй хэтрэлт (5%) 0 оноо — хүлцэл гэж байхгүй", () => {
    const res = scoreMatch(buyer, { ...apartment, price: 420_000_000 }); // +5%
    const b = res.breakdown.find((x) => x.key === "budget");
    expect(b?.earned).toBe(0);
    expect(b?.detail).toContain("зөвшөөрөөгүй");
  });

  it("харилцагч зөвшөөрсөн дээд дүнд багтвал бүтэн оноо", () => {
    const approved: MatchProfileInput = { ...buyer, budgetOverrunApproved: true, budgetOverrunMax: 450_000_000 };
    const res = scoreMatch(approved, { ...apartment, price: 440_000_000 });
    expect(res.breakdown.find((b) => b.key === "budget")?.earned).toBe(25);
  });

  it("зөвшөөрсөн дээд дүнгээс хэтэрвэл 0", () => {
    const approved: MatchProfileInput = { ...buyer, budgetOverrunApproved: true, budgetOverrunMax: 450_000_000 };
    const res = scoreMatch(approved, { ...apartment, price: 480_000_000 });
    expect(res.breakdown.find((b) => b.key === "budget")?.earned).toBe(0);
  });

  it("зөвшөөрөл тэмдэглээгүй бол дээд дүн өгсөн ч тооцохгүй", () => {
    const notApproved: MatchProfileInput = { ...buyer, budgetOverrunApproved: false, budgetOverrunMax: 450_000_000 };
    const res = scoreMatch(notApproved, { ...apartment, price: 440_000_000 });
    expect(res.breakdown.find((b) => b.key === "budget")?.earned).toBe(0);
  });

  it("түрээслэгчийн профайлд түрээсийн үнэ хэрэглэгдэнэ", () => {
    const tenant: MatchProfileInput = { ...buyer, profileType: "tenant", budgetMax: 2_000_000 };
    const res = scoreMatch(tenant, {
      ...apartment,
      serviceKind: "managed_rental",
      price: null,
      rentPrice: 1_800_000,
    });
    expect(res.breakdown.find((b) => b.key === "budget")?.earned).toBe(25);
  });
});

describe("худалдаа/түрээс хольж тохируулахгүй (§6.9 Төсөв, Төрөл)", () => {
  const rentalFlat: MatchPropertyInput = {
    ...apartment,
    serviceKind: "standard_rental",
    price: null,
    rentPrice: 2_000_000,
  };

  it("500 сая төсөвтэй худалдан авагчид сарын 2 сая түрээсийн үл хөдлөх тохирохгүй", () => {
    const rich: MatchProfileInput = { ...buyer, budgetMax: 500_000_000 };
    const res = scoreMatch(rich, rentalFlat);
    expect(res.compatible).toBe(false);
    expect(res.score).toBe(0);
    expect(res.strength).toBe("weak");
    expect(res.breakdown.find((b) => b.key === "budget")?.earned).toBe(0);
    expect(relevantPrice(rich, rentalFlat)).toBeNull();
  });

  it("түрээслэгчид худалдах үл хөдлөх тохирохгүй", () => {
    const tenant: MatchProfileInput = { ...buyer, profileType: "tenant", budgetMax: 2_000_000 };
    const res = scoreMatch(tenant, apartment);
    expect(res.compatible).toBe(false);
    expect(res.score).toBe(0);
  });

  it("нийцлийн хүснэгт", () => {
    expect(isServiceCompatible("buyer", "sale")).toBe(true);
    expect(isServiceCompatible("investor", "sale")).toBe(true);
    expect(isServiceCompatible("intl_buyer", "sale")).toBe(true);
    expect(isServiceCompatible("buyer", "standard_rental")).toBe(false);
    expect(isServiceCompatible("buyer", "managed_rental")).toBe(false);
    expect(isServiceCompatible("tenant", "standard_rental")).toBe(true);
    expect(isServiceCompatible("tenant", "managed_rental")).toBe(true);
    expect(isServiceCompatible("tenant", "sale")).toBe(false);
  });

  it("нийцсэн хослол compatible=true", () => {
    expect(scoreMatch(buyer, apartment).compatible).toBe(true);
  });
});

describe("scoreMatch — төрөл/хэмжээ, хугацаа, шаардлага", () => {
  it("төрөл зөрвөл хэмжээ таарсан ч 0", () => {
    const res = scoreMatch(buyer, { ...apartment, propertyType: "house" });
    expect(res.breakdown.find((b) => b.key === "type_size")?.earned).toBe(0);
  });

  it("хэмжээ хүлцэлд ойролцоо бол хэсэгчилсэн оноо", () => {
    // areaMin 50, area 45 → 10% дутуу (хүлцэл 20% дотор) → 20 × 50% = 10
    const res = scoreMatch(buyer, { ...apartment, areaM2: 45 });
    expect(res.breakdown.find((b) => b.key === "type_size")?.earned).toBe(10);
  });

  it("яаралтай хугацаатай профайлд бэлэн биш объект 0 оноо", () => {
    const res = scoreMatch(
      { ...buyer, timeline: "0_30" },
      { ...apartment, status: "active", occupancy: "occupied" }
    );
    expect(res.breakdown.find((b) => b.key === "timeline")?.earned).toBe(0);
  });

  it("заавал шаардлага хагас хангагдвал пропорциональ оноо", () => {
    const res = scoreMatch(
      { ...buyer, mustHaves: ["Лифттэй", "Зогсоолтой", "Гражтай"] },
      apartment
    );
    expect(res.breakdown.find((b) => b.key === "must_haves")?.earned).toBe(10); // 2/3 × 15
  });
});

describe("босго 80/65 — strength (F-250)", () => {
  it("оноо 80 ба түүнээс дээш → strong, 65–79 → possible, <65 → weak", () => {
    const mk = (score80: boolean, score65: boolean): MatchPropertyInput => ({
      ...apartment,
      locationTokens: score80 ? apartment.locationTokens : ["Сүхбаатар"], // −25
      price: score65 ? apartment.price : 900_000_000, // −25
    });
    expect(scoreMatch(buyer, mk(true, true)).strength).toBe("strong");
    expect(scoreMatch(buyer, mk(false, true)).strength).toBe("possible"); // 75
    expect(scoreMatch(buyer, mk(false, false)).strength).toBe("weak"); // 50
  });

  it("босго тохиргоогоор өөрчлөгддөг", () => {
    const res = scoreMatch(
      buyer,
      { ...apartment, locationTokens: ["Сүхбаатар"] },
      { thresholds: { ...DEFAULT_MATCH_THRESHOLDS, strong: 70 } }
    );
    expect(res.score).toBe(75);
    expect(res.strength).toBe("strong");
  });
});

describe("normalize — тохиргооны хэвшүүлэлт", () => {
  it("буруу/дутуу бүтэцтэй жин default-д унана", () => {
    expect(normalizeMatchWeights(null)).toEqual(DEFAULT_MATCH_WEIGHTS);
    expect(normalizeMatchWeights({ location: 30 }).location).toBe(30);
    expect(normalizeMatchWeights({ location: 30 }).budget).toBe(25);
  });

  it("seed-ийн хуучин түлхүүрүүд (price/features) зөв буулгагдана", () => {
    const w = normalizeMatchWeights({ location: 25, price: 25, features: 15 });
    expect(w.budget).toBe(25);
    expect(w.must_haves).toBe(15);
  });

  it("босгын default-ууд бүрэн", () => {
    const t = normalizeMatchThresholds({ strong: 85 });
    expect(t.strong).toBe(85);
    expect(t.possible).toBe(65);
    expect(t.adjacent_pct).toBe(50);
  });
});

describe("deliveryTier — ангиллаар ялгасан хүргэлт (F-254)", () => {
  it("A + strong → агент биечлэн; B → хувийн зурвас; C → аян; weak → үгүй", () => {
    expect(deliveryTier("a", "strong")).toBe("agent_call");
    expect(deliveryTier("a", "possible")).toBe("personal_message");
    expect(deliveryTier("b", "strong")).toBe("personal_message");
    expect(deliveryTier("c", "possible")).toBe("campaign");
    expect(deliveryTier("a", "weak")).toBe("none");
    expect(deliveryTier(null, "strong")).toBe("none");
  });
});

describe("объектын токенчлол", () => {
  it("хаяг + match_tags байршлын токенд нэгтгэгдэнэ", () => {
    expect(
      propertyLocationTokens({ district: "Хан-Уул", khoroo: "11", complex: "Жардин" }, { location: ["Зайсан"] })
    ).toEqual(["Хан-Уул", "11", "Жардин", "Зайсан"]);
  });

  it("features + бусад match_tags онцлогийн токенд нэгтгэгдэнэ", () => {
    expect(propertyFeatureTokens(["Лифттэй"], { special: "Шинэ", goal: ["Хөрөнгө оруулалт"] })).toEqual([
      "Лифттэй",
      "Хөрөнгө оруулалт",
      "Шинэ",
    ]);
  });

  it("§6.10.2 хэмжээ, нөхцөл байдлын шошго тохируулгад орно", () => {
    expect(propertyFeatureTokens([], { size: ["70–90 м²"], condition: "Шинэ засвартай" })).toEqual([
      "70–90 м²",
      "Шинэ засвартай",
    ]);
    const res = scoreMatch(
      { ...buyer, mustHaves: ["Шинэ засвартай"] },
      { ...apartment, featureTokens: propertyFeatureTokens([], { condition: ["Шинэ засвартай"] }) }
    );
    expect(res.breakdown.find((b) => b.key === "must_haves")?.earned).toBe(15);
  });

  it("normalizePropertyTags — 7 бүлэг, давхардал/хоосон утгагүй", () => {
    const t = normalizePropertyTags({ location: [" Зайсан ", "Зайсан", ""], size: "80 м²", junk: ["x"] });
    expect(Object.keys(t)).toEqual([...PROPERTY_TAG_GROUPS]);
    expect(t.location).toEqual(["Зайсан"]);
    expect(t.size).toEqual(["80 м²"]);
    expect(t.condition).toEqual([]);
    expect(normalizePropertyTags(null).type).toEqual([]);
  });
});

describe("buildMatchMessage — хувь хүнд чиглэсэн зурвас (§6.10.5)", () => {
  it("нэр, үл хөдлөхийн гол мэдээлэл, холбоосыг агуулна", () => {
    const text = buildMatchMessage({
      contactName: "Болд Батаа",
      propertyName: "Зайсан 3 өрөө",
      serviceKind: "sale",
      price: 380_000_000,
      rooms: 3,
      areaM2: 72,
      district: "Хан-Уул",
      url: "https://www.nemi.mn/listings/abc",
      agentName: "Сараа",
    });
    expect(text).toContain("Сайн байна уу, Болд!");
    expect(text).toContain("худалдах үл хөдлөх");
    expect(text).toContain("Хан-Уул, 3 өрөө, 72 м², 380 000 000₮");
    expect(text).toContain("https://www.nemi.mn/listings/abc");
    expect(text).toContain("— Сараа");
  });

  it("түрээсэд сарын үнэ, нэргүйд ерөнхий мэндчилгээ", () => {
    const text = buildMatchMessage({
      contactName: null,
      propertyName: "Төв 1 өрөө",
      serviceKind: "managed_rental",
      rentPrice: 1_800_000,
    });
    expect(text.startsWith("Сайн байна уу!")).toBe(true);
    expect(text).toContain("түрээсийн");
    expect(text).toContain("сарын 1 800 000₮");
    expect(text).not.toContain("Дэлгэрэнгүй");
  });
});
