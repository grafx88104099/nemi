import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

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
