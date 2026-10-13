import { getSettingHistory } from "@/lib/queries-crm-core";
import { getCommissionConfigs } from "@/lib/queries-crm-commissions";
import { requireSettingsAccess } from "../_lib/guard";
import { SettingEditor } from "../_components/SettingEditor";
import { CommissionConfigShell } from "./CommissionConfigShell";

export const metadata = { title: "Шимтгэлийн журам — CRM тохиргоо" };

const KEYS: { key: string; title: string; description: string }[] = [
  { key: "commission_tax", title: "Татвар/суутгал (F-455)", description: "{ pct: N } — тооцооллын суурь = татварын ДАРААХ цэвэр дүн" },
  { key: "rental_fee_tiers", title: "Түрээсийн хөлсний шатлал (F-502/465)", description: "12+ сар / 6–11 сар / 1–5 сарын хувь" },
  { key: "fx_rates", title: "Валютын ханшийн хүснэгт (F-419)", description: "{ '2026-09-05': { USD: 3450, … } } — ₮ дүйцэл автомат" },
];

export default async function CommissionSettingsPage() {
  const ctx = await requireSettingsAccess();
  const [configs, ...histories] = await Promise.all([
    getCommissionConfigs(),
    ...KEYS.map((k) => getSettingHistory(k.key)),
  ]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Шимтгэлийн журам</h1>
      <p className="text-sm text-muted">
        Хувилбартай тохиргоо — өөрчлөлт хуучин хэлцлийн тооцоог өөрчлөхгүй (F-453). Хувь/босго
        КОДОНД БИШ — эндхийн payload-оос уншигдана (F-452).
      </p>

      <div className="mt-6">
        <CommissionConfigShell configs={configs} canEdit={ctx.canEdit} />
      </div>

      <div className="mt-4 space-y-4">
        {KEYS.map((k, i) => (
          <SettingEditor
            key={k.key}
            settingKey={k.key}
            title={k.title}
            description={k.description}
            versions={histories[i]}
            canEdit={ctx.canEdit}
          />
        ))}
      </div>
    </div>
  );
}
