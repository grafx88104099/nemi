import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthError } from "@/lib/crm/cron-auth";
import { notifyCrm } from "@/lib/crm/notify";
import { getRuleMap, hasRuleRun, listCrmOffices, logRuleRun, type AdminClient } from "@/lib/crm/rules";
import {
  addWeeks,
  currentWeekStart,
  finalLockAt,
  meetingAt,
  planReminderAt,
  reviewAt,
  weekShortLabel,
} from "@/lib/crm/week";
import {
  classifyMove,
  coachingDue,
  computeWeeklyScore,
  normalizeScoreWeights,
  normalizeWeeklyCycle,
  pickScoreWeights,
  resolveTargets,
  stageAdvances,
  summarizeMoves,
  type MetricKey,
  type MoveSummary,
  type WeeklyCycleSettings,
  type WeeklyValues,
} from "@/lib/crm/weekly-score";
import { WEEKLY_METRIC_CODES } from "@/lib/constants-crm-weekly";
import type { Json } from "@/types/database";

/**
 * CRM-ийн долоо хоногийн мөчлөгийн cron (U7 — PRO-001 v2.1 §6.22, §6.24,
 * §6.30; Ш8). pg_cron 'crm-weekly-hourly' цаг тутам дуудна (Vault нууцтай).
 * Оффис бүрд, УБ цагаар:
 *  • Д-31 — хурлаас өмнө картаа илгээгээгүй агентад сануулга;
 *  • Д-32 — хурлын сануулга (агент, ахлагч, БХЗ);
 *  • Д-33 — Баасан гарагийн урьдчилсан гүйцэтгэл ба оноо, дүн шинжилгээний
 *    сануулга;
 *  • Ням 24:00 (+тохиргоо) — эцсийн агшин зураг (дахин бичигдэхгүй), эцсийн
 *    оноо, дараалан хэтэрсэн агентад дадлагажуулалтын автомат даалгавар.
 * Идемпотент: crm_rule_runs дээрх тэмдэглэгээгээр (оффис/агент × долоо хоног).
 * Гүйцэтгэлийг зөвхөн энэ route (service role) бичнэ.
 */

export const maxDuration = 300;

/** Нээлттэй ажилтай агентууд (оффис:агент) — нэг дуудлагын хүрээнд. */
const OPEN_WORK = new Set<string>();
const workKey = (officeId: string, agentId: string) => officeId + ":" + agentId;

/** §6.25: үнэлэх агент — нээлттэй сэжим/боломжтой эсвэл долоо хоногт бүртгэлтэй. */
function isScored(officeId: string, agentId: string, v: WeeklyValues): boolean {
  if (OPEN_WORK.has(workKey(officeId, agentId))) return true;
  return (v.outbound_contacts ?? 0) + (v.meaningful_conversations ?? 0) + (v.closed_deals ?? 0) + (v.stage_advances ?? 0) > 0;
}

type StaffRow = { profile_id: string; roles: string[]; team_id: string | null; hired_on: string | null; offboarding: boolean };

async function setting(admin: AdminClient, officeId: string, key: string): Promise<unknown> {
  const { data } = await admin
    .from("crm_settings")
    .select("value")
    .eq("office_id", officeId)
    .eq("key", key)
    .is("valid_to", null)
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.value ?? null;
}

async function sellingAgents(admin: AdminClient, officeId: string): Promise<StaffRow[]> {
  const { data, error } = await admin
    .from("crm_staff")
    .select("profile_id, roles, team_id, hired_on, offboarding")
    .eq("office_id", officeId)
    .eq("is_active", true);
  if (error) console.error("crm-weekly staff:", error.message);
  return ((data ?? []) as StaffRow[]).filter((s) => (s.roles ?? []).includes("agent") && !s.offboarding);
}

async function allStaff(admin: AdminClient, officeId: string): Promise<StaffRow[]> {
  const { data } = await admin
    .from("crm_staff")
    .select("profile_id, roles, team_id, hired_on, offboarding")
    .eq("office_id", officeId)
    .eq("is_active", true);
  return (data ?? []) as StaffRow[];
}

type PlanRow = { id: string; agent_id: string; status: string };

async function plansFor(admin: AdminClient, officeId: string, week: string): Promise<Map<string, PlanRow & { targets: WeeklyValues; review: string | null }>> {
  const out = new Map<string, PlanRow & { targets: WeeklyValues; review: string | null }>();
  const { data } = await admin.from("crm_weekly_plans").select("id, agent_id, status").eq("office_id", officeId).eq("week_start", week);
  const plans = (data ?? []) as PlanRow[];
  if (!plans.length) return out;
  const ids = plans.map((p) => p.id);
  const [t, r] = await Promise.all([
    admin.from("crm_weekly_plan_targets").select("plan_id, metric_code, target").in("plan_id", ids),
    admin.from("crm_weekly_reviews").select("plan_id, status").in("plan_id", ids),
  ]);
  const targets = new Map<string, WeeklyValues>();
  for (const x of (t.data ?? []) as { plan_id: string; metric_code: string; target: number | string | null }[]) {
    const cur = targets.get(x.plan_id) ?? {};
    cur[x.metric_code as MetricKey] = x.target == null ? null : Number(x.target);
    targets.set(x.plan_id, cur);
  }
  const reviews = new Map(((r.data ?? []) as { plan_id: string; status: string }[]).map((x) => [x.plan_id, x.status]));
  for (const p of plans) out.set(p.agent_id, { ...p, targets: targets.get(p.id) ?? {}, review: reviews.get(p.id) ?? null });
  return out;
}

async function weekValues(admin: AdminClient, officeId: string, week: string): Promise<Map<string, WeeklyValues>> {
  const args = { p_week: week, p_office: officeId, p_agent: null };
  const [m, mv] = await Promise.all([admin.rpc("crm_agent_week_metrics", args), admin.rpc("crm_agent_week_moves", args)]);
  if (m.error) throw new Error(m.error.message);
  const out = new Map<string, WeeklyValues>();
  for (const r of (m.data ?? []) as { agent_id: string; metric_code: string; actual: number | string | null }[]) {
    if (r.metric_code === "open_work") {
      if (Number(r.actual ?? 0) > 0) OPEN_WORK.add(workKey(officeId, r.agent_id));
      continue;
    }
    if (!(WEEKLY_METRIC_CODES as readonly string[]).includes(r.metric_code)) continue;
    const cur = out.get(r.agent_id) ?? {};
    cur[r.metric_code as MetricKey] = r.actual == null ? null : Number(r.actual);
    out.set(r.agent_id, cur);
  }
  const moves = new Map<string, MoveSummary>();
  const kinds = new Map<string, ReturnType<typeof classifyMove>[]>();
  for (const x of (mv.data ?? []) as { agent_id: string; from_sort: number | null; to_sort: number | null; to_terminal: string | null }[]) {
    const k = classifyMove({
      fromSort: x.from_sort,
      toSort: x.to_sort,
      toTerminal: x.to_terminal === "won" || x.to_terminal === "lost" ? x.to_terminal : null,
    });
    kinds.set(x.agent_id, [...(kinds.get(x.agent_id) ?? []), k]);
  }
  for (const [a, list] of kinds) moves.set(a, summarizeMoves(list));
  for (const [a, v] of out) v.stage_advances = stageAdvances(moves.get(a) ?? summarizeMoves([]));
  return out;
}

/** Агшин зураг + оноо хадгална. Эцсийн оноо дахин бичигдэхгүй. */
async function freezeAndScore(
  admin: AdminClient,
  officeId: string,
  week: string,
  kind: "preliminary" | "final",
  cycle: WeeklyCycleSettings,
  weightsRaw: unknown
): Promise<{ agents: number; scored: number }> {
  const { error: fErr } = await admin.rpc("crm_weekly_freeze", { p_office: officeId, p_week: week, p_kind: kind });
  if (fErr) throw new Error(fErr.message);

  let values: Map<string, WeeklyValues>;
  if (kind === "final") {
    // Эцсийн оноо хадгалсан агшин зургаас (дахин тооцоход өөрчлөгдөхгүй).
    const { data } = await admin
      .from("crm_weekly_actuals")
      .select("agent_id, metrics, moves")
      .eq("office_id", officeId)
      .eq("week_start", week)
      .eq("kind", "final");
    values = new Map();
    for (const r of (data ?? []) as { agent_id: string; metrics: Record<string, unknown>; moves: Record<string, unknown> }[]) {
      const v: WeeklyValues = {};
      for (const [k, x] of Object.entries(r.metrics ?? {})) {
        if (k === "open_work") {
          if (Number(x ?? 0) > 0) OPEN_WORK.add(workKey(officeId, r.agent_id));
          continue;
        }
        v[k as MetricKey] = x == null ? null : Number(x);
      }
      const mv = r.moves ?? {};
      v.stage_advances = Number(mv.advanced ?? 0) + Number(mv.won ?? 0);
      values.set(r.agent_id, v);
    }
  } else {
    values = await weekValues(admin, officeId, week);
  }

  const [staff, plans] = await Promise.all([sellingAgents(admin, officeId), plansFor(admin, officeId, week)]);
  const base = normalizeScoreWeights(weightsRaw);
  const rows = staff
    .filter((s) => values.has(s.profile_id) && isScored(officeId, s.profile_id, values.get(s.profile_id) ?? {}))
    .map((s) => {
      const plan = plans.get(s.profile_id) ?? null;
      const targets = resolveTargets(plan?.targets, plan?.status, cycle.defaultTargets);
      const { weights, profile } = pickScoreWeights(base, cycle, s.hired_on, week);
      const score = computeWeeklyScore({ actuals: values.get(s.profile_id) ?? {}, targets, weights, naPolicy: cycle.naPolicy });
      return {
        office_id: officeId,
        agent_id: s.profile_id,
        week_start: week,
        kind,
        plan_id: plan?.id ?? null,
        profile,
        weights: weights as unknown as Json,
        targets: targets as unknown as Json,
        components: score.components as unknown as Json,
        total: score.total,
        computed_at: new Date().toISOString(),
      };
    });
  if (rows.length) {
    const { error } = await admin
      .from("crm_weekly_scores")
      .upsert(rows, { onConflict: "office_id,agent_id,week_start,kind", ignoreDuplicates: kind === "final" });
    if (error) throw new Error(error.message);
  }
  return { agents: values.size, scored: rows.length };
}

/** Дараалан хэтэрсэн агентад дадлагажуулалтын даалгавар (§9.6, «N удаа хэтэрвэл»). */
async function autoCoaching(admin: AdminClient, officeId: string, week: string, cycle: WeeklyCycleSettings, sinceIso: string) {
  const weeks = Array.from({ length: cycle.coaching.consecutiveWeeks }, (_, i) => addWeeks(week, -i));
  const [actualsRes, scoresRes, staff, everyone] = await Promise.all([
    admin.from("crm_weekly_actuals").select("agent_id, week_start, metrics").eq("office_id", officeId).eq("kind", "final").in("week_start", weeks),
    admin.from("crm_weekly_scores").select("agent_id, week_start, total").eq("office_id", officeId).eq("kind", "final").in("week_start", weeks),
    sellingAgents(admin, officeId),
    allStaff(admin, officeId),
  ]);
  const overdue = new Map<string, number | null>();
  for (const r of (actualsRes.data ?? []) as { agent_id: string; week_start: string; metrics: Record<string, unknown> }[]) {
    const v = r.metrics?.overdue_followups;
    overdue.set(`${r.agent_id}:${r.week_start}`, v == null ? null : Number(v));
  }
  const totals = new Map<string, number>();
  for (const r of (scoresRes.data ?? []) as { agent_id: string; week_start: string; total: number }[]) {
    totals.set(`${r.agent_id}:${r.week_start}`, Number(r.total));
  }
  let created = 0;
  for (const s of staff) {
    const history = weeks.map((w) => ({
      overdue: overdue.get(`${s.profile_id}:${w}`) ?? null,
      score: totals.get(`${s.profile_id}:${w}`) ?? null,
    }));
    const due = coachingDue(history, cycle.coaching);
    if (!due.due) continue;
    if (await hasRuleRun(admin, { officeId, ruleCode: "weekly_coaching_auto", entity: "profiles", entityId: s.profile_id, sinceIso })) continue;
    const lead =
      everyone.find((x) => x.team_id && x.team_id === s.team_id && x.roles.includes("team_lead") && x.profile_id !== s.profile_id) ??
      everyone.find((x) => x.roles.some((r) => cycle.approverFallbackRoles.includes(r)) && x.profile_id !== s.profile_id);
    if (!lead) continue;
    const deadline = new Date(Date.now() + cycle.coaching.taskDueDays * 86_400_000).toISOString();
    const reason =
      due.reason === "overdue"
        ? `Сүүлийн ${cycle.coaching.consecutiveWeeks} долоо хоног дараалан хугацаа хэтэрсэн эргэн холбогдолт ${cycle.coaching.overdueMin}-аас олон.`
        : `Сүүлийн ${cycle.coaching.consecutiveWeeks} долоо хоног дараалан үнэлгээ ${cycle.coaching.scoreBelow}-аас доогуур.`;
    const { data: task, error } = await admin
      .from("tasks")
      .insert({
        office_id: officeId,
        created_by: lead.profile_id,
        responsible_id: lead.profile_id,
        title: "Дадлагажуулалт: агенттай уулзах",
        description: reason,
        priority: "high",
        deadline,
      })
      .select("id")
      .single();
    if (error || !task) {
      await logRuleRun(admin, { officeId, ruleCode: "weekly_coaching_auto", entity: "profiles", entityId: s.profile_id, status: "error", error: error?.message });
      continue;
    }
    await admin.from("crm_task_links").insert({ task_id: task.id, entity: "profiles", entity_id: s.profile_id, rule_code: "weekly_coaching_auto" });
    await notifyCrm({
      officeId,
      admin,
      event: "coaching_assigned",
      recipients: [s.profile_id, lead.profile_id],
      title: "Дадлагажуулалтын уулзалт товлогдоно",
      body: reason,
      link: `/agent/crm/week/${week}/review`,
      entity: "profiles",
      entityId: s.profile_id,
    });
    await logRuleRun(admin, {
      officeId,
      ruleCode: "weekly_coaching_auto",
      entity: "profiles",
      entityId: s.profile_id,
      status: "ok",
      result: { week, reason: due.reason, task_id: task.id },
    });
    created += 1;
  }
  return created;
}

export async function GET(request: Request) {
  const denied = cronAuthError(request);
  if (denied) return NextResponse.json({ ok: false, error: denied.error }, { status: denied.status });

  const admin = createAdminClient();
  OPEN_WORK.clear();
  const now = new Date();
  const curWeek = currentWeekStart(now);
  const offices = await listCrmOffices(admin);
  const rules = await getRuleMap(admin);
  const summary: Record<string, unknown>[] = [];

  for (const officeId of offices) {
    const out: Record<string, unknown> = { office: officeId };
    try {
      const cycle = normalizeWeeklyCycle(await setting(admin, officeId, "weekly_cycle"), await setting(admin, officeId, "weekly_targets"));
      const weightsRaw = await setting(admin, officeId, "agent_score_weights");
      const s = cycle.schedule;
      const rule = (code: string) => rules.get(`${officeId}:${code}`) ?? null;
      const active = (code: string) => rule(code)?.is_active !== false;
      const dry = (code: string) => rule(code)?.dry_run === true;

      // Д-31: картын сануулга (энэ болон ирэх долоо хоногийн хурлаас өмнө).
      if (active("D-31")) {
        let sent = 0;
        for (const w of [curWeek, addWeeks(curWeek, 1)]) {
          const from = planReminderAt(w, s);
          const until = meetingAt(w, s);
          if (now < from || now >= until) continue;
          const [agents, plans] = await Promise.all([sellingAgents(admin, officeId), plansFor(admin, officeId, w)]);
          for (const a of agents) {
            const p = plans.get(a.profile_id);
            if (p && (p.status === "submitted" || p.status === "approved")) continue;
            if (await hasRuleRun(admin, { officeId, ruleCode: "D-31", entity: "profiles", entityId: a.profile_id, sinceIso: from.toISOString() })) continue;
            if (!dry("D-31")) {
              await notifyCrm({
                officeId,
                admin,
                now,
                event: "weekly_plan_due",
                recipients: [a.profile_id],
                title: "Долоо хоногийн картаа бөглөнө үү",
                body: `${weekShortLabel(w)}-ний төлөвлөгөөгөө хурлаас өмнө бөглөж, батлуулахаар илгээнэ үү.`,
                link: `/agent/crm/week/${w}`,
                entity: "profiles",
                entityId: a.profile_id,
              });
            }
            await logRuleRun(admin, { officeId, ruleCode: "D-31", entity: "profiles", entityId: a.profile_id, status: dry("D-31") ? "dry_run" : "ok", result: { week: w } });
            sent += 1;
          }
        }
        out.plan_reminders = sent;
      }

      // Д-32: хурлын сануулга — cron цаг тутам тул цонх дор хаяж 65 минут.
      if (active("D-32")) {
        for (const w of [curWeek, addWeeks(curWeek, 1)]) {
          const at = meetingAt(w, s);
          const from = new Date(at.getTime() - Math.max(s.meetingReminderMin, 65) * 60_000);
          if (now < from || now >= at) continue;
          if (await hasRuleRun(admin, { officeId, ruleCode: "D-32", entity: "offices", entityId: officeId, sinceIso: from.toISOString() })) continue;
          const agents = await sellingAgents(admin, officeId);
          if (!dry("D-32") && agents.length) {
            const hm = new Intl.DateTimeFormat("mn-MN", { timeZone: "Asia/Ulaanbaatar", hour: "2-digit", minute: "2-digit" }).format(at);
            await notifyCrm({
              officeId,
              admin,
              now,
              event: "sales_meeting_reminder",
              recipients: agents.map((a) => a.profile_id),
              title: "Долоо хоногийн борлуулалтын хурал",
              body: `Хурал ${hm}-д эхэлнэ. Картаа шалгаад 3–5 минутын танилцуулгадаа бэлдээрэй.`,
              link: `/agent/crm/week/${w}`,
              entity: "offices",
              entityId: officeId,
            });
          }
          await logRuleRun(admin, { officeId, ruleCode: "D-32", entity: "offices", entityId: officeId, status: dry("D-32") ? "dry_run" : "ok", result: { week: w } });
          out.meeting_reminder = true;
        }
      }

      // Д-33: Баасан гарагийн урьдчилсан дүн + дүн шинжилгээний сануулга.
      {
        const from = reviewAt(curWeek, s);
        if (now >= from && now < finalLockAt(curWeek, s)) {
          const done = await hasRuleRun(admin, { officeId, ruleCode: "D-33", entity: "offices", entityId: officeId, sinceIso: from.toISOString() });
          if (!done) {
            const res = await freezeAndScore(admin, officeId, curWeek, "preliminary", cycle, weightsRaw);
            let reminded = 0;
            if (active("D-33") && !dry("D-33")) {
              const [agents, plans] = await Promise.all([sellingAgents(admin, officeId), plansFor(admin, officeId, curWeek)]);
              const todo = agents.filter((a) => {
                const p = plans.get(a.profile_id);
                return !p || !p.review || p.review === "draft" || p.review === "returned";
              });
              if (todo.length) {
                await notifyCrm({
                  officeId,
                  admin,
                  now,
                  event: "weekly_review_due",
                  recipients: todo.map((a) => a.profile_id),
                  title: "Баасан гарагийн дүн шинжилгээ",
                  body: "Долоо хоногийн урьдчилсан дүн бэлэн. Дүн шинжилгээгээ Ням 24:00-оос өмнө бөглөж илгээнэ үү.",
                  link: `/agent/crm/week/${curWeek}/review`,
                  entity: "offices",
                  entityId: officeId,
                });
                reminded = todo.length;
              }
            }
            await logRuleRun(admin, {
              officeId,
              ruleCode: "D-33",
              entity: "offices",
              entityId: officeId,
              status: active("D-33") && !dry("D-33") ? "ok" : "dry_run",
              result: { week: curWeek, ...res, reminded },
            });
            out.preliminary = res;
          }
        }
      }

      // Эцсийн түгжээ: өмнөх (эсвэл offset сөрөг бол энэ) долоо хоног.
      for (const w of [addWeeks(curWeek, -1), curWeek]) {
        const lock = finalLockAt(w, s);
        if (now < lock) continue;
        if (await hasRuleRun(admin, { officeId, ruleCode: "weekly_final", entity: "offices", entityId: officeId, sinceIso: lock.toISOString() })) continue;
        const res = await freezeAndScore(admin, officeId, w, "final", cycle, weightsRaw);
        const coaching = await autoCoaching(admin, officeId, w, cycle, lock.toISOString());
        await logRuleRun(admin, { officeId, ruleCode: "weekly_final", entity: "offices", entityId: officeId, status: "ok", result: { week: w, ...res, coaching } });
        out.final = { week: w, ...res, coaching };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("crm-weekly:", officeId, msg);
      await logRuleRun(admin, { officeId, ruleCode: "weekly_cycle", entity: "offices", entityId: officeId, status: "error", error: msg });
      out.error = true;
    }
    summary.push(out);
  }
  return NextResponse.json({ ok: true, week: curWeek, offices: summary });
}
