import { describe, expect, it } from "vitest";

import { isStaleListing, STALE_LISTING_DAYS } from "@/lib/listing-freshness";

const NOW = new Date("2026-11-25T04:00:00Z");

describe("isStaleListing — 60 хоногоос өмнө нийтэлсэн зар", () => {
  it("60 хоногоос олон → хуучирсан", () => {
    expect(STALE_LISTING_DAYS).toBe(60);
    expect(isStaleListing("2026-06-04T00:00:00Z", NOW)).toBe(true);
    expect(isStaleListing("2026-09-25T03:00:00Z", NOW)).toBe(true); // 61 хоног
  });

  it("60 хоног хүртэл → хуучраагүй", () => {
    expect(isStaleListing("2026-09-26T04:00:00Z", NOW)).toBe(false); // яг 60
    expect(isStaleListing("2026-11-24T00:00:00Z", NOW)).toBe(false);
  });

  it("огноогүй, буруу огноо → дохиогүй", () => {
    expect(isStaleListing(null, NOW)).toBe(false);
    expect(isStaleListing(undefined, NOW)).toBe(false);
    expect(isStaleListing("not-a-date", NOW)).toBe(false);
  });
});
