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
});
