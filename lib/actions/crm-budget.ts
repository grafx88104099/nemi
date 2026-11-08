"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext } from "@/lib/queries-crm-core";
import type { Json } from "@/types/database";
import { normalizeKpiTargets, normalizeQualitySettings, ubTodayIso } from "@/lib/crm/quality";
import { getExecutiveDashboard } from "@/lib/queries-crm-kpi";

/**
 * Төсөв, төсөөлөл, удирдлагын дүгнэлт, KPI-ийн тохиргооны үйлдлүүд
 * (U6 — PRO-001 v2.1 §5 RACI, §8.1, §8.5, §9(12)).
 *   • Төсөв — CEO, Санхүү, Борлуулалт хариуцсан захирал (RLS давхар).
 *   • Төсөөллийн агшин зураг, батлалт — Борлуулалт хариуцсан захирал (A).
 *   • Удирдлагын дүгнэлт — Борлуулалт хариуцсан захирал, CEO.
 *   • KPI жишиг, урсгалын хүрээ — Борлуулалт хариуцсан захирал; чанарын
 *     аудитын тохиргоо — Үйл ажиллагаа-ЧМТ; аяны зардал — Маркетинг.
 */

const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";
const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";

function friendly(message: string | undefined, prefix: string): string {
  if (!message) return SAVE_ERR;
  const idx = message.indexOf(prefix);
  if (idx !== -1) return message.slice(idx + prefix.length).trim() || SAVE_ERR;
  if (/does not exist|Could not find/i.test(message)) return "Энэ хэсэг хараахан идэвхжээгүй байна. Системийн админд хандана уу.";
  if (message.includes("row-level security")) return "Танд энэ үйлдлийг хийх эрх алга.";
  if (message.includes("duplicate key")) return "Энэ сар, салбарын төсөв аль хэдийн бүртгэгдсэн байна.";
  return SAVE_ERR;
}

function revalidateKpi() {
  revalidatePath("/office/crm/quality/executive");
  revalidatePath("/office/crm/quality/kpi");
  revalidatePath("/office/crm/settings/budget");
}

// ── Төсөв ─────────────────────────────────────────────────

const budgetSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/, "Сарыг сонгоно уу"),
    branchId: z.uuid().nullable().optional(),
    amount: z.number().min(0, "Төсөв сөрөг байж болохгүй").max(1e14, "Дүн хэт их байна"),
    note: z.string().max(500).optional(),
  })
  .strict();

export async function saveBudget(raw: z.input<typeof budgetSchema>): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  if (!ctx.roles.some((r) => r === "ceo" || r === "finance" || r === "sales_director")) {
    return { ok: false, error: "Төсвийг CEO, Санхүү эсвэл Борлуулалт хариуцсан захирал бүртгэнэ." };
  }
  const parsed = budgetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const v = parsed.data;
  const month = `${v.month}-01`;
  const supabase = await createClient();

  let q = supabase.from("crm_budgets").select("id").eq("month", month).eq("metric", "revenue");
  q = v.branchId ? q.eq("branch_id", v.branchId) : q.is("branch_id", null);
  const { data: existing, error: rErr } = await q.maybeSingle();
  if (rErr) {
    console.error("saveBudget read:", rErr.message);
    return { ok: false, error: friendly(rErr.message, "CRM_BUDGET:") };
  }
  if (existing) {
    const { error } = await supabase
      .from("crm_budgets")
      .update({ amount: Math.round(v.amount), note: v.note?.trim() || null, updated_by: ctx.profileId })
      .eq("id", existing.id);
    if (error) {
      console.error("saveBudget update:", error.message);
      return { ok: false, error: friendly(error.message, "CRM_BUDGET:") };
    }
  } else {
    const { error } = await supabase.from("crm_budgets").insert({
      office_id: ctx.officeId,
      month,
      branch_id: v.branchId ?? null,
      metric: "revenue",
      amount: Math.round(v.amount),
      note: v.note?.trim() || null,
      created_by: ctx.profileId,
    });
    if (error) {
      console.error("saveBudget insert:", error.message);
      return { ok: false, error: friendly(error.message, "CRM_BUDGET:") };
    }
  }
  revalidateKpi();
  return { ok: true };
}

// ── Төсөөлөл ──────────────────────────────────────────────

export async function takeForecastSnapshot(): Promise<{ ok: boolean; id?: string; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  if (!ctx.roles.some((r) => r === "sales_director" || r === "ceo" || r === "sysadmin")) {
    return { ok: false, error: "Төсөөллийг Борлуулалт хариуцсан захирал бүртгэнэ." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_take_forecast_snapshot", {
    p_office: ctx.officeId,
    p_month: ubTodayIso(),
    p_kind: "manual",
  });
  if (error) {
    console.error("takeForecastSnapshot:", error.message);
    return { ok: false, error: friendly(error.message, "CRM_FORECAST:") };
  }
  revalidateKpi();
  return { ok: true, id: data as string };
}

export async function approveForecastSnapshot(raw: { id: string; note?: string }): Promise<{ ok: boolean; error?: string }> {
  const parsed = z.object({ id: z.uuid(), note: z.string().max(1000).optional() }).strict().safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Оролт буруу." };
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  if (!ctx.roles.includes("sales_director")) {
    return { ok: false, error: "Төсөөллийг Борлуулалт хариуцсан захирал батална." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_approve_forecast_snapshot", {
    p_id: parsed.data.id,
    p_note: parsed.data.note?.trim() || null,
  });
  if (error) {
    console.error("approveForecastSnapshot:", error.message);
    return { ok: false, error: friendly(error.message, "CRM_FORECAST:") };
  }
  revalidateKpi();
  return { ok: true };
}

// ── Удирдлагын дүгнэлт (§9(12)) ───────────────────────────

const reviewSchema = z
  .object({
    periodKind: z.enum(["week", "month", "quarter"], "Хугацааг сонгоно уу"),
    findings: z.string().trim().min(10, "Дүгнэлтийг 10-аас дээш тэмдэгтээр бичнэ үү").max(4000),
    decisions: z.string().trim().max(4000).optional(),
  })
  .strict();

export async function saveMgmtReview(raw: z.input<typeof reviewSchema>): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  if (!ctx.roles.some((r) => r === "sales_director" || r === "ceo")) {
    return { ok: false, error: "Удирдлагын дүгнэлтийг Борлуулалт хариуцсан захирал эсвэл CEO бүртгэнэ." };
  }
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const v = parsed.data;

  // Дүгнэлт бичих үеийн тоог хадгална — дараа нь тайлан өөрчлөгдсөн ч шийдвэрийн үндэс хэвээр.
  const dash = await getExecutiveDashboard();
  const periodStart = v.periodKind === "week" ? dash.week.from : v.periodKind === "month" ? dash.month.from : dash.quarter.from;
  const snapshot = {
    revenue_month: dash.revenueMonth,
    budget_month: dash.budgetMonth,
    revenue_week: dash.revenueWeek,
    budget_week: dash.budgetWeek,
    weighted_pipeline_mnt: Math.round(dash.pipeline.totals.weighted_mnt),
    weighted_fee_mnt: Math.round(dash.pipeline.totals.weighted_fee_mnt),
    active_agents: dash.activeAgents,
    revenue_per_agent: dash.revenuePerAgent,
    sufficient_agents: dash.sufficient.count,
    compliance_pct: dash.compliancePct,
    closed_month: dash.closedMonth,
    retention_pct: dash.retention.retentionPct,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("crm_mgmt_reviews").insert({
    office_id: ctx.officeId,
    period_kind: v.periodKind,
    period_start: periodStart,
    kpi_snapshot: snapshot as unknown as Json,
    findings: v.findings,
    decisions: v.decisions?.trim() || null,
    reviewed_by: ctx.profileId,
  });
  if (error) {
    console.error("saveMgmtReview:", error.message);
    return { ok: false, error: friendly(error.message, "CRM:") };
  }
  revalidateKpi();
  return { ok: true };
}

// ── KPI-ийн тохиргоо (хувилбартай) ────────────────────────

const SETTING_RIGHTS: Record<string, readonly string[]> = {
  kpi_targets: ["sales_director", "ops_qc", "sysadmin"],
  quality_audit: ["ops_qc", "sysadmin"],
  campaign_costs: ["marketing", "ops_qc", "sysadmin"],
  marketing_costs: ["marketing", "ops_qc", "sysadmin"],
};

function sanitizeCosts(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = k.trim();
    const n = typeof v === "string" ? Number(v) : v;
    if (!key || key.length > 60) return null;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
    out[key] = Math.round(n);
  }
  return out;
}

export async function saveKpiSetting(raw: { key: string; value: unknown; note?: string }): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  const allowed = SETTING_RIGHTS[raw.key];
  if (!allowed) return { ok: false, error: "Тохиргооны түлхүүр буруу." };
  if (!ctx.roles.some((r) => allowed.includes(r))) return { ok: false, error: "Танд энэ тохиргоог өөрчлөх эрх алга." };

  let value: unknown;
  if (raw.key === "kpi_targets") value = normalizeKpiTargets(raw.value);
  else if (raw.key === "quality_audit") value = normalizeQualitySettings(raw.value);
  else {
    value = sanitizeCosts(raw.value);
    if (value == null) return { ok: false, error: "Зардлын утга буруу: код бүрд 0-ээс багагүй тоо оруулна уу." };
  }

  const supabase = await createClient();
  // Маркетинг тохиргоог уншиж чадахгүй (RLS) тул хуучин хувилбарыг хаах алхмыг
  // дүрийн шалгалтын дараа системээр хийнэ; шинэ хувилбарыг RLS-ээр оруулна.
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: open } = await admin
    .from("crm_settings")
    .select("id")
    .eq("office_id", ctx.officeId)
    .eq("key", raw.key)
    .is("valid_to", null);
  // Эхлээд шинэ хувилбар (RLS шалгана); амжилттай бол хуучныг хаана.
  // RETURNING-гүй: Маркетинг тохиргоог уншиж чадахгүй тул буцаалт RLS-д унана.
  const { error } = await supabase.from("crm_settings").insert({
    office_id: ctx.officeId,
    key: raw.key,
    value: value as Json,
    valid_from: nowIso,
    created_by: ctx.profileId,
    note: raw.note?.slice(0, 300) || null,
  });
  if (error) {
    console.error("saveKpiSetting insert:", error.message);
    return { ok: false, error: friendly(error.message, "CRM:") };
  }
  const oldIds = (open ?? []).map((o) => o.id);
  if (oldIds.length) {
    const { error: cErr } = await admin.from("crm_settings").update({ valid_to: nowIso }).in("id", oldIds);
    if (cErr) console.error("saveKpiSetting close:", cErr.message);
  }
  revalidateKpi();
  revalidatePath("/office/crm/quality");
  return { ok: true };
}
