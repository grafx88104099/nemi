import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, Flame, Handshake, Smile } from "lucide-react";

import { KpiTile } from "@/components/crm/CrmDashboard/KpiTile";
import { FunnelChart } from "@/components/crm/CrmDashboard/FunnelChart";
import { ForecastCard } from "@/components/crm/CrmDashboard/ForecastCard";
import { GoldenRuleViolations } from "@/components/crm/CrmDashboard/GoldenRuleViolations";
import { ArrearsAging } from "@/components/crm/CrmDashboard/ArrearsAging";
import { OccupancyCard } from "@/components/crm/CrmDashboard/OccupancyCard";
import { FollowupKpiCard } from "@/components/crm/CrmDashboard/FollowupKpiCard";
import { Funnel10Chart } from "@/components/crm/CrmDashboard/Funnel10Chart";
import { BudgetVsActualCard } from "@/components/crm/CrmDashboard/BudgetVsActualCard";
import { DataQualityCard } from "@/components/crm/CrmDashboard/DataQualityCard";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { shortMNT } from "@/lib/format";
import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getExecDashboard } from "@/lib/queries-crm-reports";
import {
  canEditBudget,
  canSeeExecutive,
  canSeeKpi,
  getExecutiveDashboard,
  getFollowupKpi,
  getFunnelReport,
  getKpiSettings,
  getQualitySummary,
} from "@/lib/queries-crm-kpi";
import { canLeadWeekly, getWeekBoard } from "@/lib/queries-crm-weekly";
import { monthRange, ubTodayIso } from "@/lib/crm/quality";
import { currentWeekStart, weekShortLabel } from "@/lib/crm/week";
import { TeamWeekTable } from "@/components/crm/weekly/TeamWeekTable";

export const metadata = { title: "CRM самбар — Оффис" };

/**
 * Удирдлагын нэгдсэн самбар (§8.4, §8.5). Бүх тоо CRM-ийн бүртгэл ба
 * view-үүдээс — гараар оруулсан дүн харагдахгүй. Даваагийн хурал, Баасан
 * гарагийн дүн шинжилгээ долоо хоногийн мөчлөгийн хуудсанд (/office/crm/week).
 */
export default async function CrmDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  // Хуучин ?view=monday|friday холбоос → долоо хоногийн мөчлөг.
  if (view === "monday") redirect("/office/crm/week?tab=meeting");
  if (view === "friday") redirect("/office/crm/week?tab=friday");

  const ctx = await getCrmStaffContext();
  const roles = ctx?.roles ?? [];
  const leads = canLeadWeekly(roles);

  const tabs = [
    { key: "exec", label: "Нэгдсэн самбар", href: "/office/crm" },
    ...(leads
      ? [
          { key: "monday", label: "Даваагийн хурал", href: "/office/crm/week?tab=meeting" },
          { key: "friday", label: "Баасан гарагийн дүн шинжилгээ", href: "/office/crm/week?tab=friday" },
        ]
      : []),
  ];

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">CRM самбар</h1>
          <p className="text-sm text-muted">Удирдлагын нэгдсэн KPI, юүлүүр, төсөөлөл, долоо хоногийн зорилт ба гүйцэтгэл</p>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                t.key === "exec" ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>
      <ExecView roles={roles} leads={leads} />
    </div>
  );
}

async function ExecView({ roles, leads }: { roles: string[]; leads: boolean }) {
  const today = ubTodayIso();
  const month = monthRange(today);
  const showKpi = canSeeKpi(roles);
  const showExec = canSeeExecutive(roles);
  const week = currentWeekStart();

  const settings = showKpi ? await getKpiSettings() : null;
  const [d, followup, funnel, quality, exec, board] = await Promise.all([
    getExecDashboard(),
    settings ? getFollowupKpi(month, settings.targets) : Promise.resolve(null),
    showKpi ? getFunnelReport(month) : Promise.resolve(null),
    showKpi ? getQualitySummary() : Promise.resolve(null),
    showExec ? getExecutiveDashboard(today) : Promise.resolve(null),
    leads ? getWeekBoard(week) : Promise.resolve(null),
  ]);
  const kpi = d.kpi;
  const slaPct = kpi && kpi.sla_total > 0 ? `${Math.round((100 * kpi.sla_met) / kpi.sla_total)}%` : "—";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Энэ сарын хаалт"
          value={String(kpi?.closed_txn_count ?? 0)}
          sub={`${shortMNT(Number(kpi?.closed_amount_mnt ?? 0))} · давтан ${kpi?.repeat_txn_count ?? 0}`}
          icon={Handshake}
          tone="brand"
        />
        <KpiTile
          label="Баталгаажсан орлого"
          value={shortMNT(Number(kpi?.verified_income_mnt ?? 0))}
          sub={`Тогтмол орлого ${shortMNT(Number(kpi?.recurring_revenue ?? 0))}`}
          icon={Banknote}
          tone="green"
        />
        <KpiTile label="Шинэ сэжим" value={String(kpi?.new_leads ?? 0)} sub={`Эхний холболтын SLA ${slaPct}`} icon={Flame} />
        <KpiTile
          label="NPS"
          value={kpi?.nps_score != null ? String(kpi.nps_score) : "—"}
          sub={`${kpi?.nps_count ?? 0} хариулт · ${kpi?.referral_count ?? 0} реферал`}
          icon={Smile}
          tone={kpi?.nps_score != null && kpi.nps_score >= 50 ? "green" : "neutral"}
        />
      </div>

      {exec && !exec.unavailable ? (
        <BudgetVsActualCard
          rows={[
            { label: "Энэ долоо хоног", actual: exec.revenueWeek, budget: exec.budgetWeek, variance: exec.varianceWeek },
            { label: "Энэ сар", actual: exec.revenueMonth, budget: exec.budgetMonth, variance: exec.varianceMonth },
          ]}
          budgetHref={canEditBudget(roles) ? "/office/crm/settings/budget" : undefined}
        />
      ) : null}

      {board && !board.unavailable ? (
        <Card>
          <CardBody>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">Агентын долоо хоногийн зорилт ба гүйцэтгэл</h2>
              <span className="text-xs text-muted">{weekShortLabel(week)}</span>
              <Link href="/office/crm/week" className="ml-auto text-xs font-medium text-brand-700 hover:underline">
                Долоо хоногийн мөчлөг →
              </Link>
            </div>
            <TeamWeekTable rows={board.rows} detailBase="/office/crm/week" />
          </CardBody>
        </Card>
      ) : null}

      {showKpi && followup && funnel && quality ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <FollowupKpiCard kpis={followup.office} />
          <DataQualityCard pct={quality.pct} rows={quality.rows} threshold={settings?.quality.commission_quality_min_pct} />
          <div className="lg:col-span-2">
            <Funnel10Chart steps={funnel.steps} conversions={funnel.conversions} />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FunnelChart rows={d.funnel} />
        <ForecastCard totals={d.forecast} />
        <GoldenRuleViolations rows={d.violations} />
        <div className="space-y-4">
          <ArrearsAging rows={d.arrears} limit={4} />
          <OccupancyCard rows={d.occupancy} />
        </div>
      </div>

      <p className="text-xs text-subtle">
        Бүх тоо CRM бүртгэлээс автомат — гараар оруулсан дүн самбарт харагдахгүй. Дэлгэрэнгүй:{" "}
        <Link href="/office/crm/reports" className="font-medium text-brand-700 hover:underline">
          Тайлан
        </Link>
        {showKpi ? (
          <>
            {" · "}
            <Link href="/office/crm/quality/kpi" className="font-medium text-brand-700 hover:underline">
              KPI
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}
