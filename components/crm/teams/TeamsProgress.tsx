import Link from "next/link";
import { ChevronRight, Crown, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/ui/back-link";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MembersTable, MetricTiles, ReadError, TeamMemberView } from "@/components/crm/teams/TeamMonitor";
import type { ProgressGroup } from "@/lib/crm/team-monitor";
import { getOfficeTeamsProgress, type TeamMonitorMember } from "@/lib/queries-crm-team-monitor";

const UNASSIGNED_LABEL = "Багт хуваарилагдаагүй";
const SECTION_BODY = "p-4 sm:p-5";

/** Хоосон бүлгийн тоог 0 гэж харуулахгүй — гишүүнгүй гэж хэлнэ. */
function GroupBody({
  group,
  memberHref,
  emptyTitle,
  emptyHint,
}: {
  group: ProgressGroup<TeamMonitorMember>;
  memberHref: (m: TeamMonitorMember) => string;
  emptyTitle: string;
  emptyHint?: string;
}) {
  if (group.members.length === 0) {
    return <EmptyState compact className="mt-2" icon={UsersRound} title={emptyTitle} description={emptyHint} />;
  }
  return (
    <>
      <div className="mt-3">
        <MetricTiles values={group.totals} wide />
      </div>
      <MembersTable members={group.members} memberHref={memberHref} className="mt-3 rounded-xl" />
    </>
  );
}

/**
 * Оффисын бүх багийн явц: оффисын нийт, баг бүрийн нийт ба гишүүд, эцэст нь багт
 * хуваарилагдаагүй агентууд. ?member= — тойм дахь аль ч гишүүний дэлгэрэнгүй (багт
 * ороогүй агентын хувьд цорын ганц дэлгэрэнгүй). Дуудах хуудас эрхийг шалгана.
 */
export async function TeamsProgress({
  officeId,
  memberId,
  basePath,
  teamsPath,
  progressPath,
  canManage,
}: {
  officeId: string;
  memberId?: string;
  basePath: string;
  /** Багийн хуудсууд: `${teamsPath}/[id]`. */
  teamsPath: string;
  /** Энэ хуудасны зам. */
  progressPath: string;
  /** Баг удирдах эрхтэй бол «Багууд» удирдлагын хуудас руу холбоно. */
  canManage: boolean;
}) {
  const data = await getOfficeTeamsProgress(officeId);
  const teamHref = (teamId: string) => `${teamsPath}/${teamId}`;

  if (memberId) {
    const section = data.teams.find((s) => s.members.some((m) => m.profileId === memberId));
    const member = (section?.members ?? data.unassigned.members).find((m) => m.profileId === memberId);
    if (member) {
      return (
        <TeamMemberView
          member={member}
          contextLabel={section?.team.name ?? UNASSIGNED_LABEL}
          metricsUnavailable={data.unavailable}
          basePath={basePath}
          backHref={progressPath}
          backLabel="Бүх багийн явц"
        />
      );
    }
  }

  return (
    <div className="min-w-0">
      {canManage ? <BackLink href={teamsPath} label="Багууд" /> : null}
      <h1 className="text-2xl font-extrabold text-ink">Бүх багийн явц</h1>
      <p className="mt-1 text-sm text-muted">
        Баг бүр болон багт хуваарилагдаагүй агентуудын бүртгэсэн сэжим, холболт, дараагийн үйлдэл, боломж. Тоо
        CRM-ийн бүртгэлээс автоматаар гарна.
      </p>

      {data.unavailable ? (
        <ReadError />
      ) : (
        <div className="mt-4 space-y-4">
          <Card>
            <CardBody className={SECTION_BODY}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="text-lg font-bold text-ink">Баг ба агентуудын нийт</h2>
                <p className="text-xs text-subtle">
                  {data.teams.length} баг · {data.memberCount} ажилтан, үүнээс {data.unassigned.members.length} нь багт
                  хуваарилагдаагүй
                </p>
              </div>
              <p className="mt-1 text-xs text-muted">
                Доорх багууд болон багт хуваарилагдаагүй агентуудын нийлбэр. Удирдлага, бусад ажилтны болон эзэмшигчгүй
                бүртгэл орохгүй.
              </p>
              {data.memberCount === 0 ? (
                <EmptyState compact className="mt-2" icon={UsersRound} title="Идэвхтэй агент алга" />
              ) : (
                <div className="mt-3">
                  <MetricTiles values={data.totals} wide />
                </div>
              )}
            </CardBody>
          </Card>

          {data.teams.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="Баг бүртгэгдээгүй"
              description="Баг үүсгэж агентуудаа хуваарилбал баг бүрийн явц энд харагдана."
              action={canManage ? { label: "Багууд", href: teamsPath } : undefined}
            />
          ) : null}

          {data.teams.map(({ team, lead, ...group }) => (
            <Card key={team.id}>
              <CardBody className={SECTION_BODY}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-lg font-bold text-ink">
                      <Link href={teamHref(team.id)} className="hover:text-brand-700 hover:underline">
                        {team.name}
                      </Link>
                    </h2>
                    <p className="text-xs text-subtle">
                      {[team.branchName, `${group.members.length} гишүүн`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ButtonLink href={teamHref(team.id)} size="sm" variant="secondary">
                    Багийн явц <ChevronRight className="size-4" aria-hidden />
                  </ButtonLink>
                </div>
                <div className="mt-2">
                  {lead ? (
                    <Badge tone="brand" className="max-w-full">
                      <Crown aria-hidden className="shrink-0" />
                      <span className="truncate">Ахлагч: {lead.name}</span>
                    </Badge>
                  ) : (
                    <Badge tone="amber">Ахлагч томилоогүй</Badge>
                  )}
                </div>
                <GroupBody
                  group={group}
                  memberHref={(m) => `${teamHref(team.id)}?member=${m.profileId}`}
                  emptyTitle="Энэ багт гишүүн алга"
                />
              </CardBody>
            </Card>
          ))}

          {/* Ажилтангүй үед «бүх агент хуваарилагдсан» гэж худал хэлэхгүй — дээд карт аль хэдийн хэлсэн. */}
          {data.memberCount > 0 ? (
            <Card>
              <CardBody className={SECTION_BODY}>
                <h2 className="text-lg font-bold text-ink">{UNASSIGNED_LABEL}</h2>
                <p className="text-xs text-subtle">{data.unassigned.members.length} агент · аль ч багт ороогүй</p>
                <GroupBody
                  group={data.unassigned}
                  memberHref={(m) => `${progressPath}?member=${m.profileId}`}
                  emptyTitle="Бүх агент багт хуваарилагдсан"
                />
              </CardBody>
            </Card>
          ) : null}

          {data.truncated ? <p className="text-xs text-subtle">Мөр маш олон тул зарим тоо дутуу байж болзошгүй.</p> : null}
        </div>
      )}
    </div>
  );
}
