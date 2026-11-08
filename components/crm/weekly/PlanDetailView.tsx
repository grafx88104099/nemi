import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getCrmStaffContext } from "@/lib/queries-crm-core";
import {
  canApproveAgent,
  getAgentWeekCard,
  getLostReasonsForRange,
  getObstacleOptions,
  getOpenOpportunityOptions,
  getOverdueSteps,
  getPlanById,
  type PlanDetail,
} from "@/lib/queries-crm-weekly";
import { DECISION_KIND_LABEL, weeklyStatusLabel } from "@/lib/constants-crm-weekly";
import { weekConversions } from "@/lib/crm/weekly-score";
import { ubDateIso, weekEnd, weekShortLabel } from "@/lib/crm/week";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { WeeklyPlanForm } from "@/components/crm/weekly/WeeklyPlanForm";
import { WeeklyReviewForm } from "@/components/crm/weekly/WeeklyReviewForm";
import { ApprovalPanel } from "@/components/crm/weekly/ApprovalPanel";
import { ScoreCard } from "@/components/crm/weekly/ScoreCard";
import { MetricTable } from "@/components/crm/weekly/MetricTable";
import { WeekPhaseBadge } from "@/components/crm/weekly/WeekNav";

/**
 * Багийн ахлагч / удирдлагын нэг агентын долоо хоногийн карт, дүн шинжилгээ,
 * үнэлгээ, батлалт (§5 RACI). Засах эрхгүй — зөвхөн батлах/буцаах.
 */
export async function PlanDetailView({ planId, crmBase, backHref }: { planId: string; crmBase: string; backHref: string }) {
  const ctx = await getCrmStaffContext();
  const { plan, unavailable } = await getPlanById(planId);
  if (unavailable || !plan) {
    return (
      <EmptyState
        icon={FileQuestion}
        title={unavailable ? "Долоо хоногийн мөчлөг хараахан идэвхжээгүй" : "Карт олдсонгүй"}
        description={unavailable ? "Өгөгдлийн сангийн шинэчлэл тавигдсаны дараа ажиллана." : "Энэ картыг харах эрхгүй эсвэл устсан байна."}
        action={{ label: "Буцах", href: backHref }}
      />
    );
  }
  const today = ubDateIso();
  const [card, canApprove, opps, obstacles, overdue, lost] = await Promise.all([
    getAgentWeekCard(plan.agent_id, plan.week_start),
    canApproveAgent(plan.agent_id),
    getOpenOpportunityOptions(plan.agent_id),
    getObstacleOptions(),
    getOverdueSteps(plan.week_start, plan.agent_id, crmBase, today),
    getLostReasonsForRange(plan.week_start, weekEnd(plan.week_start), [plan.agent_id]),
  ]);
  const isOwner = ctx?.profileId === plan.agent_id;
  const notes = Object.fromEntries(
    Object.entries(plan.targets).map(([k, v]) => [k, { note: v?.review_note ?? null, nextAction: v?.next_action ?? null }])
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={backHref} className="text-sm font-medium text-brand-700 hover:underline">
          ← Буцах
        </Link>
        <h1 className="text-xl font-bold text-ink">
          {plan.agent_name} · {weekShortLabel(plan.week_start)}
        </h1>
        <WeekPhaseBadge phase={card.phase} />
        {isOwner ? <Badge tone="neutral">Таны карт — өөрөө батлахгүй</Badge> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <WeeklyPlanForm
            plan={plan}
            editable={false}
            agentLine={plan.agent_name}
            oppOptions={opps}
            obstacleOptions={obstacles}
            defaults={card.settings.cycle.defaultTargets}
          />
          {canApprove ? <ApprovalPanel planId={plan.id} kind="plan" status={plan.status} /> : null}
        </div>
        <div className="space-y-4">
          <ScoreCard score={card.score} kind={card.scoreKind} />
          <CommitmentHistory plan={plan} />
        </div>
      </div>

      <Card>
        <CardBody>
          <h2 className="mb-2 text-sm font-semibold text-ink">Зорилт ба гүйцэтгэл</h2>
          <MetricTable actuals={card.actuals} targets={card.targets} notes={notes} filter="all" showNotes />
        </CardBody>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-ink">Баасан гарагийн дүн шинжилгээ</h2>
          <Badge tone={weeklyStatusLabel(plan.review?.status ?? null).tone}>
            {plan.review ? weeklyStatusLabel(plan.review.status).label : "Бөглөөгүй"}
          </Badge>
        </div>
        {plan.review ? (
          <>
            <WeeklyReviewForm
              plan={plan}
              editable={false}
              actuals={card.actuals}
              targets={card.targets}
              moves={card.moves}
              conversions={weekConversions(card.actuals)}
              overdue={overdue}
              lostReasons={lost}
              oppOptions={opps}
            />
            {canApprove ? (
              <ApprovalPanel
                planId={plan.id}
                kind="review"
                status={plan.review.status}
                existingCoaching={{ need: plan.review.coaching_need, at: plan.review.coaching_at }}
              />
            ) : null}
          </>
        ) : (
          <EmptyState compact title="Агент дүн шинжилгээгээ хараахан бөглөөгүй" description="Баасан гарагаас Ням 24:00 хүртэл бөглөнө." />
        )}
      </section>
    </div>
  );
}

export function CommitmentHistory({ plan }: { plan: PlanDetail }) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Амлалт ба хурлын шийдвэр</h3>
        {plan.commitments.length === 0 && plan.decisions.length === 0 ? (
          <p className="text-sm text-muted">Бүртгэл алга.</p>
        ) : null}
        {plan.decisions.length ? (
          <ul className="space-y-1.5 text-sm">
            {plan.decisions.map((d) => (
              <li key={d.id} className="rounded-lg bg-surface-2 px-2.5 py-1.5">
                <Badge tone={d.kind === "commitment" ? "brand" : "neutral"}>{DECISION_KIND_LABEL[d.kind]}</Badge>{" "}
                <span className={d.status === "done" ? "line-through opacity-60" : "text-ink"}>{d.text}</span>
                <span className="block text-xs text-muted">
                  {[d.owner_name, d.due_on ? fmtDate(d.due_on) : null].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {plan.commitments.length ? (
          <details>
            <summary className="cursor-pointer text-xs font-medium text-muted">Амлалтын түүх ({plan.commitments.length})</summary>
            <ul className="mt-2 space-y-1 text-xs">
              {plan.commitments.map((c, i) => (
                <li key={`${c.changed_at}-${i}`} className="text-muted">
                  <span className="text-ink">{c.new_text || "(хоосолсон)"}</span> · {c.source === "meeting" ? "Хурал" : "Карт"} ·{" "}
                  {c.changed_by_name ?? ""} · {fmtDateTime(c.changed_at)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardBody>
    </Card>
  );
}
