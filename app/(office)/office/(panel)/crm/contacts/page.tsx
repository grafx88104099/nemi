import { redirect } from "next/navigation";

import { getCrmStaffContext, getBranches, getLookups } from "@/lib/queries-crm-core";
import { getContacts, type ContactFilters } from "@/lib/queries-crm-contacts";
import { ContactsPageShell } from "@/components/crm/ContactsPageShell";
import {
  CRM_LIFECYCLES,
  CONTACT_KINDS,
  CONTACT_TYPES,
  CONSENT_STATUSES,
  type CrmLifecycle,
  type ContactKind,
  type ContactType,
  type ConsentStatus,
} from "@/lib/constants-crm";

export const metadata = { title: "Харилцагч — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const sp = await searchParams;
  const filters: ContactFilters = {
    lifecycle: CRM_LIFECYCLES.includes(sp.lifecycle as CrmLifecycle) ? (sp.lifecycle as CrmLifecycle) : undefined,
    kind: CONTACT_KINDS.includes(sp.kind as ContactKind) ? (sp.kind as ContactKind) : undefined,
    contactType: CONTACT_TYPES.includes(sp.type as ContactType) ? (sp.type as ContactType) : undefined,
    consent: CONSENT_STATUSES.includes(sp.consent as ConsentStatus) ? (sp.consent as ConsentStatus) : undefined,
    branchId: sp.branch || undefined,
    tagId: sp.tag || undefined,
    q: sp.q || undefined,
  };

  const [rows, branches, sources, tags] = await Promise.all([
    getContacts(filters),
    getBranches(),
    getLookups("lead_source"),
    getLookups("tag"),
  ]);

  return (
    <div className="p-8">
      <ContactsPageShell
        rows={rows}
        sources={sources}
        branches={branches}
        tags={tags}
        roles={ctx.roles}
        basePath="/office/crm"
      />
    </div>
  );
}
