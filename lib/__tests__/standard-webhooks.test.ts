import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";

import { secretKeyBytes, verifyStandardWebhook } from "@/lib/auth/standard-webhooks";

// Standard Webhooks-ийн каноник жишээ (спецификацын тест вектор).
const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
const TS = "1614265330";
const PAYLOAD = '{"test": 2432232314}';
const SIG = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=";
const NOW = 1614265330;

function sign(secret: string, id: string, ts: string, payload: string) {
  return "v1," + createHmac("sha256", secretKeyBytes(secret)).update(`${id}.${ts}.${payload}`).digest("base64");
}

const base = { payload: PAYLOAD, id: ID, timestamp: TS, signature: SIG, secret: SECRET, nowSec: NOW };

describe("verifyStandardWebhook", () => {
  it("каноник вектор", () => {
    expect(verifyStandardWebhook(base)).toBe(true);
    expect(verifyStandardWebhook({ ...base, secret: `v1,${SECRET}` })).toBe(true);
  });
  it("өөрөө гарын үсэг зурсныг шалгана", () => {
    const secret = "v1,whsec_" + Buffer.from("super-secret-key-bytes-0123456789").toString("base64");
    const ts = "1700000000";
    const body = JSON.stringify({ user: { id: "u" }, sms: { otp: "123456" } });
    const signature = sign(secret, "msg_1", ts, body);
    expect(
      verifyStandardWebhook({ payload: body, id: "msg_1", timestamp: ts, signature, secret, nowSec: 1700000100 })
    ).toBe(true);
  });
  it("хуурамч/дутуу оролт → false", () => {
    expect(verifyStandardWebhook({ ...base, payload: '{"test": 1}' })).toBe(false);
    expect(verifyStandardWebhook({ ...base, secret: "whsec_" + Buffer.from("other").toString("base64") })).toBe(false);
    expect(verifyStandardWebhook({ ...base, id: null })).toBe(false);
    expect(verifyStandardWebhook({ ...base, timestamp: null })).toBe(false);
    expect(verifyStandardWebhook({ ...base, signature: null })).toBe(false);
    expect(verifyStandardWebhook({ ...base, secret: "" })).toBe(false);
    expect(verifyStandardWebhook({ ...base, secret: "whsec_" })).toBe(false);
  });
  it("хугацаа (±300 сек) ба бүхэл бус timestamp", () => {
    expect(verifyStandardWebhook({ ...base, nowSec: NOW + 301 })).toBe(false);
    expect(verifyStandardWebhook({ ...base, nowSec: NOW - 301 })).toBe(false);
    expect(verifyStandardWebhook({ ...base, nowSec: NOW + 299 })).toBe(true);
    expect(verifyStandardWebhook({ ...base, timestamp: "1614265330.5" })).toBe(false);
    expect(verifyStandardWebhook({ ...base, timestamp: "abc" })).toBe(false);
  });
  it("зөвхөн v2 оруулга → false; олон гарын үсгээс хоёр дахь нь зөв → true", () => {
    expect(verifyStandardWebhook({ ...base, signature: SIG.replace("v1,", "v2,") })).toBe(false);
    expect(verifyStandardWebhook({ ...base, signature: `v1,AAAA ${SIG}` })).toBe(true);
    expect(verifyStandardWebhook({ ...base, signature: `v2,xyz ${SIG}` })).toBe(true);
  });
  it("нууцын төгсгөлийн мөр шилжилтийг тэвчинэ", () => {
    expect(verifyStandardWebhook({ ...base, secret: `${SECRET}\n` })).toBe(true);
  });
});
