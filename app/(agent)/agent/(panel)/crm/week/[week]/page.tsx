import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarRange, Users } from "lucide-react";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import {
  canLeadWeekly,
  getAgentWeekCard,
  getObstacleOptions,
  getOpenOpportunityOptions,
  getWeekActuals,
} from "@/lib/queries-crm-weekly";
import { addWeeks, currentWeekStart, finalLockAt, meetingAt, normalizeWeekParam, slotLabel, weekPhase } from "@/lib/crm/week";
import { fmtDateTime } from "@/lib/format";
import { CrmNav } from "@/components/crm/CrmNav";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { WeekNav } from "@/components/crm/weekly/WeekNav";
import { WeeklyPlanForm } from "@/components/crm/weekly/WeeklyPlanForm";
import { ScoreCard } from "@/components/crm/weekly/ScoreCard";
import { MetricTable } from "@/components/crm/weekly/MetricTable";
import { CreatePlanButton } from "@/components/crm/weekly/CreatePlanButton";
import { CommitmentHistory } from "@/components/crm/weekly/PlanDetailView";
import { WeekTabs } from "@/components/crm/weekly/WeekTabs";

export const metadata = { title: "Долоо хоногийн төлөвлөгөө — CRM" };

const BASE = "/agent/crm";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Агентын долоо хоногийн төлөвлөгөөний карт (§6.19, §6.21): Даваагийн хурлаас
 * өмнө бөглөж, багийн ахлагчаар батлуулна. Гүйцэтгэл CRM-ээс автоматаар.
 */
export default async function AgentWeekPage({ params }: { params: Promise<{ week: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");
  const { week: raw } = await params;
  // Мэдэгдлийн холбоос /agent/crm/week/<картын id> → багийн ахлагчийн хяналтын хуудас.
  if (UUID_RE.test(raw)) redirect(`${BASE}/team/${raw}`);
  const week = normalizeWeekParam(raw);
  if (week !== raw) redirect(`${BASE}/week/${week}`);

  const header = (
    <div className="mb-4 border-b border-line">
      <CrmNav roles={ctx.roles} basePath={BASE} />
    </div>
  );

  if (!ctx.roles.includes("agent")) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        {header}
        <EmptyState
          icon={Users}
          title="Долоо хоногийн картыг борлуулагч агент бөглөнө"
          description="Та багийнхаа карт, хурал, дүн шинжилгээг «Миний баг» хэсгээс удирдана."
          action={canLeadWeekly(ctx.roles) ? { label: "Миний баг", href: `${BASE}/team` } : undefined}
        />
      </div>
    );
  }

  const card = await getAgentWeekCard(ctx.profileId, week);
  const s = card.settings.cycle.schedule;
  const prevWeek = addWeeks(week, -1);
  const [opps, obstacles, prev] = await Promise.all([
    getOpenOpportunityOptions(ctx.profileId),
    getObstacleOptions(),
    card.plan ? getWeekActuals(prevWeek, ctx.profileId, weekPhase(prevWeek, new Date(), s)) : Promise.resolve(null),
  ]);
  const editable = !!card.plan && ["draft", "returned"].includes(card.plan.status) && !card.phase.finalLocked;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {header}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Долоо хоногийн төлөвлөгөө</h1>
          <p className="text-sm text-muted">
            Хурал: {slotLabel(s.meeting)} ({fmtDateTime(meetingAt(week, s).toISOString())}) · Эцсийн дүн түгжигдэх:{" "}
            {fmtDateTime(finalLockAt(week, s).toISOString())}
          </p>
        </div>
        <WeekNav
          week={week}
          phase={card.phase}
          prevHref={`${BASE}/week/${prevWeek}`}
          nextHref={`${BASE}/week/${addWeeks(week, 1)}`}
          currentHref={`${BASE}/week/${currentWeekStart()}`}
        />
      </div>
      <WeekTabs week={week} active="plan" base={`${BASE}/week`} />

      {card.unavailable ? (
        <EmptyState
          title="Долоо хоногийн мөчлөг хараахан идэвхжээгүй"
          description="Өгөгдлийн сангийн шинэчлэл тавигдсаны дараа энэ хэсэг ажиллана. Системийн админд хандана уу."
        />
      ) : !card.plan ? (
        <div className="space-y-4">
          <EmptyState
            icon={CalendarRange}
            title="Энэ долоо хоногийн карт бөглөгдөөгүй"
            description={
              card.canCreate
                ? "Карт үүсгэхэд өмнөх долоо хоногийн гүйцэтгэл, зорилт, Баасан гарагт сонгосон шилжих боломжууд урьдчилан бөглөгдөнө."
                : "Энэ долоо хоног түгжигдсэн тул шинээр карт үүсгэхгүй."
            }
          >
            {card.canCreate ? <CreatePlanButton week={week} /> : null}
          </EmptyState>
          <Card>
            <CardBody>
              <h2 className="mb-2 text-sm font-semibold text-ink">Энэ долоо хоногийн явц</h2>
              <MetricTable actuals={card.actuals} targets={card.targets} filter="all" />
            </CardBody>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-4">
            <WeeklyPlanForm
              plan={card.plan}
              editable={editable}
              agentLine={[card.plan.agent_name].join(" ")}
              oppOptions={opps}
              obstacleOptions={obstacles}
              defaults={card.settings.cycle.defaultTargets}
              prevActuals={prev?.byAgent.get(ctx.profileId) ?? null}
            />
            <Card>
              <CardBody>
                <h2 className="mb-2 text-sm font-semibold text-ink">Энэ долоо хоногийн явц</h2>
                <MetricTable actuals={card.actuals} targets={card.targets} filter="all" />
              </CardBody>
            </Card>
          </div>
          <div className="space-y-4">
            <ScoreCard score={card.score} kind={card.scoreKind} />
            <CommitmentHistory plan={card.plan} />
            <Link href={`${BASE}/week/${week}/review`} className="block text-sm font-medium text-brand-700 hover:underline">
              Баасан гарагийн дүн шинжилгээ →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
