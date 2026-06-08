import Link from "next/link";
import { Phone } from "lucide-react";

import { getMyAgent, getAgentLeads, getAgentListings, getAgentProjects } from "@/lib/queries-agent";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { LeadStageSelect } from "@/components/dashboard/LeadStageSelect";
import { LeadFormButton } from "@/components/dashboard/LeadFormButton";
import { Card, CardBody } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { LEAD_PIPELINE, LEAD_STAGE_LABEL } from "@/lib/constants";

const COLS: [string, string][] = LEAD_PIPELINE.map((k) => [k, LEAD_STAGE_LABEL[k]]);

export default async function LeadsPage() {
  const agent = await getMyAgent();
  if (!agent) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-muted">Зөвхөн агент CRM ашиглана.</p>
        <ButtonLink href="/office-signup" className="mt-4">Оффис нээх</ButtonLink>
      </div>
    );
  }
  const [leads, listings, projects] = await Promise.all([
    getAgentLeads(agent.id as string),
    getAgentListings(agent.id as string),
    getAgentProjects(agent.id as string),
  ]);
  const listingOpts = listings.map((l) => ({ id: l.id, title: l.title }));
  const projectOpts = projects.map((p) => ({ id: p.id, title: p.title }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mt-1"><DashboardNav /></div>
      <div className="mt-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-ink">Лид удирдлага (CRM)</h1>
        <LeadFormButton mode="create" listings={listingOpts} projects={projectOpts} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {COLS.map(([key, label]) => {
          const items = leads.filter((l) => l.stage === key);
          return (
            <div key={key} className="rounded-2xl bg-surface-2 p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-semibold text-ink">{label}</span>
                <span className="rounded-full bg-surface px-2 text-xs text-muted">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((l) => (
                  <Card key={l.id}>
                    <CardBody className="space-y-1.5 p-3">
                      <div className="flex items-center justify-between">
                        <Link href={`/agent/leads/${l.id}`} className="text-sm font-bold text-ink hover:text-brand-600 hover:underline">{l.name}</Link>
                        {l.score != null && (
                          <span className="rounded-full bg-brand-50 px-1.5 text-xs font-semibold text-brand-700">{l.score}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted">{l.listing?.title ?? "—"}</div>
                      {l.note && <p className="text-xs text-muted">{l.note}</p>}
                      {l.phone && (
                        <a href={`tel:${l.phone}`} className="flex items-center gap-1 text-xs text-brand-600">
                          <Phone className="size-3" /> {l.phone}
                        </a>
                      )}
                      <LeadStageSelect id={l.id} stage={l.stage} />
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
