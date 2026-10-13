import { describe, expect, it } from "vitest";

import {
  agingBucket,
  arrearsStepFor,
  daysPastDue,
  effectiveOverdueDays,
  isPreReminderDue,
  missingEscalationSteps,
  type ArrearsLadder,
} from "@/lib/crm/arrears";

/** Seed-тэй ижил шатлал (scripts/seed-crm.mjs 'arrears_ladder'). */
const LADDER: ArrearsLadder = {
  steps: [
    { step: 1, days: 1, role: "agent" },
    { step: 2, days: 4, role: "property_manager" },
    { step: 3, days: 8, role: "sales_director" },
    { step: 4, days: 15, role: "ceo" },
  ],
};

describe("arrears — хоцролтын хоног", () => {
  it("daysPastDue / effectiveOverdueDays (grace-тэй уялдана F-603)", () => {
    expect(daysPastDue("2026-03-10", "2026-03-15")).toBe(5);
    expect(daysPastDue("2026-03-10", "2026-03-08")).toBe(-2);
    expect(effectiveOverdueDays("2026-03-10", 3, "2026-03-15")).toBe(2);
    expect(effectiveOverdueDays("2026-03-10", 0, "2026-03-15")).toBe(5);
  });
});

describe("arrearsStepFor (F-535/538)", () => {
  it("grace дотор → шатлалд ороогүй (null)", () => {
    expect(
      arrearsStepFor({ dueOn: "2026-03-10", graceDays: 3, today: "2026-03-12", ladder: LADDER })
    ).toBeNull();
    // grace яг дуусах өдөр — босго 1 хоног хараахан болоогүй.
    expect(
      arrearsStepFor({ dueOn: "2026-03-10", graceDays: 3, today: "2026-03-13", ladder: LADDER })
    ).toBeNull();
  });

  it("босго бүрд зөв шат + зөв хариуцагч дүр", () => {
    const s1 = arrearsStepFor({ dueOn: "2026-03-10", graceDays: 0, today: "2026-03-12", ladder: LADDER });
    expect(s1?.step).toBe(1);
    expect(s1?.role).toBe("agent");

    const s2 = arrearsStepFor({ dueOn: "2026-03-10", graceDays: 0, today: "2026-03-15", ladder: LADDER });
    expect(s2?.step).toBe(2);
    expect(s2?.role).toBe("property_manager");

    const s3 = arrearsStepFor({ dueOn: "2026-03-10", graceDays: 0, today: "2026-03-18", ladder: LADDER });
    expect(s3?.step).toBe(3);
    expect(s3?.role).toBe("sales_director");

    const s4 = arrearsStepFor({ dueOn: "2026-03-01", graceDays: 0, today: "2026-03-20", ladder: LADDER });
    expect(s4?.step).toBe(4);
    expect(s4?.role).toBe("ceo");
  });

  it("grace шатны босгыг хойшлуулна (тохиргоо өөрчлөгдөхөд дагана)", () => {
    // 5 хоног хоцролт, grace 3 → бодит 2 хоног → 1-р шат (grace-гүй бол 2-р шат).
    const withGrace = arrearsStepFor({
      dueOn: "2026-03-10",
      graceDays: 3,
      today: "2026-03-15",
      ladder: LADDER,
    });
    expect(withGrace?.step).toBe(1);
  });

  it("давтагдсан хоцролт → шат алгасаж дээшилнэ (F-538)", () => {
    const bumped = arrearsStepFor({
      dueOn: "2026-03-10",
      graceDays: 0,
      today: "2026-03-12", // ердийн үед 1-р шат
      ladder: LADDER,
      priorLateCount: 2,
      repeatThreshold: 2,
    });
    expect(bumped?.step).toBe(2);
    expect(bumped?.role).toBe("property_manager");
  });

  it("давтагдсан ч дээд шатнаас хэтрэхгүй", () => {
    const top = arrearsStepFor({
      dueOn: "2026-03-01",
      graceDays: 0,
      today: "2026-03-25", // аль хэдийн 4-р шат
      ladder: LADDER,
      priorLateCount: 5,
    });
    expect(top?.step).toBe(4);
  });

  it("хоосон шатлалд null", () => {
    expect(
      arrearsStepFor({ dueOn: "2026-03-01", graceDays: 0, today: "2026-03-25", ladder: { steps: [] } })
    ).toBeNull();
  });
});

describe("missingEscalationSteps (F-536 — түүх бүрэн)", () => {
  it("бүртгэгдээгүй завсрын шатуудыг бүгдийг буцаана", () => {
    const target = LADDER.steps[2]; // step 3
    const missing = missingEscalationSteps(target, [1], LADDER);
    expect(missing.map((s) => s.step)).toEqual([2, 3]);
  });

  it("бүгд бүртгэгдсэн бол хоосон", () => {
    expect(missingEscalationSteps(LADDER.steps[1], [1, 2], LADDER)).toEqual([]);
    expect(missingEscalationSteps(null, [], LADDER)).toEqual([]);
  });
});

describe("isPreReminderDue (Д-15) / agingBucket (F-524)", () => {
  it("төлөх өдрөөс 3 хоногийн өмнөх цонхонд сануулна", () => {
    expect(isPreReminderDue("2026-03-10", "2026-03-07")).toBe(true);
    expect(isPreReminderDue("2026-03-10", "2026-03-09")).toBe(true);
    expect(isPreReminderDue("2026-03-10", "2026-03-06")).toBe(false);
    expect(isPreReminderDue("2026-03-10", "2026-03-10")).toBe(false);
  });

  it("насжилтын бүлэглэл 1–3/4–7/8+", () => {
    expect(agingBucket("2026-03-10", "2026-03-10")).toBe("current");
    expect(agingBucket("2026-03-10", "2026-03-12")).toBe("d1_3");
    expect(agingBucket("2026-03-10", "2026-03-16")).toBe("d4_7");
    expect(agingBucket("2026-03-10", "2026-03-25")).toBe("d8_plus");
  });
});
