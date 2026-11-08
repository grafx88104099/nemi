import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import {
  getAgentWeekCard,
  getLostReasonsForRange,
  getOpenOpportunityOptions,
  getOverdueSteps,
} from "@/lib/queries-crm-weekly";
import { weekConversions } from "@/lib/crm/weekly-score";
import {
  addWeeks,
  currentWeekStart,
  finalLockAt,
  normalizeWeekParam,
  reviewAt,
  slotLabel,
  ubDateIso,
  weekEnd,
} from "@/lib/crm/week";
import { fmtDateTime } from "@/lib/format";
import { CrmNav } from "@/components/crm/CrmNav";
import { EmptyState } from "@/components/ui/empty-state";
import { WeekNav } from "@/components/crm/weekly/WeekNav";
import { WeekTabs } from "@/components/crm/weekly/WeekTabs";
import { WeeklyReviewForm } from "@/components/crm/weekly/WeeklyReviewForm";
import { ScoreCard } from "@/components/crm/weekly/ScoreCard";
import { CreatePlanButton } from "@/components/crm/weekly/CreatePlanButton";

export const metadata = { title: "Баасан гарагийн дүн шинжилгээ — CRM" };

const BASE = "/agent/crm";

/**
 * §6.24 Баасан гараг — долоо хоногийн төгсгөлийн дүн шинжилгээ ба «Миний
 * үнэлгээ» (§6.25). Ням 24:00-д эцсийн дүн түгжигдэнэ (Ш8); илгээсэн дүн
 * шинжилгээний «шилжих 3 боломж» дараагийн Даваагийн картыг эхлүүлнэ.
 */
export default async function AgentWeekReviewPage({ params }: { params: Promise<{ week: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");
  const { week: raw } = await params;
  const week = normalizeWeekParam(raw);
  if (week !== raw) redirect(`${BASE}/week/${week}/review`);

  const card = await getAgentWeekCard(ctx.profileId, week);
  const s = card.settings.cycle.schedule;
  const today = ubDateIso();
  const [opps, overdue, lost] = await Promise.all([
    getOpenOpportunityOptions(ctx.profileId),
    getOverdueSteps(week, ctx.profileId, BASE, today),
    getLostReasonsForRange(week, weekEnd(week), [ctx.profileId]),
  ]);
  const started = !card.phase.isFuture;
  const reviewStatus = card.plan?.review?.status ?? "draft";
  const editable = !!card.plan && started && !card.phase.finalLocked && ["draft", "returned"].includes(reviewStatus);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath={BASE} />
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Баасан гарагийн дүн шинжилгээ</h1>
          <p className="text-sm text-muted">
            Урьдчилсан дүн: {slotLabel(s.review)} ({fmtDateTime(reviewAt(week, s).toISOString())}) · Эцсийн түгжээ:{" "}
            {fmtDateTime(finalLockAt(week, s).toISOString())}
          </p>
        </div>
        <WeekNav
          week={week}
          phase={card.phase}
          prevHref={`${BASE}/week/${addWeeks(week, -1)}/review`}
          nextHref={`${BASE}/week/${addWeeks(week, 1)}/review`}
          currentHref={`${BASE}/week/${currentWeekStart()}/review`}
        />
      </div>
      <WeekTabs week={week} active="review" base={`${BASE}/week`} />

      {card.unavailable ? (
        <EmptyState
          title="Долоо хоногийн мөчлөг хараахан идэвхжээгүй"
          description="Өгөгдлийн сангийн шинэчлэл тавигдсаны дараа энэ хэсэг ажиллана. Системийн админд хандана уу."
        />
      ) : !card.plan ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Энэ долоо хоногийн карт алга"
          description="Дүн шинжилгээ картын зорилттой харьцуулагдана — эхлээд картаа үүсгэнэ үү."
        >
          {card.canCreate && ctx.roles.includes("agent") ? <CreatePlanButton week={week} /> : null}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]">
          <WeeklyReviewForm
            plan={card.plan}
            editable={editable}
            actuals={card.actuals}
            targets={card.targets}
            moves={card.moves}
            conversions={weekConversions(card.actuals)}
            overdue={overdue}
            lostReasons={lost}
            oppOptions={opps}
          />
          <div className="space-y-4">
            <ScoreCard score={card.score} kind={card.scoreKind} title="Миний үнэлгээ" />
            {!started ? (
              <p className="text-sm text-muted">Долоо хоног эхэлсний дараа дүн шинжилгээ бөглөнө.</p>
            ) : card.phase.finalLocked && reviewStatus === "draft" ? (
              <p className="text-sm text-rose-700">Долоо хоног түгжигдсэн — дүн шинжилгээг хугацаандаа илгээгээгүй.</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
