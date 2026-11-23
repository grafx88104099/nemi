import { describe, expect, it } from "vitest";

import { clientKey, createWindowLimiter } from "@/lib/window-limiter";

describe("createWindowLimiter", () => {
  it("цонхонд limit хүртэл зөвшөөрнө, дараа нь шинэчлэгдэнэ", () => {
    const l = createWindowLimiter({ limit: 3, windowMs: 1000 });
    expect([l.hit("a", 0), l.hit("a", 1), l.hit("a", 2), l.hit("a", 3)]).toEqual([true, true, true, false]);
    expect(l.hit("b", 3)).toBe(true);
    expect(l.hit("a", 1000)).toBe(true);
  });
  it("maxKeys хэтэрвэл хуучирсныг цэвэрлэнэ, үлдвэл бүгдийг", () => {
    const l = createWindowLimiter({ limit: 1, windowMs: 100, maxKeys: 3 });
    l.hit("a", 0);
    l.hit("b", 0);
    l.hit("c", 50);
    l.hit("d", 120); // a, b хуучирсан → цэвэрлэгдэнэ
    expect(l.size()).toBe(2);
    l.hit("e", 120);
    l.hit("f", 120); // c,d,e бүгд шинэ → clear
    expect(l.size()).toBeLessThanOrEqual(3);
  });
});

describe("clientKey", () => {
  const get = (h: Record<string, string>) => (n: string) => h[n] ?? null;
  it("эхний x-forwarded-for hop", () => {
    expect(clientKey(get({ "x-forwarded-for": " 1.2.3.4 , 5.6.7.8" }))).toBe("1.2.3.4");
    expect(clientKey(get({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientKey(get({}))).toBe("?");
  });
});
