import Link from "next/link";
import { Users, CalendarClock, MapPin } from "lucide-react";

import { getMyAgent, getAgentProjects, type ProjectRow } from "@/lib/queries-agent";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { ProjectFormButton } from "@/components/dashboard/ProjectFormButton";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { shortMNT } from "@/lib/format";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, PROJECT_TYPE_LABEL } from "@/lib/constants";

function budget(p: ProjectRow): string {
  if (p.budget_min && p.budget_max) return `${shortMNT(p.budget_min)} – ${shortMNT(p.budget_max)}`;
  if (p.budget_max) return `≤ ${shortMNT(p.budget_max)}`;
  if (p.budget_min) return `≥ ${shortMNT(p.budget_min)}`;
  return "—";
}

export default async function ProjectsPage() {
  const agent = await getMyAgent();
  if (!agent) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-muted">Зөвхөн агент төсөл удирдана.</p>
        <ButtonLink href="/office-signup" className="mt-4">Оффис нээх</ButtonLink>
      </div>
    );
  }
  const projects = await getAgentProjects(agent.id as string);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mt-1"><DashboardNav /></div>
      <div className="mt-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-ink">Төслүүд ({projects.length})</h1>
          <p className="text-sm text-muted">Үйлчлүүлэгчийн гэрээ бүрийг эхнээс хаах хүртэл удирдана.</p>
        </div>
        <ProjectFormButton mode="create" />
      </div>

      {projects.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-line p-10 text-center text-muted">
          Төсөл алга. «Шинэ төсөл» дарж эхний гэрээгээ үүсгэнэ үү.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PROJECT_STATUSES.map((st) => {
            const items = projects.filter((p) => p.status === st);
            const meta = PROJECT_STATUS_LABEL[st];
            return (
              <div key={st} className="rounded-2xl bg-surface-2 p-3">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <span className={`size-2 rounded-full ${st === "active" ? "bg-emerald-500" : st === "on_hold" ? "bg-amber-500" : st === "won" ? "bg-sky-500" : "bg-rose-500"}`} />
                    {meta.label}
                  </span>
                  <span className="rounded-full bg-surface px-2 text-xs text-muted">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((p) => (
                    <Card key={p.id}>
                      <CardBody className="space-y-2 p-3">
                        <Link href={`/agent/projects/${p.id}`} className="block font-bold text-ink hover:text-brand-600 hover:underline">{p.title}</Link>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="neutral">{PROJECT_TYPE_LABEL[p.type as keyof typeof PROJECT_TYPE_LABEL] ?? p.type}</Badge>
                        </div>
                        {p.client_name && <div className="text-xs text-muted">{p.client_name}{p.client_phone ? ` · ${p.client_phone}` : ""}</div>}
                        <div className="text-xs text-ink">{budget(p)}</div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                          <span className="flex items-center gap-1"><Users className="size-3" /> {p.leadCount} лид</span>
                          {p.target_area && <span className="flex items-center gap-1"><MapPin className="size-3" /> {p.target_area}</span>}
                          {p.deadline && <span className="flex items-center gap-1"><CalendarClock className="size-3" /> {p.deadline}</span>}
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                  {items.length === 0 && <p className="px-1 py-2 text-xs text-subtle">—</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
