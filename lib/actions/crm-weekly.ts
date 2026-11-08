"use server";

import { fmtDateTime } from "@/lib/format";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import { getCrmStaffContext, getSettingValue } from "@/lib/queries-crm-core";
import { notifyCrm } from "@/lib/crm/notify";
import {
  CARD_TARGET_CODES,
  WEEKLY_METRICS,
  WEEKLY_METRIC_CODES,
  type WeeklyStatus,
} from "@/lib/constants-crm-weekly";
import {
  buildLastWeekSummary,
  computeWeeklyScore,
  gapRow,
  normalizeScoreWeights,
  normalizeWeeklyCycle,
  planSubmitError,
  prefillItemsFromCarry,
  resolveTargets,
  reviewSubmitError,
  stageAdvances,
  summarizeMoves,
  classifyMove,
  type MetricKey,
  type WeeklyValues,
} from "@/lib/crm/weekly-score";
import { addWeeks, isIsoDate, isoWeekday, ubDateIso, weekShortLabel } from "@/lib/crm/week";

/**
 * Долоо хоногийн мөчлөгийн үйлдлүүд (U7 — PRO-001 v2.1 §5 RACI, §6.19–§6.24,
 * §6.30, §9.6). Эцсийн эрх, төлөвийн шилжилт, түгжээ DB-ийн trigger-т
 * (crm_weekly_*_guard); энд оролт шалгаж, картыг бэлтгэж, мэдэгдэнэ.
 * Гүйцэтгэлийн тоог хэрэглэгч оруулах зам байхгүй — зөвхөн зорилт, тайлбар.
 */

const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";
const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const NOT_FOUND = "Долоо хоногийн карт олдсонгүй.";

type Result = { ok: boolean; error?: string; id?: string };

function friendly(message: string | undefined): string {
  if (!message) return SAVE_ERR;
  const idx = message.indexOf("CRM_WEEK:");
  if (idx !== -1) {
    const msg = message.slice(idx + "CRM_WEEK:".length).trim();
    return msg ? msg.charAt(0).toUpperCase() + msg.slice(1) + (/[.!?]$/.test(msg) ? "" : ".") : SAVE_ERR;
  }
  if (/does not exist|Could not find|schema cache/i.test(message))
    return "Долоо хоногийн мөчлөг хараахан идэвхжээгүй байна. Системийн админд хандана уу.";
  if (message.includes("row-level security")) return "Энэ үйлдлийг хийх эрх танд алга.";
  if (message.includes("crm_wp_uniq")) return "Энэ долоо хоногийн карт аль хэдийн үүссэн байна.";
  return SAVE_ERR;
}

function revalidateWeek() {
  revalidatePath("/agent/crm/week", "layout");
  revalidatePath("/agent/crm/team", "layout");
  revalidatePath("/office/crm/week", "layout");
  revalidatePath("/office/crm");
}

const isoDate = z.string().refine(isIsoDate, "Огноо буруу");
const uuid = z.uuid("Сонголт буруу");
const text = (max: number) => z.string().trim().max(max, `${max} тэмдэгтээс хэтрэхгүй`).nullable().optional();

async function cycleSettings() {
  const [cycle, legacy, weights] = await Promise.all([
    getSettingValue("weekly_cycle"),
    getSettingValue("weekly_targets"),
    getSettingValue("agent_score_weights"),
  ]);
  return { cycle: normalizeWeeklyCycle(cycle, legacy), weights: normalizeScoreWeights(weights) };
}

type PlanLite = { id: string; office_id: string; agent_id: string; week_start: string; status: WeeklyStatus };

async function loadPlanLite(planId: string): Promise<PlanLite | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_weekly_plans")
    .select("id, office_id, agent_id, week_start, status")
    .eq("id", planId)
    .maybeSingle();
  if (error) console.error("loadPlanLite:", error.message);
  return (data ?? null) as PlanLite | null;
}

async function agentWeekValues(week: string, agentId: string): Promise<WeeklyValues> {
  const supabase = await createClient();
  const args = { p_week: week, p_office: null, p_agent: agentId };
  const [m, mv] = await Promise.all([
    supabase.rpc("crm_agent_week_metrics", args),
    supabase.rpc("crm_agent_week_moves", args),
  ]);
  if (m.error) console.error("agentWeekValues:", m.error.message);
  const out: WeeklyValues = {};
  for (const r of (m.data ?? []) as { metric_code: string; actual: number | string | null }[]) {
    if ((WEEKLY_METRIC_CODES as readonly string[]).includes(r.metric_code)) {
      out[r.metric_code as MetricKey] = r.actual == null ? null : Number(r.actual);
    }
  }
  const kinds = ((mv.data ?? []) as { from_sort: number | null; to_sort: number | null; to_terminal: string | null }[]).map((x) =>
    classifyMove({
      fromSort: x.from_sort,
      toSort: x.to_sort,
      toTerminal: x.to_terminal === "won" || x.to_terminal === "lost" ? x.to_terminal : null,
    })
  );
  out.stage_advances = stageAdvances(summarizeMoves(kinds));
  return out;
}

/** Картын батлагч(ид): багийн ахлагч, эс бөгөөс тохиргооны нөөц дүр (Ш9). */
async function approverRecipients(
  officeId: string,
  agentId: string,
  fallbackRoles: string[]
): Promise<{ direct: string[]; includeRoles: string[] }> {
  const admin = createAdminClient();
  const { data: me } = await admin
    .from("crm_staff")
    .select("team_id")
    .eq("office_id", officeId)
    .eq("profile_id", agentId)
    .maybeSingle();
  if (me?.team_id) {
    const { data: leads } = await admin
      .from("crm_staff")
      .select("profile_id, roles")
      .eq("office_id", officeId)
      .eq("team_id", me.team_id)
      .eq("is_active", true);
    const ids = (leads ?? [])
      .filter((s) => ((s.roles as string[]) ?? []).includes("team_lead") && s.profile_id !== agentId)
      .map((s) => s.profile_id);
    if (ids.length) return { direct: ids, includeRoles: [] };
  }
  return { direct: [], includeRoles: fallbackRoles };
}

// ── Карт үүсгэх (§6.30: Баасны өгөгдөл → Даваагийн эхлэл) ──

/**
 * Энэ долоо хоногийн картыг үүсгэнэ, өмнөх долоо хоногийн гүйцэтгэл, зорилт,
 * «шилжих 3 боломж»-оос урьдчилан бөглөнө. Байгаа бол түүнийг буцаана.
 */
export async function createWeeklyPlan(weekRaw: string): Promise<Result> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  if (!ctx.roles.includes("agent")) return { ok: false, error: "Долоо хоногийн картыг борлуулагч агент бөглөнө." };
  const parsed = isoDate.safeParse(weekRaw);
  if (!parsed.success || isoWeekday(parsed.data) !== 1) return { ok: false, error: "Долоо хоног Даваа гарагаас эхэлнэ." };
  const res = await ensurePlan(ctx.officeId, ctx.profileId, parsed.data);
  if (res.ok) revalidateWeek();
  return res;
}

async function ensurePlan(officeId: string, agentId: string, week: string): Promise<Result> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("crm_weekly_plans")
    .select("id")
    .eq("agent_id", agentId)
    .eq("week_start", week)
    .maybeSingle();
  if (existing?.id) return { ok: true, id: existing.id };

  const prevWeek = addWeeks(week, -1);
  const { data: prevPlan } = await supabase
    .from("crm_weekly_plans")
    .select("id, status")
    .eq("agent_id", agentId)
    .eq("week_start", prevWeek)
    .maybeSingle();

  const settings = await cycleSettings();
  let summary: string | null = null;
  const prevTargets: WeeklyValues = {};
  let carry: { opportunity_id: string | null; text: string | null }[] = [];
  if (prevPlan?.id) {
    const [tRes, cRes] = await Promise.all([
      supabase.from("crm_weekly_plan_targets").select("metric_code, target").eq("plan_id", prevPlan.id),
      supabase.from("crm_weekly_plan_items").select("opportunity_id, text, position").eq("plan_id", prevPlan.id).eq("kind", "carry").order("position"),
    ]);
    for (const t of (tRes.data ?? []) as { metric_code: string; target: number | string | null }[]) {
      prevTargets[t.metric_code as MetricKey] = t.target == null ? null : Number(t.target);
    }
    carry = (cRes.data ?? []) as { opportunity_id: string | null; text: string | null }[];
  }
  try {
    const prevActuals = await agentWeekValues(prevWeek, agentId);
    const effTargets = resolveTargets(prevTargets, prevPlan?.status ?? null, settings.cycle.defaultTargets);
    const score = computeWeeklyScore({
      actuals: prevActuals,
      targets: effTargets,
      weights: settings.weights,
      naPolicy: settings.cycle.naPolicy,
    }).total;
    summary = buildLastWeekSummary(prevActuals, effTargets, score) || null;
  } catch (e) {
    console.error("ensurePlan summary:", e instanceof Error ? e.message : e);
  }

  const { data: created, error } = await supabase
    .from("crm_weekly_plans")
    .insert({
      office_id: officeId,
      agent_id: agentId,
      week_start: week,
      last_week_summary: summary,
      prefilled_from: prevPlan?.id ?? null,
      created_by: agentId,
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("ensurePlan insert:", error?.message);
    return { ok: false, error: friendly(error?.message) };
  }

  const targetRows = Object.entries(prevTargets)
    .filter(([, v]) => v != null)
    .map(([code, v]) => ({ plan_id: created.id, office_id: officeId, metric_code: code, target: v as number }));
  if (targetRows.length) {
    const { error: tErr } = await supabase.from("crm_weekly_plan_targets").insert(targetRows);
    if (tErr) console.error("ensurePlan targets:", tErr.message);
  }
  if (carry.length) {
    const { data: openOpps } = await supabase
      .from("crm_opportunities")
      .select("id")
      .eq("owner_id", agentId)
      .eq("state", "open")
      .in("id", carry.map((c) => c.opportunity_id).filter((x): x is string => !!x));
    const open = new Set((openOpps ?? []).map((o) => o.id));
    const items = prefillItemsFromCarry(
      carry.map((c) => ({ opportunity_id: c.opportunity_id && open.has(c.opportunity_id) ? c.opportunity_id : null, text: c.text }))
    ).map((i) => ({ ...i, plan_id: created.id, office_id: officeId, text: i.text || null }));
    if (items.length) {
      const { error: iErr } = await supabase.from("crm_weekly_plan_items").insert(items);
      if (iErr) console.error("ensurePlan items:", iErr.message);
    }
  }
  return { ok: true, id: created.id };
}

// ── Карт хадгалах (§6.21) ─────────────────────────────────

const targetSchema = z.record(z.string(), z.number().min(0, "Зорилт сөрөг байж болохгүй").max(1e13).nullable());

const planSchema = z
  .object({
    lastWeekSummary: text(2000),
    supportNeeded: text(1000),
    commitment: text(500),
    targets: targetSchema,
    topDeals: z.array(z.object({ opportunityId: uuid, text: text(300) }).strict()).max(3, "Шилдэг хэлцэл 3 хүртэл"),
    priorities: z
      .array(z.object({ text: z.string().trim().min(3, "Ажлыг тодорхой бичнэ үү").max(300), opportunityId: uuid.nullable().optional() }).strict())
      .max(3, "Тэргүүлэх ажил 3 хүртэл"),
    obstacles: z
      .array(z.object({ obstacleId: uuid, text: text(300) }).strict())
      .max(6, "Саад 6 хүртэл"),
  })
  .strict();

export type WeeklyPlanInput = z.input<typeof planSchema>;

const PLAN_TARGET_CODES = new Set<string>([...WEEKLY_METRICS.map((m) => m.code), "stage_advances"]);

export async function saveWeeklyPlan(planId: string, raw: WeeklyPlanInput): Promise<Result> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const v = parsed.data;
  const plan = await loadPlanLite(planId);
  if (!plan) return { ok: false, error: NOT_FOUND };
  if (plan.agent_id !== ctx.profileId) return { ok: false, error: "Картыг зөвхөн агент өөрөө бөглөнө." };
  if (!["draft", "returned"].includes(plan.status))
    return { ok: false, error: "Илгээсэн картыг засахгүй — ахлагч буцаасны дараа засна." };

  const dealIds = v.topDeals.map((d) => d.opportunityId);
  if (new Set(dealIds).size !== dealIds.length) return { ok: false, error: "Нэг хэлцлийг давхар сонгосон байна." };

  const supabase = await createClient();
  const { error: pErr } = await supabase
    .from("crm_weekly_plans")
    .update({
      last_week_summary: v.lastWeekSummary || null,
      support_needed: v.supportNeeded || null,
      commitment: v.commitment || null,
    })
    .eq("id", planId);
  if (pErr) {
    console.error("saveWeeklyPlan plan:", pErr.message);
    return { ok: false, error: friendly(pErr.message) };
  }

  const rows = Object.entries(v.targets)
    .filter(([code]) => PLAN_TARGET_CODES.has(code))
    .map(([code, target]) => ({ plan_id: planId, office_id: plan.office_id, metric_code: code, target }));
  if (rows.length) {
    const { error: tErr } = await supabase
      .from("crm_weekly_plan_targets")
      .upsert(rows, { onConflict: "plan_id,metric_code" });
    if (tErr) {
      console.error("saveWeeklyPlan targets:", tErr.message);
      return { ok: false, error: friendly(tErr.message) };
    }
  }

  const { error: dErr } = await supabase
    .from("crm_weekly_plan_items")
    .delete()
    .eq("plan_id", planId)
    .in("kind", ["top_deal", "priority", "obstacle"]);
  if (dErr) {
    console.error("saveWeeklyPlan items delete:", dErr.message);
    return { ok: false, error: friendly(dErr.message) };
  }
  const items = [
    ...v.topDeals.map((d, i) => ({ kind: "top_deal", position: i + 1, opportunity_id: d.opportunityId, obstacle_id: null, text: d.text || null })),
    ...v.priorities.map((p, i) => ({ kind: "priority", position: i + 1, opportunity_id: p.opportunityId ?? null, obstacle_id: null, text: p.text })),
    ...v.obstacles.map((o, i) => ({ kind: "obstacle", position: i + 1, opportunity_id: null, obstacle_id: o.obstacleId, text: o.text || null })),
  ].map((i) => ({ ...i, plan_id: planId, office_id: plan.office_id }));
  if (items.length) {
    const { error: iErr } = await supabase.from("crm_weekly_plan_items").insert(items);
    if (iErr) {
      console.error("saveWeeklyPlan items:", iErr.message);
      return { ok: false, error: friendly(iErr.message) };
    }
  }
  revalidateWeek();
  return { ok: true, id: planId };
}

// ── Илгээх, батлах, буцаах ────────────────────────────────

export async function submitWeeklyPlan(planId: string): Promise<Result> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  const plan = await loadPlanLite(planId);
  if (!plan) return { ok: false, error: NOT_FOUND };
  if (plan.agent_id !== ctx.profileId) return { ok: false, error: "Картыг агент өөрөө илгээнэ." };

  const supabase = await createClient();
  const [full, tRes, iRes, oppCount] = await Promise.all([
    supabase.from("crm_weekly_plans").select("last_week_summary, commitment").eq("id", planId).single(),
    supabase.from("crm_weekly_plan_targets").select("metric_code, target").eq("plan_id", planId),
    supabase.from("crm_weekly_plan_items").select("kind").eq("plan_id", planId),
    supabase
      .from("crm_opportunities")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ctx.profileId)
      .eq("state", "open"),
  ]);
  const targets: WeeklyValues = {};
  for (const t of (tRes.data ?? []) as { metric_code: string; target: number | string | null }[]) {
    targets[t.metric_code as MetricKey] = t.target == null ? null : Number(t.target);
  }
  const kinds = ((iRes.data ?? []) as { kind: string }[]).map((i) => i.kind);
  const err = planSubmitError(
    {
      targets,
      topDeals: kinds.filter((k) => k === "top_deal").length,
      openOpportunities: oppCount.count ?? 0,
      priorities: kinds.filter((k) => k === "priority").length,
      commitment: full.data?.commitment ?? null,
      summary: full.data?.last_week_summary ?? null,
    },
    CARD_TARGET_CODES
  );
  if (err) return { ok: false, error: err };

  const { error } = await supabase.from("crm_weekly_plans").update({ status: "submitted" }).eq("id", planId);
  if (error) {
    console.error("submitWeeklyPlan:", error.message);
    return { ok: false, error: friendly(error.message) };
  }
  const { cycle } = await cycleSettings();
  const to = await approverRecipients(plan.office_id, plan.agent_id, cycle.approverFallbackRoles);
  await notifyCrm({
    officeId: plan.office_id,
    event: "weekly_plan_submitted",
    recipients: to.direct,
    includeRoles: to.includeRoles as never,
    title: "Долоо хоногийн карт батлуулахаар ирлээ",
    body: `${weekShortLabel(plan.week_start)}-ний долоо хоногийн төлөвлөгөөг хянаж батална уу.`,
    link: `/agent/crm/week/${planId}`,
    entity: "crm_weekly_plans",
    entityId: planId,
  });
  revalidateWeek();
  return { ok: true, id: planId };
}

const decideSchema = z
  .object({ decision: z.enum(["approve", "return"]), note: z.string().trim().max(1000).nullable().optional() })
  .strict()
  .refine((v) => v.decision === "approve" || (v.note ?? "").length >= 5, { message: "Буцаах шалтгааныг бичнэ үү." });

export async function decideWeeklyPlan(planId: string, raw: z.input<typeof decideSchema>): Promise<Result> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  const parsed = decideSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const plan = await loadPlanLite(planId);
  if (!plan) return { ok: false, error: NOT_FOUND };
  if (plan.agent_id === ctx.profileId) return { ok: false, error: "Өөрийн картыг батлахгүй." };
  const supabase = await createClient();
  const approve = parsed.data.decision === "approve";
  const { error } = await supabase
    .from("crm_weekly_plans")
    .update(approve ? { status: "approved" } : { status: "returned", return_note: parsed.data.note ?? null })
    .eq("id", planId);
  if (error) {
    console.error("decideWeeklyPlan:", error.message);
    return { ok: false, error: friendly(error.message) };
  }
  await notifyCrm({
    officeId: plan.office_id,
    event: approve ? "weekly_plan_approved" : "weekly_plan_returned",
    recipients: [plan.agent_id],
    includeRoles: [],
    title: approve ? "Долоо хоногийн карт батлагдлаа" : "Долоо хоногийн картыг засуулахаар буцаалаа",
    body: approve
      ? `${weekShortLabel(plan.week_start)}-ний төлөвлөгөө батлагдсан.`
      : `Шалтгаан: ${parsed.data.note ?? ""}`,
    link: `/agent/crm/week/${plan.week_start}`,
    entity: "crm_weekly_plans",
    entityId: planId,
  });
  revalidateWeek();
  return { ok: true, id: planId };
}

// ── Баасан гарагийн дүн шинжилгээ (§6.24, §9.1, §9.6) ─────

const reviewSchema = z
  .object({
    achievedNote: text(2000),
    missedNote: text(2000),
    conversionNote: text(2000),
    movementNote: text(2000),
    overdueReason: text(2000),
    recoveryAction: text(2000),
    lostNote: text(2000),
    revenueNote: text(2000),
    lessons: text(2000),
    metricNotes: z.record(
      z.string(),
      z.object({ note: text(500), nextAction: text(500) }).strict()
    ),
    carry: z
      .array(z.object({ opportunityId: uuid.nullable().optional(), text: text(300) }).strict())
      .max(3, "Шилжих боломж 3 хүртэл"),
  })
  .strict();

export type WeeklyReviewInput = z.input<typeof reviewSchema>;

async function ensureReview(plan: PlanLite, profileId: string): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: existing } = await supabase.from("crm_weekly_reviews").select("id").eq("plan_id", plan.id).maybeSingle();
  if (existing?.id) return { id: existing.id };
  const { data, error } = await supabase
    .from("crm_weekly_reviews")
    .insert({
      office_id: plan.office_id,
      plan_id: plan.id,
      agent_id: plan.agent_id,
      week_start: plan.week_start,
      created_by: profileId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("ensureReview:", error?.message);
    return { error: friendly(error?.message) };
  }
  return { id: data.id };
}

export async function saveWeeklyReview(planId: string, raw: WeeklyReviewInput): Promise<Result> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const v = parsed.data;
  const plan = await loadPlanLite(planId);
  if (!plan) return { ok: false, error: NOT_FOUND };
  if (plan.agent_id !== ctx.profileId) return { ok: false, error: "Дүн шинжилгээг агент өөрөө бөглөнө." };
  const rev = await ensureReview(plan, ctx.profileId);
  if (!rev.id) return { ok: false, error: rev.error ?? SAVE_ERR };

  const supabase = await createClient();
  const { error: rErr } = await supabase
    .from("crm_weekly_reviews")
    .update({
      achieved_note: v.achievedNote || null,
      missed_note: v.missedNote || null,
      conversion_note: v.conversionNote || null,
      movement_note: v.movementNote || null,
      overdue_reason: v.overdueReason || null,
      recovery_action: v.recoveryAction || null,
      lost_note: v.lostNote || null,
      revenue_note: v.revenueNote || null,
      lessons: v.lessons || null,
    })
    .eq("id", rev.id);
  if (rErr) {
    console.error("saveWeeklyReview:", rErr.message);
    return { ok: false, error: friendly(rErr.message) };
  }

  // §9.1 «Тайлбар, дараагийн үйлдэл»: байгаа мөрийг зөвхөн тайлбараар шинэчилнэ
  // (зорилт хөндөхгүй), байхгүйг тайлбартай шинээр нэмнэ.
  const { data: existingRows } = await supabase.from("crm_weekly_plan_targets").select("metric_code").eq("plan_id", planId);
  const have = new Set(((existingRows ?? []) as { metric_code: string }[]).map((r) => r.metric_code));
  for (const [code, n] of Object.entries(v.metricNotes)) {
    if (!PLAN_TARGET_CODES.has(code)) continue;
    const note = n.note || null;
    const next = n.nextAction || null;
    if (have.has(code)) {
      const { error } = await supabase
        .from("crm_weekly_plan_targets")
        .update({ review_note: note, next_action: next })
        .eq("plan_id", planId)
        .eq("metric_code", code);
      if (error) {
        console.error("saveWeeklyReview note:", error.message);
        return { ok: false, error: friendly(error.message) };
      }
    } else if (note || next) {
      const { error } = await supabase
        .from("crm_weekly_plan_targets")
        .insert({ plan_id: planId, office_id: plan.office_id, metric_code: code, review_note: note, next_action: next });
      if (error) {
        console.error("saveWeeklyReview note insert:", error.message);
        return { ok: false, error: friendly(error.message) };
      }
    }
  }

  const carry = v.carry.filter((c) => c.opportunityId || (c.text ?? "").trim());
  const ids = carry.map((c) => c.opportunityId).filter((x): x is string => !!x);
  if (new Set(ids).size !== ids.length) return { ok: false, error: "Нэг боломжийг давхар сонгосон байна." };
  const { error: cdErr } = await supabase.from("crm_weekly_plan_items").delete().eq("plan_id", planId).eq("kind", "carry");
  if (cdErr) {
    console.error("saveWeeklyReview carry delete:", cdErr.message);
    return { ok: false, error: friendly(cdErr.message) };
  }
  if (carry.length) {
    const { error } = await supabase.from("crm_weekly_plan_items").insert(
      carry.map((c, i) => ({
        plan_id: planId,
        office_id: plan.office_id,
        kind: "carry",
        position: i + 1,
        opportunity_id: c.opportunityId ?? null,
        text: c.text || null,
      }))
    );
    if (error) {
      console.error("saveWeeklyReview carry:", error.message);
      return { ok: false, error: friendly(error.message) };
    }
  }
  revalidateWeek();
  return { ok: true, id: rev.id };
}

export async function submitWeeklyReview(planId: string): Promise<Result> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  const plan = await loadPlanLite(planId);
  if (!plan) return { ok: false, error: NOT_FOUND };
  if (plan.agent_id !== ctx.profileId) return { ok: false, error: "Дүн шинжилгээг агент өөрөө илгээнэ." };
  const supabase = await createClient();
  const [revRes, tRes, cRes, actuals, settings] = await Promise.all([
    supabase.from("crm_weekly_reviews").select("id, missed_note, lessons, overdue_reason, recovery_action").eq("plan_id", planId).maybeSingle(),
    supabase.from("crm_weekly_plan_targets").select("metric_code, target, review_note, next_action").eq("plan_id", planId),
    supabase.from("crm_weekly_plan_items").select("id", { count: "exact", head: true }).eq("plan_id", planId).eq("kind", "carry"),
    agentWeekValues(plan.week_start, plan.agent_id),
    cycleSettings(),
  ]);
  const rev = revRes.data;
  if (!rev) return { ok: false, error: "Эхлээд дүн шинжилгээгээ бөглөж хадгална уу." };
  const rows = (tRes.data ?? []) as { metric_code: string; target: number | string | null; review_note: string | null; next_action: string | null }[];
  const planTargets: WeeklyValues = {};
  for (const r of rows) planTargets[r.metric_code as MetricKey] = r.target == null ? null : Number(r.target);
  const targets = resolveTargets(planTargets, plan.status, settings.cycle.defaultTargets);
  const unmetWithoutNote = WEEKLY_METRICS.filter((m) => m.inReview).filter((m) => {
    const g = gapRow(actuals[m.code], targets[m.code], m.better);
    if (g.met !== false) return false;
    const row = rows.find((r) => r.metric_code === m.code);
    return !(row?.review_note ?? "").trim() || !(row?.next_action ?? "").trim();
  }).length;
  const err = reviewSubmitError({
    missedNote: rev.missed_note,
    lessons: rev.lessons,
    overdueCount: actuals.overdue_followups ?? 0,
    overdueReason: rev.overdue_reason,
    recoveryAction: rev.recovery_action,
    carry: cRes.count ?? 0,
    unmetWithoutNote,
  });
  if (err) return { ok: false, error: err };

  const { error } = await supabase.from("crm_weekly_reviews").update({ status: "submitted" }).eq("id", rev.id);
  if (error) {
    console.error("submitWeeklyReview:", error.message);
    return { ok: false, error: friendly(error.message) };
  }
  // Баасны өгөгдөл дараагийн Даваагийн картыг эхлүүлнэ (§6.30).
  const next = await ensurePlan(plan.office_id, plan.agent_id, addWeeks(plan.week_start, 1));
  if (!next.ok) console.error("submitWeeklyReview next plan:", next.error);

  const to = await approverRecipients(plan.office_id, plan.agent_id, settings.cycle.approverFallbackRoles);
  await notifyCrm({
    officeId: plan.office_id,
    event: "weekly_plan_submitted",
    recipients: to.direct,
    includeRoles: to.includeRoles as never,
    title: "Баасан гарагийн дүн шинжилгээ ирлээ",
    body: `${weekShortLabel(plan.week_start)}-ний долоо хоногийн дүн шинжилгээг хянаж батална уу.`,
    link: `/agent/crm/week/${planId}`,
    entity: "crm_weekly_reviews",
    entityId: rev.id,
  });
  revalidateWeek();
  return { ok: true, id: rev.id };
}

const decideReviewSchema = z
  .object({
    decision: z.enum(["approve", "return"]),
    note: z.string().trim().max(1000).nullable().optional(),
    coachingNeed: z.string().trim().max(1000).nullable().optional(),
    coachingAt: z.string().nullable().optional(),
  })
  .strict()
  .refine((v) => v.decision === "approve" || (v.note ?? "").length >= 5, { message: "Буцаах шалтгааныг бичнэ үү." })
  .refine((v) => !v.coachingNeed || !!v.coachingAt, { message: "Дадлагажуулалтын дараагийн уулзалтын огноог сонгоно уу." })
  .refine((v) => !v.coachingAt || !Number.isNaN(new Date(v.coachingAt).getTime()), { message: "Уулзалтын огноо буруу." });

export async function decideWeeklyReview(planId: string, raw: z.input<typeof decideReviewSchema>): Promise<Result> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  const parsed = decideReviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const v = parsed.data;
  const plan = await loadPlanLite(planId);
  if (!plan) return { ok: false, error: NOT_FOUND };
  if (plan.agent_id === ctx.profileId) return { ok: false, error: "Өөрийн дүн шинжилгээг батлахгүй." };
  const supabase = await createClient();
  const { data: rev } = await supabase.from("crm_weekly_reviews").select("id, coaching_task_id").eq("plan_id", planId).maybeSingle();
  if (!rev) return { ok: false, error: "Агент дүн шинжилгээгээ хараахан бөглөөгүй байна." };

  const approve = v.decision === "approve";
  const coachingAt = v.coachingAt ? new Date(v.coachingAt).toISOString() : null;
  const patch: Database["public"]["Tables"]["crm_weekly_reviews"]["Update"] = approve
    ? { status: "approved" }
    : { status: "returned", return_note: v.note ?? null };
  if (v.coachingNeed) {
    patch.coaching_need = v.coachingNeed;
    patch.coaching_at = coachingAt;
  }
  const { error } = await supabase.from("crm_weekly_reviews").update(patch).eq("id", rev.id);
  if (error) {
    console.error("decideWeeklyReview:", error.message);
    return { ok: false, error: friendly(error.message) };
  }

  if (v.coachingNeed && coachingAt && !rev.coaching_task_id) {
    const admin = createAdminClient();
    const { data: task, error: tErr } = await admin
      .from("tasks")
      .insert({
        office_id: plan.office_id,
        created_by: ctx.profileId,
        responsible_id: ctx.profileId,
        title: "Дадлагажуулалтын уулзалт",
        description: v.coachingNeed,
        priority: "normal",
        deadline: coachingAt,
      })
      .select("id")
      .single();
    if (tErr || !task) console.error("decideWeeklyReview task:", tErr?.message);
    else {
      await admin.from("crm_task_links").insert({ task_id: task.id, entity: "crm_weekly_reviews", entity_id: rev.id, rule_code: "weekly_coaching" });
      await supabase.from("crm_weekly_reviews").update({ coaching_task_id: task.id }).eq("id", rev.id);
    }
    await notifyCrm({
      officeId: plan.office_id,
      event: "coaching_assigned",
      recipients: [plan.agent_id],
      title: "Дадлагажуулалтын уулзалт товлогдлоо",
      body: `${fmtDateTime(coachingAt)}: ${v.coachingNeed}`,
      link: `/agent/crm/week/${plan.week_start}/review`,
      entity: "crm_weekly_reviews",
      entityId: rev.id,
      admin,
    });
  }
  await notifyCrm({
    officeId: plan.office_id,
    event: approve ? "weekly_plan_approved" : "weekly_plan_returned",
    recipients: [plan.agent_id],
    includeRoles: [],
    title: approve ? "Дүн шинжилгээ батлагдлаа" : "Дүн шинжилгээг засуулахаар буцаалаа",
    body: approve ? `${weekShortLabel(plan.week_start)}-ний дүн шинжилгээ батлагдсан.` : `Шалтгаан: ${v.note ?? ""}`,
    link: `/agent/crm/week/${plan.week_start}/review`,
    entity: "crm_weekly_reviews",
    entityId: rev.id,
  });
  revalidateWeek();
  return { ok: true, id: rev.id };
}

// ── Хурал (§6.30, §9.5) ───────────────────────────────────

const meetingSchema = z
  .object({
    kind: z.enum(["monday", "friday"]),
    week: isoDate,
    teamId: uuid.nullable().optional(),
  })
  .strict();

export async function startSalesMeeting(raw: z.input<typeof meetingSchema>): Promise<Result> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  const parsed = meetingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  if (isoWeekday(parsed.data.week) !== 1) return { ok: false, error: "Долоо хоног Даваа гарагаас эхэлнэ." };
  const supabase = await createClient();
  let q = supabase
    .from("crm_sales_meetings")
    .select("id")
    .eq("kind", parsed.data.kind)
    .eq("week_start", parsed.data.week)
    .eq("status", "in_progress")
    .limit(1);
  q = parsed.data.teamId ? q.eq("team_id", parsed.data.teamId) : q.is("team_id", null);
  const { data: open } = await q.maybeSingle();
  if (open?.id) return { ok: true, id: open.id };
  const { data, error } = await supabase
    .from("crm_sales_meetings")
    .insert({
      office_id: ctx.officeId,
      kind: parsed.data.kind,
      week_start: parsed.data.week,
      team_id: parsed.data.teamId ?? null,
      branch_id: ctx.branchId,
      facilitator_id: ctx.profileId,
      created_by: ctx.profileId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("startSalesMeeting:", error?.message);
    return { ok: false, error: friendly(error?.message) };
  }
  revalidateWeek();
  return { ok: true, id: data.id };
}

const sectionsSchema = z.array(z.object({ key: z.string().max(40), seconds: z.number().int().min(0).max(86400) }).strict()).max(20);

export async function finishSalesMeeting(meetingId: string, sections: z.input<typeof sectionsSchema>, notes?: string | null): Promise<Result> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  const parsed = sectionsSchema.safeParse(sections);
  if (!parsed.success) return { ok: false, error: "Хурлын хугацааны мэдээлэл буруу." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("crm_sales_meetings")
    .update({ status: "done", ended_at: new Date().toISOString(), sections: parsed.data, notes: (notes ?? "").trim().slice(0, 2000) || null })
    .eq("id", meetingId);
  if (error) {
    console.error("finishSalesMeeting:", error.message);
    return { ok: false, error: friendly(error.message) };
  }
  revalidateWeek();
  return { ok: true, id: meetingId };
}

const decisionSchema = z
  .object({
    meetingId: uuid,
    planId: uuid.nullable().optional(),
    kind: z.enum(["decision", "commitment", "coaching", "obstacle"], "Төрлийг сонгоно уу"),
    text: z.string().trim().min(3, "Шийдвэрийг тодорхой бичнэ үү").max(1000),
    ownerId: uuid.nullable().optional(),
    dueOn: isoDate.nullable().optional(),
  })
  .strict()
  .refine((v) => v.kind !== "commitment" || !!v.planId, { message: "Амлалтыг агентын карттай холбоно уу." });

export async function recordMeetingDecision(raw: z.input<typeof decisionSchema>): Promise<Result> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу." };
  const v = parsed.data;
  if (v.dueOn && v.dueOn < ubDateIso()) return { ok: false, error: "Хугацаа өнгөрсөн огноо байж болохгүй." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_meeting_decisions")
    .insert({
      office_id: ctx.officeId,
      meeting_id: v.meetingId,
      plan_id: v.planId ?? null,
      kind: v.kind,
      text: v.text,
      owner_id: v.ownerId ?? null,
      due_on: v.dueOn ?? null,
      created_by: ctx.profileId,
    })
    .select("id, agent_id")
    .single();
  if (error || !data) {
    console.error("recordMeetingDecision:", error?.message);
    return { ok: false, error: friendly(error?.message) };
  }
  const notifyTo = [v.ownerId, data.agent_id].filter((x): x is string => !!x && x !== ctx.profileId);
  if (notifyTo.length && (v.kind === "coaching" || v.ownerId)) {
    await notifyCrm({
      officeId: ctx.officeId,
      event: v.kind === "coaching" ? "coaching_assigned" : "meeting_decision_assigned",
      recipients: notifyTo,
      includeRoles: [],
      title: v.kind === "coaching" ? "Хурлаас дадлагажуулалт оноогдлоо" : "Хурлын шийдвэр танд оноогдлоо",
      body: v.text + (v.dueOn ? ` (хугацаа ${v.dueOn})` : ""),
      link: "/agent/crm/week",
      entity: "crm_meeting_decisions",
      entityId: data.id,
    });
  }
  revalidateWeek();
  return { ok: true, id: data.id };
}

export async function setMeetingDecisionStatus(id: string, status: "open" | "done"): Promise<Result> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  if (!uuid.safeParse(id).success || !["open", "done"].includes(status)) return { ok: false, error: "Оролт буруу." };
  const supabase = await createClient();
  const { error } = await supabase.from("crm_meeting_decisions").update({ status }).eq("id", id);
  if (error) {
    console.error("setMeetingDecisionStatus:", error.message);
    return { ok: false, error: friendly(error.message) };
  }
  revalidateWeek();
  return { ok: true, id };
}
