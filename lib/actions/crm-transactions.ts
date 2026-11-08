"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, getSettingValue, type CrmStaffContext } from "@/lib/queries-crm-core";
import { getTransactions, type TxnFilters } from "@/lib/queries-crm-transactions";
import { notifyCrm } from "@/lib/crm/notify";
import { authorizeExport } from "@/lib/actions/crm-exports";
import { canExportDeals, normalizeDealFlow, parseClosingChecks } from "@/lib/crm/deal-flow";
import { validateDealContract, type DealContractInput } from "@/lib/validation/crm-deals";
import {
  TXN_TYPES,
  TXN_STATUSES,
  PARTY_ROLES,
  COMMISSION_ROLES,
  TXN_TYPE_LABEL,
  TXN_STATUS_LABEL,
} from "@/lib/constants-crm";
import type { Database, Json } from "@/types/database";

type TxnUpdate = Database["public"]["Tables"]["crm_transactions"]["Update"];

/**
 * Хэлцлийн бичилтүүд (U5 — F-400–421). Гол дүрмүүд:
 *  • Төлөвийн машин (F-420) DB guard — энд зөвхөн дүрсэлж, exception-ыг задална.
 *  • F-419: ₮ дүйцэл автомат — settings 'fx_rates'-аас тухайн өдрийн ханш;
 *    олдохгүй бол хадгалалт алдаа; гар override → шалтгаан + audit заавал.
 *  • Хаалт: Д-09 post-sale даалгаврыг ЭХЭЛЖ үүсгээд (урьдач) төлөв солино.
 *  • Цуцлалт: шалтгааны ангилал заавал (F-415); F-462 rollback job DB trigger-ээс.
 *  • Хаагдсан хэлцэл — зөвхөн crm_apply_txn_correction RPC (F-417).
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const AUTH_ERR = "Нэвтэрнэ үү.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";

export type TxnActionResult = {
  ok: boolean;
  error?: string;
  /** Гейт/бүрдэл дутуу бол жагсаалт (GateErrorDialog-т). */
  missing?: string[];
};

function revalidateTxnPaths(id?: string) {
  revalidatePath("/office/crm/transactions");
  revalidatePath("/agent/crm/transactions");
  revalidatePath("/office/crm/pipeline");
  revalidatePath("/agent/crm/pipeline");
  revalidatePath("/office/crm/finance");
  revalidatePath("/office/crm");
  if (id) {
    revalidatePath(`/office/crm/transactions/${id}`);
    revalidatePath(`/agent/crm/transactions/${id}`);
  }
}

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

/**
 * Мэдэгдэл — notifyCrm (матриц, чимээгүй цаг, push). Холбоосыг агентын
 * панелийн замаар өгнө; оффисын хэрэглэгчид автоматаар хөрвөнө.
 */
async function notify(
  officeId: string,
  recipientIds: (string | null | undefined)[],
  title: string,
  body: string,
  txnId: string,
  extra?: { event?: string; includeRoles?: CrmStaffContext["roles"] }
) {
  await notifyCrm({
    officeId,
    event: extra?.event ?? "txn_status_changed",
    recipients: recipientIds,
    includeRoles: extra?.includeRoles,
    title,
    body,
    link: `/agent/crm/transactions/${txnId}`,
    entity: "crm_transactions",
    entityId: txnId,
  });
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
      p_old: extra?.oldValue != null ? (JSON.parse(JSON.stringify(extra.oldValue)) as Json) : null,
      p_new: extra?.newValue != null ? (JSON.parse(JSON.stringify(extra.newValue)) as Json) : null,
      p_reason: extra?.reason ?? null,
    });
  } catch (e) {
    console.error("writeAudit:", e instanceof Error ? e.message : e);
  }
}

function parseGateMissing(message: string): string[] | null {
  const idx = message.indexOf("CRM_GATE:");
  if (idx === -1) return null;
  return message
    .slice(idx + "CRM_GATE:".length)
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** DB exception → хэрэглэгчид ойлгомжтой монгол мессеж. */
function friendlyTxnError(message: string): string {
  const idx = message.indexOf("CRM_TXN:");
  if (idx !== -1) {
    // Хуучин DB мессежүүдийн дотоод кодыг дэлгэцэнд гаргахгүй.
    return (
      message
        .slice(idx + "CRM_TXN:".length)
        .replace(/\s*\((?:F|Д)-[^)]*\)/g, "")
        .replace(/\s*\(§[^)]*\)/g, "")
        .trim() || SAVE_ERR
    );
  }
  if (message.indexOf("CRM_AML:") !== -1) {
    return message.slice(message.indexOf("CRM_AML:") + "CRM_AML:".length).trim() || SAVE_ERR;
  }
  if (message.includes("crm_txn_opp_active_uq")) {
    return "Энэ боломж дээр идэвхтэй хэлцэл аль хэдийн бий (Боломж→Хэлцэл 1:1).";
  }
  if (message.includes("crm_sequences")) {
    return "Дугаарлалтын тохиргоо (crm_sequences) хийгдээгүй байна — сисадминд хандана уу.";
  }
  if (message.includes("өөрчлөх хориотой талбар")) return "Өөрчлөх хориотой талбар байна.";
  if (message.includes("эрх алга") || message.includes("оффисын эрхгүй")) {
    return "Танд энэ үйлдлийг хийх эрх алга.";
  }
  if (message.includes("олдсонгүй")) return "Бичлэг олдсонгүй эсвэл танд эрх алга.";
  return SAVE_ERR;
}

/** F-419: тухайн өдрийн ханш settings 'fx_rates'-аас ({огноо: {USD: 3450}}). */
async function resolveFxRate(
  officeId: string,
  currency: string
): Promise<{ rate?: number; error?: string }> {
  if (!currency || currency === "MNT") return { rate: 1 };
  const supabase = await createClient();
  const { data } = await supabase.rpc("crm_setting_at", { p_office: officeId, p_key: "fx_rates" });
  const today = new Date().toISOString().slice(0, 10);
  const table = (data ?? {}) as Record<string, Record<string, number>>;
  const rate = table?.[today]?.[currency];
  if (typeof rate !== "number" || rate <= 0) {
    return { error: `Өнөөдрийн (${today}) ${currency} ханш тохируулагдаагүй байна — Санхүү 'fx_rates'-д нэмнэ үү.` };
  }
  return { rate };
}

// ── Үүсгэх (F-400/401/413/414) ────────────────────────────

const createTxnSchema = z
  .object({
    opportunityId: z.uuid("Боломж сонгоно уу"),
    type: z.enum(TXN_TYPES, "Хэлцлийн төрөл буруу байна"),
    amount: z.number("Дүн оруулна уу").positive("Дүн 0-ээс их байна"),
    currency: z.string().trim().max(8).optional(),
    originalTransactionId: z.uuid().optional().nullable(),
  })
  .strict();

export type CreateTransactionInput = z.infer<typeof createTxnSchema>;

export async function createTransaction(
  raw: CreateTransactionInput
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = createTxnSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу байна." };
  const input = parsed.data;

  if (input.type === "replacement" && !input.originalTransactionId) {
    return { error: "Replacement хэлцэлд анхны хэлцлийн холбоос заавал." };
  }

  const { data: opp } = await supabase
    .from("crm_opportunities")
    .select("id, state, property_id, owner_id, contact_id")
    .eq("id", input.opportunityId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!opp) return { error: "Боломж олдсонгүй эсвэл танд эрх алга." };
  if (opp.state !== "open") return { error: "Хаагдсан боломж дээр хэлцэл үүсгэхгүй." };
  if (!opp.property_id) {
    return { error: "Боломжид үл хөдлөх холбогдоогүй байна — картын «Засах» хэсгээс үл хөдлөхөө сонгоно уу." };
  }
  // Нэг үл хөдлөх дээр зэрэг хоёр идэвхтэй хэлцэл нээхгүй (листинг, худалдан
  // авагч тал нэг хэлцлийн хавтсаар ажиллана).
  const { data: activeOnProperty } = await createAdminClient()
    .from("crm_transactions")
    .select("id, number, opportunity_id")
    .eq("office_id", ctx.officeId)
    .eq("property_id", opp.property_id)
    .in("status", ["draft", "contract", "payment"])
    .limit(1);
  if (activeOnProperty?.length) {
    return {
      error: `Энэ үл хөдлөх дээр идэвхтэй хэлцэл (${activeOnProperty[0].number}) аль хэдийн нээгдсэн. Тэр хэлцлийн хавтсаар үргэлжлүүлнэ үү.`,
    };
  }

  const currency = input.currency || "MNT";
  const fx = await resolveFxRate(ctx.officeId, currency);
  if (fx.error) return { error: fx.error };

  const { data: row, error } = await supabase
    .from("crm_transactions")
    .insert({
      office_id: ctx.officeId,
      type: input.type,
      opportunity_id: input.opportunityId,
      property_id: opp.property_id,
      amount: input.amount,
      currency,
      fx_rate: fx.rate ?? 1,
      fx_rate_source: "auto",
      original_transaction_id: input.originalTransactionId ?? null,
      created_by: user.id,
    })
    .select("id, number")
    .single();
  if (error || !row) {
    console.error("createTransaction:", error?.message);
    return { error: friendlyTxnError(error?.message ?? "") };
  }

  await writeAudit(ctx.officeId, "crm_transactions", row.id, "insert", {
    newValue: { number: row.number, type: input.type, amount: input.amount, currency },
  });
  if (opp.owner_id !== ctx.profileId) {
    await notify(
      ctx.officeId,
      [opp.owner_id],
      "Шинэ хэлцэл үүслээ",
      `${TXN_TYPE_LABEL[input.type]} хэлцэл (${row.number}) үүсгэгдлээ.`,
      row.id
    );
  }
  revalidateTxnPaths(row.id);
  revalidatePath(`/agent/crm/pipeline/${input.opportunityId}`);
  revalidatePath(`/office/crm/deals/${input.opportunityId}`);
  return { id: row.id };
}

// ── Засах (дүн/валют/огноо — F-419 fx автомат) ────────────

const updateTxnSchema = z
  .object({
    id: z.uuid(),
    amount: z.number().positive("Дүн 0-ээс их байна").optional(),
    currency: z.string().trim().max(8).optional(),
    openedOn: z.string().optional().nullable(),
    contractedOn: z.string().optional().nullable(),
  })
  .strict();

export type UpdateTransactionInput = z.infer<typeof updateTxnSchema>;

export async function updateTransaction(raw: UpdateTransactionInput): Promise<TxnActionResult> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const parsed = updateTxnSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу байна." };
  const input = parsed.data;

  const { data: before } = await supabase
    .from("crm_transactions")
    .select("id, amount, currency, status")
    .eq("id", input.id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!before) return { ok: false, error: "Хэлцэл олдсонгүй эсвэл танд эрх алга." };
  if (before.status === "closed") {
    return { ok: false, error: "Хаагдсан хэлцэл — зөвхөн залруулгын тусгай урсгалаар." };
  }

  const patch: TxnUpdate = {};
  const newCurrency = input.currency ?? before.currency;
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.currency !== undefined && input.currency !== before.currency) {
    const fx = await resolveFxRate(ctx.officeId, newCurrency);
    if (fx.error) return { ok: false, error: fx.error };
    patch.currency = newCurrency;
    patch.fx_rate = fx.rate ?? 1;
    patch.fx_rate_source = "auto";
  }
  if (input.openedOn !== undefined) patch.opened_on = input.openedOn?.slice(0, 10) ?? undefined;
  if (input.contractedOn !== undefined) patch.contracted_on = input.contractedOn?.slice(0, 10) ?? null;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabase
    .from("crm_transactions")
    .update(patch)
    .eq("id", input.id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("updateTransaction:", error.message);
    return { ok: false, error: friendlyTxnError(error.message) };
  }
  if (input.amount !== undefined && input.amount !== before.amount) {
    await writeAudit(ctx.officeId, "crm_transactions", input.id, "update", {
      field: "amount",
      oldValue: before.amount,
      newValue: input.amount,
    });
  }
  revalidateTxnPaths(input.id);
  return { ok: true };
}

/** F-419: ханшийн гар override — шалтгаан заавал + audit (finance/менежер). */
export async function setFxRateManual(id: string, fxRate: number, reason: string): Promise<TxnActionResult> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!ctx.roles.some((r) => ["finance", "sales_director", "ops_qc", "ceo"].includes(r))) {
    return { ok: false, error: "Ханшийг гараар зөвхөн Санхүү/удирдлага өөрчилнө." };
  }
  if (!(fxRate > 0)) return { ok: false, error: "Ханш 0-ээс их байна." };
  if (!reason.trim()) return { ok: false, error: "Гар ханшинд шалтгаан заавал." };

  const { data: before } = await supabase
    .from("crm_transactions")
    .select("id, fx_rate, status")
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!before) return { ok: false, error: "Хэлцэл олдсонгүй эсвэл танд эрх алга." };
  if (before.status === "closed") {
    return { ok: false, error: "Хаагдсан хэлцэл — зөвхөн залруулгын тусгай урсгалаар." };
  }

  const { error } = await supabase
    .from("crm_transactions")
    .update({ fx_rate: fxRate, fx_rate_source: "manual" })
    .eq("id", id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("setFxRateManual:", error.message);
    return { ok: false, error: friendlyTxnError(error.message) };
  }
  await writeAudit(ctx.officeId, "crm_transactions", id, "update", {
    field: "fx_rate",
    oldValue: before.fx_rate,
    newValue: fxRate,
    reason: reason.trim(),
  });
  revalidateTxnPaths(id);
  return { ok: true };
}

// ── Төлөвийн машин (F-420 — DB guard эцсийн үнэн) ─────────

export async function setTxnStatus(id: string, to: string): Promise<TxnActionResult> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!(TXN_STATUSES as readonly string[]).includes(to)) {
    return { ok: false, error: "Төлөв буруу байна." };
  }
  if (to === "closed") return closeTransaction(id);
  if (to === "cancelled") return { ok: false, error: "Цуцлалтыг шалтгааны ангилалтайгаар «Цуцлах» үйлдлээр хийнэ." };

  const { data: before } = await supabase
    .from("crm_transactions")
    .select("id, status, number, opportunity_id, opportunity:crm_opportunities!crm_transactions_opportunity_id_fkey(owner_id)")
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!before) return { ok: false, error: "Хэлцэл олдсонгүй эсвэл танд эрх алга." };

  const { error } = await supabase
    .from("crm_transactions")
    .update({ status: to as (typeof TXN_STATUSES)[number] })
    .eq("id", id)
    .eq("office_id", ctx.officeId);
  if (error) {
    const missing = parseGateMissing(error.message);
    if (missing) {
      return { ok: false, error: "Шилжих шалгуур хангагдаагүй — дутуу шаардлагууд байна.", missing };
    }
    console.error("setTxnStatus:", error.message);
    return { ok: false, error: friendlyTxnError(error.message) };
  }

  const ownerId = (before as unknown as { opportunity: { owner_id: string } | null }).opportunity?.owner_id;
  if (ownerId && ownerId !== ctx.profileId) {
    await notify(
      ctx.officeId,
      [ownerId],
      "Хэлцлийн төлөв өөрчлөгдлөө",
      `${before.number} — ${TXN_STATUS_LABEL[to as (typeof TXN_STATUSES)[number]].label}.`,
      id
    );
  }
  revalidateTxnPaths(id);
  revalidatePath(`/agent/crm/pipeline/${before.opportunity_id}`);
  revalidatePath(`/office/crm/deals/${before.opportunity_id}`);
  return { ok: true };
}

/** Хаалтын босго (§6.17) — DB-ийн crm_txn_closing_checks (нэг эх үнэн). */
export async function getClosingChecks(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_txn_closing_checks", { p_txn: id });
  if (error) {
    console.error("getClosingChecks:", error.message);
    return [];
  }
  return parseClosingChecks(data);
}

/** Хаалт: Д-09 post-sale багц даалгаврыг ЭХЭЛЖ үүсгээд (урьдач) төлөв солино. */
export async function closeTransaction(id: string): Promise<TxnActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!ctx.roles.some((r) => ["sales_director", "ceo"].includes(r))) {
    return { ok: false, error: "Хаалтыг зөвхөн Борлуулалт хариуцсан захирал баталгаажуулна." };
  }

  const { data: txn } = await supabase
    .from("crm_transactions")
    .select("id, status, number, type, opportunity_id, opportunity:crm_opportunities!crm_transactions_opportunity_id_fkey(owner_id)")
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!txn) return { ok: false, error: "Хэлцэл олдсонгүй эсвэл танд эрх алга." };
  if (txn.status !== "payment") {
    return { ok: false, error: "Зөвхөн «Төлбөр» төлөвөөс хаалт руу шилжинэ." };
  }
  const ownerId =
    (txn as unknown as { opportunity: { owner_id: string } | null }).opportunity?.owner_id ?? ctx.profileId;

  // Хаалтын босго: борлуулалтын дараах даалгавраас бусад нь хангагдсан
  // байх ёстой — хангагдаагүй бол даалгавар үүсгэлгүй буцаана.
  const checks = await getClosingChecks(id);
  const blocking = checks.filter((c) => !c.ok && c.code !== "post_sale").map((c) => c.label);
  if (blocking.length) {
    return { ok: false, error: "Хаалтын босго хангагдаагүй байна.", missing: blocking };
  }

  // Д-09: борлуулалтын дараах даалгавар (хаалтын урьдач нөхцөл).
  const admin = createAdminClient();
  try {
    const { data: existing } = await admin
      .from("crm_task_links")
      .select("task_id")
      .eq("entity", "transaction")
      .eq("entity_id", id)
      .eq("rule_code", "D-09")
      .limit(1);
    if (!existing?.length) {
      const { data: rule } = await admin
        .from("crm_automation_rules")
        .select("is_active, dry_run")
        .eq("office_id", ctx.officeId)
        .eq("code", "D-09")
        .maybeSingle();
      if (rule?.dry_run) {
        await logRuleRun(ctx.officeId, "D-09", "crm_transactions", id, "dry_run", { would_create_tasks: true });
      } else {
        // Загвар: checklist_templates scope='post_sale', үгүй бол default багц.
        const { data: tpl } = await admin
          .from("crm_checklist_templates")
          .select("items")
          .eq("office_id", ctx.officeId)
          .eq("scope", "post_sale")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const labels: string[] =
          tpl?.items && Array.isArray(tpl.items)
            ? (tpl.items as { label?: string }[]).map((i) => i.label ?? "").filter(Boolean)
            : [
                "Баримтын эх хувийг архивт хүлээлгэн өгөх",
                "Харилцагчтай эргэн холбогдож сэтгэл ханамжийг асуух",
                "Санал болголтын хүсэлт тавих",
              ];
        for (const label of labels) {
          const { data: task } = await admin
            .from("tasks")
            .insert({
              office_id: ctx.officeId,
              created_by: ownerId,
              responsible_id: ownerId,
              title: `${label} — ${txn.number}`,
              description: `Хэлцэл ${txn.number} хаагдахтай холбоотой борлуулалтын дараах алхам.`,
              priority: "normal",
              deadline: new Date(Date.now() + 3 * 86400000).toISOString(),
            })
            .select("id")
            .single();
          if (task?.id) {
            await admin.from("crm_task_links").insert({
              task_id: task.id,
              entity: "transaction",
              entity_id: id,
              rule_code: "D-09",
            });
          }
        }
        await logRuleRun(ctx.officeId, "D-09", "crm_transactions", id, "ok", { tasks: labels.length });
      }
    }
  } catch (e) {
    await logRuleRun(
      ctx.officeId,
      "D-09",
      "crm_transactions",
      id,
      "error",
      undefined,
      e instanceof Error ? e.message : String(e)
    );
  }

  const { error } = await supabase
    .from("crm_transactions")
    .update({ status: "closed" })
    .eq("id", id)
    .eq("office_id", ctx.officeId);
  if (error) {
    const missing = parseGateMissing(error.message);
    if (missing) {
      return { ok: false, error: "Хаалтын босго хангагдаагүй — дутуу шаардлагууд байна.", missing };
    }
    console.error("closeTransaction:", error.message);
    return { ok: false, error: friendlyTxnError(error.message) };
  }

  // Шимтгэлийн тооцооны скан (урамшууллын нэгж уншина).
  await logRuleRun(ctx.officeId, "F-454", "crm_transactions", id, "pending", { number: txn.number });
  await notify(
    ctx.officeId,
    [ownerId],
    "Хэлцэл амжилттай хаагдлаа",
    `${txn.number} — ${TXN_STATUS_LABEL.closed.label}. Боломж амжилттай хаагдсан шатанд шилжлээ.`,
    id
  );
  revalidateTxnPaths(id);
  revalidatePath(`/agent/crm/pipeline/${txn.opportunity_id}`);
  revalidatePath(`/office/crm/deals/${txn.opportunity_id}`);
  return { ok: true };
}

// ── Цуцлалт (F-415) ───────────────────────────────────────

// «use server» модуль зөвхөн async функц export хийнэ — UI-ийн ангиллын
// жагсаалт TransactionDetailShell-д давхар тодорхойлогдсон (ижил кодууд).
const TXN_CANCEL_CATEGORIES = [
  "client_fault",
  "executor_fault",
  "force_majeure",
  "compliance",
  "other",
] as const;

const CANCEL_CATEGORY_LABEL: Record<string, string> = {
  client_fault: "Харилцагчийн буруу",
  executor_fault: "Хэрэгжүүлэгчийн буруу",
  force_majeure: "Давагдашгүй хүчин зүйл",
  compliance: "Нийцэл",
  other: "Бусад",
};

export async function cancelTransaction(
  id: string,
  reasonCategory: string,
  note?: string
): Promise<TxnActionResult> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!(TXN_CANCEL_CATEGORIES as readonly string[]).includes(reasonCategory)) {
    return { ok: false, error: "Цуцлалтын шалтгааны ангилал буруу байна." };
  }
  if (reasonCategory === "other" && !note?.trim()) {
    return { ok: false, error: "«Бусад» шалтгаанд тайлбар заавал." };
  }
  const reason = `${CANCEL_CATEGORY_LABEL[reasonCategory]}${note?.trim() ? ` — ${note.trim()}` : ""}`;

  const { error } = await supabase
    .from("crm_transactions")
    .update({ status: "cancelled", cancellation_reason: reason })
    .eq("id", id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("cancelTransaction:", error.message);
    return { ok: false, error: friendlyTxnError(error.message) };
  }
  revalidateTxnPaths(id);
  return { ok: true };
}

// ── Талууд (F-402) ────────────────────────────────────────

export async function addParty(txnId: string, contactId: string, role: string): Promise<TxnActionResult> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!(PARTY_ROLES as readonly string[]).includes(role)) {
    return { ok: false, error: "Талын үүрэг буруу байна." };
  }
  const { error } = await supabase.from("crm_transaction_parties").insert({
    office_id: ctx.officeId,
    transaction_id: txnId,
    contact_id: contactId,
    role: role as (typeof PARTY_ROLES)[number],
  });
  if (error) {
    if (error.message.includes("duplicate key")) {
      return { ok: false, error: "Энэ харилцагч ижил үүргээр аль хэдийн бүртгэгдсэн." };
    }
    console.error("addParty:", error.message);
    return { ok: false, error: friendlyTxnError(error.message) };
  }
  await writeAudit(ctx.officeId, "crm_transactions", txnId, "party_added", {
    newValue: { contact_id: contactId, role },
  });
  revalidateTxnPaths(txnId);
  return { ok: true };
}

/** Талыг хасах — зөвхөн ноорог төлөвт (RLS давхар сахина). */
export async function removeParty(partyId: string, txnId: string): Promise<TxnActionResult> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const { error, count } = await supabase
    .from("crm_transaction_parties")
    .delete({ count: "exact" })
    .eq("id", partyId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("removeParty:", error.message);
    return { ok: false, error: friendlyTxnError(error.message) };
  }
  if (!count) return { ok: false, error: "Талыг зөвхөн ноорог төлөвт хасна." };
  await writeAudit(ctx.officeId, "crm_transactions", txnId, "party_removed", { newValue: { party_id: partyId } });
  revalidateTxnPaths(txnId);
  return { ok: true };
}

// ── Агентын үүрэг + split (F-402/451/458) ─────────────────

const agentRoleSchema = z
  .object({
    agentProfileId: z.uuid("Агент сонгоно уу"),
    role: z.enum(COMMISSION_ROLES, "Үүрэг буруу байна"),
    splitPct: z.number().positive().max(100).optional().nullable(),
  })
  .strict();

export type AgentRoleInput = z.infer<typeof agentRoleSchema>;

export async function setAgentRoles(txnId: string, rawRoles: AgentRoleInput[]): Promise<TxnActionResult> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const parsed = z.array(agentRoleSchema).min(1, "Дор хаяж нэг үүрэг бүртгэнэ").safeParse(rawRoles);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу байна." };
  const roles = parsed.data;

  // F-458: нэг үүргийг олон агент хуваавал нийлбэр 100% байх ёстой.
  const byRole = new Map<string, AgentRoleInput[]>();
  for (const r of roles) {
    const list = byRole.get(r.role) ?? [];
    list.push(r);
    byRole.set(r.role, list);
  }
  for (const [role, list] of byRole) {
    if (list.length > 1) {
      const sum = list.reduce((s, r) => s + (r.splitPct ?? 0), 0);
      if (Math.abs(sum - 100) > 0.01) {
        return {
          ok: false,
          error: `«${role}» үүргийн хуваарилалтын нийлбэр 100% байх ёстой (одоо ${sum}%).`,
        };
      }
    }
  }

  const { data: txn } = await supabase
    .from("crm_transactions")
    .select("id, status")
    .eq("id", txnId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!txn) return { ok: false, error: "Хэлцэл олдсонгүй эсвэл танд эрх алга." };

  const { data: existing } = await supabase
    .from("crm_transaction_agent_roles")
    .select("id, agent_profile_id, role, split_pct")
    .eq("transaction_id", txnId);
  const rows = existing ?? [];

  const key = (a: string, r: string) => `${a}|${r}`;
  const wanted = new Map(roles.map((r) => [key(r.agentProfileId, r.role), r]));

  // Хасагдсан мөр (зөвхөн ноорогт RLS зөвшөөрнө).
  for (const row of rows) {
    if (!wanted.has(key(row.agent_profile_id, row.role))) {
      const { count, error } = await supabase
        .from("crm_transaction_agent_roles")
        .delete({ count: "exact" })
        .eq("id", row.id)
        .eq("office_id", ctx.officeId);
      if (error || !count) {
        return { ok: false, error: "Үүргийн мөрийг зөвхөн ноорог төлөвт хасна — нотолгоо хөндөгдөхгүй." };
      }
    }
  }
  // Шинэчлэх/нэмэх.
  for (const r of roles) {
    const ex = rows.find((row) => key(row.agent_profile_id, row.role) === key(r.agentProfileId, r.role));
    if (ex) {
      if ((ex.split_pct ?? null) !== (r.splitPct ?? null)) {
        const { error } = await supabase
          .from("crm_transaction_agent_roles")
          .update({ split_pct: r.splitPct ?? null })
          .eq("id", ex.id)
          .eq("office_id", ctx.officeId);
        if (error) return { ok: false, error: friendlyTxnError(error.message) };
      }
    } else {
      const { error } = await supabase.from("crm_transaction_agent_roles").insert({
        office_id: ctx.officeId,
        transaction_id: txnId,
        agent_profile_id: r.agentProfileId,
        role: r.role,
        split_pct: r.splitPct ?? null,
      });
      if (error) return { ok: false, error: friendlyTxnError(error.message) };
    }
  }

  await writeAudit(ctx.officeId, "crm_transactions", txnId, "agent_roles_set", {
    newValue: roles.map((r) => ({ agent: r.agentProfileId, role: r.role, split: r.splitPct ?? null })),
  });
  revalidateTxnPaths(txnId);
  return { ok: true };
}

// ── Гэрээний бүртгэл (F-403) ──────────────────────────────

export type AddContractInput = DealContractInput;

export async function addContract(raw: AddContractInput): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const v = validateDealContract(raw);
  if ("error" in v) return { error: v.error };
  const input = v.data;

  // Гарын үсэгтэй хавсралт нь энэ хэлцлийн баримт байх.
  if (input.docId) {
    const { data: link } = await supabase
      .from("crm_document_links")
      .select("document_id")
      .eq("document_id", input.docId)
      .eq("entity", "transaction")
      .eq("entity_id", input.transactionId)
      .maybeSingle();
    if (!link) return { error: "Сонгосон баримт энэ хэлцлийн хавтсанд хавсаргагдаагүй байна." };
  }

  const { data: row, error } = await supabase
    .from("crm_transaction_contracts")
    .insert({
      office_id: ctx.officeId,
      transaction_id: input.transactionId,
      template_code: input.templateCode,
      contract_type: input.contractType,
      number: input.number,
      signed_on: input.signedOn?.slice(0, 10) ?? null,
      valid_from: input.validFrom?.slice(0, 10) ?? null,
      valid_to: input.validTo?.slice(0, 10) ?? null,
      doc_id: input.docId ?? null,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("addContract:", error?.message);
    return { error: friendlyTxnError(error?.message ?? "") };
  }
  await writeAudit(ctx.officeId, "crm_transactions", input.transactionId, "contract_added", {
    newValue: { number: input.number, type: input.contractType, template: input.templateCode },
  });
  // Гэрээний хяналт: эрх бүхий хянагчдад мэдэгдэнэ.
  if (input.docId) {
    const cfg = normalizeDealFlow(await getSettingValue("deal_flow"));
    await notify(
      ctx.officeId,
      [],
      "Гэрээ хянах хүлээгдэж байна",
      `Хэлцлийн гэрээ ${input.number} бүртгэгдлээ — загвар, гарын үсгийг хянана уу.`,
      input.transactionId,
      { includeRoles: cfg.contractReviewerRoles.filter((r) => r !== "agent") as CrmStaffContext["roles"] }
    );
  }
  revalidateTxnPaths(input.transactionId);
  return { id: row.id };
}

/** Гэрээ хянах (deal_flow.contract_reviewer_roles) — хаалтын «Гэрээ» босго. */
export async function reviewContract(
  contractId: string,
  txnId: string,
  note?: string
): Promise<TxnActionResult> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { error } = await supabase.rpc("crm_review_contract", { p_contract: contractId, p_note: note?.trim() || null });
  if (error) {
    console.error("reviewContract:", error.message);
    return { ok: false, error: friendlyTxnError(error.message) };
  }
  revalidateTxnPaths(txnId);
  return { ok: true };
}

// ── Төлбөрийн хуваарь (F-405) ─────────────────────────────

const scheduleSchema = z
  .object({
    transactionId: z.uuid(),
    dueOn: z.string().min(1, "Огноо сонгоно уу"),
    amount: z.number("Дүн оруулна уу").positive("Дүн 0-ээс их байна"),
    kind: z.string().trim().min(1, "Төрөл оруулна уу").max(60),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

export type AddScheduleLineInput = z.infer<typeof scheduleSchema>;

export async function addScheduleLine(raw: AddScheduleLineInput): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = scheduleSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу байна." };
  const input = parsed.data;

  const { data: row, error } = await supabase
    .from("crm_payment_schedule_lines")
    .insert({
      office_id: ctx.officeId,
      transaction_id: input.transactionId,
      due_on: input.dueOn.slice(0, 10),
      amount: input.amount,
      kind: input.kind,
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("addScheduleLine:", error?.message);
    return { error: friendlyTxnError(error?.message ?? "") };
  }
  revalidateTxnPaths(input.transactionId);
  return { id: row.id };
}

// ── Хүлээлцэх checklist (F-407, hold түгжээ №5 DB-д) ──────

export async function toggleHandoverItem(itemId: string, txnId: string, done: boolean): Promise<TxnActionResult> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const { error } = await supabase
    .from("crm_handover_items")
    .update({ done, done_on: done ? undefined : null })
    .eq("id", itemId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("toggleHandoverItem:", error.message);
    return { ok: false, error: friendlyTxnError(error.message) };
  }
  revalidateTxnPaths(txnId);
  return { ok: true };
}

export async function addHandoverItem(txnId: string, label: string): Promise<TxnActionResult> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!label.trim()) return { ok: false, error: "Алхмын нэр оруулна уу." };
  const { data: max } = await supabase
    .from("crm_handover_items")
    .select("sort_order")
    .eq("transaction_id", txnId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("crm_handover_items").insert({
    office_id: ctx.officeId,
    transaction_id: txnId,
    label: label.trim(),
    sort_order: (max?.sort_order ?? 0) + 1,
  });
  if (error) {
    console.error("addHandoverItem:", error.message);
    return { ok: false, error: friendlyTxnError(error.message) };
  }
  revalidateTxnPaths(txnId);
  return { ok: true };
}

// ── Transaction Approval (F-410–412) ──────────────────────

const approvalSchema = z
  .object({
    transactionId: z.uuid(),
    rationale: z.string().trim().min(1, "Үндэслэл заавал").max(2000),
    feeChange: z.enum(["discount", "waiver", "special"], "Хөлсний өөрчлөлтийн төрөл буруу"),
    approvedAmount: z.number().nonnegative().optional().nullable(),
    docId: z.uuid().optional().nullable(),
  })
  .strict();

export type RequestApprovalInput = z.infer<typeof approvalSchema>;

export async function requestApproval(raw: RequestApprovalInput): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = approvalSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу байна." };
  const input = parsed.data;

  const { data: row, error } = await supabase
    .from("crm_transaction_approvals")
    .insert({
      office_id: ctx.officeId,
      transaction_id: input.transactionId,
      requested_by: user.id,
      rationale: input.rationale,
      fee_change: input.feeChange,
      approved_amount: input.approvedAmount ?? null,
      doc_id: input.docId ?? null,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("requestApproval:", error?.message);
    return { error: friendlyTxnError(error?.message ?? "") };
  }

  // Мэдэгдэл: Борлуулалтын захирал(ууд).
  await notify(
    ctx.officeId,
    [],
    "Хөлсний зөвшөөрлийн хүсэлт",
    "Стандартаас зөрсөн хөлсний зөвшөөрөл хүлээгдэж байна.",
    input.transactionId,
    { includeRoles: ["sales_director"] }
  );
  revalidateTxnPaths(input.transactionId);
  return { id: row.id };
}

export async function approveTxnApproval(
  approvalId: string,
  txnId: string,
  approvedAmount?: number | null
): Promise<TxnActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!ctx.roles.some((r) => ["sales_director", "ceo"].includes(r))) {
    return { ok: false, error: "Зөвшөөрлийг зөвхөн Борлуулалт хариуцсан захирал / CEO батална." };
  }

  const { error, count } = await supabase
    .from("crm_transaction_approvals")
    .update(
      {
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        ...(approvedAmount != null ? { approved_amount: approvedAmount } : {}),
      },
      { count: "exact" }
    )
    .eq("id", approvalId)
    .eq("office_id", ctx.officeId)
    .is("approved_at", null);
  if (error) {
    console.error("approveTxnApproval:", error.message);
    return { ok: false, error: friendlyTxnError(error.message) };
  }
  if (!count) return { ok: false, error: "Хүсэлт олдсонгүй эсвэл аль хэдийн батлагдсан." };

  await writeAudit(ctx.officeId, "crm_transactions", txnId, "approval_granted", {
    newValue: { approval_id: approvalId, approved_amount: approvedAmount ?? null },
  });
  revalidateTxnPaths(txnId);
  return { ok: true };
}

// ── Хаагдсан хэлцлийн залруулга (F-417) ───────────────────

export async function applyCorrection(
  txnId: string,
  changes: Record<string, string | number | null>,
  rationale: string
): Promise<TxnActionResult> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  if (!rationale.trim()) return { ok: false, error: "Залруулгад үндэслэл заавал." };
  if (!Object.keys(changes).length) return { ok: false, error: "Өөрчлөлт хоосон байна." };

  const { error } = await supabase.rpc("crm_apply_txn_correction", {
    p_txn: txnId,
    p_changes: changes as Json,
    p_rationale: rationale.trim(),
  });
  if (error) {
    console.error("applyCorrection:", error.message);
    return { ok: false, error: friendlyTxnError(error.message) };
  }
  revalidateTxnPaths(txnId);
  return { ok: true };
}

// ── Бүрэн байдал дахин тооцох (F-409) ─────────────────────

export async function recomputeCompleteness(txnId: string): Promise<TxnActionResult> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { error } = await supabase.rpc("crm_recompute_txn_completeness", { p_txn: txnId });
  if (error) {
    console.error("recomputeCompleteness:", error.message);
    return { ok: false, error: friendlyTxnError(error.message) };
  }
  revalidateTxnPaths(txnId);
  return { ok: true };
}

// ── Экспорт (F-418 — аудиттай CSV) ────────────────────────

export async function exportTransactions(
  filters: TxnFilters
): Promise<{ csv?: string; error?: string; needsRequest?: boolean }> {
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;
  // §6.32: хэлцлийн экспорт зөвхөн тохиргоонд заасан дүрд.
  const cfg = normalizeDealFlow(await getSettingValue("deal_flow"));
  if (!canExportDeals(ctx.roles, cfg)) {
    return { error: "Хэлцлийн жагсаалтыг экспортлох эрх танд алга." };
  }

  const rows = await getTransactions(filters);
  // §6.32: дүрийн эрхээс гадна мөрийн тоо/зөвшөөрлийн хүсэлтээр хязгаарлана.
  const auth = await authorizeExport("transactions", rows.length);
  if (!auth.ok) return { error: auth.error, needsRequest: auth.needsRequest };
  const header = [
    "Дугаар",
    "Төрөл",
    "Төлөв",
    "Дүн",
    "Валют",
    "₮ дүйцэл",
    "Нээсэн",
    "Гэрээ",
    "Хаасан",
    "Бүрэн байдал %",
    "Агент",
    "Үл хөдлөх",
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [
      r.number,
      TXN_TYPE_LABEL[r.type],
      TXN_STATUS_LABEL[r.status].label,
      r.amount,
      r.currency,
      r.amount_mnt,
      r.opened_on,
      r.contracted_on ?? "",
      r.closed_on ?? "",
      r.file_completeness_pct,
      r.owner_name ?? "",
      r.property_number ? `${r.property_number} ${r.property_name ?? ""}` : "",
    ]
      .map(esc)
      .join(",")
  );
  await writeAudit(ctx.officeId, "crm_transactions", ctx.officeId, "export", {
    newValue: { count: rows.length, filters: filters as unknown },
  });
  return { csv: "﻿" + [header.join(","), ...lines].join("\n") };
}
