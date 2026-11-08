import { notFound, redirect } from "next/navigation";

import { myCrmContext } from "@/lib/queries-crm-today";
import { canSeeVitals, getMyWorklists, getTrackTemplates } from "@/lib/queries-crm-worklists";
import { isWorklistCode, worklistLabel } from "@/lib/crm/worklists";
import { BackLink } from "@/components/ui/back-link";
import { WorklistsNav } from "@/components/crm/mobile/WorklistsNav";
import { WorklistDialer } from "@/components/crm/mobile/WorklistDialer";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Ажлын жагсаалт — CRM" };

export default async function WorklistPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isWorklistCode(code)) notFound();
  const ctx = await myCrmContext();
  if (!ctx) redirect("/agent");
  const [data, tracks] = await Promise.all([getMyWorklists("/agent/crm"), getTrackTemplates()]);
  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <EmptyState title="Жагсаалт ачаалагдсангүй" description="Хуудсыг дахин ачаалж үзнэ үү." />
      </div>
    );
  }
  if (data.settings.disabled.includes(code)) notFound();
  const l = worklistLabel(code, data.settings);

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:py-6">
      <BackLink href="/agent/crm/worklists" label="Ажлын жагсаалт"/>
      <h1 className="mb-1 text-xl font-bold text-ink">{l.label}</h1>
      <p className="mb-3 text-sm text-muted">{l.hint}</p>
      <WorklistsNav active="lists" showVitals={canSeeVitals(ctx.roles)} />
      <WorklistDialer
        entries={data.lists[code]}
        templates={tracks.templates}
        retryHours={data.retryHours}
        recontactRanges={data.recontactRanges}
        emptyHref="/agent/crm/worklists"
      />
    </div>
  );
}
