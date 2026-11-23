import { describe, expect, it } from "vitest";

import {
  attributionColumns,
  channelLabel,
  decodeAttribution,
  encodeAttribution,
  isBotUa,
  optedOut,
  parseUtm,
  sanitizeUtm,
  shouldStampAttribution,
} from "@/lib/attribution";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CUBOT =
  "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const FB_INAPP =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.38.108;FBBV/600000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBLC/en_US;FBOP/5]";
const INSTAGRAM =
  "Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36 Instagram 315.0.0.29.109 Android";
const VIBER =
  "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 Viber/21.5.0.0";

const headers = (h: Record<string, string>) => (n: string) => h[n.toLowerCase()] ?? null;

describe("sanitizeUtm", () => {
  it("жижиг үсэг, хоосон зай, хориотой тэмдэгт", () => {
    expect(sanitizeUtm("  FaceBook ")).toBe("facebook");
    expect(sanitizeUtm("fb ads!!2026")).toBe("fb_ads_2026");
    expect(sanitizeUtm("__x__")).toBe("x");
    expect(sanitizeUtm("a-b_c")).toBe("a-b_c");
  });
  it("40 тэмдэгтээр тасална", () => {
    expect(sanitizeUtm("a".repeat(80))).toHaveLength(40);
  });
  it("хоосон → null", () => {
    expect(sanitizeUtm("")).toBeNull();
    expect(sanitizeUtm("!!!")).toBeNull();
    expect(sanitizeUtm(null)).toBeNull();
    expect(sanitizeUtm("Фэйсбүүк")).toBeNull();
  });
});

describe("parseUtm", () => {
  it("utm_source шаардлагатай", () => {
    expect(parseUtm(new URLSearchParams("utm_medium=social"))).toBeNull();
    expect(parseUtm(new URLSearchParams("utm_source=%20"))).toBeNull();
  });
  it("бүх талбар", () => {
    expect(
      parseUtm(new URLSearchParams("utm_source=Facebook&utm_medium=social&utm_campaign=listing&utm_content=ABCD1234"))
    ).toEqual({ source: "facebook", medium: "social", campaign: "listing", content: "abcd1234" });
    expect(parseUtm(new URLSearchParams("utm_source=viber"))).toEqual({
      source: "viber",
      medium: null,
      campaign: null,
      content: null,
    });
  });
});

describe("encode/decodeAttribution", () => {
  it("буцаан задлана", () => {
    const a = { source: "facebook", medium: "social", campaign: "listing", content: "abcd1234" };
    expect(encodeAttribution(a)).toBe("v1~facebook~social~listing~abcd1234");
    expect(decodeAttribution(encodeAttribution(a))).toEqual(a);
    const b = { source: "viber", medium: null, campaign: null, content: null };
    expect(decodeAttribution(encodeAttribution(b))).toEqual(b);
  });
  it("хог, буруу угтвар, буруу хэсгийн тоо → null", () => {
    expect(decodeAttribution(undefined)).toBeNull();
    expect(decodeAttribution("garbage")).toBeNull();
    expect(decodeAttribution("v2~facebook~social~listing~x")).toBeNull();
    expect(decodeAttribution("v1~facebook~social")).toBeNull();
    expect(decodeAttribution("v1~facebook~a~b~c~d")).toBeNull();
    expect(decodeAttribution("v1~~social~listing~x")).toBeNull();
  });
  it("тарьсан тэмдэгтийг дахин цэвэрлэнэ", () => {
    expect(decodeAttribution("v1~Face<script>~so cial~'; drop~x")).toEqual({
      source: "face_script",
      medium: "so_cial",
      campaign: "drop",
      content: "x",
    });
  });
});

describe("optedOut", () => {
  it("Sec-GPC 1 / DNT 1", () => {
    expect(optedOut(headers({ "sec-gpc": "1" }))).toBe(true);
    expect(optedOut(headers({ dnt: "1" }))).toBe(true);
    expect(optedOut(headers({}))).toBe(false);
    expect(optedOut(headers({ dnt: "0" }))).toBe(false);
  });
});

describe("isBotUa", () => {
  it("мөлхөгч/скрипт", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
      "curl/8.4.0",
      "python-requests/2.31.0",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
      "",
    ]) {
      expect(isBotUa(ua), ua).toBe(true);
    }
    expect(isBotUa(null)).toBe(true);
    expect(isBotUa(CHROME, true)).toBe(true);
  });
  it("жинхэнэ хөтөч, апп доторх хөтөч, Cubot утас", () => {
    for (const ua of [CHROME, CUBOT, FB_INAPP, INSTAGRAM, VIBER]) {
      expect(isBotUa(ua), ua).toBe(false);
    }
  });
});

describe("shouldStampAttribution", () => {
  const base = { method: "GET", pathname: "/listings/x", nextIsBot: false };
  it("Chrome GET → true", () => {
    expect(shouldStampAttribution({ ...base, get: headers({ "user-agent": CHROME }) })).toBe(true);
  });
  it("бусад тохиолдолд false", () => {
    const ua = { "user-agent": CHROME };
    expect(shouldStampAttribution({ ...base, method: "POST", get: headers(ua) })).toBe(false);
    expect(shouldStampAttribution({ ...base, pathname: "/api/x", get: headers(ua) })).toBe(false);
    expect(shouldStampAttribution({ ...base, get: headers({ ...ua, "sec-gpc": "1" }) })).toBe(false);
    expect(shouldStampAttribution({ ...base, get: headers({ ...ua, dnt: "1" }) })).toBe(false);
    expect(shouldStampAttribution({ ...base, nextIsBot: true, get: headers(ua) })).toBe(false);
    expect(shouldStampAttribution({ ...base, get: headers({}) })).toBe(false);
    expect(shouldStampAttribution({ ...base, get: headers({ "user-agent": "curl/8.4.0" }) })).toBe(false);
  });
});

describe("attributionColumns / channelLabel", () => {
  it("null → {}", () => {
    expect(attributionColumns(null)).toEqual({});
  });
  it("багана", () => {
    expect(attributionColumns({ source: "viber", medium: "messenger", campaign: null, content: "x" })).toEqual({
      utm_source: "viber",
      utm_medium: "messenger",
      utm_campaign: null,
    });
  });
  it("шошго", () => {
    expect(channelLabel("unegui")).toBe("unegui.mn");
    expect(channelLabel("direct")).toBe("Шууд / бусад");
    expect(channelLabel("tiktok")).toBe("tiktok");
  });
});
