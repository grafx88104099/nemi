import { describe, it, expect } from "vitest";

import { safeNext } from "@/lib/nav";

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
});
