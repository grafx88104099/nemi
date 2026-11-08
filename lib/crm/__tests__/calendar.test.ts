import { describe, expect, it } from "vitest";

import {
  addBusinessDays,
  businessDaysBetween,
  calendarExceptionsFromRows,
  fromIsoDate,
  isWithinWorkHours,
  isWorkday,
  leadSlaDeadline,
  slaClockStart,
  slaDeadline,
  sourceSlaRule,
  toIsoDate,
  ubHour,
  ubTime,
  workHoursFromPolicy,
  type CalendarExceptions,
  type SlaPolicy,
} from "@/lib/crm/calendar";

// 2026-09-04 = Баасан, 2026-09-05 = Бямба, 2026-09-07 = Даваа.
// Бүх оролт бодит UTC агшин; УБ = UTC+8.
const FRI = fromIsoDate("2026-09-04");
const SAT = fromIsoDate("2026-09-05");
const MON = fromIsoDate("2026-09-07");

describe("Улаанбаатарын цаг", () => {
  it("ubTime нь УБ-ын ханын цагийг бодит агшин болгоно", () => {
    expect(ubTime("2026-09-07", 10).toISOString()).toBe("2026-09-07T02:00:00.000Z");
    expect(ubHour(new Date("2026-09-07T02:00:00.000Z"))).toBe(10);
  });

  it("УБ-ын шөнө дунд өнгөрмөгц огноо солигдоно (UTC 16:00)", () => {
    expect(toIsoDate(new Date("2026-09-06T15:59:00.000Z"))).toBe("2026-09-06");
    expect(toIsoDate(new Date("2026-09-06T16:00:00.000Z"))).toBe("2026-09-07");
  });

  it("Ням 23:30 УТС = Даваа 07:30 УБ — ажлын өдөр гэж тооцогдоно", () => {
    expect(isWorkday(new Date("2026-09-06T23:30:00.000Z"))).toBe(true);
  });
});

describe("isWorkday", () => {
  it("Даваа–Баасан ажлын өдөр, Бямба/Ням амралт (анхдагч)", () => {
    expect(isWorkday(FRI)).toBe(true);
    expect(isWorkday(SAT)).toBe(false);
    expect(isWorkday(fromIsoDate("2026-09-06"))).toBe(false); // Ням
    expect(isWorkday(MON)).toBe(true);
  });

  it("хуанлийн онцгой өдөр анхдагчийг дардаг", () => {
    const ex: CalendarExceptions = { "2026-09-07": false, "2026-09-05": true };
    expect(isWorkday(MON, ex)).toBe(false); // Даваа — баяр
    expect(isWorkday(SAT, ex)).toBe(true); // Бямба — ажлын өдөр болгосон
  });

  it("crm_calendar_days мөрөөс толь үүсгэнэ", () => {
    expect(calendarExceptionsFromRows([{ day: "2026-09-07", is_workday: false }])).toEqual({ "2026-09-07": false });
    expect(calendarExceptionsFromRows(null)).toEqual({});
  });
});

describe("addBusinessDays", () => {
  it("амралтын өдрийг алгасдаг (Баасан + 1 → Даваа)", () => {
    expect(toIsoDate(addBusinessDays(FRI, 1))).toBe("2026-09-07");
  });

  it("ажлын 5 өдөр — 2 амралтын өдрийг давдаг", () => {
    expect(toIsoDate(addBusinessDays(FRI, 5))).toBe("2026-09-11");
  });

  it("баярын өдрийг exceptions-оор алгасдаг", () => {
    const ex: CalendarExceptions = { "2026-09-07": false };
    expect(toIsoDate(addBusinessDays(FRI, 1, ex))).toBe("2026-09-08");
  });

  it("0 өдөр — эхлэх өдөр өөрөө тооцогдохгүй, огноо хэвээр", () => {
    expect(toIsoDate(addBusinessDays(FRI, 0))).toBe("2026-09-04");
  });

  it("бодит агшинг УБ-ын огноогоор эхлүүлнэ (Баасан 23:00 УБ + 1 → Даваа)", () => {
    expect(toIsoDate(addBusinessDays(new Date("2026-09-04T15:00:00.000Z"), 1))).toBe("2026-09-07");
  });
});

describe("businessDaysBetween", () => {
  it("from-г оруулахгүй, to-г оруулж тоолдог", () => {
    expect(businessDaysBetween(FRI, MON)).toBe(1);
    expect(businessDaysBetween(fromIsoDate("2026-09-07"), fromIsoDate("2026-09-11"))).toBe(4);
  });

  it("to < from бол 0", () => {
    expect(businessDaysBetween(MON, FRI)).toBe(0);
  });
});

describe("isWithinWorkHours", () => {
  it("09:00–18:00 УБ, ажлын өдөр", () => {
    expect(isWithinWorkHours(ubTime("2026-09-07", 9))).toBe(true);
    expect(isWithinWorkHours(ubTime("2026-09-07", 17, 59))).toBe(true);
    expect(isWithinWorkHours(ubTime("2026-09-07", 18))).toBe(false);
    expect(isWithinWorkHours(ubTime("2026-09-07", 8, 59))).toBe(false);
    expect(isWithinWorkHours(ubTime("2026-09-05", 11))).toBe(false); // Бямба
  });

  it("20:00 УБ (= 12:00 UTC) ажлын цаг БИШ", () => {
    expect(isWithinWorkHours(new Date("2026-09-07T12:00:00.000Z"))).toBe(false);
  });
});

describe("slaClockStart (ажлын бус цагийн дараалал)", () => {
  it("ажлын цагийн дотор ирсэн үйл явдал тэр мөчөөсөө", () => {
    const at = ubTime("2026-09-04", 10, 30);
    expect(slaClockStart(at).toISOString()).toBe(at.toISOString());
  });

  it("өглөө эрт ирсэн нь тухайн өдрийн 09:00 УБ-аас", () => {
    expect(slaClockStart(ubTime("2026-09-04", 6)).toISOString()).toBe(ubTime("2026-09-04", 9).toISOString());
  });

  it("оройн цагт ирсэн нь дараагийн ажлын өдрийн эхлэлээс (Баасан 20:00 → Даваа 09:00)", () => {
    expect(slaClockStart(ubTime("2026-09-04", 20)).toISOString()).toBe(ubTime("2026-09-07", 9).toISOString());
  });

  it("амралтын өдөр ирсэн нь дараагийн ажлын өдрөөс", () => {
    expect(slaClockStart(ubTime("2026-09-05", 11)).toISOString()).toBe(ubTime("2026-09-07", 9).toISOString());
  });

  it("баярын өдөр алгасна", () => {
    const ex: CalendarExceptions = { "2026-09-07": false };
    expect(slaClockStart(ubTime("2026-09-05", 11), undefined, ex).toISOString()).toBe(
      ubTime("2026-09-08", 9).toISOString()
    );
  });
});

describe("slaDeadline (§6.4: ажлын цагаар 15 минут)", () => {
  it("ХҮЛЭЭН АВАХ: Даваа 10:00 УБ сэжимд хугацаа 10:15 УБ", () => {
    const at = new Date("2026-09-07T02:00:00.000Z"); // Даваа 10:00 УБ
    expect(slaDeadline(at, 15).toISOString()).toBe("2026-09-07T02:15:00.000Z"); // 10:15 УБ
  });

  it("өдрийн төгсгөлд хүрвэл дараагийн ажлын өдөрт үргэлжилдэг", () => {
    const at = ubTime("2026-09-04", 17, 50); // Баасан 17:50 УБ
    expect(slaDeadline(at, 30).toISOString()).toBe(ubTime("2026-09-07", 9, 20).toISOString());
  });

  it("ажлын бус цагт ирсэн SLA дараагийн ажлын өдрөөс тоологддог", () => {
    expect(slaDeadline(ubTime("2026-09-05", 11), 15).toISOString()).toBe(ubTime("2026-09-07", 9, 15).toISOString());
  });

  it("оройн 20:00 УБ-д ирсэн сэжим маргааш 09:15 УБ", () => {
    expect(slaDeadline(ubTime("2026-09-08", 20), 15).toISOString()).toBe(ubTime("2026-09-09", 9, 15).toISOString());
  });

  it("тохиргооны ажлын цагийг дагана", () => {
    const hours = workHoursFromPolicy({ work_hours: { start: 10, end: 19 } });
    expect(slaDeadline(ubTime("2026-09-07", 9, 30), 15, hours).toISOString()).toBe(
      ubTime("2026-09-07", 10, 15).toISOString()
    );
  });
});

describe("эх сурвалжаар ялгаатай SLA (§6.4)", () => {
  const policy: SlaPolicy = {
    work_hours: { start: 9, end: 18 },
    by_source: {
      default: { kind: "minutes", minutes: 15 },
      referral: { kind: "same_day" },
      personal_network: { kind: "same_day" },
    },
  };

  it("дижитал сэжим — ажлын цагаар 15 минут", () => {
    const at = ubTime("2026-09-07", 10);
    expect(leadSlaDeadline(at, "digital", { policy, fallbackMinutes: 15 }).toISOString()).toBe(
      ubTime("2026-09-07", 10, 15).toISOString()
    );
  });

  it("реферал — мэдээлэл авсан өдрийн 24:00 УБ хүртэл", () => {
    const at = ubTime("2026-09-05", 21); // Бямба орой ч тухайн өдөрт нь
    expect(leadSlaDeadline(at, "referral", { policy, fallbackMinutes: 15 }).toISOString()).toBe(
      ubTime("2026-09-06", 0).toISOString()
    );
  });

  it("бодлого тохируулаагүй бол fallback минут", () => {
    expect(sourceSlaRule(null, "referral", 20)).toEqual({ kind: "minutes", minutes: 20 });
    expect(workHoursFromPolicy({ work_hours: { start: 18, end: 9 } })).toEqual({ startHour: 9, endHour: 18 });
  });
});
