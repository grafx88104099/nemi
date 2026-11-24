import { NoAccessState } from "@/components/crm2/ui/empty";
import type { StaffOption } from "@/components/crm2/deals/types";
import { getCrm2Context } from "@/lib/crm2/context";
import type { Crm2Panel } from "@/lib/crm2/paths";
import { brokerageApproverMap } from "@/lib/crm2/queries/card-tabs";
import { getStaffDirectory } from "@/lib/crm2/queries/lookups";
import type { PropertyDetail } from "@/lib/crm2/queries/properties";
import { fileLimits, type Crm2Settings } from "@/lib/crm2/settings";

import { BrokeragePanel } from "./BrokeragePanel";
import { buildContractContext } from "../contract/contract-context";
import { activationPanelState } from "../contract/contract-model";
import { canCreateBrokerage } from "../logic";

/**
 * «Зуучлалын гэрээ» таб. Гэрээ, файлыг RLS шүүнэ (3 агент, хариуцагч, ахлагч,
 * батлагч, менежер); эрхгүй хүнд хоосон — тайлбар харуулна. Гэрээ үүсгэх/засах нь
 * ContractSheet (урьдчилан бөглөсөн доод цонх).
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
  const [approverOf, directory, ctx] = await Promise.all([
    brokerageApproverMap(detail.brokerage),
    getStaffDirectory(),
    getCrm2Context(),
  ]);
  const allowed = new Set(staff.map((s) => s.id));
  const members = allowed.size ? directory.filter((s) => allowed.has(s.profile_id)) : directory;
  const limits = fileLimits(settings);
  const context = ctx ? buildContractContext(detail, settings, ctx) : null;
  const activeContract = detail.brokerage.find((c) => c.status === "active") ?? null;
  const activation = activationPanelState({
    propertyStatus: p.status,
    hasActiveContract: !!activeContract,
    activateOnStart: !!activeContract?.activate_on_start,
    mode: settings["brokerage.activation_mode"],
    check: detail.activation,
  });
  return (
    <BrokeragePanel
      panel={panel}
      propertyId={p.id}
      officeId={p.office_id}
      contracts={detail.brokerage}
      canCreate={canCreate}
      staff={members}
      settings={settings}
      context={context}
      activation={activation}
      limits={{ maxDocMb: limits.maxDocMb, maxDocsPerContract: limits.maxDocsPerContract }}
      requireFile={settings["brokerage.require_file"]}
      names={names}
      approverOf={approverOf}
      now={now}
    />
  );
}
