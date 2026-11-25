import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";

type Rule = { source: string; headers: { key: string; value: string }[] };

describe("next.config headers()", () => {
  it("бүх замд clickjacking, nosniff, referrer толгой", async () => {
    const rules = (await nextConfig.headers!()) as Rule[];
    const all = rules.find((r) => r.source === "/:path*");
    expect(all).toBeDefined();
    const h = Object.fromEntries(all!.headers.map((x) => [x.key, x.value]));
    expect(h["Content-Security-Policy"]).toBe("frame-ancestors 'self'");
    expect(h["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    // Зөвхөн frame-ancestors — script/img/connect хязгаарлахгүй (Supabase, Google Maps хэвээр).
    expect(h["Content-Security-Policy"]).not.toMatch(/script-src|img-src|connect-src|default-src/);
  });

  it("/sw.js-ийн CSP нь ерөнхий мөрийн ДАРАА (сүүлийнх давамгайлна)", async () => {
    const rules = (await nextConfig.headers!()) as Rule[];
    const iAll = rules.findIndex((r) => r.source === "/:path*");
    const iSw = rules.findIndex((r) => r.source === "/sw.js");
    expect(iAll).toBeGreaterThanOrEqual(0);
    expect(iSw).toBeGreaterThan(iAll);
    const sw = Object.fromEntries(rules[iSw].headers.map((x) => [x.key, x.value]));
    expect(sw["Content-Security-Policy"]).toBe("default-src 'self'; script-src 'self'");
  });
});
