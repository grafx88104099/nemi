import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

// Service-role клиентийн хуурамч хувилбар: phone_otp_sends-ийн тоолол ба insert.
const db = vi.hoisted(() => ({
  count: 0,
  countError: null as null | { message: string },
  inserts: [] as unknown[],
  // rate_limit_hit-ийн атомар тоолуур (key → hits).
  hits: new Map<string, number>(),
  rpcError: null as null | { message: string },
  rpcCalls: [] as unknown[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: { p_key: string; p_window_seconds: number; p_max: number }) => {
      if (fn !== "rate_limit_hit") throw new Error("unexpected rpc " + fn);
      db.rpcCalls.push(args);
      if (db.rpcError) return { data: null, error: db.rpcError };
      const n = (db.hits.get(args.p_key) ?? 0) + 1;
      db.hits.set(args.p_key, n);
      return { data: n <= args.p_max, error: null };
    },
    from: (table: string) => {
      if (table !== "phone_otp_sends") throw new Error("unexpected table " + table);
      return {
        select: () => ({
          eq: () => ({
            gte: async () => ({ count: db.count, error: db.countError }),
          }),
        }),
        insert: async (row: unknown) => {
          db.inserts.push(row);
          return { error: null };
        },
      };
    },
  }),
}));

import * as route from "@/app/api/auth/sms-hook/route";

const { POST } = route;

const SECRET = "v1,whsec_" + Buffer.from("test-hook-secret-0123456789abcdef").toString("base64");
const OTP = "482915";
const PHONE = "97699112233";

function sign(body: string, secret = SECRET) {
  const id = "msg_test_1";
  const ts = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.replace(/^v1,/, "").replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` };
}

function req(payload: unknown, headers?: Record<string, string>) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return new Request("https://www.nemi.mn/api/auth/sms-hook", {
    method: "POST",
    headers: { "content-type": "application/json", ...(headers ?? sign(body)) },
    body,
  });
}

const payload = (phone = PHONE, extra: Record<string, unknown> = {}) => ({
  user: { id: "00000000-0000-4000-8000-000000000001", phone, ...extra },
  sms: { otp: OTP },
});

let fetchMock: ReturnType<typeof vi.fn>;
let logs: unknown[][];

function configure() {
  vi.stubEnv("SUPABASE_SMS_HOOK_SECRET", SECRET);
  vi.stubEnv("SMS_API_URL", "https://sms.example.test/send");
  vi.stubEnv("SMS_API_TOKEN", "tok_secret");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
  vi.stubEnv("SMS_PROVIDER", "");
  vi.stubEnv("PHONE_OTP_MAX_PER_DAY", "");
  vi.stubEnv("SMS_OTP_TEMPLATE", "");
}

beforeEach(() => {
  db.count = 0;
  db.countError = null;
  db.inserts = [];
  db.hits = new Map();
  db.rpcError = null;
  db.rpcCalls = [];
  logs = [];
  fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  for (const k of ["log", "warn", "error", "info"] as const) {
    vi.spyOn(console, k).mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
  }
});

afterEach(() => {
  // Ямар ч лог мөрөнд OTP эсвэл бүтэн дугаар орохгүй.
  const flat = JSON.stringify(logs);
  expect(flat).not.toContain(OTP);
  expect(flat).not.toContain(PHONE);
  expect(flat).not.toContain("99112233");
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/auth/sms-hook", () => {
  it("env тохируулаагүй → 500, fetch дуудахгүй", async () => {
    vi.stubEnv("SUPABASE_SMS_HOOK_SECRET", "");
    vi.stubEnv("SMS_API_URL", "");
    vi.stubEnv("SMS_API_TOKEN", "");
    const res = await POST(req(payload()));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { http_code: 500, message: "Phone login is not configured" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("буруу гарын үсэг → 401", async () => {
    configure();
    const body = JSON.stringify(payload());
    const res = await POST(req(body, { ...sign(body), "webhook-signature": "v1,AAAA" }));
    expect(res.status).toBe(401);
    const res2 = await POST(req(body, {}));
    expect(res2.status).toBe(401);
    const res3 = await POST(req(body, sign(body, "v1,whsec_" + Buffer.from("other").toString("base64"))));
    expect(res3.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("+976 биш дугаар → 400, fetch дуудахгүй", async () => {
    configure();
    const res = await POST(req(payload("14155550100")));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.inserts).toHaveLength(0);
  });

  it("new_phone (дугаар солих) → 400", async () => {
    configure();
    const res = await POST(req(payload(PHONE, { new_phone: "97688112233" })));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("буруу бүтэц → 400", async () => {
    configure();
    const res = await POST(req({ user: { id: "x", phone: PHONE }, sms: { otp: "abc" } }));
    expect(res.status).toBe(400);
    const res2 = await POST(req("not json"));
    expect(res2.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("өдрийн хязгаар (5) → 400, fetch дуудахгүй", async () => {
    configure();
    db.count = 5;
    const res = await POST(req(payload()));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.inserts).toHaveLength(0);
  });

  it("атомар хязгаар: зэрэгцээ хүсэлтүүд гулсах тоог давсан ч max-аас илүү SMS гарахгүй", async () => {
    configure();
    db.count = 4; // SELECT бүгдэд 4 харагдана (уралдааны нөхцөл)
    const results = await Promise.all([0, 1, 2, 3].map(() => POST(req(payload()))));
    const ok = results.filter((r) => r.status === 200).length;
    expect(ok).toBe(4);
    // Өдрийн атомар тоолуур 5 хүртэл зөвшөөрнө — 6 дахь нь татгалзана.
    const more = await Promise.all([0, 1].map(() => POST(req(payload()))));
    expect(more.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const call = db.rpcCalls[0] as { p_key: string; p_window_seconds: number; p_max: number };
    expect(call.p_key).toMatch(/^otp:[0-9a-f]{64}$/);
    expect(call.p_window_seconds).toBe(86_400);
    expect(call.p_max).toBe(5);
  });

  it("хязгаарлагчийн алдаа → 500 (fail closed)", async () => {
    configure();
    db.rpcError = { message: "db down" };
    const res = await POST(req(payload()));
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.inserts).toHaveLength(0);
  });

  it("Content-Length-гүй (chunked) том body → 400, бүтнээр нь уншихгүй", async () => {
    configure();
    const big = new TextEncoder().encode("x".repeat(8192));
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        if (pulled > 100) c.close();
        else c.enqueue(big);
      },
    });
    const res = await POST(
      new Request("https://www.nemi.mn/api/auth/sms-hook", { method: "POST", body: stream, duplex: "half" } as RequestInit)
    );
    expect(res.status).toBe(400);
    expect(pulled).toBeLessThan(10);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("тоолуурын алдаа → 500 (fail closed)", async () => {
    configure();
    db.countError = { message: "db down" };
    const res = await POST(req(payload()));
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("амжилттай: 200, provider-т +976 дугаар, илгээлт бүртгэгдэнэ (hash, түүхий дугаар биш)", async () => {
    configure();
    db.count = 4;
    const res = await POST(req(payload()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const sent = JSON.parse(init.body as string);
    expect(sent.to).toBe("+97699112233");
    expect(sent.text).toContain(OTP);
    expect(db.inserts).toHaveLength(1);
    const row = db.inserts[0] as { phone_hash: string };
    expect(row.phone_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain("99112233");
  });

  it("+976 угтвартай «+» дугаарыг ч хүлээн авна", async () => {
    configure();
    const res = await POST(req(payload("+97699112233")));
    expect(res.status).toBe(200);
  });

  it("provider 500 → 500", async () => {
    configure();
    fetchMock.mockImplementation(async () => new Response("x", { status: 500 }));
    const res = await POST(req(payload()));
    expect(res.status).toBe(500);
  });

  it("GET экспортлохгүй (Next 405 буцаана)", () => {
    expect("GET" in route).toBe(false);
  });
});
