import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthUser = vi.fn();
const maybeSingle = vi.fn();
const from = vi.fn(() => {
  const q = { select: () => q, eq: () => q, maybeSingle };
  return q;
});

vi.mock("@/lib/supabase/user", () => ({ getAuthUser: () => getAuthUser() }));
// auth байхгүй хуурамч клиент: getCrmStaffContext GoTrue руу ӨӨРӨӨ дахин очвол тест унана.
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from }) }));

const { getCrmStaffContext } = await import("@/lib/queries-crm-core");

beforeEach(() => {
  getAuthUser.mockReset();
  maybeSingle.mockReset();
  from.mockClear();
});

describe("getCrmStaffContext", () => {
  it("нэвтрээгүй бол crm_staff уншихгүй", async () => {
    getAuthUser.mockResolvedValue(null);
    expect(await getCrmStaffContext()).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("хуваалцсан getAuthUser-ийн хэрэглэгчээр идэвхтэй мөрийг уншина", async () => {
    getAuthUser.mockResolvedValue({ id: "u1" });
    maybeSingle.mockResolvedValue({
      data: { id: "s1", office_id: "o1", roles: ["agent"], branch_id: null, team_id: "t1", panel_admin: false, offboarding: false },
      error: null,
    });
    expect(await getCrmStaffContext()).toEqual({
      staffId: "s1",
      profileId: "u1",
      officeId: "o1",
      roles: ["agent"],
      branchId: null,
      teamId: "t1",
      panelAdmin: false,
      offboarding: false,
    });
    expect(from).toHaveBeenCalledWith("crm_staff");
  });

  it("мөргүй эсвэл алдаатай бол null", async () => {
    getAuthUser.mockResolvedValue({ id: "u1" });
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await getCrmStaffContext()).toBeNull();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "x" } });
    expect(await getCrmStaffContext()).toBeNull();
    spy.mockRestore();
  });
});
