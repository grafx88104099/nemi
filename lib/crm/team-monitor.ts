import { ubTime } from "@/lib/crm/calendar";
import { currentWeekStart, ubDateIso } from "@/lib/crm/week";

/**
 * Багийн хяналтын тоололт (Staff — CRM2) — цэвэр логик, цаг бүгд Улаанбаатарын цагаар.
 * Дуудлага, үзүүлэлтийг үйл явдал бүрээр, хэлцлийг нэг удаа тоолно.
 */

export type MonitorPeriods = {
  weekStart: Date;
  monthStart: Date;
  /** Хоёрын эрт нь: долоо хоног өмнөх сараас эхэлж болно. */
  since: Date;
  todayIso: string;
};

export function monitorPeriods(now: Date = new Date()): MonitorPeriods {
  const todayIso = ubDateIso(now);
  const weekStart = ubTime(currentWeekStart(now), 0);
  const monthStart = ubTime(`${todayIso.slice(0, 8)}01`, 0);
  return { weekStart, monthStart, since: weekStart < monthStart ? weekStart : monthStart, todayIso };
}

/** Гишүүн бүрийн (ба баг, оффисын нийт) үзүүлэлт. */
export type MonitorMetrics = {
  /** Идэвхтэй Staff хөрөнгө — гишүүн 3 үүргийн (листлэгч, гэрээ, зураг) аль нэгтэй. */
  staffActive: number;
  /** Ноорог Staff хөрөнгө (3 үүргийн аль нэгтэй). */
  staffDraft: number;
  /** Гишүүний хариуцсан нээлттэй хэлцэл. */
  openDeals: number;
  callsWeek: number;
  callsMonth: number;
  /** Одоо товлогдсон (үр дүн нь оруулаагүй) үзүүлэлт. */
  showingsScheduled: number;
  /** Энэ сард бодит «үзүүлсэн» гэж бүртгэгдсэн үзүүлэлт. */
  showingsShownMonth: number;
  confirmedMonth: number;
  cancelledMonth: number;
  /** Хугацаа хэтэрсэн нээлттэй ажил. */
  overdueTasks: number;
};

const ZERO_METRICS: MonitorMetrics = {
  staffActive: 0,
  staffDraft: 0,
  openDeals: 0,
  callsWeek: 0,
  callsMonth: 0,
  showingsScheduled: 0,
  showingsShownMonth: 0,
  confirmedMonth: 0,
  cancelledMonth: 0,
  overdueTasks: 0,
};

export const MONITOR_METRIC_KEYS = Object.keys(ZERO_METRICS) as (keyof MonitorMetrics)[];

export type MonitorProperty = {
  id: string;
  status: string;
  listing_agent_id: string | null;
  contract_agent_id: string | null;
  photo_agent_id: string | null;
};

export type MonitorDeal = {
  agent_id: string;
  is_open: boolean;
  confirmed_at: string | null;
  cancelled_at: string | null;
};

export type MonitorActivity = {
  agent_id: string;
  kind: string;
  occurred_at: string | null;
  showing_status: string | null;
};

export type MonitorTask = { assignee_id: string; due_at: string | null };

/** Хөрөнгө дээр гишүүн 3 үүргийн аль нэгтэй эсэх. */
export function holdsPropertyRole(p: MonitorProperty, profileId: string): boolean {
  return p.listing_agent_id === profileId || p.contract_agent_id === profileId || p.photo_agent_id === profileId;
}

/** Гишүүний үүрэгтэй хөрөнгийн id (төлөвөөр) — багийн нийтэд давхар тоолохгүйн тулд. */
export type MemberPropertyIds = { active: string[]; draft: string[] };

export function memberPropertyIds(properties: readonly MonitorProperty[], profileId: string): MemberPropertyIds {
  const mine = properties.filter((p) => holdsPropertyRole(p, profileId));
  return {
    active: mine.filter((p) => p.status === "active").map((p) => p.id),
    draft: mine.filter((p) => p.status === "draft").map((p) => p.id),
  };
}

const since = (at: string | null, from: Date) => !!at && Date.parse(at) >= from.getTime();

/** Нэг гишүүний үзүүлэлт: өгсөн мөрүүд бүгд тэр гишүүнийх (хөрөнгөөс бусад нь шүүгдсэн). */
export function countMemberMetrics(input: {
  propertyIds: MemberPropertyIds;
  deals: readonly MonitorDeal[];
  activities: readonly MonitorActivity[];
  tasks: readonly MonitorTask[];
  periods: MonitorPeriods;
  now: Date;
}): MonitorMetrics {
  const { deals, activities, tasks, periods, now } = input;
  const calls = activities.filter((a) => a.kind === "call");
  const showings = activities.filter((a) => a.kind === "showing");
  return {
    staffActive: input.propertyIds.active.length,
    staffDraft: input.propertyIds.draft.length,
    openDeals: deals.filter((d) => d.is_open).length,
    callsWeek: calls.filter((a) => since(a.occurred_at, periods.weekStart)).length,
    callsMonth: calls.filter((a) => since(a.occurred_at, periods.monthStart)).length,
    showingsScheduled: showings.filter((a) => a.showing_status === "scheduled").length,
    showingsShownMonth: showings.filter((a) => a.showing_status === "shown" && since(a.occurred_at, periods.monthStart))
      .length,
    confirmedMonth: deals.filter((d) => since(d.confirmed_at, periods.monthStart)).length,
    cancelledMonth: deals.filter((d) => since(d.cancelled_at, periods.monthStart)).length,
    overdueTasks: tasks.filter((t) => !!t.due_at && Date.parse(t.due_at) < now.getTime()).length,
  };
}

/** Хэлцэл, дуудлага, ажил бүр нэг хариуцагчтай тул гишүүдийн нийлбэр давхар тоолохгүй. */
export function sumMonitorMetrics(rows: readonly MonitorMetrics[]): MonitorMetrics {
  const total = { ...ZERO_METRICS };
  for (const row of rows) for (const key of MONITOR_METRIC_KEYS) total[key] += row[key];
  return total;
}

/**
 * Нийт дүн: нэг хөрөнгө дээр хэд хэдэн гишүүн үүрэгтэй байж болох тул Staff-ийн
 * тоог давхардалгүй id-аар, бусдыг нийлбэрээр.
 */
export function totalMonitorMetrics(
  rows: readonly (MonitorMetrics & { propertyIds?: MemberPropertyIds })[]
): MonitorMetrics {
  const total = sumMonitorMetrics(rows);
  if (rows.every((r) => r.propertyIds)) {
    total.staffActive = new Set(rows.flatMap((r) => r.propertyIds?.active ?? [])).size;
    total.staffDraft = new Set(rows.flatMap((r) => r.propertyIds?.draft ?? [])).size;
  }
  return total;
}

/** Агентын ажил хийдэг ажилтан; удирдлага, санхүүгийн ажилтан агент биш. */
export function isAgentStaff(roles: readonly string[] | null | undefined, userRole: string | null | undefined): boolean {
  return userRole === "agent" || !!roles?.some((r) => r === "agent" || r === "team_lead");
}

/** Бүх багийн явцад орох ажилтан: бүртгэлтэй багийн гишүүн, эсвэл багт ороогүй агент. */
export function inTeamProgressScope(
  staff: { teamId: string | null; roles: readonly string[] | null; userRole: string | null },
  teamIds: ReadonlySet<string>
): boolean {
  return (!!staff.teamId && teamIds.has(staff.teamId)) || isAgentStaff(staff.roles, staff.userRole);
}

export type ProgressGroup<M> = { members: M[]; totals: MonitorMetrics };

/**
 * Гишүүдийг багаар бүлэглэж, баг бүрийн ба оффисын нийт дүнг гаргана. Бүртгэлтэй багт
 * хамаарахгүй гишүүн «хуваарилагдаагүй»-д орно. Багуудын болон гишүүдийн дараалал хадгалагдана.
 */
export function groupTeamProgress<
  T extends { id: string },
  M extends MonitorMetrics & { teamId: string | null; propertyIds?: MemberPropertyIds },
>(
  teams: readonly T[],
  members: readonly M[]
): { teams: (ProgressGroup<M> & { team: T })[]; unassigned: ProgressGroup<M>; totals: MonitorMetrics } {
  const byTeam = new Map<string, M[]>(teams.map((t) => [t.id, []]));
  const unassigned: M[] = [];
  for (const member of members) {
    const list = member.teamId ? byTeam.get(member.teamId) : undefined;
    if (list) list.push(member);
    else unassigned.push(member);
  }
  const group = (list: M[]): ProgressGroup<M> => ({ members: list, totals: totalMonitorMetrics(list) });
  return {
    teams: teams.map((team) => ({ team, ...group(byTeam.get(team.id) ?? []) })),
    unassigned: group(unassigned),
    totals: totalMonitorMetrics(members),
  };
}
