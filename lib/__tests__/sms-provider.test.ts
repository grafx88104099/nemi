import { afterEach, describe, it, expect, vi } from "vitest";

import { getSmsProvider } from "@/lib/sms/provider";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const HTTP = { SMS_API_URL: "https://sms.example.test/send", SMS_API_TOKEN: "tok_123", NODE_ENV: "test" };

describe("getSmsProvider", () => {
  it("env хоосон → null (унтраастай)", () => {
    expect(getSmsProvider({})).toBeNull();
    expect(getSmsProvider({ SMS_API_URL: HTTP.SMS_API_URL })).toBeNull();
    expect(getSmsProvider({ SMS_API_TOKEN: "x" })).toBeNull();
  });
  it("production-д http:// URL → null", () => {
    expect(getSmsProvider({ ...HTTP, SMS_API_URL: "http://sms.example.test", NODE_ENV: "production" })).toBeNull();
    expect(getSmsProvider({ ...HTTP, NODE_ENV: "production" })).not.toBeNull();
  });
  it("console нь production-д хаалттай; үл мэдэгдэх нэр → null", () => {
    expect(getSmsProvider({ SMS_PROVIDER: "console", NODE_ENV: "production" })).toBeNull();
    expect(getSmsProvider({ SMS_PROVIDER: "console", NODE_ENV: "development" })?.name).toBe("console");
    expect(getSmsProvider({ ...HTTP, SMS_PROVIDER: "twilio" })).toBeNull();
  });
  it("http: POST, Bearer, JSON {from,to,text}", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const p = getSmsProvider({ ...HTTP, SMS_SENDER: "NemiMN" })!;
    expect(await p.send({ to: "+97699112233", text: "code 1" })).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(HTTP.SMS_API_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok_123");
    expect(JSON.parse(init.body as string)).toEqual({ from: "NemiMN", to: "+97699112233", text: "code 1" });
  });
  it("анхдагч sender «Nemi»", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await getSmsProvider(HTTP)!.send({ to: "+97699112233", text: "t" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).from).toBe("Nemi");
  });
  it("2xx бус ба сүлжээний алдаа", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    expect(await getSmsProvider(HTTP)!.send({ to: "+1", text: "t" })).toEqual({
      ok: false,
      error: "http_500",
      retryable: true,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 400 })));
    expect(await getSmsProvider(HTTP)!.send({ to: "+1", text: "t" })).toEqual({
      ok: false,
      error: "http_400",
      retryable: false,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("boom tok_123");
      })
    );
    const r = await getSmsProvider(HTTP)!.send({ to: "+1", text: "t" });
    expect(r).toEqual({ ok: false, error: "network", retryable: true });
  });
});
