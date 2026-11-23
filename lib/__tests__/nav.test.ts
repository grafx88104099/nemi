import { describe, it, expect } from "vitest";

import { safeNext, loginHref, isAuthPath } from "@/lib/nav";

describe("safeNext", () => {
  it("prefix-тэй зөв замыг буцаана", () => {
    expect(safeNext("/office/agents", "/office", "/office")).toBe("/office/agents");
    expect(safeNext("/admin/users", "/admin", "/admin")).toBe("/admin/users");
  });
  it("login-loop-оос сэргийлнэ", () => {
    expect(safeNext("/office/login", "/office", "/office")).toBe("/office");
  });
  it("undefined үед fallback", () => {
    expect(safeNext(undefined, "/office", "/office")).toBe("/office");
  });
  it("гадны/буруу prefix-ийг блоклоно (open-redirect)", () => {
    expect(safeNext("https://evil.com", "/office", "/office")).toBe("/office");
    expect(safeNext("//evil.com", "/office", "/office")).toBe("/office");
    expect(safeNext("/admin/users", "/office", "/office")).toBe("/office");
  });
  it("хөтчийн хэвийн болгодог хувилбаруудыг блоклоно", () => {
    // Хөтөч `\`-ийг `/` болгодог тул эдгээр нь гадны хаяг болно.
    expect(safeNext("/\\evil.com", "/", "/")).toBe("/");
    expect(safeNext("\\\\evil.com", "/", "/")).toBe("/");
    expect(safeNext("/\t/evil.com", "/", "/")).toBe("/");
    expect(safeNext("javascript:alert(1)", "/", "/")).toBe("/");
    expect(safeNext("https://evil.com/office/agents", "/office", "/office")).toBe("/office");
  });
  it("нийтийн нэвтрэх хуудсанд (prefix «/») дотоод замыг зөвшөөрнө", () => {
    expect(safeNext("/account", "/", "/")).toBe("/account");
    expect(safeNext("/agent/crm/staff", "/", "/")).toBe("/agent/crm/staff");
    expect(safeNext("/listings?q=1#top", "/", "/")).toBe("/listings?q=1#top");
    // Нэвтрэх хуудас руу буцаавал давталт үүснэ.
    expect(safeNext("/login", "/", "/")).toBe("/");
  });
  it("query-г бүтнээр хадгална", () => {
    const p = "/listings?district=СБД&rooms=2&page=3";
    // URL нь кирилл query-г percent-encode хийнэ — утга нь ижил.
    expect(decodeURIComponent(safeNext(p, "/", "/"))).toBe(p);
    expect(safeNext("/agent/crm?q=1", "/agent", "/agent")).toBe("/agent/crm?q=1");
  });
  it("pathname-д суурилсан давталтын хамгаалалт", () => {
    expect(safeNext("/login?next=/x", "/", "/")).toBe("/");
    expect(safeNext("/signup?next=/a", "/", "/")).toBe("/");
    expect(safeNext("/forgot-password", "/", "/")).toBe("/");
    expect(safeNext("/auth/callback?code=1", "/", "/")).toBe("/");
    expect(safeNext("/office/login?x=1", "/office", "/office")).toBe("/office");
    // Кодлогдсон «?» нь pathname-д үлдэнэ (URL задлахгүй) → login зам биш тул буцаана.
    // Хөтөч ч мөн ийм замыг /office/login гэж үзэхгүй (404) — давталт үүсэхгүй.
    expect(safeNext("/office/login%3Fx%3D1", "/office", "/office")).toBe("/office/login%3Fx%3D1");
  });
  it("/reset-password-ийг зөвшөөрнө (auth/confirm)", () => {
    expect(safeNext("/reset-password", "/", "/")).toBe("/reset-password");
  });
  it("2048-аас урт next → fallback", () => {
    expect(safeNext("/" + "a".repeat(3000), "/", "/")).toBe("/");
    expect(safeNext("/" + "a".repeat(100), "/", "/")).toBe("/" + "a".repeat(100));
  });
});

describe("loginHref", () => {
  it("next-ийг бүтнээр encode хийнэ", () => {
    expect(loginHref("/listings?q=a b")).toBe("/login?next=%2Flistings%3Fq%3Da%20b");
    expect(loginHref("/favorites")).toBe("/login?next=%2Ffavorites");
    expect(loginHref("/office", "/office/login")).toBe("/office/login?next=%2Foffice");
  });
});

describe("isAuthPath", () => {
  it("нэвтрэлтийн хуудсыг таньна", () => {
    expect(isAuthPath("/login?next=x")).toBe(true);
    expect(isAuthPath("/signup")).toBe(true);
    expect(isAuthPath("/forgot-password")).toBe(true);
    expect(isAuthPath("/reset-password")).toBe(true);
    expect(isAuthPath("/auth/callback?code=1")).toBe(true);
    expect(isAuthPath("/listings")).toBe(false);
    expect(isAuthPath("/login-help")).toBe(false);
  });
});
