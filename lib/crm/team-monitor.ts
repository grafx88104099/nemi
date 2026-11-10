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
