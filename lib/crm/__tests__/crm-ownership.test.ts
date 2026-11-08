import { describe, expect, it } from "vitest";

import {
  acceptMinutesLeft,
  buildSettingValue,
  canWriteLookup,
  canWriteSetting,
  dbErrorMessage,
  disputeAbilities,
  disputeOpenSchema,
  duplicateSearchSchema,
  exportNeedsApproval,
  isOnLeave,
  leaveSchema,
  offboardingBlockMessage,
  ownershipReasonLabel,
  parseWith,
  reassignReasonsFor,
  reassignSchema,
  settingValuesFrom,
  type DisputeLite,
  type SettingFormSpec,
} from "@/lib/validation/crm-ownership";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";

describe("дахин хуваарилалт (§6.27)", () => {
  it("Багийн ахлагч зөвхөн нотолгоот шалтгаантай, захирал бүгдтэй", () => {
    expect(reassignReasonsFor(["team_lead"])).not.toContain("client_request");
    expect(reassignReasonsFor(["team_lead"])).toContain("sla_breach");
    expect(reassignReasonsFor(["sales_director"])).toContain("client_request");
    expect(reassignReasonsFor(["ops_qc"])).toContain("zoning");
    expect(reassignReasonsFor(["agent"])).toEqual([]);
    expect(reassignReasonsFor(["sysadmin"])).toEqual([]);
  });

  it("шалтгаанд анхдагч утга байхгүй — заавал сонгуулна (UX-10)", () => {
    const r = parseWith(reassignSchema, { leadId: UUID_A, newOwnerId: UUID_B, reason: "", note: "SLA хэтэрсэн" });
    expect("error" in r).toBe(true);
  });

  it("харилцагчийн хүсэлтэд дэлгэрэнгүй үндэслэл заавал", () => {
    const short = parseWith(reassignSchema, {
      leadId: UUID_A,
      newOwnerId: UUID_B,
      reason: "client_request",
      note: "хүссэн",
    });
    expect("error" in short && short.error).toMatch(/дэлгэрэнгүй/);
    const ok = parseWith(reassignSchema, {
      leadId: UUID_A,
      newOwnerId: UUID_B,
      reason: "client_request",
      note: "11/05 утсаар өөр агент хүссэн, бичлэг хавсаргав",
    });
    expect("data" in ok).toBe(true);
  });

  it("эзэмшлийн түүхэд дотоод код дэлгэцэнд гарахгүй", () => {
    expect(ownershipReasonLabel("initial")).toBe("Анхны оноолт");
    expect(ownershipReasonLabel("not_accepted")).toMatch(/хүлээн аваагүй/);
    expect(ownershipReasonLabel("pool_claim")).toMatch(/сангаас/);
    expect(ownershipReasonLabel("some_new_code")).toBe("Бусад шилжүүлэлт");
    expect(ownershipReasonLabel(null)).toBe("Тодорхойгүй");
  });
});

describe("эзэмшлийн маргааны эрх (§5 v2.1)", () => {
  const base: DisputeLite = {
    status: "under_review",
    claimant_id: UUID_A,
    respondent_id: UUID_B,
    decided_by: null,
    decided_at: null,
  };

  it("өөрийн чиглүүлсэн сэжмийн маргааныг Борлуулалт хариуцсан захирал шийдэхгүй", () => {
    const can = disputeAbilities(base, { me: UUID_C, roles: ["sales_director"], isTeamLeadOfParty: false, conflict: "routed" });
    expect(can.decide).toBe(false);
    expect(can.decideBlockedReason).toMatch(/өөрөө бүртгэсэн эсвэл эзэмшигчийг нь оноосон/);
    expect(can.escalate).toBe(true);
  });

  it("зөрчилгүй захирал шийднэ, тал шийдэхгүй, хянахгүй", () => {
    expect(
      disputeAbilities(base, { me: UUID_C, roles: ["sales_director"], isTeamLeadOfParty: false, conflict: null }).decide
    ).toBe(true);
    const party = disputeAbilities(base, { me: UUID_A, roles: ["sales_director"], isTeamLeadOfParty: true, conflict: "party" });
    expect(party.decide).toBe(false);
    expect(party.review).toBe(false);
    expect(party.addEvidence).toBe(true);
    expect(party.withdraw).toBe(true);
  });

  it("CEO-д шилжсэн маргааныг зөвхөн CEO шийднэ", () => {
    const esc = { ...base, status: "escalated" as const };
    expect(disputeAbilities(esc, { me: UUID_C, roles: ["sales_director"], isTeamLeadOfParty: false, conflict: null }).decide).toBe(false);
    expect(disputeAbilities(esc, { me: UUID_C, roles: ["ceo"], isTeamLeadOfParty: false, conflict: null }).decide).toBe(true);
  });

  it("хяналтыг талуудын Багийн ахлагч эсвэл Үйл ажиллагаа-ЧМТ бичнэ", () => {
    expect(disputeAbilities(base, { me: UUID_C, roles: ["team_lead"], isTeamLeadOfParty: true, conflict: null }).review).toBe(true);
    expect(disputeAbilities(base, { me: UUID_C, roles: ["team_lead"], isTeamLeadOfParty: false, conflict: null }).review).toBe(false);
    expect(disputeAbilities(base, { me: UUID_C, roles: ["ops_qc"], isTeamLeadOfParty: false, conflict: null }).review).toBe(true);
  });

  it("давж заалдах хугацаа ба CEO-ийн шийдвэр", () => {
    const decided: DisputeLite = { ...base, status: "decided", decided_by: UUID_C, decided_at: "2026-11-01T00:00:00Z" };
    const inWindow = disputeAbilities(
      decided,
      { me: UUID_B, roles: ["agent"], isTeamLeadOfParty: false, conflict: "party" },
      { appealDays: 5, now: new Date("2026-11-04T00:00:00Z") }
    );
    expect(inWindow.appeal).toBe(true);
    const late = disputeAbilities(
      decided,
      { me: UUID_B, roles: ["agent"], isTeamLeadOfParty: false, conflict: "party" },
      { appealDays: 5, now: new Date("2026-11-10T00:00:00Z") }
    );
    expect(late.appeal).toBe(false);
    const appealed = { ...decided, status: "appealed" as const };
    expect(disputeAbilities(appealed, { me: UUID_C, roles: ["ceo"], isTeamLeadOfParty: false, conflict: null }).decideAppeal).toBe(false);
    expect(
      disputeAbilities(appealed, { me: "44444444-4444-4444-8444-444444444444", roles: ["ceo"], isTeamLeadOfParty: false, conflict: null })
        .decideAppeal
    ).toBe(true);
  });

  it("маргаан нээхэд нотолгоо заавал", () => {
    const noEv = parseWith(disputeOpenSchema, {
      contactId: UUID_A,
      kind: "ownership",
      claim: "Харилцагч 11/02-нд надтай өөрөө холбогдсон",
      evidence: [],
    });
    expect("error" in noEv).toBe(true);
    const ok = parseWith(disputeOpenSchema, {
      contactId: UUID_A,
      kind: "ownership",
      claim: "Харилцагч 11/02-нд надтай өөрөө холбогдсон",
      evidence: [{ kind: "message", text: "Messenger зурвасын дэлгэцийн зураг", at: "2026-11-02" }],
    });
    expect("data" in ok).toBe(true);
  });

  it("DB-ийн алдааг журмын хэллэгээр (кодгүй) буцаана", () => {
    expect(dbErrorMessage("CRM: ашиг сонирхлын зөрчилтэй тул энэ маргааныг шийдэх боломжгүй (routed)", "x")).toBe(
      "ашиг сонирхлын зөрчилтэй тул энэ маргааныг шийдэх боломжгүй — энэ сэжмийг та өөрөө бүртгэсэн эсвэл эзэмшигчийг нь оноосон"
    );
    expect(dbErrorMessage("CRM: шилжилт зөвшөөрөгдөөгүй (F-355)", "x")).toBe("шилжилт зөвшөөрөгдөөгүй");
    expect(dbErrorMessage("duplicate key value violates unique constraint", "Алдаа")).toBe("Алдаа");
    expect(dbErrorMessage(null, "Алдаа")).toBe("Алдаа");
  });
});

describe("давхардал шалгах", () => {
  it("утас, и-мэйл эсвэл нэрийн аль нэг заавал", () => {
    expect("error" in parseWith(duplicateSearchSchema, { phone: "99", email: "", name: "Бо" })).toBe(true);
    expect("data" in parseWith(duplicateSearchSchema, { phone: "9911 2233" })).toBe(true);
    expect("data" in parseWith(duplicateSearchSchema, { email: "a@b.mn" })).toBe(true);
    expect("data" in parseWith(duplicateSearchSchema, { name: "Болд" })).toBe(true);
  });
});

describe("тохиргооны эрх (§5, §6.26)", () => {
  it("Борлуулалт хариуцсан захирал босгыг тогтооно, МУТСТ-ийн тохиргоог биш", () => {
    expect(canWriteSetting(["sales_director"], "recycle_thresholds")).toBe(true);
    expect(canWriteSetting(["sales_director"], "inactivity_thresholds")).toBe(true);
    expect(canWriteSetting(["sales_director"], "lead_score_weights")).toBe(true);
    expect(canWriteSetting(["sales_director"], "aml_weights")).toBe(false);
    expect(canWriteSetting(["sales_director"], "export_limits")).toBe(false);
    expect(canWriteSetting(["ops_qc"], "aml_weights")).toBe(true);
    expect(canWriteSetting(["marketing"], "marketing_costs")).toBe(true);
    expect(canWriteSetting(["marketing"], "lead_score_weights")).toBe(false);
    expect(canWriteSetting(["agent", "team_lead"], "lead_accept")).toBe(false);
  });

  it("SQL crm_setting_writable-тэй ижил: долоо хоног, KPI, өдрийн тохиргоо БХЗ-д, аяны зардал Маркетингт", () => {
    for (const k of ["weekly_cycle", "kpi_targets", "kpi_scope", "daily_norms", "public_links"]) {
      expect(canWriteSetting(["sales_director"], k)).toBe(true);
    }
    expect(canWriteSetting(["marketing"], "campaign_costs")).toBe(true);
    expect(canWriteSetting(["marketing"], "weekly_cycle")).toBe(false);
  });

  it("Маркетинг зөвхөн эх сурвалжийн лавлахыг засна", () => {
    expect(canWriteLookup(["marketing"], "lead_source")).toBe(true);
    expect(canWriteLookup(["marketing"], "lost_reason")).toBe(false);
    expect(canWriteLookup(["sysadmin"], "lost_reason")).toBe(true);
  });
});

describe("бүтэцтэй тохиргооны маягт (UX-11)", () => {
  const weights: SettingFormSpec = {
    kind: "map",
    sumTo: 100,
    fields: [
      { name: "a", label: "А", min: 0, max: 100 },
      { name: "b", label: "Б", min: 0, max: 100 },
    ],
  };

  it("жингийн нийлбэр 100 биш бол хадгалахгүй", () => {
    expect(buildSettingValue(weights, { a: 40, b: 50 })).toEqual({ error: "Жингийн нийлбэр 100 байх ёстой (одоо 90)" });
    expect(buildSettingValue(weights, { a: 40, b: 60 })).toEqual({ value: { a: 40, b: 60 } });
  });

  it("хүрээ, хоосон утгыг шалгана", () => {
    expect(buildSettingValue(weights, { a: 140, b: -40 })).toEqual({ error: "«А» 0–100 хооронд байна" });
    expect(buildSettingValue(weights, { a: null, b: 100 })).toEqual({ error: "«А» утгыг оруулна уу" });
  });

  it("ангиллын босго буурах, хоногийн босго өсөх ёстой", () => {
    const desc: SettingFormSpec = { kind: "map", descending: true, fields: weights.fields };
    expect("error" in buildSettingValue(desc, { a: 60, b: 80 })).toBe(true);
    expect(buildSettingValue(desc, { a: 80, b: 60 })).toEqual({ value: { a: 80, b: 60 } });
    const asc: SettingFormSpec = { kind: "map", ascending: true, fields: weights.fields };
    expect("error" in buildSettingValue(asc, { a: 30, b: 14 })).toBe(true);
  });

  it("маягтад байхгүй түлхүүрийг хуучин утгаас хадгална", () => {
    const keep: SettingFormSpec = {
      kind: "map",
      keepUnknown: true,
      fields: [{ name: "strong", label: "Хүчтэй", min: 1, max: 100 }],
    };
    expect(buildSettingValue(keep, { strong: 85 }, { strong: 80, adjacent_pct: 50 })).toEqual({
      value: { strong: 85, adjacent_pct: 50 },
    });
  });

  it("скаляр ба асаах/унтраах маягт", () => {
    const scalar: SettingFormSpec = { kind: "scalar", field: { name: "value", label: "Минут", min: 1, max: 240 } };
    expect(buildSettingValue(scalar, { value: 15 })).toEqual({ value: 15 });
    expect(settingValuesFrom(scalar, 15)).toEqual({ value: 15 });
    const toggle: SettingFormSpec = {
      kind: "toggle_map",
      toggle: { name: "enabled", label: "Идэвхтэй" },
      fields: [{ name: "window_min", label: "Минут", min: 5, max: 240 }],
    };
    expect(settingValuesFrom(toggle, { enabled: true, window_min: 15 })).toEqual({ enabled: true, window_min: 15 });
    expect(buildSettingValue(toggle, { enabled: false, window_min: 20 })).toEqual({
      value: { enabled: false, window_min: 20 },
    });
  });
});

describe("экспорт (§6.32)", () => {
  it("агент үргэлж зөвшөөрөл хүснэ, удирдлага дээд мөрөөс их бол", () => {
    expect(exportNeedsApproval(["agent"], 5, 500)).toBe(true);
    expect(exportNeedsApproval(["team_lead"], 5, 500)).toBe(true);
    expect(exportNeedsApproval(["ops_qc"], 500, 500)).toBe(false);
    expect(exportNeedsApproval(["sales_director"], 501, 500)).toBe(true);
    expect(exportNeedsApproval(["sysadmin"], 1, 500)).toBe(true);
  });
});

describe("гарах ажилтан (§6.28.11)", () => {
  it("CRM-гүй агентыг хаах/устгахад саадгүй", () => {
    expect(offboardingBlockMessage({ has_staff: false }, "disable")).toBeNull();
    expect(offboardingBlockMessage({ has_staff: false }, "delete")).toBeNull();
  });

  it("нээлттэй эзэмшилтэй бол нэвтрэлт хаахгүй", () => {
    const msg = offboardingBlockMessage(
      { has_staff: true, is_active: true, leads: 2, opportunities: 1, property_roles: 0, had_ownership: true, approved_act: false },
      "disable"
    );
    expect(msg).toMatch(/3 нээлттэй бичлэг/);
  });

  it("түүхтэй ажилтанд батлагдсан акт шаардана, батлагдсан бол болно", () => {
    const base = { has_staff: true, is_active: true, leads: 0, opportunities: 0, property_roles: 0, had_ownership: true };
    expect(offboardingBlockMessage({ ...base, approved_act: false }, "disable")).toMatch(/акт/);
    expect(offboardingBlockMessage({ ...base, approved_act: true }, "disable")).toBeNull();
  });

  it("CRM-д бүртгэлтэй ажилтныг бүрэн устгахгүй (нотолгоо хадгална)", () => {
    expect(offboardingBlockMessage({ has_staff: true, is_active: false, approved_act: true }, "delete")).toMatch(/устгахгүй/);
  });
});

describe("чөлөө, хүлээн авах хугацаа", () => {
  it("чөлөөний хугацаа", () => {
    expect(isOnLeave("2026-11-05", "2026-11-10", "2026-11-07")).toBe(true);
    expect(isOnLeave("2026-11-05", "2026-11-10", "2026-11-11")).toBe(false);
    expect(isOnLeave("2026-11-05", null, "2026-12-01")).toBe(true);
    expect(isOnLeave(null, null, "2026-11-07")).toBe(false);
    expect("error" in parseWith(leaveSchema, { staffId: UUID_A, from: "2026-11-10", to: "2026-11-05", substituteId: null })).toBe(
      true
    );
  });

  it("хүлээн авах хүртэл үлдсэн минут", () => {
    const now = new Date("2026-11-09T02:00:00Z");
    expect(acceptMinutesLeft("2026-11-09T02:15:00Z", now)).toBe(15);
    expect(acceptMinutesLeft("2026-11-09T01:59:00Z", now)).toBeLessThan(0);
    expect(acceptMinutesLeft(null, now)).toBeNull();
  });
});
