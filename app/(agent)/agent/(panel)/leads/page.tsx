import { Phone } from "lucide-react";

import { getMyAgent, getAgentLeads } from "@/lib/queries-agent";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { LeadStageSelect } from "@/components/dashboard/LeadStageSelect";
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
  const leads = await getAgentLeads(agent.id as string);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mt-1"><DashboardNav /></div>
      <h1 className="mt-6 text-xl font-extrabold text-ink">Лид удирдлага (CRM)</h1>

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
                        <span className="text-sm font-bold text-ink">{l.name}</span>
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
