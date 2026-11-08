import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext, getLookups } from "@/lib/queries-crm-core";
import { getProperty, getActivationMissing } from "@/lib/queries-crm-properties";
import { getMatchesForProperty } from "@/lib/queries-crm-matching";
import { getActivities, getAgentOptions } from "@/lib/queries-crm-leads";
import { getDocsForEntity } from "@/lib/queries-crm-docs";
import { CrmNav } from "@/components/crm/CrmNav";
import { PropertyDetailShell } from "@/components/crm/PropertyDetailShell";

export const metadata = { title: "Үл хөдлөхийн карт — CRM" };

type Params = Promise<{ id: string }>;

export default async function AgentPropertyDetailPage({ params }: { params: Params }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");

  const { id } = await params;
  const property = await getProperty(id);
  if (!property) notFound();

  const [matches, missing, agents, docs, activities, objections] = await Promise.all([
    getMatchesForProperty(id),
    property.status === "draft" || property.status === "withdrawn" ? getActivationMissing(id) : Promise.resolve([]),
    getAgentOptions(),
    getDocsForEntity("property", id),
    getActivities({ propertyId: id }),
    getLookups("objection"),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>
      <PropertyDetailShell
        property={property}
        matches={matches}
        missing={missing}
        agents={agents}
        roles={ctx.roles}
        basePath="/agent/crm"
        docs={docs}
        activities={activities}
        objections={objections.map((o) => ({ id: o.id, label: o.label }))}
        me={ctx.profileId}
      />
    </div>
  );
}
