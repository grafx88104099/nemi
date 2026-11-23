import { describe, it, expect } from "vitest";

import { buildLoginRedirectUrl } from "@/lib/auth/login-redirect";

describe("buildLoginRedirectUrl", () => {
  it("query-г next-д хадгалж, нэвтрэх URL дээр давхар үлдээхгүй", () => {
    const u = buildLoginRedirectUrl(new URL("https://www.nemi.mn/account?tab=x"), "/login");
    expect(u.toString()).toBe("https://www.nemi.mn/login?next=%2Faccount%3Ftab%3Dx");
    expect(u.searchParams.get("tab")).toBeNull();
  });
  it("панелийн нэвтрэх зам", () => {
    const u = buildLoginRedirectUrl(new URL("https://www.nemi.mn/agent/crm/staff?q=1"), "/agent/login");
    expect(u.toString()).toBe("https://www.nemi.mn/agent/login?next=%2Fagent%2Fcrm%2Fstaff%3Fq%3D1");
  });
  it("hash хаягдана, оролтын URL өөрчлөгдөхгүй", () => {
    const src = new URL("https://www.nemi.mn/office/agents#top");
    const u = buildLoginRedirectUrl(src, "/office/login");
    expect(u.hash).toBe("");
    expect(u.toString()).toBe("https://www.nemi.mn/office/login?next=%2Foffice%2Fagents");
    expect(src.toString()).toBe("https://www.nemi.mn/office/agents#top");
  });
});
