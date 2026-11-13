import { describe, expect, it } from "vitest";

import { getOffboardingBlockers, isOnLeave, leaveSchema, offboardingBlockMessage } from "@/lib/crm2/offboarding";

const UUID_A = "11111111-1111-4111-8111-111111111111";

describe("гарах ажилтны хориг", () => {
  it("CRM-гүй агентыг хаах/устгахад саадгүй", () => {
    expect(offboardingBlockMessage({ has_staff: false }, "disable")).toBeNull();
    expect(offboardingBlockMessage({ has_staff: false }, "delete")).toBeNull();
  });

  it("нээлттэй Staff хэлцэл, хөрөнгийн үүрэгтэй бол нэвтрэлт хаахгүй", () => {
    const msg = offboardingBlockMessage(
      { has_staff: true, is_active: true, leads: 0, opportunities: 2, property_roles: 1, had_ownership: true },
      "disable"
    );
    expect(msg).toMatch(/нээлттэй Staff хэлцэл 2/);
    expect(msg).toMatch(/Staff хөрөнгийн үүрэг 1/);
    expect(msg).not.toMatch(/хуучин CRM/);
  });

  it("хуучин CRM-ийн бичлэг үлдсэн бол тэр тоог нэмж хэлнэ", () => {
    const msg = offboardingBlockMessage({ has_staff: true, is_active: true, leads: 3, opportunities: 0 }, "disable");
    expect(msg).toMatch(/хуучин CRM-ийн нээлттэй бичлэг 3/);
  });

  it("түүхтэй ажилтанд батлагдсан акт шаардана, батлагдсан бол болно", () => {
    const base = { has_staff: true, is_active: true, leads: 0, opportunities: 0, property_roles: 0, had_ownership: true };
    expect(offboardingBlockMessage({ ...base, approved_act: false }, "disable")).toMatch(/акт/);
    expect(offboardingBlockMessage({ ...base, approved_act: true }, "disable")).toBeNull();
  });

  it("CRM-д бүртгэлтэй ажилтныг бүрэн устгахгүй", () => {
    expect(offboardingBlockMessage({ has_staff: true, is_active: false, approved_act: true }, "delete")).toMatch(/устгахгүй/);
  });

  it("DB-ийн RPC-г дуудаж, алдаа гарвал саадтай гэж үзнэ", async () => {
    const calls: unknown[] = [];
    const ok = {
      rpc: async (fn: string, args: unknown) => {
        calls.push([fn, args]);
        return { data: { has_staff: true, opportunities: 1 }, error: null };
      },
    };
    expect(await getOffboardingBlockers(ok as never, UUID_A)).toEqual({ has_staff: true, opportunities: 1 });
    expect(calls).toEqual([["crm_offboarding_blockers", { p_profile: UUID_A }]]);

    const failing = { rpc: async () => ({ data: null, error: { message: "boom" } }) };
    expect(await getOffboardingBlockers(failing as never, UUID_A)).toHaveProperty("error");
    const throwing = {
      rpc: async () => {
        throw new Error("network");
      },
    };
    expect(await getOffboardingBlockers(throwing as never, UUID_A)).toHaveProperty("error");
  });
});

describe("чөлөө", () => {
  it("чөлөөний хугацаа", () => {
    expect(isOnLeave("2026-11-05", "2026-11-10", "2026-11-07")).toBe(true);
    expect(isOnLeave("2026-11-05", "2026-11-10", "2026-11-11")).toBe(false);
    expect(isOnLeave("2026-11-05", null, "2026-12-01")).toBe(true);
    expect(isOnLeave(null, null, "2026-11-07")).toBe(false);
  });

  it("дуусах огноо эхлэхээс өмнө, эсвэл эхлэхгүй дуусах бол алдаа", () => {
    expect(leaveSchema.safeParse({ staffId: UUID_A, from: "2026-11-10", to: "2026-11-05", substituteId: null }).success).toBe(
      false
    );
    expect(leaveSchema.safeParse({ staffId: UUID_A, from: null, to: "2026-11-05", substituteId: null }).success).toBe(false);
    expect(leaveSchema.safeParse({ staffId: UUID_A, from: "2026-11-05", to: null, substituteId: null }).success).toBe(true);
  });
});
