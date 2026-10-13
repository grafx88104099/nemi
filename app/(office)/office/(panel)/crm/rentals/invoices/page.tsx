import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import {
  getAging,
  getInvoices,
  getLeases,
  getRentalContactOptions,
  type InvoiceFilters,
} from "@/lib/queries-crm-rentals";
import { InvoicesPageShell } from "@/components/crm/InvoicesPageShell";
import {
  INVOICE_STATUSES,
  INVOICE_TYPES,
  type InvoiceStatus,
  type InvoiceType,
} from "@/lib/constants-crm";

export const metadata = { title: "Нэхэмжлэх — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

/** Нэхэмжлэх + насжилтын самбар (F-515–524, F-524 aging) (§4.1). */
export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const sp = await searchParams;
  const filters: InvoiceFilters = {
    status:
      sp.status && (INVOICE_STATUSES as readonly string[]).includes(sp.status)
        ? (sp.status as InvoiceStatus)
        : undefined,
    type:
      sp.type && (INVOICE_TYPES as readonly string[]).includes(sp.type)
        ? (sp.type as InvoiceType)
        : undefined,
    leaseId: sp.lease || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
    q: sp.q || undefined,
  };

  const [rows, aging, leases, contacts] = await Promise.all([
    getInvoices(filters),
    getAging(),
    getLeases({ status: "active" }),
    getRentalContactOptions(),
  ]);

  return (
    <div className="p-8">
      <InvoicesPageShell
        rows={rows}
        aging={aging}
        leases={leases}
        contacts={contacts}
        filters={filters}
        roles={ctx.roles}
      />
    </div>
  );
}
