import { describe, expect, it } from "vitest";

import { daysUntil, isIsoDate, isoToUbInput, taskBucket, ubInputToIso, ubToday } from "@/lib/crm2/datetime";
import { HEIC_ERROR, docPath, fileExt, fileMime, mediaPath, validateDocFile, validateMediaFile } from "@/lib/crm2/files";
import { describeHistory, formatHistoryValue } from "@/lib/crm2/history";
import { formatAmount, formatCommission, formatMoney, formatPrice } from "@/lib/crm2/money";
import { crm2MenuItems, crm2Paths, panelBase, panelFromPathname } from "@/lib/crm2/paths";
import { crmMessage, dbErrorText, GENERIC_ERROR, NO_ACCESS_ERROR } from "@/lib/crm2/result";
import type { Crm2Context } from "@/lib/crm2/types";

describe("result — DB алдааны текст", () => {
  it("«CRM: » угтварыг хасаад томоор эхлүүлнэ", () => {
    expect(crmMessage("CRM: хөрөнгө олдсонгүй")).toBe("Хөрөнгө олдсонгүй");
    expect(dbErrorText({ message: "CRM: идэвхжүүлэхэд дутуу: үнэ" })).toBe("Идэвхжүүлэхэд дутуу: үнэ");
    expect(crmMessage("other")).toBeNull();
  });
  it("англи Postgres алдааг монгол болгоно", () => {
    expect(dbErrorText({ message: 'new row violates row-level security policy for table "x"', code: "42501" })).toBe(NO_ACCESS_ERROR);
    expect(dbErrorText({ message: "duplicate key", code: "23505" })).toBe("Ийм бичлэг аль хэдийн байна.");
    expect(dbErrorText({ message: "boom" })).toBe(GENERIC_ERROR);
    expect(dbErrorText(null)).toBe(GENERIC_ERROR);
  });
});

describe("datetime (УБ)", () => {
  it("datetime-local → ISO, ISO → datetime-local", () => {
    expect(ubInputToIso("2026-11-13T08:05")).toBe("2026-11-13T00:05:00.000Z");
    expect(ubInputToIso("2026-11-13T08:05:30")).toBe("2026-11-13T00:05:30.000Z");
    expect(ubInputToIso("2026-11-13T00:05:00Z")).toBe("2026-11-13T00:05:00.000Z");
    expect(ubInputToIso("2026-11-13")).toBeNull();
    expect(ubInputToIso("")).toBeNull();
    expect(isoToUbInput("2026-11-13T00:05:00Z")).toBe("2026-11-13T08:05");
    expect(isoToUbInput(null)).toBe("");
  });
  it("огноо, өдөр", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(ubToday(Date.parse("2026-11-12T17:00:00Z"))).toBe("2026-11-13");
    expect(daysUntil("2026-11-20", Date.parse("2026-11-13T01:00:00Z"))).toBe(7);
    expect(daysUntil(null)).toBeNull();
  });
  it("ажлын бүлэг", () => {
    const now = Date.parse("2026-11-13T02:00:00Z"); // УБ 10:00
    expect(taskBucket("2026-11-13T01:00:00Z", now)).toBe("overdue");
    expect(taskBucket("2026-11-13T10:00:00Z", now)).toBe("today"); // УБ 18:00
    expect(taskBucket("2026-11-13T17:00:00Z", now)).toBe("upcoming"); // УБ дараа өдөр 01:00
    expect(taskBucket(null, now)).toBe("none");
  });
});

describe("files", () => {
  const limits = { maxImageMb: 15, maxVideoMb: 50, maxImages: 40, maxVideos: 5, maxDocMb: 20, maxDocsPerContract: 20 };
  const MB = 1024 * 1024;
  it("HEIC татгалзана", () => {
    expect(validateMediaFile({ name: "IMG_1.HEIC", type: "", size: MB }, limits)).toBe(HEIC_ERROR);
    expect(validateMediaFile({ name: "a.jpg", type: "image/heic", size: MB }, limits)).toBe(HEIC_ERROR);
    expect(validateDocFile({ name: "scan.heif", type: "image/heif", size: MB }, limits)).toBe(HEIC_ERROR);
  });
  it("төрөл, хэмжээ, тоо", () => {
    expect(validateMediaFile({ name: "a.jpg", type: "image/jpeg", size: MB }, limits)).toBeNull();
    expect(validateMediaFile({ name: "a.mov", type: "", size: MB }, limits)).toBeNull();
    expect(validateMediaFile({ name: "a.gif", type: "image/gif", size: MB }, limits)).toMatch(/JPEG/);
    expect(validateMediaFile({ name: "a.jpg", type: "image/jpeg", size: 16 * MB }, limits)).toMatch(/15 МБ/);
    expect(validateMediaFile({ name: "a.mp4", type: "video/mp4", size: MB }, limits, { videos: 5 })).toMatch(/5 хүртэл/);
    expect(validateDocFile({ name: "a.pdf", type: "application/pdf", size: 21 * MB }, limits)).toMatch(/20 МБ/);
    expect(validateDocFile({ name: "a.docx", type: "application/msword", size: MB }, limits)).toMatch(/PDF/);
    expect(validateDocFile({ name: "a.pdf", type: "application/pdf", size: MB }, limits, 20)).toMatch(/20 хүртэл/);
  });
  it("mime, өргөтгөл, зам", () => {
    expect(fileMime({ name: "x.MOV", type: "", size: 1 })).toBe("video/quicktime");
    expect(fileExt({ name: "x.jpeg", type: "image/jpeg", size: 1 })).toBe("jpg");
    expect(mediaPath("o", "p", "f", "jpg")).toBe("o/p/f.jpg");
    expect(docPath("o", "c", "f", "pdf")).toBe("o/brokerage/c/f.pdf");
  });
});

describe("money", () => {
  it("бүлэглэлт, валют, хугацаа, суурь", () => {
    expect(formatAmount(1250000)).toBe("1,250,000");
    expect(formatAmount(1234.5)).toBe("1,234.5");
    expect(formatAmount(-1000)).toBe("-1,000");
    expect(formatMoney(350000000, "MNT")).toBe("350,000,000₮");
    expect(formatMoney(1200, "USD")).toBe("$1,200");
    expect(formatPrice({ amount: 12000, currency: "MNT", period: "month", basis: "per_m2" })).toBe("12,000₮/м²/сар");
    expect(formatPrice({ amount: null })).toBe("");
    expect(formatMoney(1_650_000_000, "MNT", true)).toBe("1.65 тэрбум ₮");
    expect(formatCommission("percent", 3, "MNT")).toBe("3%");
    expect(formatCommission("fixed", 2000000, "MNT")).toBe("2,000,000₮");
  });
});

describe("paths", () => {
  it("хоёр панелийн холбоос", () => {
    expect(panelBase("agent")).toBe("/agent/crm");
    expect(panelFromPathname("/office/crm/staff")).toBe("office");
    const p = crm2Paths("office");
    expect(p.property("abc")).toBe("/office/crm/staff/abc");
    expect(p.property("abc", "deals")).toBe("/office/crm/staff/abc?tab=deals");
    expect(p.deal("p1", "d1")).toBe("/office/crm/staff/p1/deals/d1");
    expect(p.staff({ view: "archive", q: "" })).toBe("/office/crm/staff?view=archive");
  });
  it("цэс эрхээр", () => {
    const base: Crm2Context = {
      profileId: "u",
      officeId: "o",
      staffId: "s",
      roles: ["agent"],
      teamId: null,
      isMember: true,
      isManager: false,
      isTeamLead: false,
      isOfficeAdmin: false,
      canWork: true,
      canApprove: false,
      hasFinance: false,
      canManageSettings: false,
      canManageAccessSettings: false,
    };
    expect(crm2MenuItems("agent", base).map((m) => m.label)).toEqual([
      "Staff",
      "Харилцагчид",
      "Миний ажил",
      "Хүлээлгийн үйлчлүүлэгч",
      "Тохиргоо",
    ]);
    expect(crm2MenuItems("office", { ...base, isManager: true }).map((m) => m.key)).toEqual([
      "staff",
      "contacts",
      "myWork",
      "waitlist",
      "finance",
      "reports",
      "settings",
    ]);
    expect(crm2MenuItems("agent", { ...base, isMember: false })).toEqual([]);
  });
});

describe("history", () => {
  it("enum, агент, огноо, тоо", () => {
    expect(formatHistoryValue("property", "status", "contract_ended")).toBe("Гэрээ дууссан");
    expect(formatHistoryValue("deal", "stage", "showing_scheduled")).toBe("Үзүүлэхээр товлосон");
    expect(formatHistoryValue("property", "listing_agent_id", "u1", { names: { u1: "Сараа" } })).toBe("Сараа");
    expect(formatHistoryValue("property", "available_from", "2026-12-01")).toBe("2026.12.01");
    expect(formatHistoryValue("property", "price", 350000000)).toBe("350,000,000");
    expect(formatHistoryValue("property", "year_in_use", 2024)).toBe("2024");
    expect(formatHistoryValue("property", "features", ["parking"], { features: { parking: "Зогсоол" } })).toBe("Зогсоол");
    expect(formatHistoryValue("property", "price", null)).toBe("—");
    expect(formatHistoryValue("activity", "scheduled_at", "2026-11-13T07:00:00Z")).toBe("2026.11.13 15:00");
  });
  it("мөрийн тайлбар", () => {
    const line = describeHistory({
      id: 1,
      entity: "property",
      action: "status",
      field: "status",
      old_value: "draft",
      new_value: "active",
      reason: null,
      actor_id: null,
      created_at: "2026-11-13T00:05:00Z",
    });
    expect(line).toMatchObject({ actor: "Систем", field: "Төлөв", from: "Ноорог", to: "Идэвхтэй" });
    const ins = describeHistory({
      id: 2,
      entity: "media",
      action: "insert",
      field: null,
      old_value: null,
      new_value: { kind: "image" },
      reason: null,
      actor_id: "u1",
      created_at: "2026-11-13T00:05:00Z",
      actor: { full_name: "Бат" },
    });
    expect(ins).toMatchObject({ actor: "Бат", action: "Бүртгэсэн", entityLabel: "Медиа", from: null, to: null });
  });
});
