import { getCrmStaffContext, getBranches, getLookups } from "@/lib/queries-crm-core";
import { getContacts, getTagLookups, type ContactFilters } from "@/lib/queries-crm-contacts";
import { CrmNav } from "@/components/crm/CrmNav";
import { ContactsPageShell } from "@/components/crm/ContactsPageShell";
import { EmptyState } from "@/components/ui/empty-state";
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

/** Агентын харилцагчийн сан — RLS эрхийн хүрээнд (crm_can_view_contact). */
export default async function AgentContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title="Та CRM-д бүртгэгдээгүй байна"
          description="Оффисын админ таныг CRM-ийн ажилтнаар нэмсний дараа харилцагчийн бүртгэл харагдана."
          action={{ label: "Агентын самбар", href: "/agent" }}
        />
      </div>
    );
  }

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
    getTagLookups(),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>
      <ContactsPageShell rows={rows} sources={sources} branches={branches} tags={tags} roles={ctx.roles} basePath="/agent/crm" />
    </div>
  );
}
