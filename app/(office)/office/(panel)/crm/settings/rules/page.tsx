import { getAutomationRules, getSettingHistory } from "@/lib/queries-crm-core";
import { requireSettingsAccess } from "../_lib/guard";
import { SettingEditor } from "../_components/SettingEditor";
import { RulesShell } from "./RulesShell";

export const metadata = { title: "Автомат дүрэм, SLA — CRM тохиргоо" };

const KEYS: { key: string; title: string; description: string }[] = [
  { key: "lead_assignment", title: "Сэжим хуваарилалт (F-126, Д-01)", description: "mode: duty_shift|round_robin|rule_based|load_capped; after_hours: queue" },
  { key: "arrears_ladder", title: "Хоцролтын шатлал (F-535)", description: "Алхам бүрийн босго хоног + хариуцагч дүр" },
  { key: "renewal_days", title: "Сунгалтын сануулгын хоног (Д-17/18)", description: "Жишиг: [60, 30]" },
  { key: "maintenance_sla", title: "Засварын SLA (Д-20)", description: "urgency бүрийн respond/resolve цаг" },
  { key: "aml_threshold_mnt", title: "МУТСТ босго ₮ (Д-25)", description: "Жишиг: 20000000" },
  { key: "quiet_hours", title: "Чимээгүй цаг (F-653)", description: "{ start: '21:00', end: '09:00' }" },
  { key: "photo_min_count", title: "Зургийн доод тоо (F-203)", description: "Листинг идэвхжүүлэлтийн босго" },
  { key: "aml_report_business_days", title: "МУТСТ тайлангийн ажлын өдөр (Д-25)", description: "Босго давсан гүйлгээний тайлангийн хугацаа — жишиг 5" },
  { key: "nps_send_delay_days", title: "NPS илгээх хоцроолт (F-751)", description: "Хэлцэл хаагдсанаас хойш хэдэн хоногт — жишиг 3" },
  { key: "nps_low_threshold", title: "NPS гомдлын босго (P-09)", description: "Энэ оноо ба доош → гомдол автомат — жишиг 6" },
  { key: "invoice_reminder_days", title: "Нэхэмжлэхийн сануулга (Д-15)", description: "Төлөх өдрөөс хэдэн хоногийн өмнө — жишиг 3" },
  { key: "monthly_record_reminder_day", title: "Сарын бүртгэлийн сануулгын өдөр (Д-21)", description: "Сарын хэд дэх өдөр — жишиг 25" },
  { key: "statement_due_days", title: "Өмчлөгчийн тайлангийн хугацаа (R-10)", description: "Сар дууссанаас хойш хоног — жишиг 10" },
];

export default async function RuleSettingsPage() {
  const ctx = await requireSettingsAccess();
  const rules = await getAutomationRules();
  const histories = await Promise.all(KEYS.map((k) => getSettingHistory(k.key)));

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Автомат дүрэм, SLA, хуанли</h1>
      <p className="text-sm text-muted">
        Д-дүрмүүдийг кодгүй унтраах/dry-run горимд шилжүүлнэ (F-601); гүйцэтгэл бүр crm_rule_runs-д логлогдоно.
      </p>

      <RulesShell rules={rules} canEdit={ctx.canEdit} />

      <h2 className="mt-8 text-lg font-bold text-ink">SLA, босго, хуанли</h2>
      <div className="mt-3 space-y-4">
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
