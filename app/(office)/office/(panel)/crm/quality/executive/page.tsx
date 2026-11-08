import { redirect } from "next/navigation";
import { Banknote, Gauge, Users } from "lucide-react";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { canSeeExecutive, getExecutiveDashboard, getKpiSettings } from "@/lib/queries-crm-kpi";
import { monthLabel, rangeLabel, ubTodayIso } from "@/lib/crm/quality";
import { shortMNT } from "@/lib/format";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiTile } from "@/components/crm/CrmDashboard/KpiTile";
import { BudgetVsActualCard } from "@/components/crm/CrmDashboard/BudgetVsActualCard";
import { DataQualityCard } from "@/components/crm/CrmDashboard/DataQualityCard";
import { QualityNav, UnavailableNotice } from "@/components/crm/quality/QualityNav";
import { LostTrendTable, PipelineStageTable } from "@/components/crm/quality/KpiTables";
import { ForecastPanel, MgmtReviewPanel } from "@/components/crm/quality/ExecutivePanels";
import { PrintButton } from "@/components/crm/quality/PrintButton";
import { cn } from "@/lib/utils";

export const metadata = { title: "Төсөв, гүйцэтгэл — CRM" };

/**
 * CEO-гийн хяналтын самбар (§8.5) + удирдлагын дүн шинжилгээний гаралт
 * (§9(12)). Орлого = Санхүү баталгаажуулсан зуучлалын орлого (Ш6 — компанийн
 * цэвэр хөлс); төсөөлөл = хүлээгдэж буй хөлс × шатны магадлал.
 */
export default async function ExecutivePage() {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  if (!canSeeExecutive(ctx.roles)) redirect("/office/crm");
  const today = ubTodayIso();
  const [d, settings] = await Promise.all([getExecutiveDashboard(today), getKpiSettings()]);
  const canBudget = ctx.roles.some((r) => r === "ceo" || r === "finance" || r === "sales_director");

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Төсөв, гүйцэтгэл</h1>
          <p className="mt-1 text-sm text-muted">
            {monthLabel(d.month.from)} · долоо хоног {rangeLabel(d.week)} · Бүх тоо CRM-ийн бүртгэлээс.
          </p>
        </div>
        <PrintButton label="Самбар хэвлэх" />
      </div>
      <QualityNav roles={ctx.roles} active="executive" />
      {d.unavailable && <UnavailableNotice />}

      <div className="mt-5 space-y-5">
        <BudgetVsActualCard
          rows={[
            { label: "Энэ долоо хоног", actual: d.revenueWeek, budget: d.budgetWeek, variance: d.varianceWeek },
            { label: "Энэ сар", actual: d.revenueMonth, budget: d.budgetMonth, variance: d.varianceMonth },
          ]}
          budgetHref={canBudget ? "/office/crm/settings/budget" : undefined}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label="Магадлалаар жинлэсэн урсгал"
            value={shortMNT(Math.round(d.pipeline.totals.weighted_mnt))}
            sub={`Жинлэсэн хөлс ${shortMNT(Math.round(d.pipeline.totals.weighted_fee_mnt))} · ${d.pipeline.totals.open_count} боломж`}
            icon={Gauge}
          />
          <KpiTile
            label="Идэвхтэй нэг агентад ногдох орлого"
            value={d.revenuePerAgent == null ? "—" : shortMNT(d.revenuePerAgent)}
            sub={`${d.activeAgents} идэвхтэй агент · энэ сар`}
            icon={Banknote}
          />
          <KpiTile
            label="Хангалттай урсгалтай идэвхтэй агент"
            value={d.sufficient.threshold == null ? "—" : `${d.sufficient.count} / ${d.activeAgents}`}
            sub={
              d.sufficient.threshold == null
                ? "Босго тогтоогоогүй (төсөв эсвэл тохиргоо)"
                : `Жинлэсэн хөлс ≥ ${shortMNT(d.sufficient.threshold)}${d.sufficient.source === "budget" ? " (сарын төсөв ÷ агент)" : ""}`
            }
            icon={Users}
            tone={d.sufficient.threshold != null && d.sufficient.count < d.activeAgents ? "amber" : "neutral"}
          />
          <DataQualityCard
            pct={d.compliancePct}
            rows={d.complianceRows}
            threshold={settings.quality.commission_quality_min_pct}
          />
        </div>

        <ForecastPanel
          snapshots={d.snapshots}
          history={d.forecastHistory}
          canTake={ctx.roles.some((r) => r === "sales_director" || r === "ceo" || r === "sysadmin")}
          canApprove={ctx.roles.includes("sales_director")}
        />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card>
            <CardBody>
              <h2 className="mb-3 text-sm font-semibold text-ink">Сэжимийн эх сурвалж тус бүрийн орлого (энэ сар)</h2>
              {d.revenueBySource.length === 0 ? (
                <EmptyState compact title="Энэ сард баталгаажсан орлого алга" />
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {d.revenueBySource.map((s) => (
                    <li key={s.label} className="flex justify-between gap-3">
                      <span className="text-muted">{s.label}</span>
                      <span className="font-semibold tabular-nums text-ink">{shortMNT(s.revenue)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <h2 className="mb-3 text-sm font-semibold text-ink">Салбаруудын гүйцэтгэл (энэ сар)</h2>
              {d.branches.length === 0 ? (
                <EmptyState compact title="Өгөгдөл алга" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead className="text-left text-xs text-muted">
                      <tr>
                        <th className="py-1.5 pr-3">Салбар</th>
                        <th className="py-1.5 pr-3">Орлого</th>
                        <th className="py-1.5 pr-3">Төсөв</th>
                        <th className="py-1.5 pr-3">Биелэлт</th>
                        <th className="py-1.5">Хаалт</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.branches.map((b) => (
                        <tr key={b.label} className="border-t border-line">
                          <td className="py-1.5 pr-3 text-ink">{b.label}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{shortMNT(b.revenue)}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{b.budget > 0 ? shortMNT(b.budget) : "—"}</td>
                          <td
                            className={cn(
                              "py-1.5 pr-3 tabular-nums",
                              b.variance.status === "warn" ? "text-danger" : "text-ink"
                            )}
                          >
                            {b.variance.pct == null ? "—" : `${b.variance.pct}%`}
                          </td>
                          <td className="py-1.5 tabular-nums">{b.closed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <PipelineStageTable report={d.pipeline} />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <LostTrendTable months={d.lost.months} reasons={d.lost.reasons} />
          <Card>
            <CardBody>
              <h2 className="mb-3 text-sm font-semibold text-ink">Гомдол (энэ сар)</h2>
              {d.complaints.length === 0 ? (
                <EmptyState compact title="Энэ сард гомдол бүртгэгдээгүй" />
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {d.complaints.map((c) => (
                    <li key={c.label} className="flex justify-between gap-3">
                      <span className="text-muted">{c.label}</span>
                      <span className="tabular-nums text-ink">
                        {c.count} · шийдэгдсэн {c.resolved}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardBody>
            <h2 className="mb-3 text-sm font-semibold text-ink">
              Агентын тогтвортой ажиллалт, бүтээмж ({rangeLabel(d.quarter)})
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
              <Stat label="Улирлын эхэнд" value={String(d.retention.atStart)} />
              <Stat label="Шинээр орсон" value={String(d.retention.hired)} />
              <Stat label="Гарсан" value={String(d.retention.left)} />
              <Stat
                label="Тогтвортой үлдсэн"
                value={d.retention.retentionPct == null ? "—" : `${d.retention.retentionPct}%`}
              />
              <Stat
                label="Агентад ногдох улирлын орлого"
                value={d.quarterRevenuePerAgent == null ? "—" : shortMNT(d.quarterRevenuePerAgent)}
              />
            </div>
          </CardBody>
        </Card>

        <MgmtReviewPanel reviews={d.reviews} canWrite={ctx.roles.some((r) => r === "sales_director" || r === "ceo")} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}
