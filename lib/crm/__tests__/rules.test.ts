import { describe, it, expect } from "vitest";

import {
  ruleGate,
  parseRuleActions,
  evaluateRuleCondition,
  conditionParam,
  sinceIso,
  queueDrainDeadline,
  leadSlaSteps,
  normalizeAutomationThresholds,
  DEFAULT_AUTOMATION_THRESHOLDS,
  leadProtectionState,
  isHotLeadInactive,
  showingFeedbackState,
  isOfferExpiring,
  isOfferFollowupDue,
  isoDaysBetween,
  type AutomationRule,
} from "@/lib/crm/rules";
import { parseHm, isQuietHours, dedupeCutoffIso, resolveMatrixRecipients, panelLink } from "@/lib/crm/notify";
import { isPushConfigured, vapidConfig, parsePushSubscription, buildPushPayload, isGoneStatus } from "@/lib/crm/push";
import { isWithinWorkHours, workHoursFromPolicy } from "@/lib/crm/calendar";

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

// ════════════════════════════════════════════════════════════
// PRO-001 v2.1 — SLA гинж, өдрийн автоматжуулалт, мэдэгдлийн матриц, push
// ════════════════════════════════════════════════════════════

/** УБ-ын ханын цаг → бодит агшин (UTC+8). */
const ub = (iso: string, hm: string) => new Date(`${iso}T${hm}:00+08:00`);
const H = 3600 * 1000;

describe("queueDrainDeadline — ажлын бус цагийн сэжим 09:05 УБ-д хуваарилагдана", () => {
  const opts = { fallbackMinutes: 15, policy: { work_hours: { start: 9, end: 18 } } };

  it("cron-ы 09:05 УБ (01:05 UTC) дуудлага ажлын цагт тооцогдоно", () => {
    // 2026-11-09 Даваа
    expect(isWithinWorkHours(ub("2026-11-09", "09:05"), workHoursFromPolicy(opts.policy))).toBe(true);
    expect(isWithinWorkHours(ub("2026-11-09", "08:55"), workHoursFromPolicy(opts.policy))).toBe(false);
    expect(ub("2026-11-09", "09:05").toISOString()).toBe("2026-11-09T01:05:00.000Z");
  });

  it("Ням 22:00 УБ-д ирсэн дижитал сэжим → Даваа 09:15 УБ хүртэл", () => {
    const due = queueDrainDeadline(ub("2026-11-08", "22:00"), ub("2026-11-09", "09:05"), "digital", opts);
    expect(due.toISOString()).toBe(ub("2026-11-09", "09:15").toISOString());
  });

  it("систем хоцорч хуваарилбал (11:00) хуваарилсан мөчөөс 15 минут", () => {
    const due = queueDrainDeadline(ub("2026-11-08", "22:00"), ub("2026-11-09", "11:00"), "digital", opts);
    expect(due.toISOString()).toBe(ub("2026-11-09", "11:15").toISOString());
  });

  it("реферал — мэдээлэл авсан өдрийн 24:00 хүртэл", () => {
    const policy = { ...opts.policy, by_source: { referral: { kind: "same_day" as const } } };
    const due = queueDrainDeadline(ub("2026-11-09", "07:30"), ub("2026-11-09", "09:05"), "referral", {
      ...opts,
      policy,
    });
    expect(due.toISOString()).toBe(ub("2026-11-10", "00:00").toISOString());
  });
});

describe("leadSlaSteps — §6.4 15 мин / 24ц / 48ц гинж", () => {
  const started = ub("2026-11-09", "10:00");
  const due = ub("2026-11-09", "10:15");
  const base = { startedAt: started, dueAt: due, firstContactAt: null, failedAttempts: 0 };
  const hours = { retryHours: 24, escalateHours: 48 };

  it("15 минутын зөрчил дараагийн 5 минутын cron-д илэрнэ (10:20)", () => {
    expect(leadSlaSteps(base, ub("2026-11-09", "10:14"), hours).breach).toBe(false);
    const s = leadSlaSteps(base, ub("2026-11-09", "10:20"), hours);
    expect(s.breach).toBe(true);
    expect(s.retry).toBe(true);
    expect(s.noContact).toBe(false);
  });

  it("хоёр дахь оролдлогын хугацаа сэжим ирснээс 24 цаг (хэтэрснээс биш)", () => {
    const s = leadSlaSteps(base, ub("2026-11-09", "10:20"), hours);
    expect(s.retryDeadline.getTime()).toBe(started.getTime() + 24 * H);
  });

  it("холбогдож чадаагүй бүртгэл → хугацаа хэтрээгүй ч дахин оролдлого", () => {
    const s = leadSlaSteps({ ...base, failedAttempts: 1 }, ub("2026-11-09", "10:10"), hours);
    expect(s.breach).toBe(false);
    expect(s.retry).toBe(true);
  });

  it("48 цаг сэжим ирсэн мөчөөс", () => {
    expect(leadSlaSteps(base, new Date(started.getTime() + 47 * H), hours).noContact).toBe(false);
    expect(leadSlaSteps(base, new Date(started.getTime() + 48 * H), hours).noContact).toBe(true);
  });

  it("утга бүхий холболт бүртгэгдсэн бол гинж зогсоно", () => {
    const s = leadSlaSteps({ ...base, firstContactAt: ub("2026-11-09", "10:30"), failedAttempts: 2 }, ub("2026-11-12", "10:00"), hours);
    expect(s).toMatchObject({ breach: false, retry: false, noContact: false });
  });

  it("хугацаа өнгөрсний дараа үүссэн даалгаврын хугацаа одооноос өмнө болохгүй", () => {
    const now = new Date(started.getTime() + 30 * H);
    expect(leadSlaSteps(base, now, hours).retryDeadline.getTime()).toBe(now.getTime());
  });
});

describe("normalizeAutomationThresholds", () => {
  it("хоосон/буруу утгад анхдагч", () => {
    expect(normalizeAutomationThresholds(null)).toEqual(DEFAULT_AUTOMATION_THRESHOLDS);
    expect(normalizeAutomationThresholds([1, 2])).toEqual(DEFAULT_AUTOMATION_THRESHOLDS);
  });

  it("хэсэгчилсэн тохиргоог нийлүүлж, зөрчилтэй утгыг засна", () => {
    const t = normalizeAutomationThresholds({
      lead_protection: { new_no_contact_days: 2, warn_before_days: 5 },
      showing_feedback_hours: 36,
      showing_feedback_escalate_hours: 12,
      hot_lead_inactive_days: -1,
    });
    expect(t.lead_protection).toEqual({ new_no_contact_days: 2, warn_before_days: 2 });
    expect(t.showing_feedback_hours).toBe(36);
    expect(t.showing_feedback_escalate_hours).toBe(36);
    expect(t.hot_lead_inactive_days).toBe(DEFAULT_AUTOMATION_THRESHOLDS.hot_lead_inactive_days);
  });
});

describe("leadProtectionState — §6.26 нэр, утастай бүртгэл хугацаагүй хамгаалагдахгүй", () => {
  const cfg = { new_no_contact_days: 3, warn_before_days: 1 };
  const created = ub("2026-11-01", "10:00");
  const lead = { status: "new", createdAt: created, firstContactAt: null, unprotected: false };

  it("босгоос өмнө ok, 1 хоногийн өмнө warn, босгонд expire", () => {
    expect(leadProtectionState(lead, new Date(created.getTime() + 24 * H), cfg)).toBe("ok");
    expect(leadProtectionState(lead, new Date(created.getTime() + 49 * H), cfg)).toBe("warn");
    expect(leadProtectionState(lead, new Date(created.getTime() + 72 * H), cfg)).toBe("expire");
  });

  it("утга бүхий холболттой, идэвхтэй, аль хэдийн хамгаалалтгүй бол хамаарахгүй", () => {
    const later = new Date(created.getTime() + 10 * 24 * H);
    expect(leadProtectionState({ ...lead, firstContactAt: created }, later, cfg)).toBe("ok");
    expect(leadProtectionState({ ...lead, status: "active" }, later, cfg)).toBe("ok");
    expect(leadProtectionState({ ...lead, unprotected: true }, later, cfg)).toBe("ok");
  });
});

describe("isHotLeadInactive / showingFeedbackState / санал", () => {
  it("зөвхөн A, идэвхтэй, босгоос олон хоног", () => {
    const cfg = { hot_lead_inactive_days: 3 };
    expect(isHotLeadInactive({ grade: "a", status: "active", inactivityDays: 3 }, cfg)).toBe(true);
    expect(isHotLeadInactive({ grade: "a", status: "active", inactivityDays: 2 }, cfg)).toBe(false);
    expect(isHotLeadInactive({ grade: "b", status: "active", inactivityDays: 9 }, cfg)).toBe(false);
    expect(isHotLeadInactive({ grade: "a", status: "new", inactivityDays: 9 }, cfg)).toBe(false);
  });

  it("үзлэгийн эргэх холбоо: 24ц → агент, 48ц → ахлагч", () => {
    const cfg = { showing_feedback_hours: 24, showing_feedback_escalate_hours: 48 };
    const at = ub("2026-11-09", "15:00");
    expect(showingFeedbackState(at, false, new Date(at.getTime() + 23 * H), cfg)).toBe("none");
    expect(showingFeedbackState(at, false, new Date(at.getTime() + 25 * H), cfg)).toBe("overdue");
    expect(showingFeedbackState(at, false, new Date(at.getTime() + 49 * H), cfg)).toBe("escalate");
    expect(showingFeedbackState(at, true, new Date(at.getTime() + 49 * H), cfg)).toBe("none");
  });

  it("саналын хүчинтэй хугацаа ба давтамж", () => {
    expect(isoDaysBetween("2026-11-09", "2026-11-11")).toBe(2);
    expect(isOfferExpiring("2026-11-11", "2026-11-09", 2)).toBe(true);
    expect(isOfferExpiring("2026-11-12", "2026-11-09", 2)).toBe(false);
    expect(isOfferExpiring("2026-11-08", "2026-11-09", 2)).toBe(false);
    expect(isOfferExpiring(null, "2026-11-09", 2)).toBe(false);
    expect(isOfferFollowupDue("2026-11-08", "2026-11-09", 1)).toBe(true);
    expect(isOfferFollowupDue("2026-11-09", "2026-11-09", 1)).toBe(false);
    expect(isOfferFollowupDue(null, "2026-11-09", 1)).toBe(true);
  });
});

describe("resolveMatrixRecipients — мэдэгдлийн матриц", () => {
  const staff = [
    { profile_id: "ag1", roles: ["agent"], team_id: "t1" },
    { profile_id: "ag2", roles: ["agent"], team_id: "t2" },
    { profile_id: "tl1", roles: ["team_lead", "agent"], team_id: "t1" },
    { profile_id: "tl2", roles: ["team_lead"], team_id: "t2" },
    { profile_id: "sd", roles: ["sales_director"], team_id: null },
    { profile_id: "aml", roles: ["aml_officer"], team_id: null },
    { profile_id: "ceo", roles: ["ceo"], team_id: null },
  ];

  it("матрицгүй үед шууд хүлээн авагч + includeRoles", () => {
    expect(resolveMatrixRecipients({ direct: ["ag1", null], matrixRoles: null, includeRoles: ["sales_director"], staff }).sort()).toEqual(
      ["ag1", "sd"]
    );
  });

  it("agent + team_lead → эзэмшигч ба өөрийн багийн ахлагч (бусад багийнх биш)", () => {
    expect(resolveMatrixRecipients({ direct: ["ag1"], matrixRoles: ["agent", "team_lead"], staff }).sort()).toEqual(["ag1", "tl1"]);
  });

  it("оффисын дүр (sales_director) → бүх тухайн дүртэй ажилтан", () => {
    expect(
      resolveMatrixRecipients({ direct: ["ag2"], matrixRoles: ["agent", "team_lead", "sales_director"], staff }).sort()
    ).toEqual(["ag2", "sd", "tl2"]);
  });

  it("матрицад agent байхгүй бол агентад очихгүй (МУТСТ)", () => {
    expect(
      resolveMatrixRecipients({ direct: ["ag1", "aml"], matrixRoles: ["aml_officer", "ceo"], staff }).sort()
    ).toEqual(["aml", "ceo"]);
  });

  it("баггүй эзэмшигчид ахлагч олдохгүй — includeRoles-оор БХЗ", () => {
    const noTeam = [...staff, { profile_id: "ag3", roles: ["agent"], team_id: null }];
    expect(
      resolveMatrixRecipients({ direct: ["ag3"], matrixRoles: ["agent", "team_lead"], includeRoles: ["sales_director"], staff: noTeam }).sort()
    ).toEqual(["ag3", "sd"]);
  });
});

describe("panelLink — холбоосыг хүлээн авагчийн панельд тааруулах", () => {
  it("оффисын хэрэглэгчид /agent/crm → /office/crm, боломж → deals", () => {
    expect(panelLink("/agent/crm/leads/x", "office_admin")).toBe("/office/crm/leads/x");
    expect(panelLink("/agent/crm/pipeline/o1", "admin")).toBe("/office/crm/deals/o1");
    expect(panelLink("/office/crm/aml/1", "office_admin")).toBe("/office/crm/aml/1");
  });

  it("агентад зөвхөн агентын панелд байдаг хэсэг солигдоно", () => {
    expect(panelLink("/office/crm/leads/x", "agent")).toBe("/agent/crm/leads/x");
    expect(panelLink("/office/crm/deals/o1", "agent")).toBe("/agent/crm/pipeline/o1");
    expect(panelLink("/office/crm/properties/p?tab=1", "agent")).toBe("/agent/crm/properties/p?tab=1");
    expect(panelLink("/office/crm/settings/rules", "agent")).toBe("/office/crm/settings/rules");
    expect(panelLink("/office/crm", "agent")).toBe("/agent/crm");
    expect(panelLink("/office/crm/transactions/t1", "agent")).toBe("/agent/crm/transactions/t1");
    expect(panelLink("/office/crm/disputes?id=d1", "agent")).toBe("/agent/crm/pool?tab=disputes&id=d1");
    expect(panelLink("/office/crm/disputes", "agent")).toBe("/agent/crm/pool?tab=disputes");
  });
});

describe("push — VAPID тохиргоо, захиалга, ачаалал", () => {
  it("VAPID дутуу бол push алгасна (алдаагүй)", () => {
    expect(isPushConfigured({})).toBe(false);
    expect(isPushConfigured({ VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "s" })).toBe(false);
    expect(isPushConfigured({ VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "s", VAPID_SUBJECT: "nemi" })).toBe(false);
    expect(
      vapidConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "s", VAPID_SUBJECT: "mailto:a@b.mn" })
    ).toEqual({ publicKey: "p", privateKey: "s", subject: "mailto:a@b.mn" });
  });

  it("хөтчийн захиалгыг шалгана", () => {
    const ok = {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
    };
    expect(parsePushSubscription(ok)).toEqual({ endpoint: ok.endpoint, p256dh: ok.keys.p256dh, auth: ok.keys.auth });
    expect(parsePushSubscription({ ...ok, endpoint: "http://insecure" })).toBeNull();
    expect(parsePushSubscription({ endpoint: ok.endpoint, keys: { p256dh: "x", auth: "y" } })).toBeNull();
    expect(parsePushSubscription(null)).toBeNull();
  });

  it("ачаалал тайрагдаж, гадаад холбоос хасагдана", () => {
    const p = JSON.parse(buildPushPayload({ title: "x".repeat(200), body: "b", url: "https://evil.example" }));
    expect(p.title.length).toBe(80);
    expect(p.url).toBe("/");
    expect(JSON.parse(buildPushPayload({ title: "t", body: "b", url: "//evil" })).url).toBe("/");
    expect(JSON.parse(buildPushPayload({ title: "t", body: "b", url: "/agent/crm/leads/1" })).url).toBe("/agent/crm/leads/1");
    expect(isGoneStatus(410)).toBe(true);
    expect(isGoneStatus(500)).toBe(false);
  });
});
