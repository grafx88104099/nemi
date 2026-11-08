import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { canRunAudit, canSeeQuality, getKpiSettings, getQualityAudit } from "@/lib/queries-crm-kpi";
import { AuditDetailShell } from "@/components/crm/quality/AuditDetailShell";

export const metadata = { title: "Чанарын аудит — Оффис" };

export default async function QualityAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  if (!canSeeQuality(ctx.roles)) redirect("/office/crm");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [audit, settings] = await Promise.all([getQualityAudit(id), getKpiSettings()]);
  if (!audit) notFound();
  return (
    <div className="p-4 sm:p-8">
      <AuditDetailShell audit={audit} canRun={canRunAudit(ctx.roles)} passScore={settings.quality.pass_score} />
    </div>
  );
}
