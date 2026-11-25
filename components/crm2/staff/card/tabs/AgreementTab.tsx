import { NoAccessState } from "@/components/crm2/ui/empty";
import type { StaffOption } from "@/components/crm2/deals/types";
import { getCrm2Context } from "@/lib/crm2/context";
import type { Crm2Panel } from "@/lib/crm2/paths";
import { getStaffDirectory } from "@/lib/crm2/queries/lookups";
import type { PropertyDetail } from "@/lib/crm2/queries/properties";
import { fileLimits, type Crm2Settings } from "@/lib/crm2/settings";

import { BrokeragePanel } from "./BrokeragePanel";
import { buildContractContext } from "../contract/contract-context";
import { activationPanelState } from "../contract/contract-model";
import { canCreateBrokerage } from "../logic";

/**
 * «Зуучлалын гэрээ» таб. Гэрээ, файлыг RLS шүүнэ (3 агент, хариуцагч, ахлагч, батлагч, менежер);
 * эрхгүй хүнд хоосон — тайлбар харуулна. Гэрээ бүртгэх нь ContractSheet («Гэрээ бүртгэх» — PMC
 * тамгатай PDF, дуусах огноо; батлах алхамгүй).
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
  /** Гэрээ байгуулсан агент сонгох жагсаалт (ажлын эрхтэй ажилтан). */
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
        description="Гэрээ, гэрээний PDF зөвхөн хөрөнгийн үүрэгт агентууд, гэрээний хариуцагч, агентын багийн ахлагч, батлагч, менежерт харагдана."
      />
    );
  }
  const [directory, ctx] = await Promise.all([getStaffDirectory(), getCrm2Context()]);
  const allowed = new Set(staff.map((s) => s.id));
  const members = allowed.size ? directory.filter((s) => allowed.has(s.profile_id)) : directory;
  const limits = fileLimits(settings);
  const context = ctx ? buildContractContext(detail, settings, ctx) : null;
  const activeContract = detail.brokerage.find((c) => c.status === "active") ?? null;
  const activation = activationPanelState({
    propertyStatus: p.status,
    hasActiveContract: !!activeContract,
    check: detail.activation,
    statusChangedAt: p.status_changed_at,
    activeRegisteredAt: activeContract?.registered_at ?? null,
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
      names={names}
      now={now}
    />
  );
}
