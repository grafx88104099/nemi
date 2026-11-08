import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import {
  canRunAudit,
  canSeeQuality,
  getAgentDataQuality,
  getAuditScopeOptions,
  getExportLog,
  getKpiSettings,
  getQualityAudits,
  getQualityFailures,
  getQualitySummary,
} from "@/lib/queries-crm-kpi";
import { addDaysIso, isQualityCriterion, monthRange, prevMonthStart, ubTodayIso } from "@/lib/crm/quality";
import { QualityNav, UnavailableNotice } from "@/components/crm/quality/QualityNav";
import { AuditListShell } from "@/components/crm/quality/AuditListShell";
import { DataQualityPanel } from "@/components/crm/quality/DataQualityPanel";

export const metadata = { title: "CRM-ийн чанарын аудит — Оффис" };

type SearchParams = Promise<{ tab?: string; criterion?: string }>;

/**
 * CRM-ийн чанар (§6.29, RACI: Үйл ажиллагаа-ЧМТ R/A): аудитын жагсаалт ба
 * 12 шалгуурын автомат шалгалт. Багийн ахлагч өөрийн багийн мөрийг харна (RLS).
 */
export default async function QualityPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  if (!canSeeQuality(ctx.roles)) redirect("/office/crm");
  const sp = await searchParams;
  const tab = sp.tab === "data" ? "data" : "audits";
  const settings = await getKpiSettings();
  const today = ubTodayIso();

  if (tab === "data") {
    const criterion = isQualityCriterion(sp.criterion) ? sp.criterion : undefined;
    const [summary, agents, failures, exportLog] = await Promise.all([
      getQualitySummary(),
      getAgentDataQuality(),
      getQualityFailures({ criterion, limit: 200 }),
      getExportLog({ from: addDaysIso(today, -30), to: today }),
    ]);
    return (
      <div className="p-4 sm:p-8">
        <Header />
        <QualityNav roles={ctx.roles} active="data" />
        {summary.unavailable || failures.unavailable ? (
          <UnavailableNotice />
        ) : (
          <DataQualityPanel
            summary={summary}
            agents={agents}
            failures={failures.rows}
            exportLog={exportLog}
            minPct={settings.quality.commission_quality_min_pct}
            activeCriterion={criterion}
          />
        )}
      </div>
    );
  }

  const prev = monthRange(prevMonthStart(today));
  const [audits, scopes] = await Promise.all([getQualityAudits(), getAuditScopeOptions()]);
  return (
    <div className="p-4 sm:p-8">
      <Header />
      <QualityNav roles={ctx.roles} active="audits" />
      {audits.unavailable ? (
        <UnavailableNotice />
      ) : (
        <AuditListShell
          audits={audits.rows}
          canRun={canRunAudit(ctx.roles)}
          scopes={scopes}
          defaultSample={settings.quality.sample_per_criterion}
          defaultFrom={prev.from}
          defaultTo={prev.to}
          passScore={settings.quality.pass_score}
        />
      )}
    </div>
  );
}

function Header() {
  return (
    <>
      <h1 className="text-2xl font-extrabold text-ink">CRM-ийн чанар</h1>
      <p className="mt-1 text-sm text-muted">
        Давхардал, эзэмшигч, эх сурвалж, ангилал, хэрэгцээний профайл, сүүлийн холболт, дараагийн үйлдэл, шат, үзлэг ба
        үнийн саналын тэмдэглэл, алдсан шалтгаан, хэлцлийн оролцогчдын үүрэг, мэдээллийн ашиглалт — 12 шалгуур.
      </p>
    </>
  );
}
