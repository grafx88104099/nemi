import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Crown, Flame, Home, KanbanSquare, UsersRound } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CRM_LIFECYCLE_LABEL, LEAD_GRADE_LABEL, OPP_STATE_LABEL } from "@/lib/constants-crm";
import type { MonitorMetrics } from "@/lib/crm/team-monitor";
import { fmtDateNum, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  TEAM_MEMBER_LEADS_LIMIT,
  getTeamMemberDetail,
  getTeamMonitor,
  type TeamMemberLead,
  type TeamMemberOpportunity,
  type TeamMonitorMember,
} from "@/lib/queries-crm-team-monitor";

type Warn = "rose" | "amber";

const METRICS: { key: keyof MonitorMetrics; label: string; warn?: Warn }[] = [
  { key: "registeredWeek", label: "Энэ 7 хоногт бүртгэсэн" },
  { key: "registeredMonth", label: "Энэ сард бүртгэсэн" },
  { key: "openOwned", label: "Нээлттэй сэжим" },
  { key: "newUncontacted", label: "Шинэ, холбогдоогүй", warn: "amber" },
  { key: "firstContactOverdue", label: "Эхний холболт хэтэрсэн", warn: "rose" },
  { key: "nextStepOverdue", label: "Дараагийн үйлдэл хэтэрсэн", warn: "rose" },
  { key: "noNextStep", label: "Дараагийн үйлдэлгүй", warn: "amber" },
  { key: "openOpps", label: "Нээлттэй боломж" },
  { key: "wonOpps", label: OPP_STATE_LABEL.won.label },
];

function metricClass(value: number, warn?: Warn): string {
  if (value === 0) return "text-subtle";
  if (warn === "rose") return "font-semibold text-rose-600";
  if (warn === "amber") return "font-semibold text-amber-700";
  return "text-ink";
}

const lastActivityText = (at: string | null) => (at ? fmtDateTime(at) : "Бүртгэлгүй");

function MemberName({ member, href }: { member: TeamMonitorMember; href: string }) {
  return (
    <Link href={href} className="group flex min-h-11 min-w-0 items-center gap-2.5">
      <Avatar initials={member.initials} src={member.avatarSrc} size="sm" className="shrink-0" />
      <span className="min-w-0 break-words font-semibold text-brand-700 group-hover:underline">{member.name}</span>
      {member.isLead ? (
        <Badge tone="brand" className="shrink-0">
          <Crown aria-hidden /> Ахлагч
        </Badge>
      ) : null}
    </Link>
  );
}

/** Гишүүний эсвэл баг, оффисын нийт үзүүлэлт. */
export function MetricTiles({ values, wide = false }: { values: MonitorMetrics; wide?: boolean }) {
  return (
    <dl className={wide ? "grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-9" : "grid grid-cols-3 gap-2"}>
      {METRICS.map((m) => (
        <div key={m.key} className="flex min-w-0 flex-col-reverse justify-end rounded-lg bg-surface-2 px-2 py-1.5">
          <dt className="break-words text-[11px] leading-tight text-muted">{m.label}</dt>
          <dd className={`text-lg tabular-nums ${metricClass(values[m.key], m.warn)}`}>{values[m.key]}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Хэвтээ гүйлгэхэд нэрийн багана харагдсаар байна. border-collapse үед хүрээ нүдтэй хамт
 * наалддаггүй тул баруун зураасыг inset сүүдрээр зурна.
 */
const STICKY_NAME_CELL = "sticky left-0 z-10 bg-surface shadow-[inset_-1px_0_0_var(--color-line)]";

/** Гишүүн бүр нэг мөр; өргөн тул өөрийн хүрээнд хэвтээ гүйлгэнэ, нэрийн багана наалттай. */
export function MembersTable({
  members,
  memberHref,
  className,
}: {
  members: TeamMonitorMember[];
  memberHref: (m: TeamMonitorMember) => string;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto overscroll-x-contain rounded-2xl border border-line bg-surface", className)}>
      <table className="w-full min-w-[60rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th scope="col" className={cn("px-3 py-2 align-bottom font-medium", STICKY_NAME_CELL)}>
              Гишүүн
            </th>
            {METRICS.map((m) => (
              <th key={m.key} scope="col" className="w-20 px-2 py-2 text-right align-bottom font-medium">
                {m.label}
              </th>
            ))}
            <th scope="col" className="w-32 px-3 py-2 text-right align-bottom font-medium">
              Сүүлийн үйл ажиллагаа
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.profileId} className="border-b border-line/60 last:border-0">
              <td className={cn("px-3 py-1.5", STICKY_NAME_CELL)}>
                <MemberName member={member} href={memberHref(member)} />
              </td>
              {METRICS.map((m) => (
                <td key={m.key} className={`px-2 py-1.5 text-right tabular-nums ${metricClass(member[m.key], m.warn)}`}>
                  {member[m.key]}
                </td>
              ))}
              <td className="whitespace-nowrap px-3 py-1.5 text-right text-xs text-muted">
                {lastActivityText(member.lastActivityAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MembersSummary({ members, monitorPath }: { members: TeamMonitorMember[]; monitorPath: string }) {
  const memberHref = (m: TeamMonitorMember) => `${monitorPath}?member=${m.profileId}`;
  return (
    <>
      <MembersTable members={members} memberHref={memberHref} className="mt-4 hidden lg:block" />

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
        {members.map((member) => (
          <Card key={member.profileId}>
            <CardBody className="p-4">
              <MemberName member={member} href={memberHref(member)} />
              <p className="mt-1 text-xs text-muted">Сүүлийн үйл ажиллагаа: {lastActivityText(member.lastActivityAt)}</p>
              <div className="mt-3">
                <MetricTiles values={member} />
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}

function NextStep({ text, date, overdue }: { text: string | null; date: string | null; overdue: boolean }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-x-1">
      <dt className="text-muted">Дараагийн үйлдэл:</dt>
      <dd className={`min-w-0 break-words ${overdue ? "font-semibold text-rose-600" : "text-ink"}`}>
        {text || date ? [text, date ? fmtDateNum(date) : null].filter(Boolean).join(" · ") : "Төлөвлөөгүй"}
      </dd>
    </div>
  );
}

function LeadItem({ lead, basePath }: { lead: TeamMemberLead; basePath: string }) {
  const status = CRM_LIFECYCLE_LABEL[lead.status];
  const grade = lead.grade ? LEAD_GRADE_LABEL[lead.grade] : null;
  return (
    <li className="py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Link href={`${basePath}/leads/${lead.id}`} className="min-w-0 break-words font-semibold text-brand-700 hover:underline">
          {lead.contactName}
        </Link>
        <Badge tone={status.tone}>{status.label}</Badge>
        {grade ? <Badge tone={grade.tone}>{grade.label}</Badge> : null}
      </div>
      {!lead.ownedByMember ? (
        <p className="mt-0.5 text-xs text-muted">Бүртгэсэн · Эзэмшигч: {lead.ownerName ?? "хуваарилагдаагүй"}</p>
      ) : null}
      {lead.listingTitle ? (
        <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted">
          <Home className="size-3 shrink-0" aria-hidden />
          <span className="truncate" title={lead.listingTitle}>
            {lead.listingTitle}
          </span>
        </p>
      ) : null}
      <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
        <div className="flex min-w-0 flex-wrap gap-x-1">
          <dt className="text-muted">Сүүлийн холболт:</dt>
          <dd className="text-ink">{lead.lastContactAt ? fmtDateTime(lead.lastContactAt) : "Холбогдоогүй"}</dd>
        </div>
        <NextStep text={lead.nextStep} date={lead.nextStepDate} overdue={lead.nextStepOverdue} />
      </dl>
    </li>
  );
}

function OpportunityItem({ opp, oppBase }: { opp: TeamMemberOpportunity; oppBase: string }) {
  return (
    <li className="py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Link href={`${oppBase}/${opp.id}`} className="min-w-0 break-words font-semibold text-brand-700 hover:underline">
          {opp.contactName}
        </Link>
        {opp.stageName ? <Badge tone="blue">{opp.stageName}</Badge> : null}
      </div>
      {opp.pipelineName ? <p className="mt-0.5 text-xs text-muted">{opp.pipelineName}</p> : null}
      <dl className="mt-1 text-xs">
        <NextStep text={opp.nextStep} date={opp.nextStepDate} overdue={opp.nextStepOverdue} />
      </dl>
    </li>
  );
}

export const ReadError = () => (
  <EmptyState
    className="mt-4"
    icon={AlertTriangle}
    title="Мэдээллийг уншиж чадсангүй"
    description="Тоо буруу харагдахаас сэргийлж нуулаа. Хуудсаа шинэчилж дахин оролдоно уу."
  />
);

/** Нэг гишүүний сэжим, нээлттэй боломж (?member=). Дуудах хуудас эрхийг шалгана. */
export async function TeamMemberView({
  member,
  contextLabel,
  metricsUnavailable,
  basePath,
  backHref,
  backLabel,
}: {
  member: TeamMonitorMember;
  /** Багийн нэр эсвэл «Багт хуваарилагдаагүй». */
  contextLabel: string;
  metricsUnavailable: boolean;
  basePath: string;
  backHref: string;
  backLabel: string;
}) {
  const detail = await getTeamMemberDetail(member.profileId);
  const oppBase = basePath.startsWith("/office") ? `${basePath}/deals` : `${basePath}/pipeline`;
  return (
    <div className="min-w-0">
      <BackLink href={backHref} label={backLabel} />
      <div className="flex min-w-0 items-center gap-3">
        <Avatar initials={member.initials} src={member.avatarSrc} size="lg" className="shrink-0" />
        <div className="min-w-0">
          <h1 className="flex min-w-0 flex-wrap items-center gap-x-2 text-2xl font-extrabold text-ink">
            <span className="min-w-0 break-words">{member.name}</span>
            {member.isLead ? (
              <Badge tone="brand">
                <Crown aria-hidden /> Ахлагч
              </Badge>
            ) : null}
          </h1>
          <p className="break-words text-sm text-muted">
            {contextLabel} · Сүүлийн үйл ажиллагаа: {lastActivityText(member.lastActivityAt)}
          </p>
        </div>
      </div>

      {metricsUnavailable ? (
        <ReadError />
      ) : (
        <div className="mt-4">
          <MetricTiles values={member} wide />
        </div>
      )}

      {detail.unavailable ? (
        <ReadError />
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card className="min-w-0">
            <CardBody className="p-4 sm:p-5">
              <h2 className="text-sm font-bold text-ink">Сэжим ({detail.leads.length})</h2>
              {detail.leads.length === 0 ? (
                <EmptyState
                  compact
                  icon={Flame}
                  title="Сэжим алга"
                  description="Энэ гишүүний бүртгэсэн эсвэл эзэмшдэг сэжим энд харагдана."
                />
              ) : (
                <ul className="divide-y divide-line">
                  {detail.leads.map((lead) => (
                    <LeadItem key={lead.id} lead={lead} basePath={basePath} />
                  ))}
                </ul>
              )}
              {detail.leadsTruncated ? (
                <p className="mt-2 text-xs text-subtle">Хамгийн сүүлийн {TEAM_MEMBER_LEADS_LIMIT} сэжим харагдаж байна.</p>
              ) : null}
            </CardBody>
          </Card>
          <Card className="min-w-0">
            <CardBody className="p-4 sm:p-5">
              <h2 className="text-sm font-bold text-ink">Нээлттэй боломж ({detail.opportunities.length})</h2>
              {detail.opportunities.length === 0 ? (
                <EmptyState
                  compact
                  icon={KanbanSquare}
                  title="Нээлттэй боломж алга"
                  description="Энэ гишүүний эзэмшдэг нээлттэй боломж энд харагдана."
                />
              ) : (
                <ul className="divide-y divide-line">
                  {detail.opportunities.map((opp) => (
                    <OpportunityItem key={opp.id} opp={opp} oppBase={oppBase} />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

/** Сэжим харах дүргүй хэрэглэгчид тоог 0 гэж харуулахын оронд. */
export function TeamProgressNoAccess({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <EmptyState
        title="Багийн явцыг харах эрх алга"
        description="Гишүүдийн сэжим харахад CRM-д «Борлуулалт хариуцсан захирал», «Үйл ажиллагаа-ЧМТ» эсвэл «CEO» дүр шаардлагатай."
        action={{ label: backLabel, href: backHref }}
      />
    </div>
  );
}

/**
 * Багийн гишүүдийн тойм ба нэг гишүүний дэлгэрэнгүй (?member=). Дуудах хуудас
 * эрхийг шалгана; гишүүн нь энэ багийнх биш бол тойм харуулна.
 */
export async function TeamMonitor({
  teamId,
  memberId,
  basePath,
  monitorPath,
  backHref,
  backLabel,
  emptyHint,
}: {
  teamId: string;
  memberId?: string;
  basePath: string;
  /** ?member= холбоосны суурь — энэ хуудасны зам. */
  monitorPath: string;
  backHref: string;
  backLabel: string;
  emptyHint: string;
}) {
  const data = await getTeamMonitor(teamId);
  if (!data) notFound();

  const member = data.members.find((m) => m.profileId === memberId) ?? null;
  if (member) {
    return (
      <TeamMemberView
        member={member}
        contextLabel={data.team.name}
        metricsUnavailable={data.unavailable}
        basePath={basePath}
        backHref={monitorPath}
        backLabel="Бүх гишүүд"
      />
    );
  }

  return (
    <div className="min-w-0">
      <BackLink href={backHref} label={backLabel} />
      <h1 className="break-words text-2xl font-extrabold text-ink">{data.team.name}</h1>
      <p className="mt-1 text-sm text-muted">
        Гишүүн бүрийн бүртгэсэн сэжим, холболт, дараагийн үйлдэл, боломж. Тоо CRM-ийн бүртгэлээс автоматаар гарна.
      </p>
      {data.unavailable ? (
        <ReadError />
      ) : data.members.length === 0 ? (
        <EmptyState className="mt-4" icon={UsersRound} title="Энэ багт гишүүн алга" description={emptyHint} />
      ) : (
        <>
          <MembersSummary members={data.members} monitorPath={monitorPath} />
          {data.truncated ? <p className="mt-2 text-xs text-subtle">Мөр маш олон тул зарим тоо дутуу байж болзошгүй.</p> : null}
        </>
      )}
    </div>
  );
}
