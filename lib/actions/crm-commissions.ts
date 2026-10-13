"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, type CrmStaffContext } from "@/lib/queries-crm-core";
import type { Json } from "@/types/database";
import {
  COMMISSION_STATUSES,
  COMMISSION_STATUS_LABEL,
  type CommissionRole,
  type CommissionStatus,
} from "@/lib/constants-crm";
import {
  COMMISSION_POLICY_CODES,
  DEFAULT_POLICY_PAYLOADS,
  calcCommission,
  calcMonthlyPmCommission,
  diffCommissionRows,
  netBaseAmount,
  policyCodeForTxnType,
  round2,
  type CalcRow,
  type CommissionPolicyCode,
  type CommissionPolicyPayload,
  type ExistingCommissionSum,
  type RoleAssignment,
} from "@/lib/crm/commission";

/**
 * Шимтгэлийн хөдөлгүүрийн үйлдлүүд (U7 — F-450–474).
 *  • generateCommissions (F-454): хаагдсан + Санхүү баталгаажуулсан орлоготой
 *    хэлцлээс тооцоо; хэсэгчилсэн орлогод пропорц + нэмэлт мөр (F-464);
 *    F-461 нөхцөлд автомат hold; тооцооллын мөрийг ЗӨВХӨН энд (service role,
 *    DB guard бүгд ажиллана — RLS-д insert policy зориуд үгүй).
 *  • generateMonthlyPmCommissions (F-466): rule_runs F-466 pending дараалал
 *    (verifyPayment + crm-monthly cron бичдэг) → сарын PM тооцоо.
 *  • Төлөвийн урсгал/hold/олголт — invoker RPC-ээр (RLS + DB guard давхар).
 *  • rollbackTransactionCommissions (F-462/463): цуцлалтын rollback урсгал.
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const AUTH_ERR = "Нэвтэрнэ үү.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";
const NO_ROLE_ERR = "Танд энэ үйлдлийг хийх эрх алга.";

const MANAGER_ROLES = ["finance", "sales_director", "ops_qc", "ceo"] as const;

function revalidateCommissionPaths(id?: string) {
  revalidatePath("/office/crm/commissions");
  revalidatePath("/agent/crm/commissions");
  revalidatePath("/office/crm");
  if (id) {
    revalidatePath(`/office/crm/commissions/${id}`);
    revalidatePath(`/agent/crm/commissions/${id}`);
  }
}

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

function friendlyCommError(message: string): string {
  for (const prefix of ["CRM_COMM:", "CRM_TXN:", "CRM_GATE:"]) {
    const idx = message.indexOf(prefix);
    if (idx !== -1) return message.slice(idx + prefix.length).trim() || SAVE_ERR;
  }
  if (message.includes("row-level security") || message.includes("оффисын эрхгүй")) {
    return NO_ROLE_ERR;
  }
  return SAVE_ERR;
}

async function logRuleRun(
  officeId: string,
  ruleCode: string,
  entity: string,
  entityId: string | null,
  status: "ok" | "error" | "skipped" | "dry_run" | "pending",
  result?: Record<string, unknown>,
  error?: string
) {
  try {
    const admin = createAdminClient();
    await admin.from("crm_rule_runs").insert({
      office_id: officeId,
      rule_code: ruleCode,
      entity,
      entity_id: entityId,
      status,
      result: (result ?? null) as Json,
      error: error ?? null,
    });
  } catch (e) {
    console.error("logRuleRun:", e instanceof Error ? e.message : e);
  }
}

async function notify(recipientIds: (string | null)[], title: string, body: string, link: string) {
  try {
    const targets = [...new Set(recipientIds.filter((x): x is string => Boolean(x)))];
    if (!targets.length) return;
    const admin = createAdminClient();
    const rows = targets.map((id) => ({
      user_id: id,
      type: "commission_status",
      title,
      body: body.slice(0, 120),
      link,
    }));
    await admin.from("notifications").insert(rows);
  } catch {
    // мэдэгдэл амжилтгүй ч үндсэн үйлдэл хэвээр
  }
}

async function writeAudit(
  officeId: string,
  entity: string,
  entityId: string,
  action: string,
  extra?: { field?: string; reason?: string; oldValue?: unknown; newValue?: unknown }
) {
  try {
    const supabase = await createClient();
    await supabase.rpc("crm_write_audit", {
      p_office: officeId,
      p_entity: entity,
      p_entity_id: entityId,
      p_action: action,
      p_field: extra?.field ?? null,
      p_old: (extra?.oldValue ?? null) as Json,
      p_new: (extra?.newValue ?? null) as Json,
      p_reason: extra?.reason ?? null,
    });
  } catch (e) {
    console.error("writeAudit:", e instanceof Error ? e.message : e);
  }
}

// ── Тохиргооны туслахууд (F-452/453) ──────────────────────

type ConfigVersion = { id: string; policy_code: string; payload: CommissionPolicyPayload };

/** Тухайн мөчид хүчинтэй хувилбар (F-453: «хэлцэлд тухайн үед хүчинтэй байсан хувилбар»). */
async function configAt(
  officeId: string,
  policyCode: string,
  atIso: string
): Promise<ConfigVersion | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("crm_commission_config_versions")
    .select("id, policy_code, payload")
    .eq("office_id", officeId)
    .eq("policy_code", policyCode)
    .lte("valid_from", atIso)
    .or(`valid_to.is.null,valid_to.gt.${atIso}`)
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    policy_code: data.policy_code,
    payload: (data.payload ?? {}) as CommissionPolicyPayload,
  };
}

/**
 * Тохиргооны хувилбар байхгүй үеийн bootstrap: тухайн журамд НЭГ Ч хувилбар
 * бүртгэгдээгүй бол DEFAULT_POLICY_PAYLOADS-оос анхны хувилбарыг (админ эрхээр,
 * аудиттай) үүсгэнэ — settings/commissions UI (U1) гартал урсгал гацахгүй.
 * Хувилбар байгаа ч тухайн огноонд хүчингүй бол bootstrap ХИЙХГҮЙ (F-453).
 */
async function configAtOrBootstrap(
  officeId: string,
  policyCode: CommissionPolicyCode,
  atIso: string,
  createdBy: string
): Promise<ConfigVersion | null> {
  const found = await configAt(officeId, policyCode, atIso);
  if (found) return found;
  const admin = createAdminClient();
  const { count } = await admin
    .from("crm_commission_config_versions")
    .select("id", { count: "exact", head: true })
    .eq("office_id", officeId)
    .eq("policy_code", policyCode);
  if ((count ?? 0) > 0) return null; // хувилбарууд бий — зөв огнооных нь алга (F-453 сахина)
  const { data, error } = await admin
    .from("crm_commission_config_versions")
    .insert({
      office_id: officeId,
      policy_code: policyCode,
      payload: DEFAULT_POLICY_PAYLOADS[policyCode] as unknown as Json,
      valid_from: "2020-01-01T00:00:00Z",
      created_by: createdBy,
    })
    .select("id, policy_code, payload")
    .single();
  if (error || !data) {
    console.error("configAtOrBootstrap:", error?.message);
    return null;
  }
  await logRuleRun(officeId, "F-452", "crm_commission_config_versions", data.id, "ok", {
    note: "Анхны (default) хувилбар автоматаар үүсэв — Тохиргоо → Шимтгэлээс нягтална уу.",
    policy: policyCode,
  });
  return {
    id: data.id,
    policy_code: data.policy_code,
    payload: (data.payload ?? {}) as CommissionPolicyPayload,
  };
}

/** F-455: татварын хувь санхүүгийн тохиргооноос (settings 'commission_tax' = {pct}). */
async function taxPct(officeId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("crm_setting_at", { p_office: officeId, p_key: "commission_tax" });
  const v = data as { pct?: number } | number | null;
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && typeof v.pct === "number") return v.pct;
  return 0;
}

// ── Тохиргооны хувилбар хадгалах (F-452/453) ──────────────

const saveConfigSchema = z
  .object({
    policyCode: z.enum(COMMISSION_POLICY_CODES, "Журмын код буруу"),
    payload: z.record(z.string(), z.unknown()),
    note: z.string().max(500).optional(),
  })
  .strict();

export type SaveCommissionConfigInput = z.infer<typeof saveConfigSchema>;

export async function saveCommissionConfig(
  raw: SaveCommissionConfigInput
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  if (!ctx.roles.some((r) => r === "sysadmin" || r === "ops_qc")) {
    return { error: "Журмын тохиргоог зөвхөн Сисадмин/ЧМТ өөрчилнө (§1.2)." };
  }
  const parsed = saveConfigSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const { policyCode, payload, note } = parsed.data;

  const nowIso = new Date().toISOString();

  // Одоогийн нээлттэй хувилбарыг хаана (F-453 — update нь зөвхөн valid_to хаах).
  const { data: open } = await supabase
    .from("crm_commission_config_versions")
    .select("id")
    .eq("policy_code", policyCode)
    .is("valid_to", null)
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) {
    const { error } = await supabase
      .from("crm_commission_config_versions")
      .update({ valid_to: nowIso })
      .eq("id", open.id);
    if (error) return { error: friendlyCommError(error.message) };
  }

  const { data: inserted, error } = await supabase
    .from("crm_commission_config_versions")
    .insert({
      office_id: ctx.officeId,
      policy_code: policyCode,
      payload: payload as Json,
      valid_from: nowIso,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    console.error("saveCommissionConfig:", error.message);
    return { error: friendlyCommError(error.message) };
  }
  await writeAudit(ctx.officeId, "crm_commission_config_versions", inserted.id, "insert", {
    field: policyCode,
    reason: note,
  });
  revalidatePath("/office/crm/settings/commissions");
  revalidateCommissionPaths();
  return { id: inserted.id };
}

// ── F-454: Хэлцлээс тооцоо үүсгэх ─────────────────────────

const generateSchema = z.object({ txnId: z.uuid("Хэлцэл сонгоно уу") }).strict();

export async function generateCommissions(
  raw: z.infer<typeof generateSchema>
): Promise<{ ok: boolean; created?: number; held?: boolean; error?: string; notes?: string[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  if (!ctx.roles.some((r) => (MANAGER_ROLES as readonly string[]).includes(r))) {
    return { ok: false, error: "Тооцоо үүсгэх эрх: Санхүү / Борлуулалтын захирал / ЧМТ / Ерөнхий захирал." };
  }
  const parsed = generateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const { txnId } = parsed.data;

  // Хэлцэл (RLS-ээр — дуудагч харах эрхтэй байх ёстой).
  const { data: txn } = await supabase
    .from("crm_transactions")
    .select("id, office_id, number, type, status, amount_mnt, closed_on, original_transaction_id")
    .eq("id", txnId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!txn) return { ok: false, error: "Хэлцэл олдсонгүй эсвэл танд эрх алга." };
  if (txn.status !== "closed") {
    return { ok: false, error: "Тооцоо зөвхөн амжилттай хаагдсан хэлцлээс үүснэ (F-454)." };
  }

  // МУТСТ түгжээ №4 (§7.5).
  const { data: onHold } = await supabase.rpc("crm_txn_on_hold", { t: txnId });
  if (onHold) {
    return { ok: false, error: "МУТСТ түгжээтэй хэлцэлд шимтгэл тооцохыг хориглоно (§7.5 түгжээ №4)." };
  }

  const admin = createAdminClient();

  // F-455/526/527: зөвхөн Санхүү баталгаажуулсан ОРЛОГЫН төлбөр = суурь.
  const { data: payments } = await admin
    .from("crm_payments")
    .select("id, amount_mnt, finance_verified_at")
    .eq("transaction_id", txnId)
    .eq("kind", "income")
    .not("finance_verified_at", "is", null);
  const gross = (payments ?? []).reduce((s, p) => s + Number(p.amount_mnt), 0);
  if (txn.type !== "replacement" && gross <= 0) {
    return { ok: false, error: "Санхүү баталгаажуулсан орлогын төлбөр алга — тооцоо үүсэх нөхцөл хангагдаагүй (F-454/455)." };
  }

  // Үүргийн бүртгэл = нотолгооны эх (F-451).
  const { data: roleRows } = await admin
    .from("crm_transaction_agent_roles")
    .select("id, agent_profile_id, role, split_pct")
    .eq("transaction_id", txnId);
  if (!roleRows?.length) {
    return { ok: false, error: "Агентын үүргийн бүртгэл алга — тооцоолох боломжгүй (F-451)." };
  }
  const assignments: RoleAssignment[] = roleRows.map((r) => ({
    agentProfileId: r.agent_profile_id,
    role: r.role as CommissionRole,
    splitPct: r.split_pct == null ? null : Number(r.split_pct),
    refId: r.id,
  }));

  const coBrokerage = assignments.some((a) => a.role === "seller_side" || a.role === "buyer_side");
  const policyCode: CommissionPolicyCode = policyCodeForTxnType(txn.type, { coBrokerage });
  const atIso = txn.closed_on ? `${txn.closed_on}T23:59:59Z` : new Date().toISOString();
  const config = await configAtOrBootstrap(ctx.officeId, policyCode, atIso, user.id);
  if (!config) {
    return {
      ok: false,
      error: `«${policyCode}» журмын хүчинтэй тохиргооны хувилбар алга — Тохиргоо → Шимтгэлд үүсгэнэ үү (F-452/453).`,
    };
  }

  const tax = await taxPct(ctx.officeId);
  const base = txn.type === "replacement" ? 0 : netBaseAmount(gross, tax);

  const result = calcCommission({
    policyCode,
    payload: config.payload,
    assignments,
    baseAmount: base,
    price: Number(txn.amount_mnt),
    flags: { replacement: txn.type === "replacement", coBrokerage },
  });

  if (result.locked) {
    await logRuleRun(ctx.officeId, "F-459", "crm_transactions", txnId, "error", { errors: result.errors });
    return { ok: false, error: result.errors.join(" ") };
  }
  if (!result.rows.length) {
    return { ok: false, error: result.errors[0] ?? "Тооцоолох мөр алга.", notes: result.notes };
  }

  // F-463/464: аль хэдийн тооцогдсон (цуцлагдаагүй) дүнг хасаж нэмэлт мөр үүсгэнэ.
  const { data: existingRows } = await admin
    .from("crm_commission_records")
    .select("recipient_profile_id, role, amount, base_amount, status")
    .eq("transaction_id", txnId)
    .neq("status", "cancelled");
  const existing: ExistingCommissionSum[] = (existingRows ?? []).map((r) => ({
    agentProfileId: r.recipient_profile_id,
    role: r.role as CommissionRole,
    amount: Number(r.amount),
    baseAmount: Number(r.base_amount),
  }));
  const deltaRows = diffCommissionRows(result.rows, existing);
  if (!deltaRows.length && txn.type !== "replacement") {
    return {
      ok: true,
      created: 0,
      notes: [...result.notes, "Шинээр тооцох дүн алга — баталгаажсан орлого бүрэн тооцогдсон байна (F-464)."],
    };
  }
  const rowsToInsert: CalcRow[] = txn.type === "replacement" && !existing.length ? result.rows : deltaRows;

  // F-461: автомат hold нөхцөлүүд.
  const holdReasons: string[] = [];
  const { data: undone } = await admin
    .from("crm_handover_items")
    .select("id")
    .eq("transaction_id", txnId)
    .eq("done", false)
    .limit(1);
  if (undone?.length) holdReasons.push("Хүлээлцэх шалгах хуудас бүрэн бус (F-461).");
  if (result.errors.length) holdReasons.push("Нотолгоо/хуваарилалт дутуу (F-458/461).");
  try {
    const { data: complaints } = await admin
      .from("crm_complaints")
      .select("id")
      .eq("transaction_id", txnId)
      .eq("severity", "serious")
      .is("resolved_at", null)
      .limit(1);
    if (complaints?.length) holdReasons.push("Шийдэгдээгүй ноцтой гомдол (F-461).");
  } catch {
    // crm_complaints (000800, U8) хараахан суугаагүй — нөхцөл идэвхгүй.
  }
  const autoHold = holdReasons.length > 0;

  let created = 0;
  for (const row of rowsToInsert) {
    const { error } = await admin.from("crm_commission_records").insert({
      office_id: ctx.officeId,
      source_type: "transaction",
      transaction_id: txnId,
      recipient_type: "agent",
      recipient_profile_id: row.agentProfileId,
      role: row.role,
      applied_rate_pct: row.appliedRatePct,
      base_amount: row.baseAmount,
      amount: row.amount,
      status: autoHold ? "hold" : "calculated",
      hold_reason: autoHold ? holdReasons.join(" ") : null,
      config_version_id: config.id,
      evidence: {
        ...row.evidence,
        policy: policyCode,
        txn_number: txn.number,
        verified_income_mnt: round2(gross),
        tax_pct: tax,
        verified_payment_ids: (payments ?? []).map((p) => p.id),
      } as Json,
    });
    if (error) {
      console.error("generateCommissions insert:", error.message);
      await logRuleRun(ctx.officeId, "F-454", "crm_transactions", txnId, "error", undefined, error.message);
      return { ok: false, error: friendlyCommError(error.message) };
    }
    created += 1;
  }

  await logRuleRun(ctx.officeId, "F-454", "crm_transactions", txnId, "ok", {
    created,
    base,
    gross,
    tax_pct: tax,
    policy: policyCode,
    hold: autoHold,
  });
  await writeAudit(ctx.officeId, "crm_transactions", txnId, "commissions_generated", {
    newValue: { created, policy: policyCode, base },
  });
  await notify(
    rowsToInsert.map((r) => r.agentProfileId),
    "Шимтгэлийн тооцоо үүслээ",
    `${txn.number} хэлцлийн шимтгэлийн тооцоо ${autoHold ? "түдгэлзүүлсэн төлөвтэй" : "«Тооцоолсон» төлөвтэй"} үүслээ.`,
    "/agent/crm/commissions"
  );
  revalidateCommissionPaths();
  return { ok: true, created, held: autoHold, notes: result.notes };
}

// ── F-466: Сарын PM тооцоо (pending дараалал) ─────────────

export async function generateMonthlyPmCommissions(): Promise<{
  ok: boolean;
  created?: number;
  skipped?: number;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  if (!ctx.roles.some((r) => (MANAGER_ROLES as readonly string[]).includes(r) || r === "property_manager")) {
    return { ok: false, error: NO_ROLE_ERR };
  }

  const admin = createAdminClient();
  const { data: pendings } = await admin
    .from("crm_rule_runs")
    .select("id, entity, entity_id, result")
    .eq("office_id", ctx.officeId)
    .eq("rule_code", "F-466")
    .eq("status", "pending")
    .order("ran_at")
    .limit(200);
  if (!pendings?.length) return { ok: true, created: 0, skipped: 0 };

  // Дараалал → сарын бүртгэлийн олонлог.
  const recordIds = new Set<string>();
  const leaseMonthPairs: { lease_id: string; month: string; runId: number | string }[] = [];
  for (const run of pendings) {
    if (run.entity === "crm_monthly_records" && run.entity_id) {
      recordIds.add(run.entity_id);
    } else {
      const res = (run.result ?? {}) as { lease_id?: string; month?: string };
      if (res.lease_id && res.month) {
        leaseMonthPairs.push({ lease_id: res.lease_id, month: res.month, runId: run.id });
      }
    }
  }
  // Төлбөрийн дарааллыг сарын бүртгэлд буулгана.
  for (const p of leaseMonthPairs) {
    const { data: rec } = await admin
      .from("crm_monthly_records")
      .select("id")
      .eq("lease_id", p.lease_id)
      .eq("month", p.month)
      .maybeSingle();
    if (rec) recordIds.add(rec.id);
  }

  let created = 0;
  let skipped = 0;
  const processedRecords = new Set<string>();

  for (const recordId of recordIds) {
    const { data: rec } = await admin
      .from("crm_monthly_records")
      .select("id, office_id, lease_id, month, net_income, completeness_pct, commission_hold")
      .eq("id", recordId)
      .eq("office_id", ctx.officeId)
      .maybeSingle();
    if (!rec || !rec.lease_id) {
      skipped += 1;
      continue;
    }
    if (Number(rec.completeness_pct) < 100) {
      // Бүртгэл дутуу — pending хэвээр (F-559: дараагийн гүйлтэд дахин орно).
      skipped += 1;
      continue;
    }
    // Давхардлын хамгаалалт: энэ сарын бүртгэлд тооцоо аль хэдийн бий юу.
    const { data: existing } = await admin
      .from("crm_commission_records")
      .select("id")
      .eq("monthly_record_id", rec.id)
      .neq("status", "cancelled")
      .limit(1);
    if (existing?.length) {
      processedRecords.add(rec.id);
      skipped += 1;
      continue;
    }
    const monthEndIso = `${rec.month}T23:59:59Z`;
    const config = await configAtOrBootstrap(ctx.officeId, "PMC-PM-POL-001", monthEndIso, user.id);
    if (!config) {
      await logRuleRun(ctx.officeId, "F-466", "crm_monthly_records", rec.id, "error", undefined,
        "PMC-PM-POL-001 тохиргооны хувилбар алга (F-452)");
      skipped += 1;
      continue;
    }
    const ratio = Number(config.payload.pm_ratio_pct ?? 0);
    const amount = calcMonthlyPmCommission(Number(rec.net_income ?? 0), ratio);
    if (amount <= 0) {
      processedRecords.add(rec.id);
      skipped += 1;
      continue;
    }
    const hold = Boolean(rec.commission_hold);
    const { error } = await admin.from("crm_commission_records").insert({
      office_id: ctx.officeId,
      source_type: "lease_monthly",
      lease_id: rec.lease_id,
      monthly_record_id: rec.id,
      recipient_type: "team",
      recipient_profile_id: null,
      role: "pm_team",
      applied_rate_pct: ratio,
      base_amount: Number(rec.net_income ?? 0),
      amount,
      status: hold ? "hold" : "calculated",
      hold_reason: hold ? "Сарын бүртгэлийн чанарын босго хангаагүй (F-559/461)." : null,
      config_version_id: config.id,
      evidence: {
        policy: "PMC-PM-POL-001",
        monthly_record_id: rec.id,
        month: rec.month,
        net_income: Number(rec.net_income ?? 0),
        ratio_pct: ratio,
      } as Json,
    });
    if (error) {
      console.error("generateMonthlyPmCommissions insert:", error.message);
      await logRuleRun(ctx.officeId, "F-466", "crm_monthly_records", rec.id, "error", undefined, error.message);
      skipped += 1;
      continue;
    }
    created += 1;
    processedRecords.add(rec.id);
  }

  // Дарааллын мөрүүдийг хаана: бүртгэл нь боловсрогдсон бол ok.
  for (const run of pendings) {
    let done = false;
    if (run.entity === "crm_monthly_records" && run.entity_id) {
      done = processedRecords.has(run.entity_id);
    } else {
      const res = (run.result ?? {}) as { lease_id?: string; month?: string };
      if (res.lease_id && res.month) {
        const { data: rec } = await admin
          .from("crm_monthly_records")
          .select("id")
          .eq("lease_id", res.lease_id)
          .eq("month", res.month)
          .maybeSingle();
        done = Boolean(rec && processedRecords.has(rec.id));
      }
    }
    if (done) {
      await admin
        .from("crm_rule_runs")
        .update({ status: "ok", result: { ...((run.result ?? {}) as Record<string, unknown>), processed_by: "U7" } as Json })
        .eq("id", run.id);
    }
  }

  if (created > 0) {
    // PM багийн гишүүдэд мэдэгдэнэ.
    const { data: pmStaff } = await admin
      .from("crm_staff")
      .select("profile_id")
      .eq("office_id", ctx.officeId)
      .eq("is_active", true)
      .contains("roles", ["property_manager"]);
    await notify(
      (pmStaff ?? []).map((s) => s.profile_id),
      "Сарын PM тооцоо үүслээ",
      `${created} сарын менежментийн шимтгэлийн тооцоо үүслээ (F-466).`,
      "/office/crm/commissions?source=lease_monthly"
    );
  }
  revalidateCommissionPaths();
  return { ok: true, created, skipped };
}

// ── Төлөвийн урсгал (F-460) ───────────────────────────────

const setStatusSchema = z
  .object({
    id: z.uuid(),
    to: z.enum(COMMISSION_STATUSES, "Төлөв буруу"),
    note: z.string().max(500).optional(),
  })
  .strict();

export async function setCommissionStatus(
  raw: z.infer<typeof setStatusSchema>
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };

  const parsed = setStatusSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const { id, to, note } = parsed.data;

  if (to === "cancelled" && !note?.trim()) {
    return { ok: false, error: "Цуцлалтад үндэслэл заавал (F-463/473)." };
  }
  if (to === "hold" && !note?.trim()) {
    return { ok: false, error: "Түдгэлзүүлэх шалтгаан заавал (F-461)." };
  }

  const { error } = await supabase.rpc("crm_commission_set_status", {
    p_id: id,
    p_to: to,
    p_note: note ?? null,
  });
  if (error) {
    console.error("setCommissionStatus:", error.message);
    return { ok: false, error: friendlyCommError(error.message) };
  }

  // Мэдэгдэл (seed матриц: commission_status → холбогдох агент).
  const admin = createAdminClient();
  const { data: rec } = await admin
    .from("crm_commission_records")
    .select("recipient_profile_id")
    .eq("id", id)
    .maybeSingle();
  await notify(
    [rec?.recipient_profile_id ?? null],
    "Шимтгэлийн төлөв өөрчлөгдлөө",
    `Таны шимтгэлийн тооцоо «${COMMISSION_STATUS_LABEL[to].label}» төлөвт шилжлээ.`,
    `/agent/crm/commissions/${id}`
  );
  revalidateCommissionPaths(id);
  return { ok: true };
}

export async function holdCommission(id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  if (!reason?.trim()) return { ok: false, error: "Түдгэлзүүлэх шалтгаан заавал (F-461)." };
  return setCommissionStatus({ id, to: "hold", note: reason.trim() });
}

export async function releaseCommissionHold(
  id: string,
  note?: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };

  const { error } = await supabase.rpc("crm_commission_release_hold", {
    p_id: id,
    p_note: note ?? null,
  });
  if (error) {
    console.error("releaseCommissionHold:", error.message);
    return { ok: false, error: friendlyCommError(error.message) };
  }
  const admin = createAdminClient();
  const { data: rec } = await admin
    .from("crm_commission_records")
    .select("recipient_profile_id")
    .eq("id", id)
    .maybeSingle();
  await notify(
    [rec?.recipient_profile_id ?? null],
    "Шимтгэлийн түдгэлзүүлэлт нээгдлээ",
    "Таны шимтгэлийн тооцооны түдгэлзүүлэлтийг удирдлага нээлээ (F-461).",
    `/agent/crm/commissions/${id}`
  );
  revalidateCommissionPaths(id);
  return { ok: true };
}

// ── Олголт (F-464) ────────────────────────────────────────

const payoutSchema = z
  .object({
    id: z.uuid(),
    amount: z.number().positive("Олголтын дүн 0-ээс их байна"),
    note: z.string().max(500).optional(),
  })
  .strict();

export async function recordPayout(
  raw: z.infer<typeof payoutSchema>
): Promise<{ ok: boolean; status?: CommissionStatus; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  if (!ctx.roles.includes("finance")) {
    return { ok: false, error: "Олголтыг зөвхөн Санхүү бүртгэнэ (F-460)." };
  }
  const parsed = payoutSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const { id, amount, note } = parsed.data;

  const { data, error } = await supabase.rpc("crm_commission_record_payout", {
    p_id: id,
    p_amount: amount,
    p_note: note ?? null,
  });
  if (error) {
    console.error("recordPayout:", error.message);
    return { ok: false, error: friendlyCommError(error.message) };
  }
  const newStatus = data as CommissionStatus;
  const admin = createAdminClient();
  const { data: rec } = await admin
    .from("crm_commission_records")
    .select("recipient_profile_id")
    .eq("id", id)
    .maybeSingle();
  await notify(
    [rec?.recipient_profile_id ?? null],
    "Шимтгэлийн олголт бүртгэгдлээ",
    `Олголт бүртгэгдэж тооцоо «${COMMISSION_STATUS_LABEL[newStatus]?.label ?? newStatus}» төлөвт орлоо.`,
    `/agent/crm/commissions/${id}`
  );
  revalidateCommissionPaths(id);
  return { ok: true, status: newStatus };
}

// ── Clawback (F-462/463) ──────────────────────────────────

const clawbackSchema = z
  .object({
    recordId: z.uuid(),
    amount: z.number().positive("Буцаалтын дүн 0-ээс их байна (сөрөг гүйлгээ болж хадгалагдана)"),
    reasonCategory: z.string().min(1, "Шалтгааны ангилал заавал (F-462)"),
  })
  .strict();

export async function recordClawback(
  raw: z.infer<typeof clawbackSchema>
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  if (!ctx.roles.some((r) => ["finance", "sales_director", "ops_qc"].includes(r))) {
    return { error: "Буцаалтыг Санхүү/Борлуулалт/ЧМТ-ийн хяналтын дараа бүртгэнэ (F-462)." };
  }
  const parsed = clawbackSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const { recordId, amount, reasonCategory } = parsed.data;

  const { data, error } = await supabase
    .from("crm_commission_clawbacks")
    .insert({
      office_id: ctx.officeId,
      record_id: recordId,
      amount: -Math.abs(amount),
      reason_category: reasonCategory,
    })
    .select("id")
    .single();
  if (error) {
    console.error("recordClawback:", error.message);
    return { error: friendlyCommError(error.message) };
  }
  revalidateCommissionPaths(recordId);
  return { id: data.id };
}

/** F-462: буцаалтыг эрх бүхий удирдлага (CEO/Борлуулалтын захирал) батална — guard давхар шалгана. */
export async function approveClawback(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };

  const { error } = await supabase
    .from("crm_commission_clawbacks")
    .update({ approved_by: user.id, approved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("approveClawback:", error.message);
    return { ok: false, error: friendlyCommError(error.message) };
  }
  revalidateCommissionPaths();
  return { ok: true };
}

// ── F-462/463: цуцлагдсан хэлцлийн rollback урсгал ────────

export async function rollbackTransactionCommissions(
  txnId: string,
  note: string
): Promise<{ ok: boolean; cancelled?: number; clawbacks?: number; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  if (!ctx.roles.some((r) => (MANAGER_ROLES as readonly string[]).includes(r))) {
    return { ok: false, error: NO_ROLE_ERR };
  }
  if (!note?.trim()) return { ok: false, error: "Rollback-д үндэслэл заавал (F-463/473)." };

  const admin = createAdminClient();
  const { data: records } = await admin
    .from("crm_commission_records")
    .select("id, status, paid_amount")
    .eq("transaction_id", txnId)
    .eq("office_id", ctx.officeId)
    .neq("status", "cancelled");
  if (!records?.length) {
    // Ямар ч тооцоогүй — pending F-462 гүйлтүүдийг хаана.
    await admin
      .from("crm_rule_runs")
      .update({ status: "ok" })
      .eq("office_id", ctx.officeId)
      .eq("rule_code", "F-462")
      .eq("entity", "crm_transactions")
      .eq("entity_id", txnId)
      .eq("status", "pending");
    return { ok: true, cancelled: 0, clawbacks: 0 };
  }

  let cancelled = 0;
  let clawbacks = 0;
  for (const rec of records) {
    // Олгосон дүнтэй мөрд сөрөг гүйлгээний ноорог үүсгэнэ (F-462 — автоматаар
    // хэрэгжихгүй: эрх бүхий удирдлага тусад нь батална).
    if (Number(rec.paid_amount) > 0) {
      const { error: cbErr } = await supabase
        .from("crm_commission_clawbacks")
        .insert({
          office_id: ctx.officeId,
          record_id: rec.id,
          amount: -Number(rec.paid_amount),
          reason_category: "transaction_rollback",
        })
        .select("id")
        .single();
      if (!cbErr) clawbacks += 1;
      else console.error("rollback clawback:", cbErr.message);
    }
    const { error } = await supabase.rpc("crm_commission_set_status", {
      p_id: rec.id,
      p_to: "cancelled",
      p_note: `Хэлцлийн буцаалт/залруулга: ${note.trim()} (F-463)`,
    });
    if (error) {
      console.error("rollback cancel:", error.message);
      return { ok: false, error: friendlyCommError(error.message) };
    }
    cancelled += 1;
  }

  await admin
    .from("crm_rule_runs")
    .update({ status: "ok" })
    .eq("office_id", ctx.officeId)
    .eq("rule_code", "F-462")
    .eq("entity", "crm_transactions")
    .eq("entity_id", txnId)
    .eq("status", "pending");
  await logRuleRun(ctx.officeId, "F-463", "crm_transactions", txnId, "ok", {
    cancelled,
    clawbacks,
    note: note.trim(),
  });
  await writeAudit(ctx.officeId, "crm_transactions", txnId, "commission_rollback", {
    reason: note.trim(),
    newValue: { cancelled, clawbacks },
  });
  revalidateCommissionPaths();
  return { ok: true, cancelled, clawbacks };
}

// ── Маргаан (F-474) ───────────────────────────────────────

const disputeSchema = z
  .object({
    transactionId: z.uuid("Хэлцэл сонгоно уу"),
    content: z.string().min(5, "Маргааны агуулга дор хаяж 5 тэмдэгт"),
    evidence: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export async function createDispute(
  raw: z.infer<typeof disputeSchema>
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = disputeSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const { transactionId, content, evidence } = parsed.data;

  const { data, error } = await supabase
    .from("crm_commission_disputes")
    .insert({
      office_id: ctx.officeId,
      transaction_id: transactionId,
      content,
      evidence: (evidence ?? null) as Json,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    console.error("createDispute:", error.message);
    return { error: friendlyCommError(error.message) };
  }
  revalidateCommissionPaths();
  return { id: data.id };
}

const decideDisputeSchema = z
  .object({
    id: z.uuid(),
    decision: z.string().min(2, "Шийдвэр заавал"),
    rationale: z.string().min(5, "Үндэслэл заавал (F-474/473)"),
  })
  .strict();

export async function decideDispute(
  raw: z.infer<typeof decideDisputeSchema>
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };

  const parsed = decideDisputeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const { id, decision, rationale } = parsed.data;

  const { error } = await supabase
    .from("crm_commission_disputes")
    .update({ decision, rationale, decided_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("decideDispute:", error.message);
    return { ok: false, error: friendlyCommError(error.message) };
  }
  revalidateCommissionPaths();
  return { ok: true };
}
