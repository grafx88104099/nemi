import { describe, expect, it } from "vitest";

import {
  getOffboardingBlockers,
  handoverExtras,
  handoverTaskDescription,
  handoverTaskTitle,
  isOnLeave,
  leaveSchema,
  offboardingBlockMessage,
} from "@/lib/crm2/offboarding";

const UUID_A = "11111111-1111-4111-8111-111111111111";

describe("хүлээлцэх шалгалт — харилцагч, нээлттэй ажил, хүсэлт", () => {
  const base = { has_staff: true, is_active: true, leads: 0, opportunities: 0, property_roles: 0, approved_act: true };

  const crm = { includeHandover: true };

  it("CRM-ийн «Идэвхгүй болгох»: хэлцэл/үүрэггүй ч хариуцсан харилцагчтай бол болохгүй", () => {
    const msg = offboardingBlockMessage({ ...base, contacts: 3 }, "disable", crm);
    expect(msg).toMatch(/хариуцсан харилцагч 3/);
    expect(msg).toMatch(/Хүлээлцэх дуусаагүй/);
  });

  it("CRM-ийн «Идэвхгүй болгох»: нээлттэй ажил, шийдвэрлээгүй хүсэлт ч хориг", () => {
    expect(offboardingBlockMessage({ ...base, open_tasks: 2 }, "disable", crm)).toMatch(/нээлттэй ажил 2/);
    expect(offboardingBlockMessage({ ...base, pending_requests: 1 }, "disable", crm)).toMatch(/шийдвэрлээгүй хүсэлт 1/);
  });

  it("Нэвтрэлт хаах / оффисын «Идэвхгүй» (анхдагч): зөвхөн харилцагч, ажил, хүсэлттэй бол ХОРИГЛОХГҮЙ", () => {
    // setAgentLoginEnabled(false), setAgentStatus('rejected') — хамгаалалтын яаралтай алхам.
    expect(offboardingBlockMessage({ ...base, contacts: 3, open_tasks: 2, pending_requests: 1 }, "disable")).toBeNull();
    // Хэлцэл / хөрөнгийн үүрэг (DB guard-тай ижил) хэвээр хориг; харилцагчийг мессежид нэмэхгүй.
    const msg = offboardingBlockMessage({ ...base, opportunities: 1, contacts: 3 }, "disable");
    expect(msg).toMatch(/нээлттэй Staff хэлцэл 1/);
    expect(msg).not.toMatch(/харилцагч/);
  });

  it("бүгд 0 (эсвэл хуучин DB — түлхүүргүй) бол саадгүй", () => {
    expect(offboardingBlockMessage({ ...base, contacts: 0, open_tasks: 0, pending_requests: 0 }, "disable", crm)).toBeNull();
    expect(offboardingBlockMessage(base, "disable", crm)).toBeNull();
  });

  it("handoverExtras зөвхөн 0-ээс их зүйлсийг", () => {
    expect(handoverExtras({ has_staff: true, contacts: 1, open_tasks: 0, pending_requests: 4 })).toEqual([
      "хариуцсан харилцагч 1",
      "шийдвэрлээгүй хүсэлт 4",
    ]);
    expect(handoverExtras({ has_staff: true })).toEqual([]);
  });

  it("хүлээлцэх даалгавар гарч буй хүний нэр, шилжүүлэх тоог агуулна", () => {
    expect(handoverTaskTitle("Бат-Эрдэнэ")).toBe("Хүлээлцэх: Бат-Эрдэнэ — гарах урсгал");
    expect(handoverTaskTitle("  ")).toBe("Хүлээлцэх: ажилтан — гарах урсгал");
    expect(handoverTaskTitle("А".repeat(200)).length).toBeLessThan(110);

    const d = handoverTaskDescription("Бат-Эрдэнэ", {
      has_staff: true,
      opportunities: 2,
      property_roles: 5,
      contacts: 3,
      open_tasks: 0,
      pending_requests: 1,
    });
    expect(d).toMatch(/^Бат-Эрдэнэ гарах урсгалд орлоо\./);
    expect(d).toMatch(/нээлттэй Staff хэлцэл 2, Staff хөрөнгийн үүрэг 5, хариуцсан харилцагч 3, шийдвэрлээгүй хүсэлт 1/);
    expect(d).toMatch(/\/office\/crm\/settings\/staff/);
    // Тоо уншиж чадаагүй бол ерөнхий заавар.
    expect(handoverTaskDescription("Бат", null)).toMatch(/өөр агентад шилжүүлнэ/);
  });
});

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
