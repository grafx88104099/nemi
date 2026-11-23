import { describe, expect, it } from "vitest";

import { isBlocked, PRIVATE_PATHS } from "@/lib/seo/robots";

describe("isBlocked(PRIVATE_PATHS)", () => {
  it("нийтийн замууд нээлттэй", () => {
    const open = [
      "/",
      "/agents",
      "/agents/123",
      "/offices",
      "/offices/1",
      "/listings/1",
      "/sell",
      "/rent/afford",
      "/_next/image",
      "/news/x",
      "/map",
    ];
    for (const p of open) expect(isBlocked(p), p).toBe(false);
  });

  it("хувийн замууд хаалттай", () => {
    const blocked = [
      "/agent",
      "/agent/crm",
      "/agent/login",
      "/office",
      "/office/crm/staff",
      "/admin",
      "/admin/listings",
      "/api/cron/x",
      "/auth/callback",
      "/account",
      "/messages",
      "/favorites",
      "/sell/new",
      "/sell/edit/1",
      "/office-signup",
      "/login",
      "/me",
    ];
    for (const p of blocked) expect(isBlocked(p), p).toBe(true);
  });

  it("bare /agent, /office дүрэм байхгүй (/agents, /offices хаагдахгүй)", () => {
    expect(PRIVATE_PATHS).not.toContain("/agent");
    expect(PRIVATE_PATHS).not.toContain("/office");
  });
});
