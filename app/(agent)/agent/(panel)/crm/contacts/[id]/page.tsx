import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext, getBranches } from "@/lib/queries-crm-core";
import { getContactCardData } from "@/lib/queries-crm-lead-card";
import { getNpsSurveys, getReferrals } from "@/lib/queries-crm-reports";
import { CrmNav } from "@/components/crm/CrmNav";
import { ContactDetailShell } from "@/components/crm/ContactDetailShell";

export const metadata = { title: "Харилцагчийн карт — CRM" };

/** Эрхийн хүрээний 360° карт — RLS-ээр хязгаарлагдана. */
export default async function AgentContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent/crm/leads");

  const { id } = await params;
  const [card, branches, npsSurveys, referrals] = await Promise.all([
    getContactCardData(id, ctx),
    getBranches(),
    getNpsSurveys({ contactId: id }),
    getReferrals({ referrerContactId: id }),
  ]);
  if (!card) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>
      <ContactDetailShell
        card={card}
        me={ctx.profileId}
        roles={ctx.roles}
        basePath="/agent/crm"
        branches={branches.filter((b) => b.is_active)}
        npsSurveys={npsSurveys}
        referrals={referrals}
      />
    </div>
  );
}
