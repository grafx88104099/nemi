import Link from "next/link";
import { CalendarRange } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { weeklyStatusLabel } from "@/lib/constants-crm-weekly";
import { calendarHref } from "@/lib/crm/calendar-view";
import { weekShortLabel } from "@/lib/crm/week";
import { canLeadWeekly, getWeekPlanStatus } from "@/lib/queries-crm-weekly";

/**
 * Календарьт харагдаж буй 7 хоногийн картын төлөв (нэг хүний календарь харж буй үед):
 * агент өөрийн карт руу, ахлагч/удирдлага гишүүний карт руу. Нэг мөр уншина (RLS).
 * Агент биш хүн өөрийгөө, эсвэл картгүй өөр хүнийг харж байвал юу ч харуулахгүй.
 */
export async function WeekPlanStatusLink({
  basePath,
  week,
  agentId,
  viewer,
}: {
  basePath: "/agent/crm" | "/office/crm";
  /** 7 хоногийн Даваа 'YYYY-MM-DD'. */
  week: string;
  agentId: string;
  viewer: { profileId: string; roles: readonly string[] };
}) {
  const isSelf = agentId === viewer.profileId;
  if (isSelf && !viewer.roles.includes("agent")) return null;
  const plan = await getWeekPlanStatus(agentId, week);
  if (!plan && !isSelf) return null;

  const status = plan ? weeklyStatusLabel(plan.status) : { label: "Бөглөөгүй", tone: "amber" as const };
  const href = calendarHref.weekPlan(basePath, {
    week,
    planId: plan?.id ?? null,
    isSelf,
    canLead: canLeadWeekly(viewer.roles),
  });
  const body = (
    <>
      <CalendarRange className="size-4 shrink-0 text-muted" aria-hidden />
      <span className="text-muted">{weekShortLabel(week)} · 7 хоногийн карт</span>
      <Badge tone={status.tone}>{status.label}</Badge>
    </>
  );

  return href ? (
    <Link href={href} className="group inline-flex flex-wrap items-center gap-1.5 text-sm">
      {body}
      <span className="font-medium text-brand-700 group-hover:underline">Нээх →</span>
    </Link>
  ) : (
    <p className="inline-flex flex-wrap items-center gap-1.5 text-sm">{body}</p>
  );
}
