import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { getCrmStaffContext, getSettingValue, type CrmStaffContext } from "@/lib/queries-crm-core";
import { getLeadCardSettings } from "@/lib/queries-crm-leads";
import { getFunnelReport, getPeriodMetrics, sumMetric } from "@/lib/queries-crm-kpi";
import {
  getCommissionSummaryView,
  getForecastView,
  sumCommissionSummary,
  sumForecast,
  type ForecastTotals,
} from "@/lib/queries-crm-reports";
import { getAgentWeekCard } from "@/lib/queries-crm-weekly";
import { currentWeekStart } from "@/lib/crm/week";
import { QUALITY_CRITERION_LABEL, isQualityCriterion } from "@/lib/crm/quality";
import {
  applySnoozes,
  dailyBlocks,
  dayCloseChecklist,
  normalizeDailyNorms,
  normalizeRhythm,
  normalizeTodaySettings,
  pctOf,
  pipelineRevenue,
  sortTodayItems,
  stageBucket,
  ubDayBounds,
  ubHour,
  ubIso,
  ubWeekday,
  PIPELINE_BUCKETS,
  type DailyBlock,
  type DayCloseItem,
  type PipelineBucket,
  type TodayItem,
  type TodaySettings,
} from "@/lib/crm/today";
import type { RecontactRanges } from "@/lib/crm/scoring";
import type { CommissionStatus } from "@/lib/constants-crm";
import type { WeeklyValues } from "@/lib/crm/weekly-score";

/**
 * Агентын «Өнөөдөр» дэлгэц (§8.3, §6.22, §6.23, R16, UX-18) — RLS-ээр
 * зөвхөн өөрийн бүртгэл. Өдрийн хил, «өнөөдөр» нь УБ-аар.
 */

export const myCrmContext = cache(getCrmStaffContext);

type PhoneRow = { raw: string; is_primary: boolean };
type ContactLite = { display_name: string; phones?: PhoneRow[] } | null;

function primaryPhone(c: ContactLite): string | null {
  const list = c?.phones ?? [];
  return (list.find((p) => p.is_primary) ?? list[0])?.raw ?? null;
}

type RawLead = {
  id: string;
  status: string;
  grade: string | null;
  contact_id: string;
  next_step: string | null;
  next_step_date: string | null;
  first_contact_at: string | null;
  first_contact_due_at: string | null;
  accept_due_at: string | null;
  accepted_at: string | null;
  last_contact_at: string | null;
  created_at: string;
  contact: ContactLite;
};

type RawOpp = {
  id: string;
  contact_id: string;
  lead_id: string | null;
  next_step: string | null;
  next_step_date: string | null;
  meeting_at: string | null;
  meeting_place: string | null;
  expected_fee_mnt: number | null;
  created_at: string;
  stage: { code: string; name: string; probability: number; is_terminal: boolean } | null;
  contact: ContactLite;
};

type RawShowing = {
  id: string;
  status: string;
  scheduled_at: string;
  done_at: string | null;
  opportunity_id: string | null;
  contact_id: string;
  contact: ContactLite;
  property: { name: string | null; number: string | null } | null;
};

type RawTask = {
  id: string;
  title: string;
  deadline: string | null;
  status: string;
  priority: string;
  links: { entity: string; entity_id: string; rule_code: string | null }[] | null;
};

const LEAD_SELECT =
  "id, status, grade, contact_id, next_step, next_step_date, first_contact_at, first_contact_due_at, " +
  "accept_due_at, accepted_at, last_contact_at, created_at, " +
  "contact:crm_contacts!crm_leads_contact_id_fkey(display_name, phones:crm_contact_phones(raw, is_primary))";

const OPP_SELECT =
  "id, contact_id, lead_id, next_step, next_step_date, meeting_at, meeting_place, expected_fee_mnt, created_at, " +
  "stage:crm_stages!crm_opportunities_stage_id_fkey(code, name, probability, is_terminal), " +
  "contact:crm_contacts!crm_opportunities_contact_id_fkey(display_name, phones:crm_contact_phones(raw, is_primary))";

const SHOWING_SELECT =
  "id, status, scheduled_at, done_at, opportunity_id, contact_id, " +
  "contact:crm_contacts!crm_showings_contact_id_fkey(display_name, phones:crm_contact_phones(raw, is_primary)), " +
  "property:crm_properties!crm_showings_property_id_fkey(name, number)";

/** Даалгаврын холбоосоос зорьсон карт (UX-18). */
export function taskHref(links: RawTask["links"], basePath: string): string {
  const l = (links ?? [])[0];
  if (!l) return "/agent/tasks";
  switch (l.entity) {
    case "lead":
    case "crm_leads":
      return `${basePath}/leads/${l.entity_id}`;
    case "contact":
    case "crm_contacts":
      return `${basePath}/contacts/${l.entity_id}`;
    case "opportunity":
    case "crm_opportunities":
      return `${basePath}/pipeline/${l.entity_id}`;
    case "transaction":
    case "crm_transactions":
      return `${basePath}/transactions/${l.entity_id}`;
    default:
      return "/agent/tasks";
  }
}

/** Эхний холболт / давтан оролдлогын даалгаврыг «Хийсэн» товчоор биш, бүртгэлээр хаана. */
const LOG_TO_CLOSE = new Set(["D-01", "D-03", "D-04"]);

export type TodayFunnel = { newLeads: number; contacted: number; qualified: number; grades: Record<"a" | "b" | "c" | "d", number> };

export type TodayData = {
  ctx: CrmStaffContext;
  settings: TodaySettings;
  todayIso: string;
  nowIso: string;
  weekday: number;
  items: TodayItem[];
  snoozedCount: number;
  snoozesUsedToday: number;
  retryHours: number;
  recontactRanges: RecontactRanges;
  funnel: TodayFunnel;
  pipeline: Record<PipelineBucket, number>;
  openOpps: number;
  revenue: { closed: number; pending: number; weighted: number; missingFee: number; dealWeighted: number };
  forecast: ForecastTotals;
  conversions: (number | null)[];
  conversionsUnavailable: boolean;
  quality: {
    pct: number | null;
    failing: { label: string; count: number }[];
    overduePct: number | null;
    lostReasons: { label: string; count: number }[];
    fixTasks: number;
  };
  blocks: DailyBlock[];
  dayClose: DayCloseItem[];
  dayCloseDue: boolean;
  rhythm: string[];
  week: { actuals: WeeklyValues; targets: WeeklyValues; planStatus: string | null } | null;
  commission: Partial<Record<CommissionStatus, { cnt: number; amount: number; paid: number }>>;
};

async function countOf(q: PromiseLike<{ count: number | null; error: { message: string } | null }>, label: string): Promise<number> {
  const { count, error } = await q;
  if (error) {
    console.error(`today ${label}:`, error.message);
    return 0;
  }
  return count ?? 0;
}

export async function getTodayData(basePath = "/agent/crm", now: Date = new Date()): Promise<TodayData | null> {
  const ctx = await myCrmContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const me = ctx.profileId;
  const todayIso = ubIso(now);
  const { start: dayStart, end: dayEnd } = ubDayBounds(todayIso);
  const nowIso = now.toISOString();

  const [settingsRaw, rhythmRaw, normsRaw, cardSettings] = await Promise.all([
    getSettingValue("today_queue"),
    getSettingValue("daily_rhythm"),
    getSettingValue("daily_norms"),
    getLeadCardSettings(),
  ]);
  const settings = normalizeTodaySettings(settingsRaw);
  const conversionFrom = new Date(Date.parse(`${todayIso}T00:00:00Z`) - settings.conversionDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const monthFrom = `${todayIso.slice(0, 8)}01`;

  const [leadsRes, oppsRes, showingsRes, tasksRes, snoozeRes, lostRes] = await Promise.all([
    supabase.from("crm_leads").select(LEAD_SELECT).eq("owner_id", me).in("status", ["new", "active"]).limit(500),
    supabase.from("crm_opportunities").select(OPP_SELECT).eq("owner_id", me).eq("state", "open").limit(500),
    supabase
      .from("crm_showings")
      .select(SHOWING_SELECT)
      .eq("agent_id", me)
      .or(`and(status.eq.scheduled,scheduled_at.lt.${dayEnd}),and(status.eq.done,feedback_at.is.null)`)
      .order("scheduled_at")
      .limit(100),
    supabase
      .from("tasks")
      .select("id, title, deadline, status, priority, links:crm_task_links(entity, entity_id, rule_code)")
      .eq("responsible_id", me)
      .in("status", ["pending", "in_progress"])
      .lt("deadline", dayEnd)
      .order("deadline")
      .limit(100),
    supabase.from("crm_today_snoozes").select("item_kind, item_id, until, created_at").eq("profile_id", me).gte("created_at", dayStart),
    supabase
      .from("crm_opportunities")
      .select("id, lost_reason:crm_lookups!crm_opportunities_lost_reason_id_fkey(label)")
      .eq("owner_id", me)
      .eq("state", "lost")
      .gte("updated_at", `${conversionFrom}T00:00:00Z`)
      .limit(300),
  ]);
  for (const [label, r] of [
    ["leads", leadsRes],
    ["opps", oppsRes],
    ["showings", showingsRes],
    ["tasks", tasksRes],
    ["lost", lostRes],
  ] as const) {
    if (r.error) console.error(`today ${label}:`, r.error.message);
  }
  // Хойшлуулалтын хүснэгт миграцигүй үед чимээгүй (дараалал хойшлуулалтгүй ажиллана).
  const snoozes = snoozeRes.error ? [] : (snoozeRes.data ?? []);

  const leads = (leadsRes.data ?? []) as unknown as RawLead[];
  const opps = (oppsRes.data ?? []) as unknown as RawOpp[];
  const showings = (showingsRes.data ?? []) as unknown as RawShowing[];
  const tasks = (tasksRes.data ?? []) as unknown as RawTask[];

  const items: TodayItem[] = [];
  const base = (p: Partial<TodayItem> & Pick<TodayItem, "kind" | "id" | "title" | "href">): TodayItem => ({
    key: `${p.kind}:${p.id}`,
    subtitle: null,
    dueAt: null,
    dueDate: null,
    overdue: false,
    action: "open",
    contactId: null,
    leadId: null,
    opportunityId: null,
    grade: null,
    leadIsNew: false,
    phone: null,
    ...p,
  });

  for (const l of leads) {
    const name = l.contact?.display_name ?? "Нэргүй харилцагч";
    const phone = primaryPhone(l.contact);
    const common = { contactId: l.contact_id, leadId: l.id, grade: l.grade, leadIsNew: l.status === "new", phone };
    const href = `${basePath}/leads/${l.id}`;
    if (l.status === "new" && !l.first_contact_at && l.first_contact_due_at) {
      items.push(
        base({
          kind: "sla",
          id: l.id,
          title: name,
          subtitle: "Эхний холболт хийх",
          href,
          dueAt: l.first_contact_due_at,
          overdue: Date.parse(l.first_contact_due_at) < now.getTime(),
          action: "log",
          ...common,
        })
      );
      continue;
    }
    if (l.accept_due_at && !l.accepted_at && !l.first_contact_at) {
      items.push(
        base({
          kind: "accept",
          id: l.id,
          title: name,
          subtitle: "Сэжмийг хүлээн авах",
          href: `${basePath}/pool?tab=accept`,
          dueAt: l.accept_due_at,
          overdue: Date.parse(l.accept_due_at) < now.getTime(),
          ...common,
        })
      );
    }
    if (l.next_step_date && l.next_step_date <= todayIso) {
      items.push(
        base({
          kind: "lead_step",
          id: l.id,
          title: name,
          subtitle: l.next_step ?? "Дараагийн үйлдэл",
          href,
          dueDate: l.next_step_date,
          overdue: l.next_step_date < todayIso,
          action: "log",
          ...common,
        })
      );
    }
  }

  for (const o of opps) {
    const name = o.contact?.display_name ?? "Нэргүй харилцагч";
    const phone = primaryPhone(o.contact);
    const href = `${basePath}/pipeline/${o.id}`;
    const common = { contactId: o.contact_id, opportunityId: o.id, leadId: o.lead_id, phone };
    if (o.next_step_date && o.next_step_date <= todayIso) {
      items.push(
        base({
          kind: "opp_step",
          id: o.id,
          title: name,
          subtitle: `${o.stage?.name ?? "Боломж"} · ${o.next_step ?? "Дараагийн үйлдэл"}`,
          href,
          dueDate: o.next_step_date,
          overdue: o.next_step_date < todayIso,
          action: "log",
          ...common,
        })
      );
    }
    if (o.meeting_at && o.meeting_at >= dayStart && o.meeting_at < dayEnd) {
      items.push(
        base({
          kind: "meeting",
          id: o.id,
          title: name,
          subtitle: o.meeting_place ? `Уулзалт · ${o.meeting_place}` : "Уулзалт",
          href,
          dueAt: o.meeting_at,
          ...common,
        })
      );
    }
  }

  for (const s of showings) {
    const name = s.contact?.display_name ?? "Нэргүй харилцагч";
    const prop = s.property?.name ?? s.property?.number ?? "Үл хөдлөх";
    const href = s.opportunity_id ? `${basePath}/pipeline/${s.opportunity_id}` : `${basePath}/contacts/${s.contact_id}`;
    const common = { contactId: s.contact_id, opportunityId: s.opportunity_id, phone: primaryPhone(s.contact) };
    if (s.status === "done") {
      items.push(
        base({
          kind: "feedback",
          id: s.id,
          title: name,
          subtitle: `Эргэх холбоо бүртгэх · ${prop}`,
          href,
          dueAt: s.done_at,
          overdue: true,
          ...common,
        })
      );
    } else {
      items.push(
        base({
          kind: "showing",
          id: s.id,
          title: name,
          subtitle: `Үзлэг · ${prop}`,
          href,
          dueAt: s.scheduled_at,
          overdue: s.scheduled_at < dayStart,
          ...common,
        })
      );
    }
  }

  let fixTasks = 0;
  for (const t of tasks) {
    const rule = t.links?.[0]?.rule_code ?? null;
    if (rule === "quality_fix") fixTasks += 1;
    // Эхний холболтын даалгавар сэжмийн SLA мөрөөр аль хэдийн харагдана.
    if (rule && LOG_TO_CLOSE.has(rule) && t.links?.[0]?.entity === "lead" && items.some((i) => i.kind === "sla" && i.id === t.links?.[0]?.entity_id)) {
      continue;
    }
    items.push(
      base({
        kind: "task",
        id: t.id,
        title: t.title,
        subtitle: rule === "quality_fix" ? "Өгөгдлийн чанарын засвар" : rule === "track" ? "Ажлын цуваа" : null,
        href: taskHref(t.links, basePath),
        dueAt: t.deadline,
        overdue: !!t.deadline && t.deadline < nowIso,
        action: rule && LOG_TO_CLOSE.has(rule) ? "open" : "complete",
      })
    );
  }

  const { visible, snoozed } = applySnoozes(sortTodayItems(items), snoozes, now);

  // §8.3 Сэжимийн шатлал ба хэлцлийн урсгал
  const grades = { a: 0, b: 0, c: 0, d: 0 };
  for (const l of leads) if (l.grade && l.grade in grades) grades[l.grade as keyof typeof grades] += 1;
  const pipeline = Object.fromEntries(PIPELINE_BUCKETS.map((b) => [b, 0])) as Record<PipelineBucket, number>;
  let qualified = 0;
  for (const o of opps) {
    if (!o.stage || o.stage.is_terminal) continue;
    if (o.stage.code === "qualified") qualified += 1;
    const b = stageBucket(o.stage.code);
    if (b) pipeline[b] += 1;
  }

  // §6.23 Өнөөдрийн тоо
  const [
    newOpps,
    meaningful,
    meetings,
    showingsDone,
    listingsActivated,
    closingActs,
    offersToday,
    activitiesToday,
  ] = await Promise.all([
    countOf(
      supabase.from("crm_opportunities").select("id", { count: "exact", head: true }).eq("owner_id", me).gte("created_at", dayStart).lt("created_at", dayEnd),
      "newOpps"
    ),
    countOf(
      supabase.from("crm_activities").select("id", { count: "exact", head: true }).eq("owner_id", me).eq("is_meaningful", true).gte("occurred_at", dayStart).lt("occurred_at", dayEnd),
      "meaningful"
    ),
    countOf(
      supabase.from("crm_activities").select("id", { count: "exact", head: true }).eq("owner_id", me).eq("channel", "meeting").eq("is_meaningful", true).gte("occurred_at", dayStart).lt("occurred_at", dayEnd),
      "meetings"
    ),
    countOf(
      supabase.from("crm_showings").select("id", { count: "exact", head: true }).eq("agent_id", me).eq("status", "done").gte("done_at", dayStart).lt("done_at", dayEnd),
      "showingsDone"
    ),
    (async () => {
      const { count, error } = await supabase
        .from("crm_properties")
        .select("id", { count: "exact", head: true })
        .eq("created_by", me)
        .gte("activated_at", dayStart)
        .lt("activated_at", dayEnd);
      return error ? 0 : (count ?? 0); // activated_at багана 001800-аар нэмэгдэнэ
    })(),
    countOf(
      supabase.from("crm_activities").select("id", { count: "exact", head: true }).eq("owner_id", me).in("purpose", ["offer", "negotiation"]).gte("occurred_at", dayStart).lt("occurred_at", dayEnd),
      "closingActs"
    ),
    countOf(
      supabase.from("crm_offers").select("id", { count: "exact", head: true }).eq("created_by", me).gte("created_at", dayStart).lt("created_at", dayEnd),
      "offersToday"
    ),
    countOf(
      supabase.from("crm_activities").select("id", { count: "exact", head: true }).eq("owner_id", me).gte("occurred_at", dayStart).lt("occurred_at", dayEnd),
      "activitiesToday"
    ),
  ]);

  const norms = normalizeDailyNorms(normsRaw);
  const blocks = dailyBlocks(
    {
      newOpportunities: newOpps,
      meaningfulContacts: meaningful,
      meetings,
      showings: showingsDone,
      listingsActivated,
      closingActions: closingActs + offersToday,
    },
    norms
  );

  const stepsWithDate =
    leads.filter((l) => l.status === "active" && l.next_step_date).length + opps.filter((o) => o.next_step_date).length;
  const stepsOverdue =
    leads.filter((l) => l.next_step_date && l.next_step_date < todayIso).length +
    opps.filter((o) => o.next_step_date && o.next_step_date < todayIso).length;
  const openWithoutNextStep =
    leads.filter((l) => l.status === "active" && !l.next_step_date).length + opps.filter((o) => !o.next_step_date).length;
  const remainingToday = visible.filter((i) => !i.overdue && i.kind !== "showing" && i.kind !== "meeting").length;
  const dayClose = dayCloseChecklist({ activitiesToday, openWithoutNextStep, remainingToday, overdue: stepsOverdue });

  const weekday = ubWeekday(now);
  const rhythm = normalizeRhythm(rhythmRaw)[weekday] ?? [];

  const [funnelRep, period, forecastRows, commissionRows, quality, week] = await Promise.all([
    getFunnelReport({ from: conversionFrom, to: todayIso }),
    getPeriodMetrics({ from: monthFrom, to: todayIso }),
    getForecastView(),
    getCommissionSummaryView(),
    (async () => {
      const { data, error } = await supabase
        .from("crm_v_agent_data_quality")
        .select("quality_pct, by_criterion")
        .eq("agent_id", me)
        .maybeSingle();
      if (error) return null;
      return data as { quality_pct: number | null; by_criterion: Record<string, { checked: number; passed: number }> | null } | null;
    })(),
    (async () => {
      try {
        const c = await getAgentWeekCard(me, currentWeekStart(now), now);
        if (c.unavailable) return null;
        return { actuals: c.actuals, targets: c.targets, planStatus: c.plan?.status ?? null };
      } catch (e) {
        console.error("today week:", e instanceof Error ? e.message : e);
        return null;
      }
    })(),
  ]);

  const mine = funnelRep.byAgent.find((g) => g.key === me);
  const conversions = mine ? mine.conversions : funnelRep.byAgent.length === 0 ? funnelRep.conversions : [null, null, null, null];

  const failing = Object.entries(quality?.by_criterion ?? {})
    .filter(([k, v]) => isQualityCriterion(k) && v && Number(v.checked) > Number(v.passed))
    .map(([k, v]) => ({
      label: isQualityCriterion(k) ? QUALITY_CRITERION_LABEL[k].label : k,
      count: Number(v.checked) - Number(v.passed),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const lostMap = new Map<string, number>();
  for (const r of (lostRes.data ?? []) as unknown as { lost_reason: { label: string } | null }[]) {
    const label = r.lost_reason?.label ?? "Шалтгаан бүртгэгдээгүй";
    lostMap.set(label, (lostMap.get(label) ?? 0) + 1);
  }

  const rev = pipelineRevenue(
    opps.map((o) => ({
      stageCode: o.stage?.code ?? "",
      probability: Number(o.stage?.probability ?? 0),
      expectedFee: o.expected_fee_mnt == null ? null : Number(o.expected_fee_mnt),
      terminal: o.stage?.is_terminal ?? false,
    }))
  );
  const forecast = sumForecast(forecastRows.filter((f) => f.owner_id === me));

  return {
    ctx,
    settings,
    todayIso,
    nowIso,
    weekday,
    items: visible,
    snoozedCount: snoozed.length,
    snoozesUsedToday: snoozes.length,
    retryHours: cardSettings.retryHours,
    recontactRanges: cardSettings.recontactRanges,
    funnel: {
      newLeads: leads.filter((l) => l.status === "new").length,
      contacted: leads.filter((l) => l.status === "active").length,
      qualified,
      grades,
    },
    pipeline,
    openOpps: opps.filter((o) => !o.stage?.is_terminal).length,
    revenue: { closed: sumMetric(period.rows.filter((r) => !r.owner_id || r.owner_id === me), "revenue"), ...rev, dealWeighted: forecast.weighted_amount },
    forecast,
    conversions,
    conversionsUnavailable: funnelRep.unavailable,
    quality: {
      pct: quality?.quality_pct == null ? null : Number(quality.quality_pct),
      failing,
      overduePct: pctOf(stepsOverdue, stepsWithDate),
      lostReasons: [...lostMap.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 4),
      fixTasks,
    },
    blocks,
    dayClose,
    dayCloseDue: ubHour(now) >= settings.dayCloseHour,
    rhythm,
    week,
    commission: sumCommissionSummary(commissionRows),
  };
}
