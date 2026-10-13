import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getAgentDayboard } from "@/lib/queries-crm-pipeline";
import {
  getAgentToday,
  getForecastView,
  getCommissionSummaryView,
  sumForecast,
  sumCommissionSummary,
} from "@/lib/queries-crm-reports";
import { CrmNav } from "@/components/crm/CrmNav";
import { AgentDayboard } from "@/components/crm/AgentDayboard";

export const metadata = { title: "Өдрийн самбар — CRM" };

/**
 * R-01 Агентын өдрийн самбар (U9 — DESIGN §8.2): AgentDayboard виджет —
 * өнөөдрийн даалгавар, хоцорсон эргэн холбогдолт, шинэ сэжим, үзлэгийн
 * 24ц санал, өөрийн урсгал/төсөөлөл, өөрийн шимтгэл (F-471 — RLS
 * агентад зөвхөн өөрийн мөрийг нэгтгэнэ).
 */
export default async function AgentCrmPage() {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");

  const [board, todayRows, forecastRows, commissionRows] = await Promise.all([
    getAgentDayboard(),
    getAgentToday(),
    getForecastView(),
    getCommissionSummaryView(),
  ]);
  const today = todayRows.find((t) => t.owner_id === ctx.profileId) ?? null;
  const ownForecast = sumForecast(forecastRows.filter((f) => f.owner_id === ctx.profileId));
  const commission = sumCommissionSummary(commissionRows);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>

      <h1 className="mb-4 text-xl font-bold text-ink">Өдрийн самбар</h1>

      {!board ? (
        <p className="text-sm text-muted">Мэдээлэл ачаалагдсангүй.</p>
      ) : (
        <AgentDayboard
          board={board}
          today={today}
          forecast={ownForecast}
          commission={commission}
          basePath="/agent/crm"
        />
      )}
    </div>
  );
}
