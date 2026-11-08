import { redirect } from "next/navigation";

import { getCrmStaffContext, getSettingValue } from "@/lib/queries-crm-core";
import { canEditBudget, getBudgets, getKpiSettings } from "@/lib/queries-crm-kpi";
import { createClient } from "@/lib/supabase/server";
import { ubTodayIso } from "@/lib/crm/quality";
import { QualityNav, UnavailableNotice } from "@/components/crm/quality/QualityNav";
import {
  BudgetEditor,
  CostsEditor,
  KpiTargetsEditor,
  QualitySettingsEditor,
} from "@/components/crm/quality/BudgetEditor";

export const metadata = { title: "Төсөв, KPI-ийн жишиг — CRM тохиргоо" };

type SearchParams = Promise<{ year?: string }>;

function costMap(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).filter(([, n]) => typeof n === "number" && Number.isFinite(n)) as [string, number][]
  );
}

/**
 * Төсөв (§8.5(1)), KPI-ийн жишиг (§8.1), чанарын аудитын тохиргоо (§6.29,
 * §6.31), маркетингийн зардал (§5). Дүр бүр зөвхөн өөрийн хэсгийг засна;
 * бусад нь уншигдана.
 */
export default async function BudgetSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  const roles = ctx.roles;
  const canView =
    canEditBudget(roles) || roles.some((r) => r === "ops_qc" || r === "marketing" || r === "sysadmin" || r === "ceo");
  if (!canView) redirect("/office/crm");
  const sp = await searchParams;
  const nowYear = Number(ubTodayIso().slice(0, 4));
  const yearNum = Number(sp.year);
  const year = Number.isInteger(yearNum) && yearNum >= 2020 && yearNum <= 2100 ? yearNum : nowYear;

  const supabase = await createClient();
  const [budgets, settings, branchesRes, sourcesRes, campaignCosts, marketingCosts] = await Promise.all([
    getBudgets(`${year}-01-01`, `${year}-12-01`),
    getKpiSettings(),
    supabase.from("crm_branches").select("id, name").eq("is_active", true).order("name"),
    supabase.from("crm_lookups").select("code, label").eq("kind", "lead_source").eq("is_active", true).order("sort_order"),
    getSettingValue("campaign_costs"),
    getSettingValue("marketing_costs"),
  ]);
  const isMarketing = roles.includes("marketing");
  const isOps = roles.includes("ops_qc") || roles.includes("sysadmin");
  const seeBudget = canEditBudget(roles) || roles.includes("ops_qc") || roles.includes("sysadmin") || roles.includes("ceo");

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Төсөв, KPI-ийн жишиг</h1>
      <p className="mt-1 text-sm text-muted">
        Өөрчлөлт бүр шинэ хувилбараар хадгалагдаж, зөвхөн урагш үйлчилнэ. Өмнөх тооцоо өөрчлөгдөхгүй.
      </p>
      <QualityNav roles={roles} active="settings" />
      {budgets.unavailable && <UnavailableNotice />}
      <div className="mt-5 space-y-5">
        {seeBudget && (
          <BudgetEditor
            key={year}
            year={year}
            budgets={budgets.rows}
            branches={branchesRes.data ?? []}
            canEdit={canEditBudget(roles)}
          />
        )}
        {!isMarketing || isOps || roles.includes("sales_director") ? (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <KpiTargetsEditor value={settings.targets} canEdit={roles.some((r) => r === "sales_director" || r === "ops_qc" || r === "sysadmin")} />
            <QualitySettingsEditor value={settings.quality} canEdit={isOps} />
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <CostsEditor
            anchor="campaigns"
            title="Аяны зардал"
            description="Аяны код бүрийн нийт зардал — нэг сэжмийн зардал, өгөөжийг тооцоход."
            settingKey="campaign_costs"
            codeLabel="Аяны код"
            value={costMap(campaignCosts)}
            canEdit={isMarketing || isOps}
          />
          <CostsEditor
            title="Эх сурвалжийн зардал"
            description="Сэжмийн эх сурвалж бүрийн сарын зардал."
            settingKey="marketing_costs"
            codeLabel="Эх сурвалж"
            options={(sourcesRes.data ?? []).map((s) => ({ code: s.code, label: s.label }))}
            value={costMap(marketingCosts)}
            canEdit={isMarketing || isOps}
          />
        </div>
      </div>
    </div>
  );
}
