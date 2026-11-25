import { describe, expect, it } from "vitest";

import { cronAuthError } from "@/lib/crm/cron-auth";

const req = (url = "https://nemi.mn/api/cron/search-alerts", auth?: string) =>
  new Request(url, auth ? { headers: { authorization: auth } } : undefined);

describe("cronAuthError", () => {
  it("production-д CRON_SECRET тохируулаагүй бол хаалттай", () => {
    expect(cronAuthError(req(), { VERCEL_ENV: "production" })).toEqual({ status: 503, error: "CRON_SECRET тохируулаагүй" });
    expect(cronAuthError(req(), { VERCEL_ENV: "preview" })?.status).toBe(503);
    expect(cronAuthError(req(), { NODE_ENV: "production" })?.status).toBe(503);
    // Хоосон утга = тохируулаагүй
    expect(cronAuthError(req(undefined, "Bearer "), { CRON_SECRET: "", VERCEL_ENV: "production" })?.status).toBe(503);
  });

  it("локал хөгжүүлэлтэд CRON_SECRET-гүй бол нээлттэй", () => {
    expect(cronAuthError(req(), { NODE_ENV: "development" })).toBeNull();
  });

  it("зөв Bearer токен бол зөвшөөрнө", () => {
    const env = { CRON_SECRET: "s3cret", VERCEL_ENV: "production" };
    expect(cronAuthError(req(undefined, "Bearer s3cret"), env)).toBeNull();
  });

  it("?key= query string-ийг хүлээн авахгүй (зөвхөн толгой)", () => {
    const env = { CRON_SECRET: "s3cret", VERCEL_ENV: "production" };
    expect(cronAuthError(req("https://nemi.mn/api/cron/search-alerts?key=s3cret"), env)?.status).toBe(401);
  });

  it("буруу эсвэл дутуу түлхүүрт 401", () => {
    const env = { CRON_SECRET: "s3cret", VERCEL_ENV: "production" };
    expect(cronAuthError(req(), env)?.status).toBe(401);
    expect(cronAuthError(req(undefined, "Bearer wrong!"), env)?.status).toBe(401);
    expect(cronAuthError(req(undefined, "Bearer s3cre"), env)?.status).toBe(401);
    expect(cronAuthError(req(undefined, "s3cret"), env)?.status).toBe(401);
    expect(cronAuthError(req("https://nemi.mn/api/cron/search-alerts?key="), env)?.status).toBe(401);
  });
});
