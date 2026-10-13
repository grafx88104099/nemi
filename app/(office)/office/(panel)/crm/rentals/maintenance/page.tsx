import { redirect } from "next/navigation";

import { getCrmStaffContext, getLookups } from "@/lib/queries-crm-core";
import {
  getMaintenance,
  getRentalPropertyOptions,
  getVendors,
  type MaintenanceFilters,
} from "@/lib/queries-crm-rentals";
import { MaintenancePageShell } from "@/components/crm/MaintenancePageShell";
import {
  MAINTENANCE_STATUSES,
  URGENCIES,
  type MaintenanceStatus,
  type Urgency,
} from "@/lib/constants-crm";

export const metadata = { title: "Засвар — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

/** Засварын самбар SLA-тай (F-545–554), дэлгэрэнгүй drawer-ээр (§4.1). */
export default async function MaintenancePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const sp = await searchParams;
  const filters: MaintenanceFilters = {
    status:
      sp.status && (MAINTENANCE_STATUSES as readonly string[]).includes(sp.status)
        ? (sp.status as MaintenanceStatus)
        : undefined,
    urgency:
      sp.urgency && (URGENCIES as readonly string[]).includes(sp.urgency)
        ? (sp.urgency as Urgency)
        : undefined,
    propertyId: sp.property || undefined,
  };

  const [rows, vendors, properties, categories] = await Promise.all([
    getMaintenance(filters),
    getVendors(),
    getRentalPropertyOptions(),
    getLookups("maintenance_category"),
  ]);

  return (
    <div className="p-8">
      <MaintenancePageShell
        rows={rows}
        vendors={vendors}
        properties={properties}
        categories={categories}
        filters={filters}
        roles={ctx.roles}
        profileId={ctx.profileId}
      />
    </div>
  );
}
