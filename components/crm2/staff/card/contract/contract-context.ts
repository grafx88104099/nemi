import { ubToday } from "@/lib/crm2/datetime";
import { cardChecklistInput } from "@/lib/crm2/queries/checklist";
import type { PropertyDetail } from "@/lib/crm2/queries/properties";
import type { Crm2Settings } from "@/lib/crm2/settings";
import type { Crm2Context } from "@/lib/crm2/types";

import { termEndDate } from "./contract-model";
import type { ContractContext } from "./contract-types";

/**
 * getProperty()-ийн үр дүн → ContractContext (серверт; нэмэлт уншилтгүй). Хувийн талбар харах эрхгүй
 * бол эзэн 'hidden' — утас, нэрийг клиентэд илгээхгүй.
 */
export function buildContractContext(
  detail: PropertyDetail,
  settings: Crm2Settings,
  ctx: Pick<Crm2Context, "profileId" | "teamId"> & Partial<Pick<Crm2Context, "staffId">>,
  today = ubToday()
): ContractContext {
  const p = detail.property;
  const o = detail.private?.owner ?? null;
  const termMonths = settings["brokerage.default_term_months"];
  return {
    propertyId: p.id,
    officeId: p.office_id,
    propertyCode: p.code,
    propertyStatus: p.status,
    property: {
      contract_agent_id: p.contract_agent_id,
      listing_agent_id: p.listing_agent_id,
      photo_agent_id: p.photo_agent_id,
      unconfirmed: [...(p.unconfirmed ?? [])],
    },
    canEditProperty: detail.can.edit,
    owner: !detail.can.viewPrivate
      ? "hidden"
      : o
        ? { id: o.id, code: o.code, full_name: o.full_name, source: o.source ?? null, name_unverified: !!o.name_unverified }
        : null,
    ownerPending: detail.can.viewPrivate ? (detail.private?.owner_pending ?? null) : null,
    meId: ctx.profileId,
    meIsStaff: !!ctx.staffId,
    sameAgentMultiRole: settings["property.same_agent_multi_role"],
    teamIds: ctx.teamId ? [ctx.teamId] : [],
    termMonths,
    defaultEndDate: termEndDate(today, termMonths) ?? "",
    requireOwner: settings["brokerage.require_owner"],
    checklist: cardChecklistInput(detail, settings, today),
    contracts: detail.brokerage,
    today,
  };
}
