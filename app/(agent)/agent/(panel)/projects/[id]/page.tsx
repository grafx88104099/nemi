import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Wallet, MapPin, CalendarClock, Users } from "lucide-react";

import { getProjectDetail } from "@/lib/queries-agent";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProjectFormButton, type ProjectInitial } from "@/components/dashboard/ProjectFormButton";
import { DeleteProjectButton } from "@/components/dashboard/DeleteProjectButton";
import { LogActivityForm } from "@/components/dashboard/LogActivityForm";
import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import { shortMNT } from "@/lib/format";
import { PROJECT_TYPE_LABEL, PROJECT_STATUS_LABEL, LEAD_STAGE_LABEL } from "@/lib/constants";

const typeLabel = (s: string) => PROJECT_TYPE_LABEL[s as keyof typeof PROJECT_TYPE_LABEL] ?? s;
const stageLabel = (s: string) => LEAD_STAGE_LABEL[s as keyof typeof LEAD_STAGE_LABEL] ?? s;

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getProjectDetail(id);
  if (!data) notFound();
  const { project, leads, activities } = data;

  const status = project.status as string;
  const statusMeta = PROJECT_STATUS_LABEL[status as keyof typeof PROJECT_STATUS_LABEL] ?? { label: status, tone: "neutral" as const };
  const bMin = project.budget_min as number | null;
  const bMax = project.budget_max as number | null;
  const budget = bMin && bMax ? `${shortMNT(bMin)} – ${shortMNT(bMax)}` : bMax ? `≤ ${shortMNT(bMax)}` : bMin ? `≥ ${shortMNT(bMin)}` : "—";

  const initial: ProjectInitial = {
    id: project.id as string,
    title: project.title as string,
    client_name: (project.client_name as string | null) ?? null,
    client_phone: (project.client_phone as string | null) ?? null,
    type: project.type as string,
    status,
    budget_min: bMin,
    budget_max: bMax,
    target_area: (project.target_area as string | null) ?? null,
    deadline: (project.deadline as string | null) ?? null,
    note: (project.note as string | null) ?? null,
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/agent/projects" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Төслүүд
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">{project.title as string}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge tone="neutral">{typeLabel(project.type as string)}</Badge>
            {(project.client_name as string | null) && (
              <span className="flex items-center gap-1">
                {project.client_name as string}
                {(project.client_phone as string | null) && (
                  <a href={`tel:${project.client_phone}`} className="flex items-center gap-1 text-brand-600 hover:underline">
                    <Phone className="size-3.5" /> {project.client_phone as string}
                  </a>
                )}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
          <ProjectFormButton mode="edit" initial={initial} />
          <DeleteProjectButton id={project.id as string} />
        </div>
      </div>

      {/* Гэрээний мэдээлэл */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Card><CardBody><Wallet className="size-5 text-brand-600" /><div className="mt-1 font-bold text-ink">{budget}</div><div className="text-xs text-muted">Төсөв</div></CardBody></Card>
        <Card><CardBody><MapPin className="size-5 text-emerald-600" /><div className="mt-1 font-bold text-ink">{(project.target_area as string | null) ?? "—"}</div><div className="text-xs text-muted">Хүссэн байршил</div></CardBody></Card>
        <Card><CardBody><CalendarClock className="size-5 text-amber-600" /><div className="mt-1 font-bold text-ink">{(project.deadline as string | null) ?? "—"}</div><div className="text-xs text-muted">Эцсийн хугацаа</div></CardBody></Card>
      </div>

      {(project.note as string | null) && (
        <Card className="mt-3"><CardBody><p className="whitespace-pre-wrap text-sm text-ink">{project.note as string}</p></CardBody></Card>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {/* Холбоотой лидүүд */}
        <div className="lg:col-span-1">
          <h2 className="mb-2 flex items-center gap-2 font-bold text-ink"><Users className="size-4" /> Лидүүд ({leads.length})</h2>
          <div className="space-y-2">
            {leads.map((l) => (
              <Link key={l.id} href={`/agent/leads/${l.id}`} className="block rounded-xl border border-line bg-surface p-3 hover:bg-surface-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{l.name}</span>
                  <Badge tone="neutral">{stageLabel(l.stage)}</Badge>
                </div>
                {l.phone && <div className="mt-0.5 text-xs text-muted">{l.phone}</div>}
              </Link>
            ))}
            {leads.length === 0 && (
              <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">
                Холбоотой лид алга. Лид засах үед энэ төслийг сонгож холбоно.
              </p>
            )}
          </div>
        </div>

        {/* Үйл явдал */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardBody>
              <h2 className="mb-3 font-bold text-ink">Тэмдэглэл / үйл явдал нэмэх</h2>
              <LogActivityForm projectId={project.id as string} />
            </CardBody>
          </Card>
          <div>
            <h2 className="mb-3 font-bold text-ink">Үйл явдлын түүх ({activities.length})</h2>
            <ActivityTimeline items={activities} />
          </div>
        </div>
      </div>
    </div>
  );
}
