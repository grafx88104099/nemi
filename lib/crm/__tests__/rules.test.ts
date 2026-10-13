import { describe, it, expect } from "vitest";

import {
  ruleGate,
  parseRuleActions,
  evaluateRuleCondition,
  conditionParam,
  sinceIso,
  type AutomationRule,
} from "@/lib/crm/rules";
import { parseHm, isQuietHours, dedupeCutoffIso } from "@/lib/crm/notify";

function rule(partial: Partial<AutomationRule>): AutomationRule {
  return { code: "D-99", is_active: true, dry_run: false, ...partial };
}

describe("ruleGate (F-601)", () => {
  it("мөр байхгүй бол default идэвхтэй", () => {
    expect(ruleGate(null)).toEqual({ run: true, dryRun: false, reason: null });
    expect(ruleGate(undefined)).toEqual({ run: true, dryRun: false, reason: null });
  });

  it("идэвхгүй дүрэм ажиллахгүй", () => {
    expect(ruleGate(rule({ is_active: false }))).toEqual({ run: false, dryRun: false, reason: "inactive" });
  });

  it("dry_run — зөвхөн лог", () => {
    expect(ruleGate(rule({ dry_run: true }))).toEqual({ run: false, dryRun: true, reason: "dry_run" });
  });

  it("идэвхгүй нь dry_run-аас давамгайлна", () => {
    expect(ruleGate(rule({ is_active: false, dry_run: true })).reason).toBe("inactive");
  });
});

describe("parseRuleActions", () => {
  it("зөв бүтэцтэй үйлдлүүдийг буцаана", () => {
    const r = rule({
      actions: [
        { kind: "create_task" },
        { kind: "notify", params: { event: "lead_assigned" } },
        { kind: "unknown_kind" },
        "string",
        null,
      ],
    });
    const actions = parseRuleActions(r);
    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({ kind: "create_task", params: undefined });
    expect(actions[1]).toEqual({ kind: "notify", params: { event: "lead_assigned" } });
  });

  it("actions массив биш бол хоосон", () => {
    expect(parseRuleActions(rule({ actions: { kind: "notify" } }))).toEqual([]);
    expect(parseRuleActions(null)).toEqual([]);
  });
});

describe("evaluateRuleCondition — жижиг DSL", () => {
  const entity = {
    status: "active",
    grade: "a",
    score: 85,
    owner_id: null,
    due_on: "2026-09-10",
    end_on: "2026-10-01",
  };
  const today = "2026-09-15";

  it("параметрын объект (seed-ийн {hours:24} г.м.) дүрмийг хаахгүй", () => {
    expect(evaluateRuleCondition({ hours: 24 }, entity, today)).toBe(true);
    expect(evaluateRuleCondition({ setting: "arrears_ladder" }, entity, today)).toBe(true);
    expect(evaluateRuleCondition({}, entity, today)).toBe(true);
    expect(evaluateRuleCondition(null, entity, today)).toBe(true);
  });

  it("eq/ne/in", () => {
    expect(evaluateRuleCondition({ field: "status", op: "eq", value: "active" }, entity, today)).toBe(true);
    expect(evaluateRuleCondition({ field: "status", op: "ne", value: "active" }, entity, today)).toBe(false);
    expect(evaluateRuleCondition({ field: "grade", op: "in", value: ["a", "b"] }, entity, today)).toBe(true);
    expect(evaluateRuleCondition({ field: "grade", op: "in", value: ["c"] }, entity, today)).toBe(false);
  });

  it("тоон харьцуулалт", () => {
    expect(evaluateRuleCondition({ field: "score", op: "gte", value: 80 }, entity, today)).toBe(true);
    expect(evaluateRuleCondition({ field: "score", op: "lt", value: 80 }, entity, today)).toBe(false);
  });

  it("is_null / not_null", () => {
    expect(evaluateRuleCondition({ field: "owner_id", op: "is_null" }, entity, today)).toBe(true);
    expect(evaluateRuleCondition({ field: "grade", op: "not_null" }, entity, today)).toBe(true);
  });

  it("days_past — огнооноос хойш өнгөрсөн хоног", () => {
    // due_on 2026-09-10, today 2026-09-15 → 5 хоног өнгөрсөн.
    expect(evaluateRuleCondition({ field: "due_on", op: "days_past", days: 5 }, entity, today)).toBe(true);
    expect(evaluateRuleCondition({ field: "due_on", op: "days_past", days: 6 }, entity, today)).toBe(false);
  });

  it("days_until — огноо хүртэл үлдсэн хоног", () => {
    // end_on 2026-10-01, today 2026-09-15 → 16 хоног үлдсэн.
    expect(evaluateRuleCondition({ field: "end_on", op: "days_until", days: 30 }, entity, today)).toBe(true);
    expect(evaluateRuleCondition({ field: "end_on", op: "days_until", days: 10 }, entity, today)).toBe(false);
    // Өнгөрсөн огноо days_until-д тохирохгүй.
    expect(evaluateRuleCondition({ field: "due_on", op: "days_until", days: 30 }, entity, today)).toBe(false);
  });

  it("all/any бүрдэл", () => {
    expect(
      evaluateRuleCondition(
        { all: [{ field: "status", op: "eq", value: "active" }, { field: "score", op: "gte", value: 80 }] },
        entity,
        today
      )
    ).toBe(true);
    expect(
      evaluateRuleCondition(
        { all: [{ field: "status", op: "eq", value: "active" }, { field: "score", op: "gte", value: 90 }] },
        entity,
        today
      )
    ).toBe(false);
    expect(
      evaluateRuleCondition(
        { any: [{ field: "score", op: "gte", value: 90 }, { field: "grade", op: "eq", value: "a" }] },
        entity,
        today
      )
    ).toBe(true);
  });

  it("үл мэдэх оператор дүрмийг хаахгүй (аюулгүй тал)", () => {
    expect(evaluateRuleCondition({ field: "status", op: "regex", value: ".*" }, entity, today)).toBe(true);
  });
});

describe("conditionParam", () => {
  it("параметр уншина, байхгүйд fallback", () => {
    expect(conditionParam({ hours: 24 }, "hours", 48)).toBe(24);
    expect(conditionParam({}, "hours", 48)).toBe(48);
    expect(conditionParam(null, "hours", 48)).toBe(48);
    expect(conditionParam({ before_days: 3 }, "before_days", 7)).toBe(3);
  });
});

describe("sinceIso / dedupeCutoffIso", () => {
  it("цагийн зүсэлт зөв", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    expect(sinceIso(24, now)).toBe("2026-09-14T12:00:00.000Z");
    expect(dedupeCutoffIso(now, 24)).toBe("2026-09-14T12:00:00.000Z");
    expect(dedupeCutoffIso(now, 6)).toBe("2026-09-15T06:00:00.000Z");
  });
});

describe("parseHm", () => {
  it("HH:MM → минут", () => {
    expect(parseHm("21:00")).toBe(21 * 60);
    expect(parseHm("09:30")).toBe(9 * 60 + 30);
    expect(parseHm("9:05")).toBe(9 * 60 + 5);
  });

  it("буруу оролтод null", () => {
    expect(parseHm("25:00")).toBeNull();
    expect(parseHm("21:70")).toBeNull();
    expect(parseHm("nope")).toBeNull();
    expect(parseHm(null)).toBeNull();
    expect(parseHm(2100)).toBeNull();
  });
});

describe("isQuietHours (F-653, УБ UTC+8)", () => {
  const quiet = { start: "21:00", end: "09:00" }; // seed-ийн default — шөнө дамнасан

  it("шөнө дамнасан муж: УБ 22:00 (UTC 14:00) — чимээгүй", () => {
    expect(isQuietHours(new Date("2026-09-15T14:00:00Z"), quiet)).toBe(true);
  });

  it("УБ 06:00 (UTC 22:00 өмнөх өдөр) — чимээгүй", () => {
    expect(isQuietHours(new Date("2026-09-14T22:00:00Z"), quiet)).toBe(true);
  });

  it("УБ 12:00 (UTC 04:00) — ажлын цаг", () => {
    expect(isQuietHours(new Date("2026-09-15T04:00:00Z"), quiet)).toBe(false);
  });

  it("яг зааг: УБ 09:00 чимээгүй биш, 21:00 чимээгүй", () => {
    expect(isQuietHours(new Date("2026-09-15T01:00:00Z"), quiet)).toBe(false); // УБ 09:00
    expect(isQuietHours(new Date("2026-09-15T13:00:00Z"), quiet)).toBe(true); // УБ 21:00
  });

  it("энгийн муж (13:00–14:00)", () => {
    const q = { start: "13:00", end: "14:00" };
    expect(isQuietHours(new Date("2026-09-15T05:30:00Z"), q)).toBe(true); // УБ 13:30
    expect(isQuietHours(new Date("2026-09-15T06:30:00Z"), q)).toBe(false); // УБ 14:30
  });

  it("тохиргоогүй/буруу бол чимээгүй биш", () => {
    expect(isQuietHours(new Date(), null)).toBe(false);
    expect(isQuietHours(new Date(), { start: "x", end: "09:00" })).toBe(false);
    expect(isQuietHours(new Date(), { start: "09:00", end: "09:00" })).toBe(false);
  });
});
