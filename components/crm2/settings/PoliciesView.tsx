import { History, Info, ListChecks, Lock } from "lucide-react";

import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { CRM2_SETTING_DEFAULTS, CRM2_SETTING_LABEL } from "@/lib/crm2/settings";
import {
  DEFAULT_DECISIONS,
  FIXED_RULES,
  SETTING_DESCRIPTION,
  SETTING_GROUPS,
  canEditSetting,
  settingLockReason,
  settingValueText,
} from "@/lib/crm2/settings-policies";
import { listSettingOverrides } from "@/lib/crm2/settings-queries";
import { listSettingsHistory } from "@/lib/crm2/queries/history";
import { getStaffNameMap } from "@/lib/crm2/queries/lookups";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardBody } from "@/components/ui/card";
import { HistoryList, NoAccessState } from "@/components/crm2/ui";

import { SettingRow } from "./SettingRow";

/**
 * Staff-ийн дүрэм ба анхдагч утга (/office/crm/settings/policies): crm2_settings_effective-ийн
 * бүх түлхүүрийг сэдвээр, тайлбартай; засах эрхтэнд төрөлд тохирсон засварлагч.
 * Эрх: харах — менежер, тохиргоо удирдагч; засах — crm2_set_setting-ийн эрх
 * (roles.* / approvals.* зөвхөн CEO). Бусад — зөвхөн унших.
 */

const SETTINGS_INDEX = "/office/crm/settings";

export async function PoliciesView() {
  const ctx = await getCrm2Context();
  const canView = !!ctx?.isMember && (ctx.canManageSettings || ctx.isManager || ctx.isOfficeAdmin);
  if (!ctx || !canView) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:py-6 md:px-6">
        <BackLink href={SETTINGS_INDEX} label="Тохиргоо руу буцах" />
        <NoAccessState description="Staff-ийн дүрэм ба анхдагч утгыг удирдлага, тохиргоо удирдах эрхтэн харна." />
      </div>
    );
  }

  const [settings, overrides, history, names] = await Promise.all([
    getCrm2Settings(),
    listSettingOverrides(),
    ctx.canManageSettings ? listSettingsHistory({ limit: 50 }) : Promise.resolve([]),
    getStaffNameMap(),
  ]);
  const values = settings as Record<string, unknown>;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:py-6 md:px-6">
      <BackLink href={SETTINGS_INDEX} label="Тохиргоо руу буцах" />
      <h1 className="text-xl font-extrabold text-ink sm:text-2xl">Staff-ийн дүрэм ба анхдагч утга</h1>
      <p className="mt-0.5 text-sm text-muted">
        Оффисын CRM-ийн бизнес дүрэм. Өөрчлөлт шууд хүчинтэй болж, хэн, хэзээ өөрчилсөн нь түүхэнд хадгалагдана.
      </p>

      {!ctx.canManageSettings ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-muted">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Танд зөвхөн харах эрх байна. Тохиргоог системийн админ, гүйцэтгэх захирал эсвэл оффисын админ өөрчилнө.
        </div>
      ) : !ctx.canManageAccessSettings ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          «Эрх ба батлалт» бүлгийг зөвхөн гүйцэтгэх захирал өөрчилнө — та бусад бүлгийг засна.
        </div>
      ) : null}

      {/* Анхдагч шийдвэрүүд */}
      <Card className="mt-6">
        <CardBody className="p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <ListChecks className="size-4 text-brand-600" aria-hidden />
            Анхдагч шийдвэрүүд
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Ажил эхлэхээс өмнө эзний батлах ёстой гол дүрмүүд ба одоогийн утга. Өөрчлөх бол доорх тохирох мөр рүү очно уу.
          </p>
          <ul className="mt-3 divide-y divide-line">
            {DEFAULT_DECISIONS.map((d) => {
              const changed = d.keys.some((k) => overrides[k]);
              return (
                <li key={d.title} className="py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <a href={`#setting-${d.keys[0]}`} className="font-semibold text-ink hover:text-brand-700 hover:underline">
                      {d.title}
                    </a>
                    {changed ? <Badge tone="amber">Өөрчилсөн</Badge> : <Badge tone="neutral">Анхдагч</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{d.note}</p>
                  <dl className="mt-1 space-y-0.5 text-sm">
                    {d.keys.map((k) => (
                      <div key={k} className="flex flex-col sm:flex-row sm:gap-1.5">
                        <dt className="shrink-0 text-muted">{CRM2_SETTING_LABEL[k]}:</dt>
                        <dd className="min-w-0 break-words font-medium text-ink">{settingValueText(k, values[k])}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 rounded-xl bg-surface-2 p-3">
            <p className="text-sm font-semibold text-ink">Тохиргоогоор өөрчлөгдөхгүй дүрэм</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
              {FIXED_RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </CardBody>
      </Card>

      {/* Бүлгийн товч холбоос */}
      <nav aria-label="Тохиргооны бүлгүүд" className="mt-6 flex gap-1.5 overflow-x-auto pb-1">
        {SETTING_GROUPS.map((g) => (
          <a
            key={g.id}
            href={`#group-${g.id}`}
            className="inline-flex h-9 shrink-0 items-center rounded-full border border-line bg-surface px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-ink"
          >
            {g.title}
          </a>
        ))}
      </nav>

      <div className="mt-3 space-y-4">
        {SETTING_GROUPS.map((g) => (
          <Card key={g.id} id={`group-${g.id}`} className="scroll-mt-24">
            <CardBody className="p-4 sm:p-5">
              <h2 className="text-base font-bold text-ink">{g.title}</h2>
              <p className="mt-0.5 text-sm text-muted">{g.description}</p>
              <div className="mt-4">
                {g.keys.map((k) => {
                  const o = overrides[k];
                  return (
                    <SettingRow
                      key={k}
                      settingKey={k}
                      description={SETTING_DESCRIPTION[k]}
                      value={values[k]}
                      defaultValue={CRM2_SETTING_DEFAULTS[k]}
                      override={o ? { updatedAt: o.updatedAt, updatedByName: o.updatedBy ? (names[o.updatedBy] ?? null) : null } : null}
                      canEdit={canEditSetting(k, ctx)}
                      lockReason={settingLockReason(k, ctx)}
                    />
                  );
                })}
              </div>
            </CardBody>
          </Card>
        ))}

        {ctx.canManageSettings ? (
          <Card>
            <CardBody className="p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-base font-bold text-ink">
                <History className="size-4 text-brand-600" aria-hidden />
                Өөрчлөлтийн түүх
              </h2>
              <HistoryList rows={history} lookup={{ names }} emptyText="Тохиргоо өөрчлөгдөөгүй байна" className="mt-2" />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
