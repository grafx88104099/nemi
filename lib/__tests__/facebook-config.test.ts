import { describe, expect, it } from "vitest";

import {
  canPostFacebook,
  DEFAULT_GRAPH_VERSION,
  mapGraphError,
  parseFbConfig,
  postUrl,
  type FbConfig,
} from "@/lib/distribute/facebook-config";

const OFFICE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OTHER = "11111111-2222-3333-4444-555555555555";

describe("parseFbConfig", () => {
  it("id эсвэл токенгүй бол null", () => {
    expect(parseFbConfig({})).toBeNull();
    expect(parseFbConfig({ FB_PAGE_ID: "1234567890" })).toBeNull();
    expect(parseFbConfig({ FB_PAGE_ACCESS_TOKEN: "tok" })).toBeNull();
    expect(parseFbConfig({ FB_PAGE_ID: "1234567890", FB_PAGE_ACCESS_TOKEN: "  " })).toBeNull();
  });
  it("тоон биш page id → null", () => {
    expect(parseFbConfig({ FB_PAGE_ID: "nemi.mn", FB_PAGE_ACCESS_TOKEN: "tok" })).toBeNull();
    expect(parseFbConfig({ FB_PAGE_ID: "123", FB_PAGE_ACCESS_TOKEN: "tok" })).toBeNull();
  });
  it("хувилбарын fallback", () => {
    const env = { FB_PAGE_ID: "1234567890", FB_PAGE_ACCESS_TOKEN: "tok" };
    expect(parseFbConfig(env)?.version).toBe(DEFAULT_GRAPH_VERSION);
    expect(parseFbConfig({ ...env, FB_GRAPH_VERSION: "27.0" })?.version).toBe(DEFAULT_GRAPH_VERSION);
    expect(parseFbConfig({ ...env, FB_GRAPH_VERSION: "v27.0" })?.version).toBe("v27.0");
  });
  it("officeId зөвхөн uuid", () => {
    const env = { FB_PAGE_ID: "1234567890", FB_PAGE_ACCESS_TOKEN: "tok" };
    expect(parseFbConfig({ ...env, FB_PAGE_OFFICE_ID: "office-1" })?.officeId).toBeNull();
    expect(parseFbConfig({ ...env, FB_PAGE_OFFICE_ID: OFFICE.toUpperCase() })?.officeId).toBe(OFFICE);
  });
});

describe("canPostFacebook", () => {
  const cfg: FbConfig = { pageId: "1", token: "t", version: "v26.0", officeId: OFFICE };
  it("admin", () => {
    expect(canPostFacebook({ role: "admin", myOfficeId: null, listingOfficeId: OTHER, cfg })).toBe(true);
  });
  it("office_admin: хоёр оффис cfg.officeId-тэй тэнцүү бол л", () => {
    expect(canPostFacebook({ role: "office_admin", myOfficeId: OFFICE, listingOfficeId: OFFICE, cfg })).toBe(true);
    expect(canPostFacebook({ role: "office_admin", myOfficeId: OFFICE, listingOfficeId: OTHER, cfg })).toBe(false);
    expect(canPostFacebook({ role: "office_admin", myOfficeId: OTHER, listingOfficeId: OTHER, cfg })).toBe(false);
  });
  it("cfg.officeId null бол office_admin false", () => {
    expect(
      canPostFacebook({ role: "office_admin", myOfficeId: OFFICE, listingOfficeId: OFFICE, cfg: { ...cfg, officeId: null } })
    ).toBe(false);
  });
  it("агент, cfg null", () => {
    expect(canPostFacebook({ role: "agent", myOfficeId: OFFICE, listingOfficeId: OFFICE, cfg })).toBe(false);
    expect(canPostFacebook({ role: "admin", myOfficeId: null, listingOfficeId: null, cfg: null })).toBe(false);
  });
});

describe("mapGraphError / postUrl", () => {
  it("код", () => {
    expect(mapGraphError(190)).toMatch(/токен/);
    expect(mapGraphError(200)).toMatch(/pages_manage_posts/);
    expect(mapGraphError(10)).toMatch(/pages_manage_posts/);
    expect(mapGraphError(1)).toMatch(/Дахин оролдоно/);
    expect(mapGraphError(undefined)).toMatch(/Дахин оролдоно/);
  });
  it("postUrl", () => {
    expect(postUrl("123_456")).toBe("https://www.facebook.com/123_456");
  });
});
