import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { listingObjectPath, listingPublicObjectUrl, listingsPublicPrefix, sniffImage } from "@/lib/crm2/queries/import";
import { hintsFromRows, mostCommon } from "@/lib/crm2/queries/project-hints";
import { digestPushAllowed, digestPushBody, digestPushTarget, isStaleEmptyDraft, teamFillStats } from "@/lib/crm2/queries/incomplete";
import { aggregateStaffMetrics, median } from "@/lib/crm2/queries/metrics";

const SB = "https://abcd1234.supabase.co";
const PREFIX = `${SB}/storage/v1/object/public/listings/`;

describe("listingsPublicPrefix", () => {
  it("төгсгөлийн «/»-г үл тооно; https биш / хоосон → null", () => {
    expect(listingsPublicPrefix(SB)).toBe(PREFIX);
    expect(listingsPublicPrefix(`${SB}/`)).toBe(PREFIX);
    expect(listingsPublicPrefix("http://abcd.supabase.co")).toBeNull();
    expect(listingsPublicPrefix("")).toBeNull();
    expect(listingsPublicPrefix(undefined)).toBeNull();
    expect(listingsPublicPrefix("https://a.co/path")).toBeNull();
  });
});

describe("listingObjectPath (R25 — URL-аар хэзээ ч татахгүй)", () => {
  it("манай нийтийн listings bucket-ийн хаяг → объектын зам", () => {
    expect(listingObjectPath(`${PREFIX}agent-1/abc_01.jpg`, SB)).toBe("agent-1/abc_01.jpg");
    expect(listingObjectPath(`${PREFIX}a/b/c.webp`, SB, "a/b/c.webp")).toBe("a/b/c.webp");
  });

  it("өөр хост, өөр bucket, http, хуурамч угтвар → null", () => {
    expect(listingObjectPath("https://evil.example/storage/v1/object/public/listings/a.jpg", SB)).toBeNull();
    expect(listingObjectPath(`${SB}/storage/v1/object/public/crm2-media/a.jpg`, SB)).toBeNull();
    expect(listingObjectPath(`${SB}/storage/v1/object/sign/listings/a.jpg`, SB)).toBeNull();
    expect(listingObjectPath(PREFIX.replace("https", "http") + "a.jpg", SB)).toBeNull();
    expect(listingObjectPath(`https://abcd1234.supabase.co.evil.example/storage/v1/object/public/listings/a.jpg`, SB)).toBeNull();
    expect(listingObjectPath(`https://user@abcd1234.supabase.co/storage/v1/object/public/listings/a.jpg`, SB)).toBeNull();
  });

  it("аюултай зам (.., кодлосон, зай, //, query, эхний цэг) → null", () => {
    for (const bad of [
      "../secret.jpg",
      "a/../b.jpg",
      "%2e%2e/a.jpg",
      "a%2Fb.jpg",
      "a b.jpg",
      "a//b.jpg",
      "a.jpg?x=1",
      "a.jpg#f",
      ".hidden/a.jpg",
      "a/.b.jpg",
      "a/",
      "",
      "a\\b.jpg",
    ]) {
      expect(listingObjectPath(PREFIX + bad, SB), bad).toBeNull();
    }
    expect(listingObjectPath(PREFIX + "a".repeat(501), SB)).toBeNull();
  });

  it("RPC-ийн path-тай таарахгүй бол null; url биш утга → null", () => {
    expect(listingObjectPath(`${PREFIX}a/b.jpg`, SB, "a/c.jpg")).toBeNull();
    expect(listingObjectPath(null, SB)).toBeNull();
    expect(listingObjectPath(`${PREFIX}a.jpg`, null)).toBeNull();
  });
});

describe("listingPublicObjectUrl — татах URL-ийг сервер талд угсарна", () => {
  it("баталгаажсан замаас манай төслийн нийтийн URL (хост = NEXT_PUBLIC_SUPABASE_URL)", () => {
    expect(listingPublicObjectUrl(SB, "wm/a1c635f0/1700000000-0-123.jpg")).toBe(`${PREFIX}wm/a1c635f0/1700000000-0-123.jpg`);
    expect(listingPublicObjectUrl(`${SB}/`, "a/b.webp")).toBe(`${PREFIX}a/b.webp`);
  });
  it("аюултай зам, буруу суурь URL → null (өөр хост руу хэзээ ч хандахгүй)", () => {
    expect(listingPublicObjectUrl(SB, "../x.jpg")).toBeNull();
    expect(listingPublicObjectUrl(SB, "a/../../b.jpg")).toBeNull();
    expect(listingPublicObjectUrl(SB, "https://evil.example/x.jpg")).toBeNull();
    expect(listingPublicObjectUrl(SB, "a?x=1")).toBeNull();
    expect(listingPublicObjectUrl(SB, "")).toBeNull();
    expect(listingPublicObjectUrl("http://abcd.supabase.co", "a.jpg")).toBeNull();
    expect(listingPublicObjectUrl(undefined, "a.jpg")).toBeNull();
  });
});

describe("sniffImage (magic bytes)", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  it("JPEG / PNG / WebP", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toEqual({ mime: "image/png", ext: "png" });
    expect(sniffImage(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP"), ...ascii("VP8 ")))).toEqual({ mime: "image/webp", ext: "webp" });
  });
  it("GIF, SVG, HTML, PDF, хоосон, RIFF-WAVE → null", () => {
    expect(sniffImage(bytes(...ascii("GIF89a")))).toBeNull();
    expect(sniffImage(bytes(...ascii("<svg xmlns")))).toBeNull();
    expect(sniffImage(bytes(...ascii("<!DOCTYPE html>")))).toBeNull();
    expect(sniffImage(bytes(...ascii("%PDF-1.4")))).toBeNull();
    expect(sniffImage(bytes())).toBeNull();
    expect(sniffImage(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WAVE")))).toBeNull();
  });
});

describe("project hints", () => {
  it("mostCommon: хоосныг алгасна, тэнцвэл эхнийх", () => {
    expect(mostCommon(["ХУД", "СБД", "ХУД", null, ""])).toBe("ХУД");
    expect(mostCommon([18, 12, 12, 18])).toBe(18);
    expect(mostCommon([null, undefined])).toBeNull();
  });
  it("hintsFromRows: мөргүй эсвэл утгагүй бол null", () => {
    expect(hintsFromRows([])).toBeNull();
    expect(hintsFromRows([{ district: null, building_floors: null, year_in_use: null }])).toBeNull();
    expect(
      hintsFromRows([
        { district: "ХУД", building_floors: 16, year_in_use: 2019 },
        { district: "ХУД", building_floors: 16, year_in_use: null },
        { district: "СБД", building_floors: 12, year_in_use: 2019 },
      ])
    ).toEqual({ district: "ХУД", building_floors: 16, year_in_use: 2019, sample: 3 });
  });
});

describe("incomplete helpers", () => {
  const old = "2026-11-01T00:00:00Z";
  const now = Date.parse("2026-11-24T00:00:00Z");
  const blank = { status: "draft", created_at: old, area_m2: null, price: null, district: null, project_id: null };
  it("isStaleEmptyDraft: 14+ хоног, юу ч бөглөөгүй ноорог л", () => {
    expect(isStaleEmptyDraft(blank, 0, false, now)).toBe(true);
    expect(isStaleEmptyDraft({ ...blank, created_at: "2026-11-20T00:00:00Z" }, 0, false, now)).toBe(false);
    expect(isStaleEmptyDraft({ ...blank, status: "active" }, 0, false, now)).toBe(false);
    expect(isStaleEmptyDraft(blank, 1, false, now)).toBe(false);
    expect(isStaleEmptyDraft(blank, 0, true, now)).toBe(false);
    expect(isStaleEmptyDraft({ ...blank, price: 1 }, 0, false, now)).toBe(false);
  });

  it("teamFillStats: агент бүрийн дундаж (бага нь эхэнд)", () => {
    const item = (agent: string | null, percent: number) =>
      ({ listingAgentId: agent, listingAgentName: agent ? `N${agent}` : null, percent }) as never;
    expect(teamFillStats([item("a", 50), item("a", 100), item("b", 20), item(null, 0)])).toEqual([
      { agentId: "b", name: "Nb", count: 1, avgPercent: 20 },
      { agentId: "a", name: "Na", count: 2, avgPercent: 75 },
    ]);
  });

  it("digestPushBody: зөвхөн тоо; «гэрээ бүртгэгдээгүй», батлах мөргүй (20261125000100)", () => {
    expect(digestPushBody({ properties: 3, owner: 1, contract: 2, contract_file: 1 })).toBe(
      "3 хөрөнгө дутуу: 1 эзэн, 2 гэрээ, 1 гэрээ бүртгэгдээгүй"
    );
    // Хуучин counts.approve-ийг үл тооно.
    expect(digestPushBody({ properties: 3, owner: 1, contract: 2, contract_file: 0, approve: 1 })).toBe("3 хөрөнгө дутуу: 1 эзэн, 2 гэрээ");
    expect(digestPushBody({ properties: 0, approve: 2 })).toBe("Дутуу бүртгэлээ шалгана уу");
    expect(digestPushBody(null)).toBe("Дутуу бүртгэлээ шалгана уу");
    const body = digestPushBody({ properties: "99112233<script>", owner: -1 });
    expect(body).toBe("Дутуу бүртгэлээ шалгана уу");
  });

  it("digestPushBody ≙ crm2_daily_digest-ийн бичвэр (хамгийн сүүлийн миграц)", () => {
    const dir = path.resolve(__dirname, "../../../supabase/migrations");
    let body = "";
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      const re = /create (?:or replace )?function public\.crm2_daily_digest\b[\s\S]*?\$\$([\s\S]*?)\$\$/g;
      for (const m of fs.readFileSync(path.join(dir, f), "utf8").matchAll(re)) {
        body = m[1];
      }
    }
    expect(body).toContain("' хөрөнгө дутуу: '");
    expect(body).toContain("' эзэн'");
    expect(body).toContain("' гэрээ'");
    expect(body).toContain("' гэрээ бүртгэгдээгүй'");
    expect(body).not.toContain("батлахыг хүлээж");
    expect(body).toContain("'/agent/crm/staff/incomplete'");
  });

  it("digestPushTarget: үргэлж өнөөдрийн дутуу бүртгэл (батлах жагсаалт руу биш)", () => {
    for (const counts of [{ properties: 0, approve: 2 }, { properties: 1, approve: 2 }, null]) {
      expect(digestPushTarget(counts)).toEqual({ title: "Өнөөдрийн дутуу бүртгэл", url: "/agent/crm/staff/incomplete" });
    }
  });

  it("digestPushAllowed: хувийн сонголт > оффисын матриц > анхдагч", () => {
    expect(digestPushAllowed(["app"], ["app", "push"])).toBe(false);
    expect(digestPushAllowed(["app", "push"], ["app"])).toBe(true);
    expect(digestPushAllowed(null, ["app"])).toBe(false);
    expect(digestPushAllowed(undefined, ["push"])).toBe(true);
    expect(digestPushAllowed(null, null)).toBe(true);
  });
});

describe("metrics", () => {
  it("median", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(3);
  });
  it("aggregateStaffMetrics: тоо, медиан, хувь", () => {
    const rows = [
      { event: "quick_save", profile_id: "a", duration_ms: 60_000, meta: { first_input_ms: 40_000 } },
      { event: "quick_save", profile_id: "a", duration_ms: 120_000, meta: {} },
      { event: "full_save", profile_id: "b", duration_ms: 300_000, meta: {} },
      { event: "draft_restore_offer", profile_id: "a", duration_ms: null, meta: {} },
      { event: "draft_restored", profile_id: "a", duration_ms: null, meta: {} },
      { event: "quick_sent_background", profile_id: "a", duration_ms: null, meta: {} },
      { event: "owner_pending", profile_id: "a", duration_ms: null, meta: {} },
    ];
    const m = aggregateStaffMetrics(rows, { manual: 2, paste: 1 }, { since: "x", days: 14 });
    expect(m.quick).toEqual({ saves: 2, medianOpenToSaveMs: 90_000, medianFirstInputToSaveMs: 40_000 });
    expect(m.full).toEqual({ saves: 1, medianOpenToSaveMs: 300_000 });
    expect(m.restore).toEqual({ offers: 1, used: 1, auto: 0 });
    expect(m.background).toEqual({ queued: 0, sent: 1 });
    expect(m.ownerPending).toEqual({ count: 1, rate: 0.5 });
    expect(m.savesBySource).toEqual({ manual: 2, paste: 1 });
  });
});
