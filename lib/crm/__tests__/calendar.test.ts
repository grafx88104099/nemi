import { describe, expect, it } from "vitest";

import {
  addBusinessDays,
  businessDaysBetween,
  fromIsoDate,
  isWorkday,
  slaClockStart,
  slaDeadline,
  toIsoDate,
  type CalendarExceptions,
} from "@/lib/crm/calendar";

// 2026-09-04 = Баасан, 2026-09-05 = Бямба, 2026-09-07 = Даваа.
const FRI = fromIsoDate("2026-09-04");
const SAT = fromIsoDate("2026-09-05");
const MON = fromIsoDate("2026-09-07");

describe("isWorkday", () => {
  it("Даваа–Баасан ажлын өдөр, Бямба/Ням амралт (анхдагч)", () => {
    expect(isWorkday(FRI)).toBe(true);
    expect(isWorkday(SAT)).toBe(false);
    expect(isWorkday(fromIsoDate("2026-09-06"))).toBe(false); // Ням
    expect(isWorkday(MON)).toBe(true);
  });

  it("хуанлийн онцгой өдөр анхдагчийг дардаг (F-604)", () => {
    const ex: CalendarExceptions = { "2026-09-07": false, "2026-09-05": true };
    expect(isWorkday(MON, ex)).toBe(false); // Даваа — баяр
    expect(isWorkday(SAT, ex)).toBe(true); // Бямба — ажлын өдөр болгосон
  });
});

describe("addBusinessDays", () => {
  it("амралтын өдрийг алгасдаг (Баасан + 1 → Даваа)", () => {
    expect(toIsoDate(addBusinessDays(FRI, 1))).toBe("2026-09-07");
  });

  it("МУТСТ-ийн ажлын 5 өдөр — 2 амралтын өдрийг давдаг (Д-25)", () => {
    // Баасан → Да, Мя, Лх, Пү, Ба = 2026-09-11.
    expect(toIsoDate(addBusinessDays(FRI, 5))).toBe("2026-09-11");
  });

  it("баярын өдрийг exceptions-оор алгасдаг", () => {
    const ex: CalendarExceptions = { "2026-09-07": false }; // Даваа баяр
    expect(toIsoDate(addBusinessDays(FRI, 1, ex))).toBe("2026-09-08");
  });

  it("0 өдөр — эхлэх өдөр өөрөө тооцогдохгүй, огноо хэвээр", () => {
    expect(toIsoDate(addBusinessDays(FRI, 0))).toBe("2026-09-04");
  });
});

describe("businessDaysBetween", () => {
  it("from-г оруулахгүй, to-г оруулж тоолдог", () => {
    expect(businessDaysBetween(FRI, MON)).toBe(1); // зөвхөн Даваа
    expect(businessDaysBetween(fromIsoDate("2026-09-07"), fromIsoDate("2026-09-11"))).toBe(4);
  });

  it("to < from бол 0", () => {
    expect(businessDaysBetween(MON, FRI)).toBe(0);
  });
});

describe("slaClockStart (Д-02 ажлын бус цагийн дараалал)", () => {
  it("ажлын цагийн дотор ирсэн үйл явдал тэр мөчөөсөө тоологдоно", () => {
    const at = new Date("2026-09-04T10:30:00.000Z");
    expect(slaClockStart(at).toISOString()).toBe("2026-09-04T10:30:00.000Z");
  });

  it("өглөө эрт ирсэн нь тухайн өдрийн 09:00-оос", () => {
    const at = new Date("2026-09-04T06:00:00.000Z");
    expect(slaClockStart(at).toISOString()).toBe("2026-09-04T09:00:00.000Z");
  });

  it("оройн цагт ирсэн нь дараагийн ажлын өдрийн эхлэлээс (Баасан орой → Даваа 09:00)", () => {
    const at = new Date("2026-09-04T20:00:00.000Z");
    expect(slaClockStart(at).toISOString()).toBe("2026-09-07T09:00:00.000Z");
  });

  it("амралтын өдөр ирсэн нь дараагийн ажлын өдрөөс", () => {
    const at = new Date("2026-09-05T11:00:00.000Z"); // Бямба
    expect(slaClockStart(at).toISOString()).toBe("2026-09-07T09:00:00.000Z");
  });
});

describe("slaDeadline", () => {
  it("15 минутын SLA ажлын цагийн дотор шууд нэмэгддэг", () => {
    const at = new Date("2026-09-04T10:00:00.000Z");
    expect(slaDeadline(at, 15).toISOString()).toBe("2026-09-04T10:15:00.000Z");
  });

  it("өдрийн төгсгөлд хүрвэл дараагийн ажлын өдөрт үргэлжилдэг", () => {
    const at = new Date("2026-09-04T17:50:00.000Z"); // Баасан 17:50, 18:00-д хаагдана
    // 10 мин өнөөдөр + 20 мин Даваа гарагт.
    expect(slaDeadline(at, 30).toISOString()).toBe("2026-09-07T09:20:00.000Z");
  });

  it("ажлын бус цагт ирсэн SLA дараагийн ажлын өдрөөс тоологддог", () => {
    const at = new Date("2026-09-05T11:00:00.000Z"); // Бямба
    expect(slaDeadline(at, 15).toISOString()).toBe("2026-09-07T09:15:00.000Z");
  });
});
