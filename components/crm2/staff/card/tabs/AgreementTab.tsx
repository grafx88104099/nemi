import { NoAccessState } from "@/components/crm2/ui/empty";
import type { StaffOption } from "@/components/crm2/deals/types";
import type { Crm2Panel } from "@/lib/crm2/paths";
import { brokerageApproverMap } from "@/lib/crm2/queries/card-tabs";
import type { PropertyDetail } from "@/lib/crm2/queries/properties";
import { fileLimits, type Crm2Settings } from "@/lib/crm2/settings";

import { BrokeragePanel } from "./BrokeragePanel";
import { canCreateBrokerage } from "../logic";

/**
 * «Зуучлалын гэрээ» таб. Гэрээ, файлыг RLS шүүнэ (3 агент, хариуцагч, ахлагч,
 * батлагч, менежер); эрхгүй хүнд хоосон — тайлбар харуулна.
 */
export async function AgreementTab({
  detail,
  settings,
  panel,
  staff,
  names,
  now,
}: {
  detail: PropertyDetail;
  settings: Crm2Settings;
  panel: Crm2Panel;
  staff: StaffOption[];
  names: Record<string, string>;
  now: number;
}) {
  const p = detail.property;
  const canCreate = canCreateBrokerage(detail.brokerage, detail.can.edit);
  if (detail.brokerage.length === 0 && !detail.can.viewPrivate && !canCreate) {
    return (
      <NoAccessState
        title="Зуучлалын гэрээ харах эрхгүй"
        description="Гэрээ, гэрээний файл зөвхөн хөрөнгийн үүрэгт агентууд, гэрээний хариуцагч, багийн ахлагч, батлагч, менежерт харагдана."
      />
    );
  }
  const owner = detail.private?.owner ?? null;
  const approverOf = await brokerageApproverMap(detail.brokerage);
  const limits = fileLimits(settings);
  return (
    <BrokeragePanel
      panel={panel}
      propertyId={p.id}
      officeId={p.office_id}
      contracts={detail.brokerage}
      canCreate={canCreate}
      staff={staff}
      defaultOwner={owner ? { id: owner.id, code: owner.code, full_name: owner.full_name } : null}
      limits={{ maxDocMb: limits.maxDocMb, maxDocsPerContract: limits.maxDocsPerContract }}
      requireOwner={settings["brokerage.require_owner"]}
      requireFile={settings["brokerage.require_file"]}
      names={names}
      approverOf={approverOf}
      now={now}
    />
  );
}
