import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Building2, Clock, FolderKanban } from "lucide-react";

import { getLeadDetail, getAgentListings, getAgentProjects, getMyAgent } from "@/lib/queries-agent";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeadStageSelect } from "@/components/dashboard/LeadStageSelect";
import { LeadFormButton, type LeadInitial } from "@/components/dashboard/LeadFormButton";
import { DeleteLeadButton } from "@/components/dashboard/DeleteLeadButton";
import { LogActivityForm } from "@/components/dashboard/LogActivityForm";
import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import { LEAD_STAGE_LABEL, LEAD_SOURCE_LABEL } from "@/lib/constants";
import { relativeDate } from "@/lib/format";

const stageLabel = (s: string) => LEAD_STAGE_LABEL[s as keyof typeof LEAD_STAGE_LABEL] ?? s;

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getMyAgent();
  const data = await getLeadDetail(id);
  if (!data) notFound();
  const { lead, activities } = data;
  const [listings, projects] = await Promise.all([
    getAgentListings(agent!.id as string),
    getAgentProjects(agent!.id as string),
  ]);
  const listingOpts = listings.map((l) => ({ id: l.id, title: l.title }));
  const projectOpts = projects.map((p) => ({ id: p.id, title: p.title }));

  const stage = lead.stage as string;
  const phone = lead.phone as string | null;
  const lastActivity = lead.last_activity_at as string | null;

  const leadInitial: LeadInitial = {
    id: lead.id as string,
    name: lead.name as string,
    phone: lead.phone as string | null,
    source: lead.source as string,
    stage,
    score: (lead.score as number | null) ?? null,
    note: (lead.note as string | null) ?? null,
    listing_id: (lead.listing_id as string | null) ?? null,
    project_id: (lead.project_id as string | null) ?? null,
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Link href="/agent/leads" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Лид (CRM)
      </Link>

      {/* Толгой */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">{lead.name as string}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {phone && (
              <a href={`tel:${phone}`} className="flex items-center gap-1 text-brand-600 hover:underline">
                <Phone className="size-4" /> {phone}
              </a>
            )}
            {lead.listing && (
              <Link href={`/listings/${lead.listing.id}`} className="flex items-center gap-1 hover:underline">
                <Building2 className="size-4" /> {lead.listing.title}
              </Link>
            )}
            {lead.project && (
              <Link href={`/agent/projects/${lead.project.id}`} className="flex items-center gap-1 text-brand-600 hover:underline">
                <FolderKanban className="size-4" /> {lead.project.title}
              </Link>
            )}
            {lastActivity && (
              <span className="flex items-center gap-1">
                <Clock className="size-4" /> Сүүлд: {relativeDate(lastActivity)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lead.score != null && (
            <Badge tone="brand">Оноо {lead.score as number}</Badge>
          )}
          <Badge tone="neutral">{stageLabel(stage)}</Badge>
          <LeadFormButton mode="edit" listings={listingOpts} projects={projectOpts} initial={leadInitial} />
          <DeleteLeadButton id={lead.id as string} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {/* Зүүн: шат + хураангуй */}
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-3">
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted">Шат солих</span>
                <LeadStageSelect id={lead.id as string} stage={stage} />
              </div>
              {(lead.note as string | null) && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted">Тэмдэглэл</span>
                  <p className="whitespace-pre-wrap text-sm text-ink">{lead.note as string}</p>
                </div>
              )}
              <div className="text-xs text-muted">
                Эх сурвалж: {LEAD_SOURCE_LABEL[lead.source as keyof typeof LEAD_SOURCE_LABEL] ?? (lead.source as string) ?? "—"}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Баруун: лог нэмэх + түүх */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardBody>
              <h2 className="mb-3 font-bold text-ink">Дуудлага / тэмдэглэл бүртгэх</h2>
              <LogActivityForm leadId={lead.id as string} />
            </CardBody>
          </Card>

          <div>
            <h2 className="mb-3 font-bold text-ink">Харилцааны түүх ({activities.length})</h2>
            <ActivityTimeline items={activities} />
          </div>
        </div>
      </div>
    </div>
  );
}
