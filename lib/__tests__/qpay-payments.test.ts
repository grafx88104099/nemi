import { describe, expect, it } from "vitest";

import {
  PREMIER_PRICE,
  QPAY_CHECK_MAX,
  QPAY_CHECK_WINDOW_SECONDS,
  parseSubscriptionId,
  qpayCheckRateKey,
  summarizePaidRows,
} from "@/lib/qpay/payments";

describe("summarizePaidRows", () => {
  it("зөвхөн PAID мөрийг тооцож, эхний payment_id-г буцаана", () => {
    const r = summarizePaidRows({
      count: 3,
      rows: [
        { payment_id: "p-0", payment_status: "NEW", payment_amount: 99000 },
        { payment_id: "p-1", payment_status: "PAID", payment_amount: "99000.00" },
        { payment_id: "p-2", payment_status: "REFUNDED", payment_amount: 99000 },
      ],
    });
    expect(r).toEqual({ paid: true, amount: 99000, paymentId: "p-1" });
  });

  it("REFUNDED/FAILED эсвэл статусгүй мөр төлөгдсөнд тооцогдохгүй", () => {
    expect(summarizePaidRows({ rows: [{ payment_status: "REFUNDED", payment_amount: 99000 }] }).paid).toBe(false);
    expect(summarizePaidRows({ rows: [{ payment_amount: 99000 }] }).paid).toBe(false);
    expect(summarizePaidRows({ rows: [{ payment_status: "PAID", payment_amount: "abc" }] }).paid).toBe(false);
  });

  it("буруу хэлбэрийн хариу", () => {
    expect(summarizePaidRows(null)).toEqual({ paid: false, amount: 0, paymentId: null });
    expect(summarizePaidRows({ rows: "x" })).toEqual({ paid: false, amount: 0, paymentId: null });
  });

  it("Premier үнэ", () => {
    expect(PREMIER_PRICE).toBe(99_000);
  });
});

describe("parseSubscriptionId", () => {
  it("зөвхөн uuid", () => {
    expect(parseSubscriptionId("6F1C2E3A-1111-4222-8333-944455556666")).toBe("6f1c2e3a-1111-4222-8333-944455556666");
    expect(parseSubscriptionId("1; drop table")).toBeNull();
    expect(parseSubscriptionId(null)).toBeNull();
    expect(parseSubscriptionId("")).toBeNull();
  });
});

describe("qpayCheckRateKey", () => {
  it("subscription бүрд тусдаа түлхүүр, хязгаар бага", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(qpayCheckRateKey(id)).toBe(`qpay:check:${id}`);
    expect(QPAY_CHECK_MAX).toBeLessThanOrEqual(10);
    expect(QPAY_CHECK_WINDOW_SECONDS).toBeGreaterThanOrEqual(60);
  });
});
