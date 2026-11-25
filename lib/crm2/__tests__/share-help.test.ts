import { describe, expect, it } from "vitest";

import { quickAddSettingText, sharePlatform } from "@/lib/crm2/share-help";

describe("sharePlatform", () => {
  it("Android, iPhone/iPad, бусад", () => {
    expect(sharePlatform("Mozilla/5.0 (Linux; Android 14; SM-A546E) Chrome/130 Mobile")).toBe("android");
    expect(sharePlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(sharePlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("other");
    expect(sharePlatform(null)).toBe("other");
  });
});

describe("quickAddSettingText", () => {
  it("шуурхай бүртгэл нээлттэй — өмнөх бичвэр", () => {
    expect(quickAddSettingText(true, "ios")).toMatch(/^Танд нээлттэй/);
  });
  it("хаалттай: хуваалцсан зар шуурхай бүртгэлээр нээгдэнэ гэж ХУДАЛ хэлэхгүй", () => {
    for (const p of ["android", "ios", "other"] as const) {
      const text = quickAddSettingText(false, p);
      expect(text).toMatch(/^Бүрэн формоор бүртгэнэ\./);
      expect(text).not.toMatch(/шуурхай бүртгэлээр нээгдэнэ/);
    }
  });
  it("«Хуваалцах»-ыг зөвхөн Android-д, iPhone-д хуулж буулгахыг зааварлана", () => {
    expect(quickAddSettingText(false, "android")).toMatch(/Хуваалцах/);
    expect(quickAddSettingText(false, "ios")).toMatch(/хуулж, формд буулгана/);
    expect(quickAddSettingText(false, "other")).not.toMatch(/Хуваалцах/);
  });
});
