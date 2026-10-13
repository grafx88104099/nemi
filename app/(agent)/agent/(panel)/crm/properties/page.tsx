import { redirect } from "next/navigation";

import { getCrmStaffContext, getBranches } from "@/lib/queries-crm-core";
import { getProperties, type PropertyFilters } from "@/lib/queries-crm-properties";
import { getAgentOptions } from "@/lib/queries-crm-leads";
import { getContacts } from "@/lib/queries-crm-contacts";
import { CrmNav } from "@/components/crm/CrmNav";
import { PropertiesPageShell } from "@/components/crm/PropertiesPageShell";
import {
  CRM_PROPERTY_STATUSES,
  CRM_PROPERTY_TYPES,
  OCCUPANCY_STATUSES,
  SERVICE_KINDS,
  type CrmPropertyStatus,
  type CrmPropertyType,
  type OccupancyStatus,
  type ServiceKind,
} from "@/lib/constants-crm";

export const metadata = { title: "Объектын сан — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

/** Агентын объектын сан — дундын сан (унших) + өөрийн листинг (DESIGN §4.2). */
export default async function AgentPropertiesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");

  const sp = await searchParams;
  const filters: PropertyFilters = {
    status: CRM_PROPERTY_STATUSES.includes(sp.status as CrmPropertyStatus)
      ? (sp.status as CrmPropertyStatus)
      : undefined,
    serviceKind: SERVICE_KINDS.includes(sp.service as ServiceKind) ? (sp.service as ServiceKind) : undefined,
    propertyType: CRM_PROPERTY_TYPES.includes(sp.type as CrmPropertyType) ? (sp.type as CrmPropertyType) : undefined,
    occupancy: OCCUPANCY_STATUSES.includes(sp.occupancy as OccupancyStatus)
      ? (sp.occupancy as OccupancyStatus)
      : undefined,
    branchId: sp.branch || undefined,
    agentId: sp.agent || undefined,
    priceMin: sp.priceMin ? Number(sp.priceMin) : undefined,
    priceMax: sp.priceMax ? Number(sp.priceMax) : undefined,
    areaMin: sp.areaMin ? Number(sp.areaMin) : undefined,
    q: sp.q || undefined,
  };

  const [rows, branches, agents, contacts] = await Promise.all([
    getProperties(filters),
    getBranches(),
    getAgentOptions(),
    getContacts({}),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>
      <PropertiesPageShell
        rows={rows}
        branches={branches}
        agents={agents}
        ownerContacts={contacts.map((c) => ({ id: c.id, name: c.display_name, number: c.number }))}
        roles={ctx.roles}
        basePath="/agent/crm"
      />
    </div>
  );
}
