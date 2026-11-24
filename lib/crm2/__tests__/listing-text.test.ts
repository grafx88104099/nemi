import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import holdout from "./fixtures/listing-posts.holdout.json";
import tune from "./fixtures/listing-posts.tune.json";
import {
  PHONE_PATTERN_SAMPLES,
  PHONE_PATTERN_SOURCE,
  extractPhones,
  findPriceInText,
  hasPhonePattern,
  maskPhones,
  parseListingText,
  propertyParseSchema,
  sanitizeParsedFields,
  type ListingTextContext,
  type ParsedListingFields,
} from "@/lib/crm2/listing-text";
import { normalizePhone, isFullPhone } from "@/lib/crm2/phone";

/**
 * Зарын бичвэр задлагч (P9). Босго нь ЗӨВХӨН хөлдөөсөн holdout дээр (tune дээр
 * тааруулсан, holdout-ыг засахгүй). Fixture нь нийтийн зарыг бүрэн өөрчилж бичсэн
 * (paraphrase) бичвэр — утас, нэр, тоот нь зохиомол.
 */

type Post = { id: string; source: string; text: string; phones: string[]; expect: Record<string, unknown> };

const CTX: ListingTextContext = {
  districts: ["Баянгол", "Баянзүрх", "Сонгинохайрхан", "Сүхбаатар", "Хан-Уул", "Чингэлтэй", "Налайх", "Багануур", "Багахангай"],
  projects: [],
  featureKeys: ["parking", "garage", "furnished", "balcony", "elevator", "pets", "security", "storage", "kids_playground"],
};

const HOLDOUT = holdout.posts as Post[];
const TUNE = tune.posts as Post[];

function fieldOk(post: Post, f: ParsedListingFields, key: string): boolean {
  const want = post.expect[key];
  if (key === "price") {
    const got = f.price;
    return (
      typeof got === "number" &&
      Math.abs(got - (want as number)) <= Math.abs(want as number) * 0.005 &&
      f.currency === post.expect.currency &&
      f.price_basis === post.expect.price_basis
    );
  }
  if (key === "area_m2") return typeof f.area_m2 === "number" && Math.abs(f.area_m2 - (want as number)) < 0.011;
  return (f as Record<string, unknown>)[key] === want;
}

function accuracy(posts: Post[], key: string): { rate: number; n: number; misses: string[] } {
  const relevant = posts.filter((p) => p.expect[key] !== undefined);
  const misses = relevant.filter((p) => !fieldOk(p, parseListingText(p.text, CTX).fields, key)).map((p) => p.id);
  return { rate: relevant.length ? (relevant.length - misses.length) / relevant.length : 1, n: relevant.length, misses };
}

describe("fixture олонлог", () => {
  it("tune 30, holdout 20, давхардалгүй id", () => {
    expect(TUNE).toHaveLength(30);
    expect(HOLDOUT).toHaveLength(20);
    const ids = [...TUNE, ...HOLDOUT].map((p) => p.id);
    expect(new Set(ids).size).toBe(50);
  });
});

describe("holdout дээрх нарийвчлал (босго)", () => {
  const thresholds: [string, number][] = [
    ["rooms", 0.9],
    ["area_m2", 0.9],
    ["price", 0.85],
    ["district", 0.9],
  ];
  for (const [key, min] of thresholds) {
    it(`${key} ≥ ${min * 100}%`, () => {
      const a = accuracy(HOLDOUT, key);
      expect(a.n).toBeGreaterThanOrEqual(10);
      expect(a.rate, `алдсан: ${a.misses.join(", ")}`).toBeGreaterThanOrEqual(min);
    });
  }
  it("ангилал, төрөл ≥ 85%", () => {
    expect(accuracy(HOLDOUT, "category").rate).toBeGreaterThanOrEqual(0.85);
    expect(accuracy(HOLDOUT, "property_type").rate).toBeGreaterThanOrEqual(0.85);
  });
});

describe("tune дээрх регресс", () => {
  for (const key of ["rooms", "area_m2", "price", "district", "category", "property_type"]) {
    it(`${key} ≥ 90%`, () => {
      const a = accuracy(TUNE, key);
      expect(a.rate, `алдсан: ${a.misses.join(", ")}`).toBeGreaterThanOrEqual(0.9);
    });
  }
});

describe("утас ХЭЗЭЭ Ч талбарт орохгүй", () => {
  const extra = [
    "Эзэн 99112233 2 өрөө 99112233 мкв",
    "Үнэ 99112233, утас 88112233",
    "88 11 22 33 хотхонд 3 өрөө",
    "9911-2233 Residence 4/16 давхар",
    "Эзний утас +976 9911 2233, 120м2, 350 сая",
    "Утас: 9911.2233 Хан-Уул 2 өрөө",
  ];
  const all = [...TUNE.map((p) => p.text), ...HOLDOUT.map((p) => p.text), ...extra];

  it.each(all.map((t, i) => [i, t] as const))("#%i", (_i, text) => {
    const r = parseListingText(text, CTX);
    const blob = JSON.stringify(r.fields) + JSON.stringify(r.evidence);
    for (const phone of r.phones) {
      expect(blob).not.toContain(phone);
      expect(blob).not.toContain(phone.slice(0, 4));
    }
    expect(hasPhonePattern(blob)).toBe(false);
    expect(hasPhonePattern(r.restMasked)).toBe(false);
    // Эзний талбар задлагчийн гаралтад огт байхгүй.
    expect(Object.keys(r.fields).some((k) => k.startsWith("owner"))).toBe(false);
  });

  it("fixture-ийн утсыг зөв олно (8 оронтой, isFullPhone)", () => {
    for (const p of [...TUNE, ...HOLDOUT]) {
      const r = parseListingText(p.text, CTX);
      expect([...r.phones].sort(), p.id).toEqual([...p.phones].sort());
      for (const ph of r.phones) expect(isFullPhone(ph)).toBe(true);
    }
  });
});

describe("PHONE_PATTERN_SOURCE ↔ 20261124000600 crm2_phone_pattern()", () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, "../../../supabase/migrations/20261124000600_crm2_publish_payload.sql"),
    "utf8"
  );
  it("SQL-ийн литералтай тэмдэгт бүрээрээ ижил", () => {
    const m = /function public\.crm2_phone_pattern\(\)[\s\S]*?select '([^']+)'::text;/.exec(sql);
    expect(m, "crm2_phone_pattern олдсонгүй").not.toBeNull();
    expect(m![1]).toBe(PHONE_PATTERN_SOURCE);
  });
  it("SQL маск '\\1•••• ••••' — JS '$1•••• ••••'", () => {
    expect(sql).toContain("'\\1•••• ••••'");
    expect(maskPhones("утас 99112233, 88112233")).toBe("утас •••• ••••, •••• ••••");
  });
  it("хуваалцсан жишээ", () => {
    for (const [s, want] of PHONE_PATTERN_SAMPLES) expect(hasPhonePattern(s), s).toBe(want);
  });
  it("lookbehind ашиглахгүй (iOS Safari < 16.4)", () => {
    expect(PHONE_PATTERN_SOURCE).not.toMatch(/\(\?<[=!]/);
  });
});

describe("extractPhones", () => {
  it("+976, зай, зураас, цэг; давхардалгүй, дарааллаар", () => {
    expect(extractPhones("+976 9911-2233, 8811 2233; 99112233 · 7011.2233")).toEqual(["99112233", "88112233", "70112233"]);
  });
  it("үнэ, урт тоо утас биш", () => {
    expect(extractPhones("65000000₮, 991122334, 15000000, 81,47 мкв")).toEqual([]);
  });
  it("normalizePhone-той нийцнэ", () => {
    expect(normalizePhone(extractPhones("утас 9911 2233")[0])).toBe("97699112233");
  });
});

describe("parseListingText — тусгай тохиолдол", () => {
  const p = (t: string, ctx: ListingTextContext = CTX) => parseListingText(t, ctx);

  it("«81,47» → 81.47", () => {
    expect(p("81,47 мкв 2 өрөө").fields.area_m2).toBe(81.47);
  });
  it("«4/16 давхар»", () => {
    const r = p("3 өрөө, 4/16 давхар");
    expect(r.fields).toMatchObject({ floor: 4, building_floors: 16 });
    expect(r.confidence.floor).toBe("high");
  });
  it("«2 өрөө 3 давхар» → давхар (low), барилгын давхаргүй", () => {
    const r = p("2 өрөө 3 давхар");
    expect(r.fields.rooms).toBe(2);
    expect(r.fields.floor).toBe(3);
    expect(r.confidence.floor).toBe("low");
    expect(r.fields.building_floors).toBeUndefined();
  });
  it("«1+1» түрээсийн нөхцөл", () => {
    const r = p("2 өрөө байр түрээслүүлнэ, сард 1.5 сая, 1+1");
    expect(r.fields).toMatchObject({ category: "rent", rent_advance_months: 1, rent_deposit_months: 1 });
  });
  it("«3+1 өрөө» нөхцөл биш; худалдахад нөхцөл задлахгүй", () => {
    expect(p("3+1 өрөө түрээслүүлнэ").fields.rent_advance_months).toBeUndefined();
    expect(p("байр зарна, урьдчилгаа 3 сар").fields.rent_advance_months).toBeUndefined();
  });
  it("«барьцаагүй» → 0", () => {
    expect(p("1 өрөө түрээслүүлнэ, урьдчилгаа 2 сар, барьцаагүй").fields).toMatchObject({ rent_advance_months: 2, rent_deposit_months: 0 });
  });
  it("USD илэрнэ ($, usd, доллар)", () => {
    expect(p("Үнэ $285,000").fields).toMatchObject({ price: 285000, currency: "USD" });
    expect(p("1500 USD сард").fields).toMatchObject({ price: 1500, currency: "USD", price_period: "month" });
    expect(p("2000 доллар").fields.currency).toBe("USD");
  });
  it("үнийн нэгж: сая, тэрбум, мянга, «1 тэрбум 350 сая», мянгат биш", () => {
    expect(findPriceInText("үнэ 2,5 сая")?.price).toBe(2_500_000);
    expect(findPriceInText("1.4 тэрбум")?.price).toBe(1_400_000_000);
    expect(findPriceInText("1 тэрбум 350 сая₮")?.price).toBe(1_350_000_000);
    expect(findPriceInText("м2 нь 45 мянга ₮ сард")).toMatchObject({ price: 45_000, basis: "per_m2", period: "month" });
    expect(findPriceInText("120 мянгат, тэмээтэй хөшөө")).toBeNull();
    expect(findPriceInText("саяхан засвар хийсэн 3 өрөө")).toBeNull();
  });
  it("нийт ба м²-ийн үнэ хоёулаа байвал нийтийг сонгоно", () => {
    expect(findPriceInText("м2 нь 5.4 сая, нийт 1,771,200,000₮")).toMatchObject({ price: 1_771_200_000, basis: "total" });
  });
  it("зогсоолын үнэ хөрөнгийн үнэ биш", () => {
    expect(findPriceInText("2 дулаан зогсоолтой /зогсоол 120 сая төгрөг/. үнэ 985 сая")?.price).toBe(985_000_000);
  });
  it("онцлогийн үгүйсгэл: «-гүй», «байхгүй», «хагас тавилга»", () => {
    const r = p("Тавилгагүй, лифт байхгүй, тагттай, 2 зогсоолтой");
    expect(r.fields.features).toEqual(["parking", "balcony"]);
    expect(r.negatedFeatures).toEqual(expect.arrayContaining(["furnished", "elevator"]));
    expect(p("Хагас тавилгатай 2 өрөө").fields.features).toBeUndefined();
    expect(p("Гал тогооны тавилгатай").fields.features).toBeUndefined();
    expect(p("Бүрэн тавилгатай").fields.features).toEqual(["furnished"]);
  });
  it("оффисын жагсаалтад байхгүй онцлог гарахгүй", () => {
    expect(p("Лифттэй, тагттай", { ...CTX, featureKeys: ["balcony"] }).fields.features).toEqual(["balcony"]);
  });
  it("«N зогсоол»", () => {
    expect(p("2 машины дулаан зогсоолтой").fields.parking_spaces).toBe(2);
    expect(p("70 үнээний зогсоол").fields.parking_spaces).toBeUndefined();
    expect(p("18 м2 дулаан гараж").fields.parking_spaces).toBeUndefined();
  });
  it("ангилал: lease/managed_rent хэзээ ч автоматаар биш; хөрөнгө оруулалтын «түрээслүүлэхэд» rent биш", () => {
    for (const t of ["урт хугацаагаар түрээслүүлнэ", "менежменттэй түрээс", "lease"]) {
      expect(["rent", "sale", undefined]).toContain(p(t).fields.category);
    }
    expect(p("Түрээслүүлэхэд ашигтай байр зарна").fields.category).toBe("sale");
  });
  it("төрөл: газар (өрөөгүй), гараж, оффис, худалдаа", () => {
    expect(p("700 м2 газар худалдана").fields.property_type).toBe("land");
    expect(p("3 өрөө байр, газар доорх зогсоол").fields.property_type).toBe("apartment");
    expect(p("Гараж зарна 18 м2").fields.property_type).toBe("garage");
    expect(p("D5 оффис, үйлчилгээний зориулалттай талбай").fields.property_type).toBe("commercial");
  });
  it("дүүрэг: товчлол, нөхцөл, латин; оффисын жагсаалтаар шүүнэ", () => {
    expect(p("ХУД-ийн 15-р хороо").fields.district).toBe("Хан-Уул");
    expect(p("Баянзүрхэд 2 өрөө").fields.district).toBe("Баянзүрх");
    expect(p("bayanzurkh duureg").fields.district).toBe("Баянзүрх");
    expect(p("Хан-Уул дүүрэг", { ...CTX, districts: ["Баянгол"] }).fields.district).toBeUndefined();
    // Хоёр үсэгтэй товчлол зөвхөн том үсгээр («1-нд» андуурахгүй).
    expect(p("сарын 1-нд чөлөөлөгдөнө").fields.district).toBeUndefined();
    expect(p("НД, 2 өрөө").fields.district).toBe("Налайх");
  });
  it("ашиглалтад орсон он 1950–2049", () => {
    expect(p("2014 онд ашиглалтад орсон").fields.year_in_use).toBe(2014);
    expect(p("2014 онд ашиглалтад орсон").confidence.year_in_use).toBe("high");
    expect(p("1900 он").fields.year_in_use).toBeUndefined();
    expect(p("2051 онд").fields.year_in_use).toBeUndefined();
  });
  it("төсөл: оффисын жагсаалтаас нугалж тааруулна, эс бөгөөс project_name (low)", () => {
    const ctx = { ...CTX, projects: [{ id: "11111111-1111-4111-8111-111111111111", name: "Vega City" }] };
    const a = p("VEGA CITY хотхонд 4 өрөө", ctx);
    expect(a.fields.project_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(a.fields.project_name).toBeUndefined();
    const b = p("Misheel residence-д 3 өрөө");
    expect(b.fields.project_name).toBe("Misheel residence");
    expect(b.confidence.project_name).toBe("low");
    expect(p("Буянт-Ухаа 1 хороололд").fields.project_name).toBe("Буянт-Ухаа 1");
  });
  it("10 000 тэмдэгтээс хойшхийг уншихгүй; детерминист", () => {
    const long = "а ".repeat(5000) + " 3 өрөө";
    expect(p(long).fields.rooms).toBeUndefined();
    const t = HOLDOUT[0].text;
    expect(p(t)).toEqual(p(t));
  });
  it("restMasked нь далдалсан, ≤2000", () => {
    const r = p("Эзэн Бат 99112233, 45 тоот, код 1234. " + "x".repeat(3000));
    expect(r.restMasked.length).toBeLessThanOrEqual(2000);
    expect(r.restMasked).not.toMatch(/Бат|99112233|45 тоот|1234/);
  });
});

describe("propertyParseSchema / sanitizeParsedFields", () => {
  it("тэнцээгүй талбарыг хаяж, бусдыг үлдээнэ", () => {
    const out = sanitizeParsedFields({
      category: "lease",
      rooms: 2.5,
      area_m2: 81.47,
      floor: 400,
      price: 350_000_000,
      currency: "EUR",
      parking_spaces: 3,
      rent_deposit_months: 99,
      features: ["parking", "Bad Key"],
      district: "Хан-Уул",
      owner_phone: "99112233",
    });
    expect(out).toEqual({ category: "lease", area_m2: 81.47, price: 350_000_000, parking_spaces: 3, district: "Хан-Уул" });
  });
  it("задлагчийн бүх гаралт схемд тэнцэнэ", () => {
    for (const post of [...TUNE, ...HOLDOUT]) {
      const f = parseListingText(post.text, CTX).fields;
      expect(propertyParseSchema.safeParse(f).success, post.id).toBe(true);
    }
  });
});
