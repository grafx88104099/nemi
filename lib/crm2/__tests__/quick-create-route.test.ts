import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/crm2/quick-create ба /api/crm2/events route — supabase client-ийг mock хийнэ (сүлжээ, DB-гүй).
 */

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };

const state: {
  user: { id: string } | null;
  rpc: Record<string, RpcResult>;
  rpcCalls: { name: string; args: unknown }[];
  inserts: { table: string; row: unknown }[];
} = { user: null, rpc: {}, rpcCalls: [], inserts: [] };

const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    rpc: async (name: string, args: unknown) => {
      state.rpcCalls.push({ name, args });
      return state.rpc[name] ?? { data: null, error: { message: `unexpected rpc ${name}` } };
    },
    from: (table: string) => ({
      insert: async (row: unknown) => {
        state.inserts.push({ table, row });
        return { error: null };
      },
    }),
  }),
}));

import { POST as quickCreate } from "@/app/api/crm2/quick-create/route";
import { POST as uiEvent } from "@/app/api/crm2/events/route";

const KEY = "3f2b8c1e-7d4a-4b6e-9a1c-2d5e8f7a9b10";
const USER = "6a1d2c3b-4e5f-4a7b-8c9d-0e1f2a3b4c5d";
const OFFICE = "0c9e7a51-2b3d-4f6a-8e1c-5d7b9a3f1e20";
const PROP = "11111111-2222-4333-8444-555555555555";

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://nemi.mn${url}`, {
    method: "POST",
    headers: { host: "nemi.mn", origin: "https://nemi.mn", "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = { property: { category: "sale", client_key: KEY, rooms: 2 }, owner: { phone: "99112233" } };

beforeEach(() => {
  state.user = { id: USER };
  state.rpc = {};
  state.rpcCalls = [];
  state.inserts = [];
  revalidatePath.mockClear();
});

describe("POST /api/crm2/quick-create", () => {
  it("өөр Origin → 403 (CSRF), RPC дуудахгүй", async () => {
    const res = await quickCreate(post("/api/crm2/quick-create", validBody, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("session байхгүй → 401 {code:'auth'}", async () => {
    state.user = null;
    const res = await quickCreate(post("/api/crm2/quick-create", validBody));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "auth" });
  });

  it("буруу оролт → 400 {error, field}", async () => {
    const res = await quickCreate(
      post("/api/crm2/quick-create", { property: { category: "sale", client_key: KEY, floor: 20, building_floors: 9 } })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "floor" });

    const phone = await quickCreate(post("/api/crm2/quick-create", { ...validBody, owner: { phone: "123" } }));
    expect(phone.status).toBe(400);
    expect(await phone.json()).toEqual({ error: "Дугаар 8 оронтой байх ёстой", field: "owner.phone" });

    const broken = await quickCreate(post("/api/crm2/quick-create", "{not json"));
    expect(broken.status).toBe(400);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("64 КБ-аас том → 413", async () => {
    const res = await quickCreate(
      post("/api/crm2/quick-create", { property: { category: "sale", client_key: KEY, notes: "x".repeat(70_000) } })
    );
    expect(res.status).toBe(413);
  });

  it("DB алдаа → 422 {error, field} (dbErrorField)", async () => {
    state.rpc.crm2_create_property_quick = {
      data: null,
      error: { message: "CRM: «Тэрэлж» дүүрэг жагсаалтад алга", code: "P0001" },
    };
    const res = await quickCreate(post("/api/crm2/quick-create", validBody));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.field).toBe("district");
    expect(body.error).toMatch(/дүүрэг жагсаалтад алга/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("амжилт → 200 Crm2QuickCreateResult, RPC-д p_property/p_owner, CRM хуудсуудыг шинэчилнэ", async () => {
    state.rpc.crm2_create_property_quick = {
      data: { property_id: PROP, code: "P021", replayed: false, owner: { status: "created", contact_id: USER }, duplicates: [] },
      error: null,
    };
    const res = await quickCreate(post("/api/crm2/quick-create", validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      property_id: PROP,
      code: "P021",
      replayed: false,
      owner: { status: "created", contact_id: USER },
      duplicates: [],
    });
    const call = state.rpcCalls.find((c) => c.name === "crm2_create_property_quick");
    expect(call?.args).toMatchObject({
      p_property: { category: "sale", client_key: KEY, rooms: 2, source: "manual" },
      p_owner: { phone: "99112233" },
      p_private: null,
    });
    expect(revalidatePath).toHaveBeenCalled();
  });
});

describe("POST /api/crm2/events", () => {
  beforeEach(() => {
    state.rpc.crm2_my_context = {
      data: { profile_id: USER, office_id: OFFICE, is_member: true, can_work: true, roles: [] },
      error: null,
    };
  });

  it("өөр Origin → 403", async () => {
    const res = await uiEvent(post("/api/crm2/events", { event: "quick_open" }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("4 КБ-аас том → 413; буруу үйл явдал/meta-д бичвэр → 400", async () => {
    expect((await uiEvent(post("/api/crm2/events", { event: "quick_open", pad: "x".repeat(5000) }))).status).toBe(413);
    expect((await uiEvent(post("/api/crm2/events", { event: "nope" }))).status).toBe(400);
    expect((await uiEvent(post("/api/crm2/events", { event: "quick_save", meta: { phone: "99112233" } }))).status).toBe(400);
    expect(state.inserts).toHaveLength(0);
  });

  it("session байхгүй → 401", async () => {
    state.user = null;
    expect((await uiEvent(post("/api/crm2/events", { event: "quick_open" }))).status).toBe(401);
  });

  it("зөв → 204, first_input_ms-ийг meta-д", async () => {
    const res = await uiEvent(
      post("/api/crm2/events", { event: "quick_save", flow: "quick", duration_ms: 61000, first_input_ms: 42000, meta: { photos: 3 } })
    );
    expect(res.status).toBe(204);
    expect(state.inserts).toEqual([
      {
        table: "crm2_ui_events",
        row: expect.objectContaining({
          office_id: OFFICE,
          profile_id: USER,
          event: "quick_save",
          flow: "quick",
          duration_ms: 61000,
          meta: { photos: 3, first_input_ms: 42000 },
        }),
      },
    ]);
  });
});
