import { notFound, redirect } from "next/navigation";

import { getCrmStaffContext, getLookups } from "@/lib/queries-crm-core";
import { getContact360 } from "@/lib/queries-crm-contacts";
import { getNpsSurveys, getReferrals } from "@/lib/queries-crm-reports";
import { getMatchesForProfile } from "@/lib/queries-crm-matching";
import { ContactDetailShell } from "@/components/crm/ContactDetailShell";

export const metadata = { title: "Харилцагчийн 360° карт — CRM" };

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const { id } = await params;
  const data = await getContact360(id);
  if (!data) notFound();

  const [goals, lostReasons, tags, npsSurveys, referrals, matchesByProfile] = await Promise.all([
    getLookups("goal"),
    getLookups("lost_reason"),
    getLookups("tag"),
    getNpsSurveys({ contactId: id }),
    getReferrals({ referrerContactId: id }),
    Promise.all(data.needProfiles.map((p) => getMatchesForProfile(p.id))),
  ]);
  const profileMatches = Object.fromEntries(data.needProfiles.map((p, i) => [p.id, matchesByProfile[i]]));

  return (
    <div className="p-8">
      <ContactDetailShell
        data={data}
        goals={goals}
        lostReasons={lostReasons}
        tags={tags}
        roles={ctx.roles}
        basePath="/office/crm"
        npsSurveys={npsSurveys}
        referrals={referrals}
        profileMatches={profileMatches}
      />
    </div>
  );
}
