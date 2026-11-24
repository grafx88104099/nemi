import { afterEach, describe, expect, it, vi } from "vitest";

// Сүлжээ/SDK огт дуудагдахгүйг баталгаажуулна: клиент үүсгэвэл тест унана.
const ctor = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {}
  class FakeAnthropic {
    static APIError = APIError;
    static APIConnectionTimeoutError = class extends APIError {};
    static RateLimitError = class extends APIError {};
    static AuthenticationError = class extends APIError {};
    constructor() {
      ctor();
      throw new Error("network must not be used");
    }
  }
  return { default: FakeAnthropic };
});

import {
  AiListingSchema,
  aiListingParseEnabled,
  interpretListingText,
  sanitizeAiListing,
} from "@/lib/ai/parse-listing";
import { sanitizeParsedFields } from "@/lib/crm2/listing-text/schema";

const SALT = "s".repeat(32);
const FULL = { ANTHROPIC_API_KEY: "k", RATE_LIMIT_SALT: SALT, SUPABASE_SERVICE_ROLE_KEY: "r" };
const CTX = { districts: ["Хан-Уул", "Баянзүрх"], featureKeys: ["parking", "furnished"] };

afterEach(() => {
  vi.unstubAllEnvs();
  ctor.mockClear();
});

describe("aiListingParseEnabled", () => {
  it("бүх хаалга бүрдвэл л идэвхтэй", () => {
    expect(aiListingParseEnabled(FULL)).toBe(true);
    expect(aiListingParseEnabled({ ...FULL, AI_LISTING_PARSE: "on" })).toBe(true);
  });
  it("түлхүүр, унтраалга, давс, service role дутвал унтраастай", () => {
    expect(aiListingParseEnabled({ ...FULL, ANTHROPIC_API_KEY: undefined })).toBe(false);
    expect(aiListingParseEnabled({ ...FULL, AI_LISTING_PARSE: " OFF " })).toBe(false);
    expect(aiListingParseEnabled({ ...FULL, RATE_LIMIT_SALT: "short" })).toBe(false);
    expect(aiListingParseEnabled({ ...FULL, SUPABASE_SERVICE_ROLE_KEY: "" })).toBe(false);
    expect(aiListingParseEnabled({})).toBe(false);
  });
});

describe("interpretListingText", () => {
  it("түлхүүргүй бол null, SDK үүсгэхгүй (сүлжээгүй)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(interpretListingText("3 өрөө байр зарна", CTX)).resolves.toBeNull();
    expect(ctor).not.toHaveBeenCalled();
  });
  it("унтраалга 'off' бол null", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubEnv("RATE_LIMIT_SALT", SALT);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "r");
    vi.stubEnv("AI_LISTING_PARSE", "off");
    await expect(interpretListingText("3 өрөө байр зарна", CTX)).resolves.toBeNull();
    expect(ctor).not.toHaveBeenCalled();
  });
  it("SDK алдаа → null (throw хийхгүй)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubEnv("RATE_LIMIT_SALT", SALT);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "r");
    vi.stubEnv("AI_LISTING_PARSE", "");
    await expect(interpretListingText("3 өрөө", CTX)).resolves.toBeNull();
    expect(ctor).toHaveBeenCalledTimes(1);
  });
});

describe("sanitizeAiListing", () => {
  it("буруу утга, жагсаалтад байхгүй дүүрэг/онцлог, утастай нэрийг хаяна", () => {
    const out = sanitizeAiListing(
      {
        category: "lease",
        property_type: "castle",
        area_m2: -5,
        rooms: 3,
        floor: 12,
        building_floors: 9,
        price: 1e15,
        currency: "EUR",
        price_basis: "per_m2",
        price_period: "week",
        year_in_use: 1900,
        district: "хан-уул",
        project_name: "Vega 99112233",
        features: ["parking", "pool", 5],
        parking_spaces: 99,
        rent_advance_months: 3,
        rent_deposit_months: 1.5,
      },
      CTX
    );
    expect(out).toEqual({
      rooms: 3,
      floor: 12,
      price_basis: "per_m2",
      district: "Хан-Уул",
      features: ["parking"],
      rent_advance_months: 3,
    });
  });
  it("зөв утгыг үлдээж, схемд тэнцэнэ", () => {
    const raw = {
      category: "rent",
      property_type: "apartment",
      area_m2: 81.474,
      rooms: 2,
      floor: 4,
      building_floors: 16,
      price: 1_700_000,
      currency: "MNT",
      price_basis: "total",
      price_period: "month",
      year_in_use: 2014,
      district: "Баянзүрх",
      project_name: "  «Vega City»  ",
      features: [],
      parking_spaces: 1,
      rent_advance_months: 3,
      rent_deposit_months: 1,
    };
    expect(AiListingSchema.safeParse(raw).success).toBe(true);
    const out = sanitizeAiListing(raw, CTX);
    expect(out).toMatchObject({ area_m2: 81.47, project_name: "Vega City", district: "Баянзүрх" });
    expect(out.features).toBeUndefined();
    expect(sanitizeParsedFields(out)).toEqual(out);
  });
  it("гаралтын схемд утас/эзний талбар байхгүй", () => {
    const keys = Object.keys(AiListingSchema.shape);
    expect(keys.some((k) => /owner|phone|name_/.test(k))).toBe(false);
  });
});
