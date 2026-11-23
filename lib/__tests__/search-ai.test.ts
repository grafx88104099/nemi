import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>) => fn,
}));

import { aiSearchEnabled, interpretQueryWithAI, sanitizeAiIntent } from "@/lib/ai/search-intent";
import {
  AI_IP_MAX,
  AI_IP_WINDOW_SECONDS,
  cachedInterpret,
  ipRateKey,
  parseAiSearchForm,
  resolveAiSearch,
  ruleHref,
  type RateLimitRpc,
} from "@/lib/search/ai-search";

const SALT = "x".repeat(32);
const FREE = "гэр бүлд тохиромжтой хотын төвд";

const fullEnv = {
  ANTHROPIC_API_KEY: "test-key",
  RATE_LIMIT_SALT: SALT,
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
};

function decode(href: string) {
  const [path, qs = ""] = href.split("?");
  return { path, params: Object.fromEntries(new URLSearchParams(qs)) };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("aiSearchEnabled (унтраастай байдал)", () => {
  it("бүх env байвал л асна", () => {
    expect(aiSearchEnabled(fullEnv)).toBe(true);
  });
  it("түлхүүргүй → унтраастай", () => {
    expect(aiSearchEnabled({ ...fullEnv, ANTHROPIC_API_KEY: undefined })).toBe(false);
    expect(aiSearchEnabled({ ...fullEnv, ANTHROPIC_API_KEY: "" })).toBe(false);
  });
  it("AI_SEARCH=off → унтраастай", () => {
    expect(aiSearchEnabled({ ...fullEnv, AI_SEARCH: "off" })).toBe(false);
    expect(aiSearchEnabled({ ...fullEnv, AI_SEARCH: " OFF " })).toBe(false);
    expect(aiSearchEnabled({ ...fullEnv, AI_SEARCH: "on" })).toBe(true);
  });
  it("RATE_LIMIT_SALT байхгүй эсвэл < 32 тэмдэгт → унтраастай", () => {
    expect(aiSearchEnabled({ ...fullEnv, RATE_LIMIT_SALT: undefined })).toBe(false);
    expect(aiSearchEnabled({ ...fullEnv, RATE_LIMIT_SALT: "x".repeat(31) })).toBe(false);
  });
  it("service role түлхүүргүй → унтраастай", () => {
    expect(aiSearchEnabled({ ...fullEnv, SUPABASE_SERVICE_ROLE_KEY: undefined })).toBe(false);
  });
  it("process.env-ээс уншина", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubEnv("RATE_LIMIT_SALT", SALT);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "s");
    vi.stubEnv("AI_SEARCH", "");
    expect(aiSearchEnabled()).toBe(true);
    vi.stubEnv("AI_SEARCH", "off");
    expect(aiSearchEnabled()).toBe(false);
  });
});

describe("interpretQueryWithAI", () => {
  it("түлхүүргүй үед сүлжээгүйгээр no_key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(interpretQueryWithAI("x")).resolves.toEqual({ error: "no_key" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it("AI_SEARCH=off үед түлхүүртэй ч no_key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubEnv("RATE_LIMIT_SALT", SALT);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "s");
    vi.stubEnv("AI_SEARCH", "off");
    await expect(interpretQueryWithAI("x")).resolves.toEqual({ error: "no_key" });
  });
});

describe("sanitizeAiIntent", () => {
  it("enum-д байхгүй дүүрэг/төрөл, буруу deal-ийг хаяна", () => {
    const r = sanitizeAiIntent({ district: "Зайсан", type: "Вилла", deal: "lease", keywords: "" });
    expect(r).toEqual({ keywords: "" });
  });
  it("зөв утгыг үлдээнэ", () => {
    const r = sanitizeAiIntent({ district: "Баянгол", type: "Орон сууц", deal: "rent", rooms: 2, keywords: "Зайсан" });
    expect(r).toEqual({ district: "Баянгол", type: "Орон сууц", deal: "rent", rooms: 2, keywords: "Зайсан" });
  });
  it("өрөөг 1..20 бүхэл тоонд хязгаарлана", () => {
    expect(sanitizeAiIntent({ rooms: 0, keywords: "" }).rooms).toBeUndefined();
    expect(sanitizeAiIntent({ rooms: 21, keywords: "" }).rooms).toBeUndefined();
    expect(sanitizeAiIntent({ rooms: 2.5, keywords: "" }).rooms).toBeUndefined();
    expect(sanitizeAiIntent({ rooms: 20, keywords: "" }).rooms).toBe(20);
  });
  it("урвуу үнийг сольж, сөрөг/NaN/хэт бага утгыг хаяна", () => {
    expect(sanitizeAiIntent({ min_price: 5e8, max_price: 2e8, keywords: "" })).toMatchObject({ minPrice: 2e8, maxPrice: 5e8 });
    const bad = sanitizeAiIntent({ min_price: -1, max_price: Number.NaN, min_area: Infinity, max_area: "80", keywords: "" });
    expect(bad).toEqual({ keywords: "" });
    expect(sanitizeAiIntent({ max_price: 500, keywords: "" }).maxPrice).toBeUndefined();
    expect(sanitizeAiIntent({ max_price: 2.4e6 + 0.4, keywords: "" }).maxPrice).toBe(2.4e6);
  });
  it("урвуу талбайг сольно", () => {
    expect(sanitizeAiIntent({ min_area: 90, max_area: 60, keywords: "" })).toMatchObject({ minArea: 60, maxArea: 90 });
  });
  it("keywords-ийг цэвэрлэж 60 тэмдэгтэд хязгаарлана", () => {
    expect(sanitizeAiIntent({ keywords: '  «Зайсан»   "хотхон"\n' }).keywords).toBe("Зайсан хотхон");
    expect(sanitizeAiIntent({ keywords: "а".repeat(100) }).keywords).toHaveLength(60);
    expect(sanitizeAiIntent({ keywords: 42 }).keywords).toBe("");
  });
});

describe("parseAiSearchForm", () => {
  it("$ACTION_, зөвшөөрөгдөөгүй түлхүүр, файлыг хаяна", () => {
    const fd = new FormData();
    fd.set("$ACTION_ID_abc", "x");
    fd.set("base", "/map");
    fd.set("q", FREE);
    fd.set("district", "Хан-Уул");
    fd.set("evil", "1");
    fd.set("sort", "price_asc");
    fd.set("file", new Blob(["x"]));
    expect(parseAiSearchForm(fd.entries())).toEqual({
      base: "/map",
      params: { q: FREE, district: "Хан-Уул", sort: "price_asc" },
    });
  });
  it("base зөвхөн /listings | /map", () => {
    expect(parseAiSearchForm([["base", "https://evil.example"]]).base).toBe("/listings");
  });
  it("хэт урт утга → хоосон params", () => {
    expect(parseAiSearchForm([["q", "а".repeat(201)]]).params).toEqual({});
  });
});

describe("resolveAiSearch", () => {
  const okRpc = (): RateLimitRpc & ReturnType<typeof vi.fn> =>
    vi.fn(async () => ({ data: true, error: null })) as never;

  it("shouldTryAi биш бол rpc, AI дуудахгүй — дүрмийн href", async () => {
    const rpc = okRpc();
    const interpret = vi.fn();
    const href = await resolveAiSearch("/listings", { q: "хан-уулд 2 өрөө" }, { ip: "1.2.3.4", salt: SALT, rpc, interpret });
    expect(decode(href).params).toEqual({ district: "Хан-Уул", rooms: "2" });
    expect(rpc).not.toHaveBeenCalled();
    expect(interpret).not.toHaveBeenCalled();
  });

  it("IP хязгаар { data: false } → дүрмийн href, AI дуудахгүй", async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    const interpret = vi.fn();
    const href = await resolveAiSearch("/listings", { q: FREE }, { ip: "1.2.3.4", salt: SALT, rpc, interpret });
    expect(href).toBe(ruleHref("/listings", { q: FREE }));
    expect(interpret).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_key: ipRateKey("1.2.3.4", SALT),
      p_window_seconds: AI_IP_WINDOW_SECONDS,
      p_max: AI_IP_MAX,
    });
  });

  it("rpc алдаа { data: null, error } → дүрмийн href", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "x" } }));
    const interpret = vi.fn();
    const href = await resolveAiSearch("/listings", { q: FREE }, { ip: "1.2.3.4", salt: SALT, rpc, interpret });
    expect(href).toBe(ruleHref("/listings", { q: FREE }));
    expect(interpret).not.toHaveBeenCalled();
  });

  it("IP түлхүүр нь давстай sha256 — түүхий IP агуулахгүй", () => {
    const k = ipRateKey("203.0.113.7", SALT);
    expect(k).toMatch(/^ai-search:ip:[0-9a-f]{64}$/);
    expect(k).not.toContain("203.0.113.7");
    expect(ipRateKey("203.0.113.7", "y".repeat(32))).not.toBe(k);
  });

  it("{ data: true } → AI шүүлт ба keywords-ийг нэгтгэнэ", async () => {
    const rpc = okRpc();
    const interpret = vi.fn(async () => ({ district: "Баянгол", keywords: "Зайсан" }));
    const href = await resolveAiSearch("/listings", { q: FREE, sort: "price_asc" }, { ip: "1.2.3.4", salt: SALT, rpc, interpret });
    const { path, params } = decode(href);
    expect(path).toBe("/listings");
    expect(params).toEqual({ district: "Баянгол", q: "Зайсан", sort: "price_asc" });
    expect(interpret).toHaveBeenCalledWith(FREE);
  });

  it("URL/дүрмийн утгыг AI дарахгүй", async () => {
    const rpc = okRpc();
    const interpret = vi.fn(async () => ({ district: "Баянгол", rooms: 3, keywords: "" }));
    const href = await resolveAiSearch("/listings", { q: FREE, district: "Хан-Уул" }, { ip: "1.2.3.4", salt: SALT, rpc, interpret });
    expect(decode(href).params).toEqual({ district: "Хан-Уул", rooms: "3" });
  });

  it("AI юу ч таниагүй бол хэрэглэгчийн текстийг үлдээнэ", async () => {
    const rpc = okRpc();
    const interpret = vi.fn(async () => ({ keywords: "" }));
    const href = await resolveAiSearch("/listings", { q: FREE }, { ip: "1.2.3.4", salt: SALT, rpc, interpret });
    expect(href).toBe(ruleHref("/listings", { q: FREE }));
  });

  it("interpret throw → дүрмийн href", async () => {
    const rpc = okRpc();
    const interpret = vi.fn(async () => {
      throw new Error("timeout");
    });
    const href = await resolveAiSearch("/listings", { q: FREE }, { ip: "1.2.3.4", salt: SALT, rpc, interpret });
    expect(href).toBe(ruleHref("/listings", { q: FREE }));
  });

  it("үр дүн үргэлж base-ээр эхэлсэн харьцангуй зам", async () => {
    const rpc = okRpc();
    const interpret = vi.fn(async () => ({ keywords: "//evil.example" }));
    const href = await resolveAiSearch("/map", { q: FREE }, { ip: "1.2.3.4", salt: SALT, rpc, interpret });
    expect(href.startsWith("/map?")).toBe(true);
  });
});

describe("cachedInterpret", () => {
  it("нийт өдрийн хязгаар { data: false } → throw (кэшлэхгүй), AI дуудахгүй", async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    await expect(cachedInterpret(FREE, rpc)).rejects.toThrow("cap");
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", { p_key: "ai-search:global", p_window_seconds: 86_400, p_max: 500 });
  });
  it("AI_SEARCH_DAILY_CAP-ийг уншина, буруу бол анхдагч", async () => {
    vi.stubEnv("AI_SEARCH_DAILY_CAP", "50");
    const rpc = vi.fn<RateLimitRpc>(async () => ({ data: false, error: null }));
    await expect(cachedInterpret(FREE, rpc)).rejects.toThrow();
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_max: 50 });
    vi.stubEnv("AI_SEARCH_DAILY_CAP", "abc");
    await expect(cachedInterpret(FREE, rpc)).rejects.toThrow();
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_max: 500 });
  });
  it("AI унтраастай бол cap давсан ч throw (no_key)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    await expect(cachedInterpret(FREE, rpc)).rejects.toThrow("no_key");
  });
});
