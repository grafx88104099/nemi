import { describe, expect, it } from "vitest";

import { decideAccountAccess, type AccountGuardInput } from "@/lib/office/account-guard";

const OFFICE = "11111111-1111-4111-8111-111111111111";
const base: AccountGuardInput = {
  callerId: "caller",
  callerRole: "office_admin",
  callerOfficeId: OFFICE,
  callerPanelAdmin: true,
  agentOfficeId: OFFICE,
  targetProfileId: "agent-profile",
  targetRole: "agent",
};

describe("decideAccountAccess", () => {
  it("өөрийн оффисын агентыг панелийн админ удирдана", () => {
    expect(decideAccountAccess(base)).toEqual({ ok: true });
    expect(decideAccountAccess({ ...base, targetProfileId: null, targetRole: null })).toEqual({ ok: true });
  });

  it("panel_admin=false оффисын админ — DB-ийн can_manage_agent-тай ижил хориг", () => {
    expect(decideAccountAccess({ ...base, callerPanelAdmin: false }).ok).toBe(false);
    expect(decideAccountAccess({ ...base, callerPanelAdmin: null }).ok).toBe(false);
  });

  it("өөр оффисын агент, оффисгүй админ хориотой", () => {
    expect(decideAccountAccess({ ...base, agentOfficeId: "other" }).ok).toBe(false);
    expect(decideAccountAccess({ ...base, callerOfficeId: null }).ok).toBe(false);
  });

  it("өөр оффисын админ / системийн админы бүртгэлд хүрэхгүй (өөрийнхөө картыг болно)", () => {
    expect(decideAccountAccess({ ...base, targetRole: "office_admin" }).ok).toBe(false);
    expect(decideAccountAccess({ ...base, targetRole: "admin" }).ok).toBe(false);
    expect(decideAccountAccess({ ...base, targetRole: "office_admin", targetProfileId: "caller" }).ok).toBe(true);
  });

  it("платформын админ бүгдэд; энгийн хэрэглэгч, агент хориотой", () => {
    expect(decideAccountAccess({ ...base, callerRole: "admin", callerPanelAdmin: null, agentOfficeId: "x", targetRole: "office_admin" }).ok).toBe(true);
    expect(decideAccountAccess({ ...base, callerRole: "agent" }).ok).toBe(false);
    expect(decideAccountAccess({ ...base, callerRole: "buyer" }).ok).toBe(false);
  });
});
