import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Оффисын «Нэвтрэлт хаах» (setAgentLoginEnabled(false)):
 *  - зөвхөн харилцагч / нээлттэй ажил / хүсэлттэй агентыг ХОРИГЛОХГҮЙ (хэлцэл, хөрөнгийн үүрэг л хориг);
 *  - office_agent_audit хүснэгт алга (миграц тавигдаагүй) бол аудитгүйгээр үргэлжилнэ, бусад аудитын
 *    алдаанд үйлдэл хийгдэхгүй.
 */

const OFFICE = "11111111-1111-4111-8111-111111111111";
const AGENT = "22222222-2222-4222-8222-222222222222";
const CALLER = "33333333-3333-4333-8333-333333333333";
const TARGET = "44444444-4444-4444-8444-444444444444";

const st = vi.hoisted(() => ({
  blockers: {} as Record<string, unknown>,
  auditError: null as null | { code: string; message: string },
  audits: [] as unknown[],
  bans: [] as unknown[],
}));

/** PostgREST-ийн гинжин builder: эцсийн single/maybeSingle/then нь `result`-ийг буцаана. */
function chain(result: () => unknown, onInsert?: (row: unknown) => void) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "order", "update", "in", "is"]) c[m] = () => c;
  c.insert = (row: unknown) => {
    onInsert?.(row);
    return c;
  };
  c.single = async () => result();
  c.maybeSingle = async () => result();
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res);
  return c;
}

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/listings-cache", () => ({ expirePublicListings: () => {} }));
vi.mock("@/lib/email/resend", () => ({ sendAgentInvite: async () => ({}) }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: CALLER } } }) },
    from: () => chain(() => ({ data: { role: "office_admin", office_id: OFFICE }, error: null })),
    rpc: async () => ({ data: true, error: null }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "agents")
        return chain(() => ({ data: { id: AGENT, profile_id: TARGET, office_id: OFFICE, display_name: "Бат" }, error: null }));
      if (table === "profiles") return chain(() => ({ data: { role: "agent" }, error: null }));
      if (table === "office_agent_audit")
        return chain(
          () => (st.auditError ? { data: null, error: st.auditError } : { data: { id: "audit-1" }, error: null }),
          (row) => st.audits.push(row)
        );
      throw new Error("unexpected table " + table);
    },
    rpc: async (fn: string) => {
      if (fn !== "crm_offboarding_blockers") throw new Error("unexpected rpc " + fn);
      return { data: st.blockers, error: null };
    },
    auth: {
      admin: {
        updateUserById: async (_id: string, attrs: unknown) => {
          st.bans.push(attrs);
          return { error: null };
        },
      },
    },
  }),
}));

import { setAgentLoginEnabled } from "@/lib/actions/agent-account";

const base = { has_staff: true, is_active: true, leads: 0, opportunities: 0, property_roles: 0, approved_act: true };

beforeEach(() => {
  st.blockers = { ...base };
  st.auditError = null;
  st.audits = [];
  st.bans = [];
});

describe("setAgentLoginEnabled(false) — нэвтрэлт хаах", () => {
  it("зөвхөн хариуцсан харилцагч, нээлттэй ажил, хүсэлттэй бол хориглохгүй — даруй хаана", async () => {
    st.blockers = { ...base, contacts: 3, open_tasks: 2, pending_requests: 1 };
    const r = await setAgentLoginEnabled(AGENT, false);
    expect(r).toEqual({ ok: true });
    expect(st.bans).toEqual([{ ban_duration: "876000h" }]);
    expect(st.audits).toHaveLength(1);
  });

  it("нээлттэй Staff хэлцэлтэй бол хориг хэвээр (DB guard-тай ижил)", async () => {
    st.blockers = { ...base, opportunities: 1, contacts: 3 };
    const r = await setAgentLoginEnabled(AGENT, false);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/нээлттэй Staff хэлцэл 1/);
    expect(st.bans).toEqual([]);
  });

  it("аудитын хүснэгт алга (PGRST205 — миграц тавигдаагүй) бол аудитгүйгээр хаана", async () => {
    st.auditError = { code: "PGRST205", message: "Could not find the table 'public.office_agent_audit' in the schema cache" };
    const r = await setAgentLoginEnabled(AGENT, false);
    expect(r).toEqual({ ok: true });
    expect(st.bans).toHaveLength(1);
  });

  it("аудитын бусад алдаанд нэвтрэлтийг хөндөхгүй", async () => {
    st.auditError = { code: "23514", message: "check constraint" };
    const r = await setAgentLoginEnabled(AGENT, false);
    expect(r.ok).toBe(false);
    expect(st.bans).toEqual([]);
  });
});
