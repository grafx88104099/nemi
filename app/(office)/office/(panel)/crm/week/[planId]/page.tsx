import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { canLeadWeekly } from "@/lib/queries-crm-weekly";
import { PlanDetailView } from "@/components/crm/weekly/PlanDetailView";

export const metadata = { title: "Агентын долоо хоногийн карт — CRM" };

/** Агентын карт, дүн шинжилгээ, үнэлгээ (оффис). Батлах эрхийг DB шалгана. */
export default async function OfficeWeekPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  if (!canLeadWeekly(ctx.roles)) redirect("/office/crm");
  const { planId } = await params;
  // Агентын холбоос (/agent/crm/week/<огноо>) оффисын панелд → тухайн долоо хоногийн тойм.
  if (/^\d{4}-\d{2}-\d{2}$/.test(planId)) redirect(`/office/crm/week?week=${planId}`);
  return (
    <div className="p-4 sm:p-8">
      <PlanDetailView planId={planId} crmBase="/office/crm" backHref="/office/crm/week" />
    </div>
  );
}
