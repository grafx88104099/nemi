import { describe, expect, it } from "vitest";

import {
  channelsFromRecord,
  formatCountsCompact,
  formatCountsLine,
  summarizeByChannel,
  summarizeByListing,
  topListings,
  ZERO_COUNTS,
} from "@/lib/distribute/stats-model";
import type { ChannelStatRow } from "@/lib/distribute/types";

const A = "aaaaaaaa-0000-0000-0000-000000000000";
const B = "bbbbbbbb-0000-0000-0000-000000000000";
const C = "cccccccc-0000-0000-0000-000000000000";

const rows: ChannelStatRow[] = [
  { listing_id: A, channel: "direct", views: "5", chats: "1", viewing_requests: "0" },
  { listing_id: A, channel: "facebook", views: 10, chats: 2, viewing_requests: 1 },
  { listing_id: A, channel: "tiktok", views: 1, chats: 0, viewing_requests: 0 },
  { listing_id: B, channel: "viber", views: "3", chats: "0", viewing_requests: "2" },
  { listing_id: B, channel: "google", views: 2, chats: 0, viewing_requests: 0 },
  { listing_id: C, channel: "unegui", views: 5, chats: 4, viewing_requests: 0 },
];

describe("summarizeByChannel", () => {
  it("дараалал: facebook, viber, unegui, бусад (цагаан толгой), direct", () => {
    expect(summarizeByChannel(rows).map((r) => r.channel)).toEqual([
      "facebook",
      "viber",
      "unegui",
      "google",
      "tiktok",
      "direct",
    ]);
  });
  it("string → number", () => {
    const direct = summarizeByChannel(rows).find((r) => r.channel === "direct");
    expect(direct).toEqual({ channel: "direct", views: 5, chats: 1, viewings: 0 });
  });
  it("хоосон", () => {
    expect(summarizeByChannel([])).toEqual([]);
  });
});

describe("summarizeByListing", () => {
  it("нийлбэр = сувгуудын нийлбэр", () => {
    const s = summarizeByListing(rows);
    expect(s[A]).toMatchObject({ views: 16, chats: 3, viewings: 1 });
    const sum = Object.values(s[A].byChannel).reduce((t, c) => t + c.views, 0);
    expect(sum).toBe(16);
    expect(s[B].byChannel.viber).toEqual({ views: 3, chats: 0, viewings: 2 });
  });
  it("ZERO_COUNTS-ийг өөрчлөхгүй", () => {
    summarizeByListing(rows);
    expect(ZERO_COUNTS).toEqual({ views: 0, chats: 0, viewings: 0 });
  });
});

describe("topListings", () => {
  it("үзэлтээр, дараа нь чатаар; хязгаар", () => {
    const top = topListings(rows, 5);
    expect(top.map((t) => t.listingId)).toEqual([A, C, B]);
    expect(topListings(rows, 1)).toHaveLength(1);
  });
});

describe("channelsFromRecord", () => {
  it("ижил дараалал", () => {
    const rec = { direct: { ...ZERO_COUNTS }, viber: { ...ZERO_COUNTS }, facebook: { ...ZERO_COUNTS } };
    expect(channelsFromRecord(rec).map((c) => c.channel)).toEqual(["facebook", "viber", "direct"]);
  });
});

describe("format", () => {
  it("мөр", () => {
    const c = { views: 12, chats: 1, viewings: 0 };
    expect(formatCountsLine(c)).toBe("12 үзэлт · 1 чат · 0 үзлэг");
    expect(formatCountsCompact(c)).toBe("12 · 1 · 0");
  });
});
