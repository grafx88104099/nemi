import { describe, expect, it } from "vitest";

import {
  cleanText,
  clientKey,
  collectionSizeError,
  generateShortCode,
  generateToken,
  hashToken,
  isLikelyBot,
  isPlausibleToken,
  linkState,
  normalizePublicLinkSettings,
  openHouseState,
  publicLocation,
  shareOf,
} from "@/lib/crm/public-links";

describe("Токен", () => {
  it("санамсаргүй, URL-д аюулгүй, hash нь 64 hex", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(isPlausibleToken(a)).toBe(true);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(` ${a} `));
    expect(hashToken(a)).not.toBe(a);
  });
  it("богино код андуурагдах тэмдэгтгүй", () => {
    const c = generateShortCode();
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{14}$/);
    expect(isPlausibleToken(c)).toBe(true);
  });
  it("хэлбэр буруу токеныг DB рүү явуулахгүй", () => {
    for (const bad of ["", "abc", "a b c d e f g h i j", "x".repeat(65), "<script>alert(1)</script>", null, 5]) {
      expect(isPlausibleToken(bad)).toBe(false);
    }
  });
});

describe("Төлөв", () => {
  const s = normalizePublicLinkSettings({ open_house_grace_hours: 4, open_house_early_hours: 1 });
  it("холбоос: идэвхтэй / хугацаа дууссан / цуцалсан", () => {
    const now = new Date("2026-11-09T00:00:00Z");
    expect(linkState({ expires_at: "2026-11-10T00:00:00Z", revoked_at: null }, now)).toBe("active");
    expect(linkState({ expires_at: "2026-11-08T00:00:00Z", revoked_at: null }, now)).toBe("expired");
    expect(linkState({ expires_at: "2026-11-10T00:00:00Z", revoked_at: "2026-11-08T00:00:00Z" }, now)).toBe("revoked");
  });
  it("нээлттэй үзлэг зөвхөн тухайн хугацаанд бүртгэл авна", () => {
    const oh = { kind: "open_house" as const, starts_at: "2026-11-14T03:00:00Z", ends_at: "2026-11-14T06:00:00Z", revoked_at: null };
    expect(openHouseState(oh, s, new Date("2026-11-14T01:30:00Z"))).toBe("upcoming");
    expect(openHouseState(oh, s, new Date("2026-11-14T02:10:00Z"))).toBe("open");
    expect(openHouseState(oh, s, new Date("2026-11-14T09:59:00Z"))).toBe("open");
    expect(openHouseState(oh, s, new Date("2026-11-14T10:01:00Z"))).toBe("closed");
    expect(openHouseState({ ...oh, revoked_at: "2026-11-13T00:00:00Z" }, s, new Date("2026-11-14T04:00:00Z"))).toBe("revoked");
    expect(openHouseState({ kind: "permanent", starts_at: null, ends_at: null, revoked_at: null }, s)).toBe("open");
  });
});

describe("Хамгаалалт, нууцлал", () => {
  it("холбоосын урьдчилсан харагдацын ботыг таньна", () => {
    expect(isLikelyBot("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")).toBe(true);
    expect(isLikelyBot("TelegramBot (like TwitterBot)")).toBe(true);
    expect(isLikelyBot("WhatsApp/2.23.20.0")).toBe(true);
    expect(isLikelyBot(null)).toBe(true);
    expect(
      isLikelyBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
    ).toBe(false);
  });
  it("давтамжийн түлхүүр IP-г ил хадгалахгүй, өдөр бүр солигдоно", () => {
    const k1 = clientKey("10.0.0.1", "UA", "2026-11-09", "s");
    expect(k1).not.toContain("10.0.0.1");
    expect(k1).toBe(clientKey("10.0.0.1", "UA", "2026-11-09", "s"));
    expect(k1).not.toBe(clientKey("10.0.0.1", "UA", "2026-11-10", "s"));
  });
  it("хаягаас байр, тоот гаргахгүй", () => {
    expect(publicLocation({ district: "Баянзүрх", complex: "River", building: "1", unit: "101", khoroo: "4" })).toBe("Баянзүрх, River");
    expect(publicLocation(null)).toBe("");
  });
  it("текст цэвэрлэгээ, жагсаалтын хэмжээ", () => {
    expect(cleanText("  сайн\n\u0007 байна  ", 100)).toBe("сайн байна");
    expect(cleanText("x".repeat(20), 5)).toBe("xxxxx");
    expect(cleanText("   ", 5)).toBeNull();
    const s = normalizePublicLinkSettings({ collection_min_items: 3, collection_max_items: 7 });
    expect(collectionSizeError(2, s)).toMatch(/3/);
    expect(collectionSizeError(8, s)).toMatch(/7/);
    expect(collectionSizeError(5, s)).toBeNull();
  });
  it("ангиллын эзлэх хувь", () => {
    expect(shareOf({ price: 3, location: 1, layout: 0 })).toEqual([
      { key: "price", count: 3, pct: 75 },
      { key: "location", count: 1, pct: 25 },
    ]);
  });
});
