import { describe, expect, it } from "vitest";

import { LISTING_STATUSES, LISTING_STATUS, listingStatusMeta } from "@/lib/constants";

/**
 * Өгөгдлийн сангийн listing_status enum-ийн БҮХ утга (маягтаар сонгогддоггүй
 * нь ч) монгол нэртэй байх ёстой — эс бөгөөс хэрэглэгчид «withdrawn» гэсэн
 * англи enum харагдана.
 */
const DB_STATUSES = ["active", "draft", "review", "sold", "rented", "paused", "withdrawn"] as const;

describe("listingStatusMeta", () => {
  it("DB-ийн бүх төлөв монгол нэртэй", () => {
    for (const s of DB_STATUSES) {
      const { label } = listingStatusMeta(s);
      expect(label, s).not.toBe(s);
      expect(label, s).toMatch(/^[^a-zA-Z]+$/);
    }
  });

  it("маягтын төлвүүдтэй нэг ижил нэр хэрэглэнэ", () => {
    for (const s of LISTING_STATUSES) {
      expect(listingStatusMeta(s)).toEqual(LISTING_STATUS[s]);
    }
  });

  it("танихгүй төлвийг хаяхгүй, нэрээр нь харуулна", () => {
    expect(listingStatusMeta("brand_new_state")).toEqual({ label: "brand_new_state", tone: "neutral" });
  });
});
