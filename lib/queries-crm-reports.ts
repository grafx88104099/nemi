import { createClient } from "@/lib/supabase/server";
import { getCrmStaffContext, getSettingValue } from "@/lib/queries-crm-core";
import type { Database } from "@/types/database";
import type { CommissionStatus } from "@/lib/constants-crm";
import type { NpsSurveyRow } from "@/components/crm/NpsPanel";
import type { ReferralRow } from "@/components/crm/ReferralPanel";
import type { ComplaintRow } from "@/components/crm/ComplaintShell";
import type { HandoverActRow } from "@/components/crm/HandoverActShell";
import type { HandoverItem } from "@/lib/actions/crm-post-sale";
import { addDays, ubDateIso, weekStartOf } from "@/lib/crm/week";
import { classifyMove } from "@/lib/crm/weekly-score";

/**
 * U9 (crm-reports-uat) — тайлан/самбарын уншилтууд (DESIGN §8).
 * Бүх тоо ЗӨВХӨН 000900-ийн security_invoker view-үүд болон RLS-тэй
 * хүснэгтүүдээс — дуудагчийн эрхээр (агент өөрийн, ахлагч багийн,
 * удирдлага оффисын түвшин, R-19). Гар оруулсан дүн харагдах зам байхгүй.
 */

type Views = Database["public"]["Views"];
export type AgentTodayRow = Views["crm_v_agent_today"]["Row"] & { full_name: string | null };
export type LeadFunnelRow = Views["crm_v_lead_funnel"]["Row"];
export type ForecastViewRow = Views["crm_v_pipeline_forecast"]["Row"];
export type ArrearsRow = Views["crm_v_arrears_aging"]["Row"];
export type OccupancyRow = Views["crm_v_occupancy"]["Row"];
export type MonthlyComplianceRow = Views["crm_v_monthly_compliance"]["Row"];
export type CommissionSummaryRow = Views["crm_v_commission_summary"]["Row"];
export type KpiMonthlyRow = Views["crm_v_kpi_monthly"]["Row"];
export type GoldenRuleRow = Views["crm_v_golden_rule_violations"]["Row"] & {
  contact_name: string | null;
  owner_name: string | null;
};

export type DateRange = { from?: string; to?: string };

// ── Туслахууд ─────────────────────────────────────────────

/** profiles.full_name-ийн map (RLS: ижил оффисын profile уншигдана). */
export async function getNameMap(profileIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  if (error) console.error("getNameMap:", error.message);
  const map = new Map<string, string>();
  for (const p of data ?? []) map.set(p.id, p.full_name ?? "?");
  return map;
}

function monthStart(d = new Date()): string {
  return `${d.toISOString().slice(0, 8)}01`;
}

/** Долоо хоногийн эхлэл — Даваа, Улаанбаатарын огноогоор (§6.19 цонх). */
export function weekStartIso(d = new Date()): string {
  return weekStartOf(ubDateIso(d));
}

// ── R-01: агентын өдрийн товчоо (view) ────────────────────

export async function getAgentToday(): Promise<AgentTodayRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_v_agent_today")
    .select("*")
    .order("weighted_amount", { ascending: false });
  if (error) {
    console.error("getAgentToday:", error.message);
    return [];
  }
  const rows = (data ?? []) as Views["crm_v_agent_today"]["Row"][];
  const names = await getNameMap(rows.map((r) => r.owner_id));
  return rows.map((r) => ({ ...r, full_name: names.get(r.owner_id) ?? null }));
}

// ── Юүлүүр, эх сурвалж (R-06/R-11) ────────────────────────

export async function getLeadFunnel(range: DateRange = {}): Promise<LeadFunnelRow[]> {
  const supabase = await createClient();
  let q = supabase.from("crm_v_lead_funnel").select("*").order("month", { ascending: false });
  if (range.from) q = q.gte("month", range.from);
  if (range.to) q = q.lte("month", range.to);
  const { data, error } = await q;
  if (error) console.error("getLeadFunnel:", error.message);
  return (data ?? []) as LeadFunnelRow[];
}

export type SourceAttributionRow = {
  source_code: string;
  source_label: string;
  leads: number;
  qualified: number;
  won: number;
  won_amount: number;
  sla_met: number;
  sla_total: number;
  /** Кампанит ажлын зардал settings 'marketing_costs'-оос ({source_code: дүн}); байхгүй бол null. */
  cost: number | null;
  cost_per_lead: number | null;
};

/** R-11: эх сурвалж бүрийн сэжим → хөрвөлт → орлого (+нэгж зардал, тохиргоотой үед). */
export async function getSourceAttribution(range: DateRange = {}): Promise<SourceAttributionRow[]> {
  const funnel = await getLeadFunnel(range);
  const costs = (await getSettingValue<Record<string, number>>("marketing_costs")) ?? null;
  const bySource = new Map<string, SourceAttributionRow>();
  for (const f of funnel) {
    const cur =
      bySource.get(f.source_code) ??
      ({
        source_code: f.source_code,
        source_label: f.source_label,
        leads: 0,
        qualified: 0,
        won: 0,
        won_amount: 0,
        sla_met: 0,
        sla_total: 0,
        cost: null,
        cost_per_lead: null,
      } satisfies SourceAttributionRow);
    cur.leads += f.leads_total;
    cur.qualified += f.leads_qualified;
    cur.won += f.leads_won;
    cur.won_amount += Number(f.won_amount);
    cur.sla_met += f.sla_met;
    cur.sla_total += f.sla_total;
    bySource.set(f.source_code, cur);
  }
  const rows = [...bySource.values()];
  for (const r of rows) {
    const c = costs?.[r.source_code];
    if (typeof c === "number" && c > 0) {
      r.cost = c;
      r.cost_per_lead = r.leads > 0 ? Math.round(c / r.leads) : null;
    }
  }
  return rows.sort((a, b) => b.leads - a.leads);
}

// ── Төсөөлөл (R-06) ───────────────────────────────────────

export async function getForecastView(): Promise<ForecastViewRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("crm_v_pipeline_forecast").select("*");
  if (error) console.error("getForecastView:", error.message);
  return (data ?? []) as ForecastViewRow[];
}

export type ForecastTotals = {
  open_count: number;
  total_amount: number;
  weighted_amount: number;
  weighted_30: number;
  weighted_60: number;
  weighted_90: number;
  aml_held_count: number;
  byPipeline: { pipeline_code: string; pipeline_name: string; open_count: number; weighted_amount: number }[];
};

export function sumForecast(rows: ForecastViewRow[]): ForecastTotals {
  const t: ForecastTotals = {
    open_count: 0,
    total_amount: 0,
    weighted_amount: 0,
    weighted_30: 0,
    weighted_60: 0,
    weighted_90: 0,
    aml_held_count: 0,
    byPipeline: [],
  };
  const byPl = new Map<string, { pipeline_code: string; pipeline_name: string; open_count: number; weighted_amount: number }>();
  for (const r of rows) {
    t.open_count += r.open_count;
    t.total_amount += Number(r.total_amount);
    t.weighted_amount += Number(r.weighted_amount);
    t.weighted_30 += Number(r.weighted_30);
    t.weighted_60 += Number(r.weighted_60);
    t.weighted_90 += Number(r.weighted_90);
    t.aml_held_count += r.aml_held_count;
    const cur = byPl.get(r.pipeline_code) ?? {
      pipeline_code: r.pipeline_code,
      pipeline_name: r.pipeline_name,
      open_count: 0,
      weighted_amount: 0,
    };
    cur.open_count += r.open_count;
    cur.weighted_amount += Number(r.weighted_amount);
    byPl.set(r.pipeline_code, cur);
  }
  t.byPipeline = [...byPl.values()].sort((a, b) => a.pipeline_code.localeCompare(b.pipeline_code));
  return t;
}

// ── Түрээс (R-08/R-09), сарын хяналт (R-07/R-10) ──────────

export async function getArrearsAging(): Promise<ArrearsRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_v_arrears_aging")
    .select("*")
    .order("overdue_days", { ascending: false });
  if (error) console.error("getArrearsAging:", error.message);
  return (data ?? []) as ArrearsRow[];
}

export async function getOccupancy(): Promise<OccupancyRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("crm_v_occupancy").select("*");
  if (error) console.error("getOccupancy:", error.message);
  return (data ?? []) as OccupancyRow[];
}

export async function getMonthlyCompliance(limit = 6): Promise<MonthlyComplianceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_v_monthly_compliance")
    .select("*")
    .order("month", { ascending: false })
    .limit(limit);
  if (error) console.error("getMonthlyCompliance:", error.message);
  return (data ?? []) as MonthlyComplianceRow[];
}

export type OwnerStatementReportRow = {
  id: string;
  agreement_number: string | null;
  owner_name: string | null;
  period_start: string;
  period_end: string;
  income: number;
  expenses: number;
  mgmt_fee: number;
  net_payout: number;
  sent_at: string | null;
  acknowledged_at: string | null;
};

/** R-10: өмчлөгчийн тайлангийн мөрүүд (олголтын төлөвтэй). */
export async function getOwnerStatementReport(limit = 50): Promise<OwnerStatementReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_owner_statements")
    .select(
      "id, period_start, period_end, income, expenses, mgmt_fee, net_payout, sent_at, acknowledged_at, " +
        "agreement:crm_management_agreements!crm_owner_statements_agreement_id_fkey(number), " +
        "owner:crm_contacts!crm_owner_statements_owner_contact_id_fkey(display_name)"
    )
    .order("period_start", { ascending: false })
    .limit(limit);
  if (error) console.error("getOwnerStatementReport:", error.message);
  type Raw = Omit<OwnerStatementReportRow, "agreement_number" | "owner_name"> & {
    agreement: { number: string } | null;
    owner: { display_name: string } | null;
  };
  return ((data ?? []) as unknown as Raw[]).map(({ agreement, owner, ...rest }) => ({
    ...rest,
    agreement_number: agreement?.number ?? null,
    owner_name: owner?.display_name ?? null,
  }));
}

// ── Шимтгэл, KPI ──────────────────────────────────────────

export async function getCommissionSummaryView(): Promise<CommissionSummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_v_commission_summary")
    .select("*")
    .order("month", { ascending: false });
  if (error) console.error("getCommissionSummaryView:", error.message);
  return (data ?? []) as CommissionSummaryRow[];
}

export function sumCommissionSummary(
  rows: CommissionSummaryRow[]
): Record<CommissionStatus, { cnt: number; amount: number; paid: number }> {
  const out = {} as Record<CommissionStatus, { cnt: number; amount: number; paid: number }>;
  for (const r of rows) {
    const cur = out[r.status] ?? { cnt: 0, amount: 0, paid: 0 };
    cur.cnt += r.cnt;
    cur.amount += Number(r.total_amount);
    cur.paid += Number(r.total_paid);
    out[r.status] = cur;
  }
  return out;
}

/** R-14: сар бүрийн KPI мөрүүд (сүүлийн `limit` сар). */
export async function getKpiMonthly(limit = 12): Promise<KpiMonthlyRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_v_kpi_monthly")
    .select("*")
    .order("month", { ascending: false })
    .limit(limit);
  if (error) console.error("getKpiMonthly:", error.message);
  return (data ?? []) as KpiMonthlyRow[];
}

/** Тухайн сарын KPI мөр (default: энэ сар). */
export async function getKpiForMonth(month?: string): Promise<KpiMonthlyRow | null> {
  const m = month ?? monthStart();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_v_kpi_monthly")
    .select("*")
    .eq("month", m)
    .maybeSingle();
  if (error) {
    console.error("getKpiForMonth:", error.message);
    return null;
  }
  return (data ?? null) as KpiMonthlyRow | null;
}

// ── Алтан дүрмийн зөрчил (F-125, R-04/R-06) ───────────────

export async function getGoldenRuleRows(limit = 30): Promise<GoldenRuleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_v_golden_rule_violations")
    .select("*")
    .limit(limit);
  if (error) {
    console.error("getGoldenRuleRows:", error.message);
    return [];
  }
  const rows = (data ?? []) as Views["crm_v_golden_rule_violations"]["Row"][];
  const contactIds = rows.map((r) => r.contact_id);
  const ownerIds = rows.map((r) => r.owner_id).filter((x): x is string => !!x);
  const [contactsRes, names] = await Promise.all([
    contactIds.length
      ? supabase.from("crm_contacts").select("id, display_name").in("id", contactIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[], error: null }),
    getNameMap(ownerIds),
  ]);
  const cmap = new Map<string, string>();
  for (const c of contactsRes.data ?? []) cmap.set(c.id, c.display_name);
  return rows.map((r) => ({
    ...r,
    contact_name: cmap.get(r.contact_id) ?? null,
    owner_name: r.owner_id ? (names.get(r.owner_id) ?? null) : null,
  }));
}

// ── Долоо хоногийн нэгтгэлүүд (§6.19, §6.24) ──────────────
// U7: тоог DB-ийн crm_agent_week_metrics / crm_agent_week_moves функцээс
// (Даваа–Ням, УБ, зөвхөн борлуулалтын урсгал, мөрийн хязгааргүй) авна.

export type WeeklyAgentActivity = {
  owner_id: string;
  full_name: string | null;
  /** Гадагш чиглэсэн холболт (§6.19.1). */
  calls: number;
  /** Өмчлөгч + худалдан авагчтай хийсэн уулзалт. */
  meetings: number;
  showings: number;
  /** Утга бүхий ярилцлага (§6.19.2). */
  material: number;
};

/** Тайлант 7 хоногийн үйл ажиллагаа — агент бүрээр (УБ цагаар). */
export async function getWeeklyActivityByAgent(weekStart: string): Promise<WeeklyAgentActivity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_agent_week_metrics", {
    p_week: weekStartOf(weekStart),
    p_office: null,
    p_agent: null,
  });
  if (error) {
    console.error("getWeeklyActivityByAgent:", error.message);
    return [];
  }
  const by = new Map<string, WeeklyAgentActivity>();
  for (const r of (data ?? []) as { agent_id: string; metric_code: string; actual: number | string | null }[]) {
    const cur =
      by.get(r.agent_id) ??
      ({ owner_id: r.agent_id, full_name: null, calls: 0, meetings: 0, showings: 0, material: 0 } satisfies WeeklyAgentActivity);
    const v = Number(r.actual ?? 0);
    if (r.metric_code === "outbound_contacts") cur.calls = v;
    if (r.metric_code === "owner_meetings" || r.metric_code === "buyer_meetings") cur.meetings += v;
    if (r.metric_code === "showings") cur.showings = v;
    if (r.metric_code === "meaningful_conversations") cur.material = v;
    by.set(r.agent_id, cur);
  }
  const rows = [...by.values()];
  const names = await getNameMap(rows.map((r) => r.owner_id));
  for (const r of rows) r.full_name = names.get(r.owner_id) ?? null;
  return rows.sort((a, b) => b.material - a.material);
}

export type WeeklyStageMove = {
  owner_id: string;
  advanced: number;
  backward: number;
  won: number;
  lost: number;
  none: number;
};

/**
 * Тайлант 7 хоногийн урсгалын хөдөлгөөн (§6.24): боломж бүрийн долоо хоногийн
 * эхний → сүүлийн шат. Амжилтгүй хаалт «ахисан» биш (lost тусдаа).
 */
export async function getWeeklyStageMoves(weekStart: string): Promise<WeeklyStageMove[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_agent_week_moves", {
    p_week: weekStartOf(weekStart),
    p_office: null,
    p_agent: null,
  });
  if (error) {
    console.error("getWeeklyStageMoves:", error.message);
    return [];
  }
  const by = new Map<string, WeeklyStageMove>();
  for (const m of (data ?? []) as { agent_id: string; from_sort: number | null; to_sort: number | null; to_terminal: string | null }[]) {
    const cur = by.get(m.agent_id) ?? ({ owner_id: m.agent_id, advanced: 0, backward: 0, won: 0, lost: 0, none: 0 } satisfies WeeklyStageMove);
    const kind = classifyMove({
      fromSort: m.from_sort,
      toSort: m.to_sort,
      toTerminal: m.to_terminal === "won" || m.to_terminal === "lost" ? m.to_terminal : null,
    });
    cur[kind] += 1;
    by.set(m.agent_id, cur);
  }
  return [...by.values()];
}

export type LostReasonRow = { label: string; cnt: number };

/** Алдсан шалтгааны бүтэц — амжилтгүй хаагдсан огноогоор (сүүлийн 90 хоног, УБ). */
export async function getLostReasons(): Promise<LostReasonRow[]> {
  const supabase = await createClient();
  const to = ubDateIso();
  const from = addDays(to, -90);
  const { data, error } = await supabase.rpc("crm_kpi_period_metrics", { p_from: from, p_to: to });
  if (error) {
    console.error("getLostReasons:", error.message);
    return [];
  }
  const by = new Map<string, number>();
  for (const r of (data ?? []) as { metric: string; dim_label: string | null; cnt: number }[]) {
    if (r.metric !== "lost") continue;
    const label = r.dim_label ?? "Бүртгэгдээгүй";
    by.set(label, (by.get(label) ?? 0) + Number(r.cnt));
  }
  return [...by.entries()].map(([label, cnt]) => ({ label, cnt })).sort((a, b) => b.cnt - a.cnt);
}

// ── §6.25 агентын 100 оноот үнэлгээ ───────────────────────
// Тооцоолол lib/crm/weekly-score.ts (computeWeeklyScore) ба
// lib/queries-crm-weekly.ts (getWeekBoard) — зорилт агентын картаас, гүйцэтгэл
// DB-ээс, зөвхөн идэвхтэй борлуулагч агент; хуучин «урсгал = ахилт» алдаа
// (алдсан хэлцэл оноо өгдөг байсан) засагдсан.

// ── R-12: салбар хоорондын KPI ────────────────────────────

export type BranchKpiRow = {
  branch_id: string | null;
  branch_name: string;
  open_opps: number;
  weighted_amount: number;
  managed_count: number;
  occupancy_pct: number | null;
  cross_branch_tasks: number;
};

/** R-12: салбарын харьцуулалт + Д-30 хамтын ажиллагааны даалгаврын тоо. */
export async function getBranchKpi(): Promise<BranchKpiRow[]> {
  const supabase = await createClient();
  const [forecast, occupancy, branchesRes, d30Res] = await Promise.all([
    getForecastView(),
    getOccupancy(),
    supabase.from("crm_branches").select("id, name"),
    supabase
      .from("crm_rule_runs")
      .select("id", { count: "exact", head: true })
      .eq("rule_code", "D-30"),
  ]);
  const branches = (branchesRes.data ?? []) as { id: string; name: string }[];
  const byBranch = new Map<string | null, BranchKpiRow>();
  const rowFor = (id: string | null): BranchKpiRow => {
    const cur = byBranch.get(id);
    if (cur) return cur;
    const created: BranchKpiRow = {
      branch_id: id,
      branch_name: branches.find((b) => b.id === id)?.name ?? "Салбаргүй",
      open_opps: 0,
      weighted_amount: 0,
      managed_count: 0,
      occupancy_pct: null,
      cross_branch_tasks: 0,
    };
    byBranch.set(id, created);
    return created;
  };
  for (const f of forecast) {
    const r = rowFor(f.branch_id);
    r.open_opps += f.open_count;
    r.weighted_amount += Number(f.weighted_amount);
  }
  for (const o of occupancy) {
    const r = rowFor(o.branch_id);
    r.managed_count += o.managed_count;
    r.occupancy_pct = o.occupancy_pct;
  }
  const rows = [...byBranch.values()];
  if (rows.length) rows[0].cross_branch_tasks = d30Res.count ?? 0;
  return rows.sort((a, b) => b.weighted_amount - a.weighted_amount);
}

// ── getDashboard(scope) — DESIGN §6.1 нэгдсэн орц ─────────
// Даваа/Баасан гарагийн хурлын өгөгдөл U7-ээс: lib/queries-crm-weekly.ts
// (getWeekBoard, getMeetingAgenda) — энд давхардуулахгүй.

export type ExecDashboard = {
  kpi: KpiMonthlyRow | null;
  funnel: LeadFunnelRow[];
  forecast: ForecastTotals;
  violations: GoldenRuleRow[];
  arrears: ArrearsRow[];
  occupancy: OccupancyRow[];
};

export async function getExecDashboard(): Promise<ExecDashboard> {
  const threeMonthsAgo = monthStart(new Date(Date.now() - 90 * 86400000));
  const [kpi, funnel, forecastRows, violations, arrears, occupancy] = await Promise.all([
    getKpiForMonth(),
    getLeadFunnel({ from: threeMonthsAgo }),
    getForecastView(),
    getGoldenRuleRows(10),
    getArrearsAging(),
    getOccupancy(),
  ]);
  return { kpi, funnel, forecast: sumForecast(forecastRows), violations, arrears, occupancy };
}

export type DashboardScope = "exec" | "agent" | "pm";

/** DESIGN §6.1-ийн нэг орц: scope-оор тохирох нэгтгэлийг буцаана. */
export async function getDashboard(scope: DashboardScope) {
  switch (scope) {
    case "exec":
      return { scope, data: await getExecDashboard() } as const;
    case "pm": {

      const [arrears, occupancy, compliance] = await Promise.all([
        getArrearsAging(),
        getOccupancy(),
        getMonthlyCompliance(),
      ]);
      return { scope, data: { arrears, occupancy, compliance } } as const;
    }
    case "agent": {
      const ctx = await getCrmStaffContext();
      const [today, forecastRows, commission] = await Promise.all([
        getAgentToday(),
        getForecastView(),
        getCommissionSummaryView(),
      ]);
      const own = ctx ? (today.find((t) => t.owner_id === ctx.profileId) ?? null) : null;
      return {
        scope,
        data: { today: own, forecast: sumForecast(forecastRows), commission: sumCommissionSummary(commission) },
      } as const;
    }
  }
}

// ── U8 post-sale уншилтууд (нэгтгэлийн шат) ───────────────
// NpsPanel / ReferralPanel / ComplaintShell / HandoverActShell компонентуудын
// mount цэгүүд (харилцагчийн 360° карт, тайлан, тохиргоо/ажилтан) эндээс уншина.
// Бүгд RLS-ээр — contact-эрхийн хүрээнд л мөр буцаана.

export async function getNpsSurveys(
  filter: { contactId?: string; transactionId?: string; limit?: number } = {}
): Promise<NpsSurveyRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("crm_nps_surveys")
    .select("id, transaction_id, contact_id, sent_at, score, comment, answered_at")
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 100);
  if (filter.contactId) query = query.eq("contact_id", filter.contactId);
  if (filter.transactionId) query = query.eq("transaction_id", filter.transactionId);
  const { data, error } = await query;
  if (error) {
    console.error("getNpsSurveys:", error.message);
    return [];
  }
  const rows = data ?? [];
  if (!rows.length) return [];
  const [contacts, txns] = await Promise.all([
    supabase
      .from("crm_contacts")
      .select("id, display_name")
      .in("id", [...new Set(rows.map((r) => r.contact_id))]),
    supabase
      .from("crm_transactions")
      .select("id, number")
      .in("id", [...new Set(rows.map((r) => r.transaction_id))]),
  ]);
  const cname = new Map((contacts.data ?? []).map((c) => [c.id, c.display_name]));
  const tnum = new Map((txns.data ?? []).map((t) => [t.id, t.number]));
  return rows.map((r) => ({
    ...r,
    contact_name: cname.get(r.contact_id) ?? null,
    txn_number: tnum.get(r.transaction_id) ?? null,
  }));
}

export async function getReferrals(
  filter: { referrerContactId?: string; limit?: number } = {}
): Promise<ReferralRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("crm_referrals")
    .select("id, referrer_contact_id, lead_id, created_at")
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 100);
  if (filter.referrerContactId) query = query.eq("referrer_contact_id", filter.referrerContactId);
  const { data, error } = await query;
  if (error) {
    console.error("getReferrals:", error.message);
    return [];
  }
  const rows = data ?? [];
  if (!rows.length) return [];
  const { data: leads } = await supabase
    .from("crm_leads")
    .select("id, contact_id, status")
    .in("id", [...new Set(rows.map((r) => r.lead_id))]);
  const leadById = new Map((leads ?? []).map((l) => [l.id, l]));
  const contactIds = [
    ...new Set([
      ...rows.map((r) => r.referrer_contact_id),
      ...(leads ?? []).map((l) => l.contact_id),
    ]),
  ];
  const { data: contacts } = await supabase
    .from("crm_contacts")
    .select("id, display_name")
    .in("id", contactIds);
  const cname = new Map((contacts ?? []).map((c) => [c.id, c.display_name]));
  return rows.map((r) => {
    const lead = leadById.get(r.lead_id) ?? null;
    return {
      id: r.id,
      referrer_contact_id: r.referrer_contact_id,
      referrer_name: cname.get(r.referrer_contact_id) ?? null,
      lead_id: r.lead_id,
      lead_contact_name: lead ? (cname.get(lead.contact_id) ?? null) : null,
      lead_status: lead?.status ?? null,
      created_at: r.created_at,
    };
  });
}

export async function getComplaints(
  filter: { contactId?: string; status?: "open" | "in_progress" | "resolved"; limit?: number } = {}
): Promise<ComplaintRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("crm_complaints")
    .select(
      "id, contact_id, transaction_id, source, severity, description, status, resolution, resolved_at, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 200);
  if (filter.contactId) query = query.eq("contact_id", filter.contactId);
  if (filter.status) query = query.eq("status", filter.status);
  const { data, error } = await query;
  if (error) {
    console.error("getComplaints:", error.message);
    return [];
  }
  const rows = data ?? [];
  if (!rows.length) return [];
  const txnIds = [...new Set(rows.map((r) => r.transaction_id).filter((x): x is string => !!x))];
  const [contacts, txns] = await Promise.all([
    supabase
      .from("crm_contacts")
      .select("id, display_name")
      .in("id", [...new Set(rows.map((r) => r.contact_id))]),
    txnIds.length
      ? supabase.from("crm_transactions").select("id, number").in("id", txnIds)
      : Promise.resolve({ data: [] as { id: string; number: string }[] }),
  ]);
  const cname = new Map((contacts.data ?? []).map((c) => [c.id, c.display_name]));
  const tnum = new Map((txns.data ?? []).map((t) => [t.id, t.number]));
  return rows.map((r) => ({
    ...r,
    source: r.source as ComplaintRow["source"],
    severity: r.severity as ComplaintRow["severity"],
    status: r.status as ComplaintRow["status"],
    contact_name: cname.get(r.contact_id) ?? null,
    txn_number: r.transaction_id ? (tnum.get(r.transaction_id) ?? null) : null,
  }));
}

/** Гар гомдлын маягтын харилцагчийн сонголт (сүүлд бүртгэгдсэн эхэндээ). */
export async function getComplaintContactOptions(limit = 200): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_contacts")
    .select("id, display_name")
    .is("merged_into_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) console.error("getComplaintContactOptions:", error.message);
  return (data ?? []).map((c) => ({ id: c.id, name: c.display_name }));
}

export async function getHandoverActs(limit = 50): Promise<HandoverActRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_handover_acts")
    .select("id, staff_id, items, approved_by, approved_at, clients_notified, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getHandoverActs:", error.message);
    return [];
  }
  const rows = data ?? [];
  if (!rows.length) return [];
  const { data: staff } = await supabase
    .from("crm_staff")
    .select("id, profile_id")
    .in("id", [...new Set(rows.map((r) => r.staff_id))]);
  const staffProfile = new Map((staff ?? []).map((s) => [s.id, s.profile_id]));
  const names = await getNameMap([
    ...(staff ?? []).map((s) => s.profile_id),
    ...rows.map((r) => r.approved_by).filter((x): x is string => !!x),
  ]);
  return rows.map((r) => ({
    id: r.id,
    staff_id: r.staff_id,
    staff_name: names.get(staffProfile.get(r.staff_id) ?? "") ?? null,
    items: (r.items ?? []) as unknown as HandoverItem[],
    approved_by: r.approved_by,
    approver_name: r.approved_by ? (names.get(r.approved_by) ?? null) : null,
    approved_at: r.approved_at,
    clients_notified: r.clients_notified,
    created_at: r.created_at,
  }));
}
