import { leadSlaState } from "@/lib/crm/agent-core";
import { ubTime } from "@/lib/crm/calendar";
import { isOpenLeadStatus } from "@/lib/crm/lead-listing";
import { currentWeekStart, ubDateIso } from "@/lib/crm/week";
import type { CrmLifecycle } from "@/lib/constants-crm";

/** Багийн хяналтын тоололт — цэвэр логик, цаг бүгд Улаанбаатарын цагаар. */

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

export type MonitorOwnedLead = {
  status: CrmLifecycle;
  created_at: string;
  received_at: string | null;
  first_contact_at: string | null;
  first_contact_due_at: string | null;
  next_step: string | null;
  next_step_date: string | null;
};

export type MemberLeadCounts = {
  registeredWeek: number;
  registeredMonth: number;
  openOwned: number;
  newUncontacted: number;
  firstContactOverdue: number;
  nextStepOverdue: number;
  noNextStep: number;
};

export function isNextStepOverdue(
  lead: { status: CrmLifecycle; next_step_date: string | null },
  todayIso: string
): boolean {
  return isOpenLeadStatus(lead.status) && !!lead.next_step_date && lead.next_step_date < todayIso;
}

/** Огноогүй алхам хэзээ ч хэтрэхгүй тул «алхамгүй»-д тооцно. */
export function hasNoNextStep(lead: {
  status: CrmLifecycle;
  next_step: string | null;
  next_step_date: string | null;
}): boolean {
  return isOpenLeadStatus(lead.status) && (!lead.next_step?.trim() || !lead.next_step_date);
}

/** owned: гишүүний эзэмшдэг мөрүүд; registered: гишүүний бүртгэсэн мөрүүд. */
export function countMemberLeads(
  owned: MonitorOwnedLead[],
  registered: { created_at: string }[],
  periods: MonitorPeriods,
  now: Date,
  noContactHours: number
): MemberLeadCounts {
  const open = owned.filter((l) => isOpenLeadStatus(l.status));
  const registeredSince = (from: Date) => registered.filter((l) => Date.parse(l.created_at) >= from.getTime()).length;
  return {
    registeredWeek: registeredSince(periods.weekStart),
    registeredMonth: registeredSince(periods.monthStart),
    openOwned: open.length,
    newUncontacted: open.filter((l) => l.status === "new" && !l.first_contact_at).length,
    firstContactOverdue: open.filter((l) => {
      const { kind } = leadSlaState(l, now, noContactHours);
      return kind === "breached" || kind === "no_contact";
    }).length,
    nextStepOverdue: open.filter((l) => isNextStepOverdue(l, periods.todayIso)).length,
    noNextStep: open.filter(hasNoNextStep).length,
  };
}

/** Багийн хуудас ба бүх багийн тойм ижил үзүүлэлттэй — нийлбэр нь гишүүдийнх. */
export type MonitorMetrics = MemberLeadCounts & { openOpps: number; wonOpps: number };

const ZERO_METRICS: MonitorMetrics = {
  registeredWeek: 0,
  registeredMonth: 0,
  openOwned: 0,
  newUncontacted: 0,
  firstContactOverdue: 0,
  nextStepOverdue: 0,
  noNextStep: 0,
  openOpps: 0,
  wonOpps: 0,
};

export const MONITOR_METRIC_KEYS = Object.keys(ZERO_METRICS) as (keyof MonitorMetrics)[];

export function countMemberOpportunities(opps: { state: string }[]): Pick<MonitorMetrics, "openOpps" | "wonOpps"> {
  return {
    openOpps: opps.filter((o) => o.state === "open").length,
    wonOpps: opps.filter((o) => o.state === "won").length,
  };
}

/** Сэжим бүр нэг эзэмшигч, нэг бүртгэгчтэй тул гишүүдийн нийлбэр давхар тоолохгүй. */
export function sumMonitorMetrics(rows: readonly MonitorMetrics[]): MonitorMetrics {
  const total = { ...ZERO_METRICS };
  for (const row of rows) for (const key of MONITOR_METRIC_KEYS) total[key] += row[key];
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
export function groupTeamProgress<T extends { id: string }, M extends MonitorMetrics & { teamId: string | null }>(
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
  const group = (list: M[]): ProgressGroup<M> => ({ members: list, totals: sumMonitorMetrics(list) });
  return {
    teams: teams.map((team) => ({ team, ...group(byTeam.get(team.id) ?? []) })),
    unassigned: group(unassigned),
    totals: sumMonitorMetrics(members),
  };
}
