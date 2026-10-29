import { describe, expect, it } from "vitest";

import { cronAuthError } from "@/lib/crm/cron-auth";

const req = (url = "https://nemi.mn/api/cron/crm-daily", auth?: string) =>
  new Request(url, auth ? { headers: { authorization: auth } } : undefined);

describe("cronAuthError", () => {
  it("production-д CRON_SECRET тохируулаагүй бол хаалттай", () => {
    expect(cronAuthError(req(), { VERCEL_ENV: "production" })).toEqual({ status: 503, error: "CRON_SECRET тохируулаагүй" });
    expect(cronAuthError(req(), { VERCEL_ENV: "preview" })?.status).toBe(503);
    expect(cronAuthError(req(), { NODE_ENV: "production" })?.status).toBe(503);
  });

  it("локал хөгжүүлэлтэд CRON_SECRET-гүй бол нээлттэй", () => {
    expect(cronAuthError(req(), { NODE_ENV: "development" })).toBeNull();
  });

  it("зөв Bearer токен эсвэл ?key= бол зөвшөөрнө", () => {
    const env = { CRON_SECRET: "s3cret", VERCEL_ENV: "production" };
    expect(cronAuthError(req(undefined, "Bearer s3cret"), env)).toBeNull();
    expect(cronAuthError(req("https://nemi.mn/api/cron/crm-sla?key=s3cret"), env)).toBeNull();
  });

  it("буруу эсвэл дутуу түлхүүрт 401", () => {
    const env = { CRON_SECRET: "s3cret", VERCEL_ENV: "production" };
    expect(cronAuthError(req(), env)?.status).toBe(401);
    expect(cronAuthError(req(undefined, "Bearer wrong"), env)?.status).toBe(401);
    expect(cronAuthError(req("https://nemi.mn/api/cron/crm-sla?key="), env)?.status).toBe(401);
  });
});
