import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import { leadSlaDeadline, type CalendarExceptions, type SlaPolicy } from "@/lib/crm/calendar";

/**
 * Автоматжуулалтын дүрмийн хөдөлгүүр (F-600–603, §7) — Д-01…Д-30 бүх дүрмийн
 * НЭГ ЗАМ: action/cron дүрмээ ажиллуулахын өмнө crm_automation_rules мөрөө
 * шалгаж (идэвхгүй → алгасна, dry_run → зөвхөн лог), үр дүнгээ crm_rule_runs-д
 * бичнэ. Ингэснээр «дүрэм кодгүй унтраах/туршилтын горим» (F-601) хангагдана.
 *
 * Цэвэр хэсэг (ruleGate, evaluateRuleCondition, conditionParam, sinceIso) —
 * unit тестийн бай (lib/crm/__tests__/rules.test.ts); DB хэсэг admin client-ээр.
 */

export type RuleActionKind = "create_task" | "notify" | "set_field" | "transition" | "create_record" | "block";

export type RuleAction = { kind: RuleActionKind; params?: Record<string, unknown> };

export type AutomationRule = {
  code: string;
  name?: string;
  trigger_kind?: string;
  condition?: unknown;
  actions?: unknown;
  is_active: boolean;
  dry_run: boolean;
};

export type RuleGate = {
  /** Дүрмийн үндсэн үйлдлийг гүйцэтгэх үү. */
  run: boolean;
  /** Зөвхөн лог бичих туршилтын горим (F-601). */
  dryRun: boolean;
  reason: "inactive" | "dry_run" | null;
};

/**
 * Дүрмийн мөрөөр гүйцэтгэлийн шийд: мөр байхгүй бол default идэвхтэй
 * (seed-ээс өмнөх/шинэ оффис урсгалаа алдахгүй — U2-ийн createLead прецедент).
 */
export function ruleGate(rule: AutomationRule | null | undefined): RuleGate {
  if (!rule) return { run: true, dryRun: false, reason: null };
  if (!rule.is_active) return { run: false, dryRun: false, reason: "inactive" };
  if (rule.dry_run) return { run: false, dryRun: true, reason: "dry_run" };
  return { run: true, dryRun: false, reason: null };
}

/** actions jsonb → баталгаажсан жагсаалт (буруу бүтэцтэй элементийг хаяна). */
export function parseRuleActions(rule: AutomationRule | null | undefined): RuleAction[] {
  const raw = rule?.actions;
  if (!Array.isArray(raw)) return [];
  const kinds: RuleActionKind[] = ["create_task", "notify", "set_field", "transition", "create_record", "block"];
  const out: RuleAction[] = [];
  for (const a of raw) {
    if (a && typeof a === "object" && !Array.isArray(a)) {
      const kind = (a as { kind?: unknown }).kind;
      if (typeof kind === "string" && (kinds as string[]).includes(kind)) {
        const params = (a as { params?: unknown }).params;
        out.push({
          kind: kind as RuleActionKind,
          params: params && typeof params === "object" && !Array.isArray(params) ? (params as Record<string, unknown>) : undefined,
        });
      }
    }
  }
  return out;
}

// ── Нөхцөлийн жижиг DSL (шинэ generic дүрэмд — §7 төгсгөл) ──
//
// Дэмжих хэлбэрүүд:
//   { field, op: 'eq'|'ne'|'gt'|'gte'|'lt'|'lte'|'in'|'is_null'|'not_null', value? }
//   { field, op: 'days_past'|'days_until', days }   — огнооны offset (today-тай)
//   { all: [...] } / { any: [...] }                 — бүрдэл
// Танигдахгүй бүтэц (жишээ нь seed-ийн {hours:24}, {setting:'...'} параметр)
// предикат БИШ — true (дүрмийг хаахгүй), параметрыг conditionParam-аар уншина.

export type RuleClause = {
  field?: string;
  op?: string;
  value?: unknown;
  days?: number;
  all?: unknown[];
  any?: unknown[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string, toIso: string): number | null {
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00.000Z`).getTime();
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00.000Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

function isClause(c: unknown): c is RuleClause {
  if (!c || typeof c !== "object" || Array.isArray(c)) return false;
  const o = c as RuleClause;
  return typeof o.op === "string" || Array.isArray(o.all) || Array.isArray(o.any);
}

/**
 * Нөхцөлийг entity-ийн снапшот дээр үнэлнэ. today — 'YYYY-MM-DD'
 * (огнооны offset-уудад); заагаагүй бол одоогийн UTC өдөр.
 */
export function evaluateRuleCondition(
  condition: unknown,
  entity: Record<string, unknown>,
  today?: string
): boolean {
  if (!isClause(condition)) return true; // параметрын объект / хоосон — хаахгүй
  const c = condition;
  const day = today ?? new Date().toISOString().slice(0, 10);

  if (Array.isArray(c.all)) return c.all.every((x) => evaluateRuleCondition(x, entity, day));
  if (Array.isArray(c.any)) return c.any.some((x) => evaluateRuleCondition(x, entity, day));
  if (!c.field || typeof c.op !== "string") return true;

  const v = entity[c.field];
  switch (c.op) {
    case "eq":
      return v === c.value;
    case "ne":
      return v !== c.value;
    case "gt":
      return typeof v === "number" && typeof c.value === "number" && v > c.value;
    case "gte":
      return typeof v === "number" && typeof c.value === "number" && v >= c.value;
    case "lt":
      return typeof v === "number" && typeof c.value === "number" && v < c.value;
    case "lte":
      return typeof v === "number" && typeof c.value === "number" && v <= c.value;
    case "in":
      return Array.isArray(c.value) && (c.value as unknown[]).includes(v);
    case "is_null":
      return v == null;
    case "not_null":
      return v != null;
    case "days_past": {
      // Огнооны талбараас хойш ≥ days хоног өнгөрсөн үү.
      if (typeof v !== "string" || typeof c.days !== "number") return false;
      const d = daysBetween(v, day);
      return d != null && d >= c.days;
    }
    case "days_until": {
      // Огнооны талбар хүртэл ≤ days хоног үлдсэн (ирээдүйд) үү.
      if (typeof v !== "string" || typeof c.days !== "number") return false;
      const d = daysBetween(day, v);
      return d != null && d >= 0 && d <= c.days;
    }
    default:
      return true; // үл мэдэх оператор — дүрмийг хаахгүй (аюулгүй тал)
  }
}

/** condition jsonb-оос тохиргооны параметр уншина ({hours:24} г.м.). */
export function conditionParam<T>(condition: unknown, key: string, fallback: T): T {
  if (condition && typeof condition === "object" && !Array.isArray(condition)) {
    const v = (condition as Record<string, unknown>)[key];
    if (v !== undefined && v !== null) return v as T;
  }
  return fallback;
}

/** now − hours цагийн ISO зүсэлт (rule_runs/notifications-ийн dedupe цонх). */
export function sinceIso(hours: number, now: Date = new Date()): string {
  return new Date(now.getTime() - hours * 3600 * 1000).toISOString();
}

// ════════════════════════════════════════════════════════════
// DB хэсэг — admin client (RLS-гүй систем бичилт)
// ════════════════════════════════════════════════════════════

export type AdminClient = ReturnType<typeof createAdminClient>;

export type RuleRunStatus = "ok" | "error" | "skipped" | "dry_run" | "pending";

/** Гүйцэтгэлийн лог (F-602) — алдаа залгина (лог унасан ч урсгал зогсохгүй). */
export async function logRuleRun(
  admin: AdminClient,
  input: {
    officeId: string;
    ruleCode: string;
    entity?: string | null;
    entityId?: string | null;
    status: RuleRunStatus;
    result?: Record<string, unknown> | null;
    error?: string | null;
  }
): Promise<void> {
  try {
    await admin.from("crm_rule_runs").insert({
      office_id: input.officeId,
      rule_code: input.ruleCode,
      entity: input.entity ?? null,
      entity_id: input.entityId ?? null,
      status: input.status,
      result: (input.result ?? null) as Json,
      error: input.error ? input.error.slice(0, 500) : null,
    });
  } catch (e) {
    console.error("logRuleRun:", e instanceof Error ? e.message : e);
  }
}

/**
 * Энэ entity дээр дүрэм өмнө нь гүйсэн үү (cron-ы идемпотент байдлын түлхүүр).
 * sinceIso өгвөл зөвхөн тэр мөчөөс хойшхыг тоолно.
 */
export async function hasRuleRun(
  admin: AdminClient,
  input: {
    officeId: string;
    ruleCode: string;
    entity: string;
    entityId: string;
    statuses?: RuleRunStatus[];
    sinceIso?: string;
  }
): Promise<boolean> {
  let q = admin
    .from("crm_rule_runs")
    .select("id")
    .eq("office_id", input.officeId)
    .eq("rule_code", input.ruleCode)
    .eq("entity", input.entity)
    .eq("entity_id", input.entityId)
    .limit(1);
  if (input.statuses?.length) q = q.in("status", input.statuses);
  if (input.sinceIso) q = q.gte("ran_at", input.sinceIso);
  const { data, error } = await q;
  if (error) {
    console.error("hasRuleRun:", error.message);
    return true; // алдаан дээр давхардуулахгүй тал руу
  }
  return (data ?? []).length > 0;
}

/** Оффисын дүрмийн мөрүүд — cron-д нэг удаа ачаалж map-аар шалгана. */
export async function getRuleMap(admin: AdminClient): Promise<Map<string, AutomationRule>> {
  const map = new Map<string, AutomationRule>();
  const { data, error } = await admin
    .from("crm_automation_rules")
    .select("office_id, code, trigger_kind, condition, actions, is_active, dry_run");
  if (error) {
    console.error("getRuleMap:", error.message);
    return map;
  }
  for (const r of data ?? []) {
    map.set(`${r.office_id}:${r.code}`, {
      code: r.code,
      trigger_kind: r.trigger_kind,
      condition: r.condition,
      actions: r.actions,
      is_active: r.is_active,
      dry_run: r.dry_run,
    });
  }
  return map;
}

/** CRM идэвхтэй бүх оффис (cron-ы гадаад давталт). */
export async function listCrmOffices(admin: AdminClient): Promise<string[]> {
  const { data, error } = await admin.from("crm_staff").select("office_id").eq("is_active", true);
  if (error) {
    console.error("listCrmOffices:", error.message);
    return [];
  }
  return [...new Set((data ?? []).map((r) => r.office_id))];
}

export type RunRuleResult = {
  status: RuleRunStatus;
  result?: Record<string, unknown>;
  error?: string;
};

/**
 * Дүрмийн НЭГ ЗАМ (§7): мөрөө шалгаад execute-ыг гүйцэтгэж, rule_runs-д логлоно.
 *  • rule мөр идэвхгүй → 'skipped' лог, execute дуудагдахгүй;
 *  • dry_run → 'dry_run' лог (dryRunResult-тэй), execute дуудагдахгүй;
 *  • execute шидвэл 'error' лог — алдаа дуудагч руу буцна (шидэхгүй).
 */
export async function runRule(
  admin: AdminClient,
  input: {
    officeId: string;
    code: string;
    entity?: string | null;
    entityId?: string | null;
    /** Урьдчилж ачаалсан мөр (getRuleMap); undefined бол өөрөө уншина. */
    rule?: AutomationRule | null;
    execute: () => Promise<Record<string, unknown> | void>;
    dryRunResult?: Record<string, unknown>;
  }
): Promise<RunRuleResult> {
  let rule = input.rule;
  if (rule === undefined) {
    const { data } = await admin
      .from("crm_automation_rules")
      .select("code, trigger_kind, condition, actions, is_active, dry_run")
      .eq("office_id", input.officeId)
      .eq("code", input.code)
      .maybeSingle();
    rule = (data as AutomationRule | null) ?? null;
  }

  const gate = ruleGate(rule);
  const base = {
    officeId: input.officeId,
    ruleCode: input.code,
    entity: input.entity,
    entityId: input.entityId,
  };
  if (!gate.run) {
    if (gate.dryRun) {
      await logRuleRun(admin, { ...base, status: "dry_run", result: input.dryRunResult ?? null });
      return { status: "dry_run" };
    }
    await logRuleRun(admin, { ...base, status: "skipped", result: { reason: "inactive" } });
    return { status: "skipped" };
  }

  try {
    const result = (await input.execute()) ?? undefined;
    await logRuleRun(admin, { ...base, status: "ok", result: result ?? null });
    return { status: "ok", result: result ?? undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logRuleRun(admin, { ...base, status: "error", error: msg });
    return { status: "error", error: msg };
  }
}

// ════════════════════════════════════════════════════════════
// SLA гинж ба өдрийн автоматжуулалтын цэвэр шийдүүд (PRO-001 v2.1
// §6.4, §6.15, §6.16, §6.26, §6.28) — босго бүр crm_settings-ээс
// ('automation_thresholds'); эндхийн DEFAULT нь зөвхөн fallback.
// ════════════════════════════════════════════════════════════

export type AutomationThresholds = {
  /** §6.26: холболтгүй шинэ сэжимийн эзэмшлийн хамгаалалт. */
  lead_protection: { new_no_contact_days: number; warn_before_days: number };
  /** §6.28.6: халуун (A) сэжим идэвхгүй гэж үзэх хоног. */
  hot_lead_inactive_days: number;
  /** §6.15/§6.28.3: үзлэгийн дараах эргэх холбооны хугацаа, ахлагчид шилжих хугацаа (цаг). */
  showing_feedback_hours: number;
  showing_feedback_escalate_hours: number;
  /** §6.28.4: үнийн саналын шатны сануулгын давтамж (хоног). */
  offer_followup_days: number;
  /** §6.16: саналын хүчинтэй хугацаа дуусахаас өмнөх сануулга (хоног). */
  offer_expiring_days: number;
  /** §6.4: дараагийн үйлдэл хэтэрснээс хойш ахлагчид харагдах хоног. */
  next_step_overdue_escalate_days: number;
};

export const DEFAULT_AUTOMATION_THRESHOLDS: AutomationThresholds = {
  lead_protection: { new_no_contact_days: 3, warn_before_days: 1 },
  hot_lead_inactive_days: 3,
  showing_feedback_hours: 24,
  showing_feedback_escalate_hours: 48,
  offer_followup_days: 1,
  offer_expiring_days: 2,
  next_step_overdue_escalate_days: 3,
};

function posNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
}

function nonNeg(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** Тохиргооны хэсэгчилсэн/буруу утгыг анхдагчтай нийлүүлнэ. */
export function normalizeAutomationThresholds(raw: unknown): AutomationThresholds {
  const d = DEFAULT_AUTOMATION_THRESHOLDS;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return d;
  const r = raw as Record<string, unknown>;
  const lp = (r.lead_protection ?? {}) as Record<string, unknown>;
  const newDays = posNum(lp.new_no_contact_days, d.lead_protection.new_no_contact_days);
  const feedback = posNum(r.showing_feedback_hours, d.showing_feedback_hours);
  return {
    lead_protection: {
      new_no_contact_days: newDays,
      warn_before_days: Math.min(nonNeg(lp.warn_before_days, d.lead_protection.warn_before_days), newDays),
    },
    hot_lead_inactive_days: posNum(r.hot_lead_inactive_days, d.hot_lead_inactive_days),
    showing_feedback_hours: feedback,
    showing_feedback_escalate_hours: Math.max(
      feedback,
      posNum(r.showing_feedback_escalate_hours, d.showing_feedback_escalate_hours)
    ),
    offer_followup_days: posNum(r.offer_followup_days, d.offer_followup_days),
    offer_expiring_days: nonNeg(r.offer_expiring_days, d.offer_expiring_days),
    next_step_overdue_escalate_days: posNum(r.next_step_overdue_escalate_days, d.next_step_overdue_escalate_days),
  };
}

const H_MS = 3600 * 1000;
const D_MS = 24 * H_MS;

export type LeadSlaInput = {
  /** Мэдээлэл хүлээн авсан мөч (received_at ?? created_at). */
  startedAt: Date;
  /** Эхний холболтын хугацаа (first_contact_due_at). */
  dueAt: Date | null;
  /** Анхны утга бүхий холболт (first_contact_at). */
  firstContactAt: Date | null;
  /** «Холбогдож чадаагүй» бүртгэлийн тоо (reached = false). */
  failedAttempts: number;
};

export type LeadSlaSteps = {
  /** Д-02: эхний холболтын хугацаа хэтэрсэн. */
  breach: boolean;
  /** Д-03: хоёр дахь оролдлогын даалгавар хэрэгтэй (хэтэрсэн эсвэл холбогдож чадаагүй). */
  retry: boolean;
  /** Хоёр дахь оролдлогын эцсийн хугацаа — сэжим ирснээс retryHours дотор. */
  retryDeadline: Date;
  /** Д-04: escalateHours-т утга бүхий холболт болоогүй — ахлагчид харагдуулна. */
  noContact: boolean;
};

/**
 * §6.4 эхний холболтын гинж: 24/48 цагийг сэжим ИРСЭН мөчөөс тоолно
 * (хугацаа хэтэрсэн мөчөөс биш). Утга бүхий холболт бүртгэгдсэн бол бүгд зогсоно.
 */
export function leadSlaSteps(
  input: LeadSlaInput,
  now: Date,
  opts: { retryHours: number; escalateHours: number }
): LeadSlaSteps {
  const start = input.startedAt.getTime();
  const retryDeadline = new Date(Math.max(start + opts.retryHours * H_MS, now.getTime()));
  if (input.firstContactAt) return { breach: false, retry: false, retryDeadline, noContact: false };
  const breach = !!input.dueAt && now.getTime() > input.dueAt.getTime();
  return {
    breach,
    retry: breach || input.failedAttempts > 0,
    retryDeadline,
    noContact: now.getTime() >= start + opts.escalateHours * H_MS,
  };
}

export type ProtectionState = "ok" | "warn" | "expire";

/**
 * §6.26: зөвхөн нэр, утастай (утга бүхий холболтгүй) шинэ сэжим хугацаагүй
 * хамгаалагдахгүй — босгоос warn_before_days өмнө сануулж, босгонд хамгаалалтгүй.
 */
export function leadProtectionState(
  lead: { status: string; createdAt: Date; firstContactAt: Date | null; unprotected: boolean },
  now: Date,
  cfg: AutomationThresholds["lead_protection"]
): ProtectionState {
  if (lead.status !== "new" || lead.firstContactAt || lead.unprotected) return "ok";
  const ageDays = (now.getTime() - lead.createdAt.getTime()) / D_MS;
  if (ageDays >= cfg.new_no_contact_days) return "expire";
  if (cfg.warn_before_days > 0 && ageDays >= cfg.new_no_contact_days - cfg.warn_before_days) return "warn";
  return "ok";
}

/** §6.28.6: халуун сэжим идэвхгүй (A ангилал, идэвхтэй, босгоос олон хоног холболтгүй). */
export function isHotLeadInactive(
  lead: { grade: string | null; status: string; inactivityDays: number },
  cfg: Pick<AutomationThresholds, "hot_lead_inactive_days">
): boolean {
  return lead.grade === "a" && lead.status === "active" && lead.inactivityDays >= cfg.hot_lead_inactive_days;
}

export type FeedbackState = "none" | "overdue" | "escalate";

/** §6.15/§6.28.3: үзлэгийн дараах эргэх холбооны төлөв. */
export function showingFeedbackState(
  occurredAt: Date,
  hasFeedback: boolean,
  now: Date,
  cfg: Pick<AutomationThresholds, "showing_feedback_hours" | "showing_feedback_escalate_hours">
): FeedbackState {
  if (hasFeedback) return "none";
  const hours = (now.getTime() - occurredAt.getTime()) / H_MS;
  if (hours >= cfg.showing_feedback_escalate_hours) return "escalate";
  if (hours >= cfg.showing_feedback_hours) return "overdue";
  return "none";
}

/** 'YYYY-MM-DD' хоорондын хоног (to − from). */
export function isoDaysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime()) /
      D_MS
  );
}

/** §6.16: саналын хүчинтэй хугацаа дуусах гэж буй (0..offer_expiring_days хоног үлдсэн). */
export function isOfferExpiring(validUntil: string | null, todayIso: string, days: number): boolean {
  if (!validUntil) return false;
  const left = isoDaysBetween(todayIso, validUntil);
  return left >= 0 && left <= days;
}

/** §6.28.4: саналын шатанд сүүлийн холболтоос хойш давтамж хэтэрсэн. */
export function isOfferFollowupDue(lastTouchIso: string | null, todayIso: string, days: number): boolean {
  if (!lastTouchIso) return true;
  return isoDaysBetween(lastTouchIso, todayIso) >= days;
}

/**
 * Ажлын бус цагийн дарааллаас хуваарилах үеийн эхний холболтын хугацаа:
 * мэдээлэл ирсэн мөчөөс эх сурвалжийн бодлогоор (жишээ нь Ням 22:00 → Даваа
 * 09:15 УБ); систем хоцорч хуваарилсан бол (хугацаа аль хэдийн өнгөрсөн)
 * хуваарилсан мөчөөс дахин тоолно — агентад шууд зөрчил үүсэхгүй.
 */
export function queueDrainDeadline(
  receivedAt: Date,
  now: Date,
  sourceCode: string | null | undefined,
  opts: { policy?: SlaPolicy | null; fallbackMinutes: number; exceptions?: CalendarExceptions }
): Date {
  const due = leadSlaDeadline(receivedAt, sourceCode, opts);
  return due.getTime() > now.getTime() ? due : leadSlaDeadline(now, sourceCode, opts);
}
