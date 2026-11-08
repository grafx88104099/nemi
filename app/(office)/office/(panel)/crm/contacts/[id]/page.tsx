import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext, getBranches } from "@/lib/queries-crm-core";
import { getContactCardData } from "@/lib/queries-crm-lead-card";
import { getNpsSurveys, getReferrals } from "@/lib/queries-crm-reports";
import { ContactDetailShell } from "@/components/crm/ContactDetailShell";

export const metadata = { title: "Харилцагчийн 360° карт — CRM" };

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const { id } = await params;
  const [card, branches, npsSurveys, referrals] = await Promise.all([
    getContactCardData(id, ctx),
    getBranches(),
    getNpsSurveys({ contactId: id }),
    getReferrals({ referrerContactId: id }),
  ]);
  if (!card) notFound();

  return (
    <div className="p-4 md:p-8">
      <ContactDetailShell
        card={card}
        me={ctx.profileId}
        roles={ctx.roles}
        basePath="/office/crm"
        branches={branches.filter((b) => b.is_active)}
        npsSurveys={npsSurveys}
        referrals={referrals}
      />
    </div>
  );
}
