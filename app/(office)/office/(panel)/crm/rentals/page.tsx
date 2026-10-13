import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import {
  getAging,
  getLeases,
  getManagementAgreements,
  getRentalContactOptions,
  getRentalPropertyOptions,
  getRentalsSummary,
  type LeaseFilters,
} from "@/lib/queries-crm-rentals";
import { RentalsPageShell } from "@/components/crm/RentalsPageShell";
import { LEASE_STATUSES, type LeaseStatus } from "@/lib/constants-crm";

export const metadata = { title: "Түрээсийн багц — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

/** R-08 Түрээсийн багцын самбар: гэрээнүүд, дуусах хугацаа, дүүргэлт, насжилт (§4.1). */
export default async function RentalsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const sp = await searchParams;
  const filters: LeaseFilters = {
    status:
      sp.status && (LEASE_STATUSES as readonly string[]).includes(sp.status)
        ? (sp.status as LeaseStatus)
        : undefined,
    managed: sp.managed === "1" ? true : sp.managed === "0" ? false : undefined,
    propertyId: sp.property || undefined,
    q: sp.q || undefined,
    expiringDays: sp.expiring ? Number(sp.expiring) || undefined : undefined,
  };

  const [summary, aging, leases, agreements, contacts, properties] = await Promise.all([
    getRentalsSummary(),
    getAging(),
    getLeases(filters),
    getManagementAgreements(),
    getRentalContactOptions(),
    getRentalPropertyOptions(),
  ]);

  return (
    <div className="p-8">
      <RentalsPageShell
        summary={summary}
        aging={aging}
        leases={leases}
        agreements={agreements}
        contacts={contacts}
        properties={properties}
        filters={filters}
        roles={ctx.roles}
      />
    </div>
  );
}
