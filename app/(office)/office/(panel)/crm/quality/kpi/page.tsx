import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { canSeeKpi, getKpiDashboard } from "@/lib/queries-crm-kpi";
import { isValidIsoDate, monthRange, rangeLabel, ubTodayIso, weekRange } from "@/lib/crm/quality";
import { QualityNav, RangeFilter, UnavailableNotice } from "@/components/crm/quality/QualityNav";
import { FollowupKpiCard } from "@/components/crm/CrmDashboard/FollowupKpiCard";
import { Funnel10Chart } from "@/components/crm/CrmDashboard/Funnel10Chart";
import {
  AgentFollowupTable,
  BranchTable,
  CampaignTable,
  ClosingSoonList,
  ConversionTable,
  CrossBranchTable,
  LostTrendTable,
  PipelineStageTable,
  ResponseTimeSection,
  SourceRevenueTable,
} from "@/components/crm/quality/KpiTables";
import { PrintButton } from "@/components/crm/quality/PrintButton";

export const metadata = { title: "KPI, хөрвөлт — CRM" };

type SearchParams = Promise<{ from?: string; to?: string }>;

/**
 * Багийн ахлагч, Борлуулалт хариуцсан захирлын хяналтын самбар (§8.1, §8.2,
 * §8.4, R1). Багийн ахлагч RLS-ээр өөрийн багийг, удирдлага оффисыг харна.
 * Маркетинг эх сурвалж, аяны үр ашгийг харна.
 */
export default async function KpiPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  if (!canSeeKpi(ctx.roles)) redirect("/office/crm");
  const sp = await searchParams;
  const today = ubTodayIso();
  const month = monthRange(today);
  const from = isValidIsoDate(sp.from) ? sp.from : month.from;
  const to = isValidIsoDate(sp.to) && sp.to >= from ? sp.to : month.to < today ? month.to : today;
  const range = { from, to };
  const d = await getKpiDashboard(range);
  const marketingOnly = ctx.roles.length > 0 && ctx.roles.every((r) => r === "marketing");

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">KPI, хөрвөлт</h1>
          <p className="mt-1 text-sm text-muted">
            {rangeLabel(range)} · Бүх тоо CRM-ийн бүртгэлээс автоматаар тооцогдоно; гараар оруулсан тоо орохгүй.
          </p>
        </div>
        <PrintButton />
      </div>
      <QualityNav roles={ctx.roles} active="kpi" />
      <div className="mt-4">
        <RangeFilter action="/office/crm/quality/kpi" from={from} to={to} />
      </div>
      {d.unavailable && <UnavailableNotice />}

      <div className="mt-5 space-y-5">
        {!marketingOnly && (
          <>
            <FollowupKpiCard kpis={d.followup.office} />
            <AgentFollowupTable agents={d.followup.agents} />
          </>
        )}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Funnel10Chart steps={d.funnel.steps} conversions={d.funnel.conversions} />
          <ResponseTimeSection report={d.response} />
        </div>
        {!marketingOnly && (
          <>
            <ConversionTable
              title="Агент тус бүрийн хөрвөлт"
              sub="Ур чадварын зөрүү илрүүлэх: сэжмээс хаалт хүртэлх 4 хөрвөлт."
              groups={d.funnel.byAgent}
            />
            <PipelineStageTable report={d.pipeline} />
            <ClosingSoonList rows={d.closingSoon} today={today} weekTo={weekRange(today).to} />
            <LostTrendTable months={d.lost.months} reasons={d.lost.reasons} />
          </>
        )}
        <SourceRevenueTable rows={d.revenueBySource} />
        <CampaignTable
          rows={d.campaigns}
          editHref={ctx.roles.some((r) => r === "marketing" || r === "ops_qc" || r === "sysadmin") ? "/office/crm/settings/budget#campaigns" : undefined}
        />
        {!marketingOnly && (
          <>
            <BranchTable rows={d.branches} />
            <CrossBranchTable rows={d.crossBranch} />
          </>
        )}
      </div>
    </div>
  );
}
