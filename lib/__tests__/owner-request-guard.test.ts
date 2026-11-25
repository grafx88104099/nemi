import { describe, expect, it } from "vitest";

import {
  OWNER_REQUEST_HONEYPOT,
  OWNER_REQUEST_IP_MAX,
  OWNER_REQUEST_OFFICE_DAILY_CAP,
  ownerRequestIpKey,
  splitHoneypot,
} from "@/lib/owner-request-guard";
import { validateOwnerRequest } from "@/lib/validation/owner";

const OFFICE = "11111111-1111-4111-8111-111111111111";
const form = { office_id: OFFICE, contact_name: "Бат", contact_phone: "99112233", deal_type: "sale" };

describe("owner request guard", () => {
  it("хоосон honeypot — хүсэлт хэвийн, .strict() схемд илүү түлхүүр очихгүй", () => {
    const { trap, rest } = splitHoneypot({ ...form, [OWNER_REQUEST_HONEYPOT]: "" });
    expect(trap).toBe(false);
    expect(OWNER_REQUEST_HONEYPOT in rest).toBe(false);
    expect("data" in validateOwnerRequest(rest)).toBe(true);
  });

  it("бөглөгдсөн honeypot — бот", () => {
    expect(splitHoneypot({ ...form, website: "http://spam" }).trap).toBe(true);
    expect(splitHoneypot({ ...form, website: "   " }).trap).toBe(false);
    expect(splitHoneypot(null)).toEqual({ trap: false, rest: {} });
  });

  it("IP түлхүүр богино, түүхий IP агуулахгүй", () => {
    const hash = "a".repeat(64);
    expect(ownerRequestIpKey(hash)).toBe(`owner-req:${hash}`);
    expect(ownerRequestIpKey(hash + "extra").length).toBeLessThanOrEqual(200);
  });

  it("хязгаар", () => {
    expect(OWNER_REQUEST_IP_MAX).toBe(5);
    expect(OWNER_REQUEST_OFFICE_DAILY_CAP).toBe(30);
  });
});
