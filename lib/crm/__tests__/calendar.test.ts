import { describe, expect, it } from "vitest";

import { fromIsoDate, toIsoDate, ubHour, ubTime, ubWeekday } from "@/lib/crm/calendar";

// Бүх оролт бодит UTC агшин; УБ = UTC+8.
describe("Улаанбаатарын цаг", () => {
  it("ubTime нь УБ-ын ханын цагийг бодит агшин болгоно", () => {
    expect(ubTime("2026-09-07", 10).toISOString()).toBe("2026-09-07T02:00:00.000Z");
    expect(ubHour(new Date("2026-09-07T02:00:00.000Z"))).toBe(10);
  });

  it("УБ-ын шөнө дунд өнгөрмөгц огноо солигдоно (UTC 16:00)", () => {
    expect(toIsoDate(new Date("2026-09-06T15:59:00.000Z"))).toBe("2026-09-06");
    expect(toIsoDate(new Date("2026-09-06T16:00:00.000Z"))).toBe("2026-09-07");
  });

  it("Ням 23:30 УТС = Даваа 07:30 УБ (гараг 1)", () => {
    expect(ubWeekday(new Date("2026-09-06T23:30:00.000Z"))).toBe(1);
    expect(fromIsoDate("2026-09-07").toISOString()).toBe("2026-09-07T00:00:00.000Z");
  });
});
