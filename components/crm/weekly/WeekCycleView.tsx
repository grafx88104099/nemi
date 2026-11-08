import Link from "next/link";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { shortMNT } from "@/lib/format";
import { SCORE_COMPONENTS, SCORE_COMPONENT_LABEL, MEETING_KIND_LABEL } from "@/lib/constants-crm-weekly";
import { formatMetricValue } from "@/lib/crm/weekly-score";
import { addWeeks, currentWeekStart, slotLabel, weekEnd, weekPhase } from "@/lib/crm/week";
import {
  canFacilitate,
  getLostReasonsForRange,
  getMeeting,
  getMeetingAgenda,
  getTeamsAndBranches,
  getWeekBoard,
  type WeekFilters,
} from "@/lib/queries-crm-weekly";
import { WeekNav } from "@/components/crm/weekly/WeekNav";
import { TeamWeekTable } from "@/components/crm/weekly/TeamWeekTable";
import { FridayBoard } from "@/components/crm/weekly/FridayBoard";
import { MeetingMode } from "@/components/crm/weekly/MeetingMode";
import { ScoreBadge } from "@/components/crm/weekly/ScoreCard";

export const WEEK_TABS = [
  { key: "plans", label: "Төлөвлөгөө" },
  { key: "meeting", label: "Даваагийн хурал" },
  { key: "friday", label: "Баасан гарагийн дүн шинжилгээ" },
  { key: "scores", label: "Үнэлгээ" },
] as const;
export type WeekTab = (typeof WEEK_TABS)[number]["key"];

export function weekTab(raw: string | undefined): WeekTab {
  return (WEEK_TABS.find((t) => t.key === raw)?.key ?? "plans") as WeekTab;
}

function qs(params: Record<string, string | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * Багийн ахлагч / удирдлагын долоо хоногийн мөчлөг (§5, §6.20, §6.24, §6.25,
 * §6.30, §9.5, §9.6): картын төлөв ба батлалт, Даваагийн хурлын горим, Баасан
 * гарагийн дүн шинжилгээ, үнэлгээ. Агент/баг/салбараар шүүнэ (§9.5).
 */
export async function WeekCycleView({
  basePath,
  week,
  tab,
  filters,
  roles,
  showFilters,
  meetingTeamId,
}: {
  basePath: string;
  week: string;
  tab: WeekTab;
  filters: WeekFilters;
  roles: string[];
  showFilters: boolean;
  meetingTeamId: string | null;
}) {
  const fq = { team: filters.teamId ?? null, branch: filters.branchId ?? null, agent: filters.agentId ?? null };
  const href = (w: string, t: WeekTab = tab) => `${basePath}${qs({ week: w, tab: t, ...fq })}`;
  const options = showFilters ? await getTeamsAndBranches() : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <WeekNavServer week={week} prevHref={href(addWeeks(week, -1))} nextHref={href(addWeeks(week, 1))} currentHref={href(currentWeekStart())} />
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Мөчлөгийн хэсгүүд">
        {WEEK_TABS.map((t) => (
          <Link
            key={t.key}
            href={href(week, t.key)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.key ? "border-brand-500 text-brand-700" : "border-transparent text-muted hover:text-ink"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {showFilters && options ? (
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="week" value={week} />
          <input type="hidden" name="tab" value={tab} />
          <label className="text-xs text-muted">
            Салбар
            <Select name="branch" defaultValue={filters.branchId ?? ""} className="mt-1 w-48">
              <option value="">Бүх салбар</option>
              {options.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs text-muted">
            Баг
            <Select name="team" defaultValue={filters.teamId ?? ""} className="mt-1 w-48">
              <option value="">Бүх баг</option>
              {options.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </label>
          <Button type="submit" size="sm" variant="outline">
            Шүүх
          </Button>
        </form>
      ) : null}

      {tab === "plans" ? (
        <PlansTab week={week} filters={filters} detailBase={basePath} />
      ) : tab === "meeting" ? (
        <MeetingTab week={week} filters={filters} detailBase={basePath} roles={roles} teamId={meetingTeamId} />
      ) : tab === "friday" ? (
        <FridayTab week={week} filters={filters} detailBase={basePath} />
      ) : (
        <ScoresTab week={week} filters={filters} detailBase={basePath} />
      )}
    </div>
  );
}

function WeekNavServer({ week, prevHref, nextHref, currentHref }: { week: string; prevHref: string; nextHref: string; currentHref: string }) {
  return <WeekNav week={week} phase={weekPhase(week)} prevHref={prevHref} nextHref={nextHref} currentHref={currentHref} />;
}

function Unavailable() {
  return (
    <EmptyState
      title="Долоо хоногийн мөчлөг хараахан идэвхжээгүй"
      description="Өгөгдлийн сангийн шинэчлэл тавигдсаны дараа энэ хэсэг ажиллана. Системийн админд хандана уу."
    />
  );
}

async function PlansTab({ week, filters, detailBase }: { week: string; filters: WeekFilters; detailBase: string }) {
  const board = await getWeekBoard(week, filters, { withPrev: true });
  if (board.unavailable) return <Unavailable />;
  const s = board.settings.cycle.schedule;
  const submitted = board.rows.filter((r) => r.plan && r.plan.status !== "draft" && r.plan.status !== "returned").length;
  const queue = board.rows.filter((r) => r.plan?.status === "submitted" || r.plan?.review_status === "submitted");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Картаа илгээсэн" value={`${submitted}/${board.rows.length}`} />
        <Tile label="Батлахыг хүлээж буй" value={String(queue.length)} tone={queue.length ? "amber" : undefined} />
        <Tile label={MEETING_KIND_LABEL.monday} value={slotLabel(s.meeting)} />
      </div>
      {queue.length ? (
        <Card>
          <CardBody>
            <h2 className="mb-2 text-sm font-semibold text-ink">Батлах дараалал</h2>
            <ul className="space-y-1.5 text-sm">
              {queue.map((r) => (
                <li key={r.agent.profile_id} className="flex flex-wrap items-center gap-2">
                  <Link href={`${detailBase}/${r.plan!.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.agent.full_name}
                  </Link>
                  {r.plan?.status === "submitted" ? <Badge tone="blue">Карт</Badge> : null}
                  {r.plan?.review_status === "submitted" ? <Badge tone="blue">Дүн шинжилгээ</Badge> : null}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardBody>
          <TeamWeekTable rows={board.rows} detailBase={detailBase} />
        </CardBody>
      </Card>
    </div>
  );
}

async function MeetingTab({
  week,
  filters,
  detailBase,
  roles,
  teamId,
}: {
  week: string;
  filters: WeekFilters;
  detailBase: string;
  roles: string[];
  teamId: string | null;
}) {
  const fmt = (code: Parameters<typeof formatMetricValue>[0], v: number | null | undefined) => formatMetricValue(code, v, shortMNT);
  const [agenda, meeting] = await Promise.all([
    getMeetingAgenda(week, filters, detailBase, fmt),
    getMeeting("monday", week, teamId),
  ]);
  if (agenda.board.unavailable) return <Unavailable />;
  const c = agenda.board.settings.cycle;
  return (
    <MeetingMode
      kind="monday"
      week={week}
      teamId={teamId}
      meeting={
        meeting
          ? {
              id: meeting.id,
              status: meeting.status,
              started_at: meeting.started_at,
              decisions: meeting.decisions.map((d) => ({
                id: d.id,
                kind: d.kind,
                text: d.text,
                agent_id: d.agent_id,
                owner_name: d.owner_name,
                due_on: d.due_on,
                status: d.status,
              })),
            }
          : null
      }
      agents={agenda.agents}
      agenda={c.agenda}
      slotMin={c.agentSlotMin}
      slotMax={c.agentSlotMax}
      canFacilitate={canFacilitate(roles)}
      ownerOptions={agenda.ownerOptions}
      teamNumbers={agenda.teamNumbers}
    />
  );
}

async function FridayTab({ week, filters, detailBase }: { week: string; filters: WeekFilters; detailBase: string }) {
  const board = await getWeekBoard(week, filters);
  if (board.unavailable) return <Unavailable />;
  const lost = await getLostReasonsForRange(week, weekEnd(week), board.rows.map((r) => r.agent.profile_id));
  return <FridayBoard rows={board.rows} lostReasons={lost} detailBase={detailBase} />;
}

async function ScoresTab({ week, filters, detailBase }: { week: string; filters: WeekFilters; detailBase: string }) {
  const board = await getWeekBoard(week, filters, { withPrev: true });
  if (board.unavailable) return <Unavailable />;
  if (!board.rows.length) return <EmptyState title="Үнэлэх агент алга" />;
  const w = board.settings.weights;
  return (
    <Card>
      <CardBody>
        <p className="mb-3 text-xs text-subtle">
          Жин: {SCORE_COMPONENTS.map((k) => `${SCORE_COMPONENT_LABEL[k]} ${w[k]}`).join(" · ")}. Зөвхөн борлуулалтын урсгалын
          идэвхтэй агентыг үнэлнэ; гүйцэтгэл CRM-ээс, гараар засагдахгүй.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-2 font-medium">Агент</th>
                {SCORE_COMPONENTS.map((k) => (
                  <th key={k} className="px-2 py-2 text-right font-medium">
                    {SCORE_COMPONENT_LABEL[k]}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-medium">Нийт</th>
                <th className="px-2 py-2 text-right font-medium">Өмнөх</th>
              </tr>
            </thead>
            <tbody>
              {[...board.rows]
                .sort((a, b) => (b.storedTotal ?? b.score.total) - (a.storedTotal ?? a.score.total))
                .map((r) => (
                  <tr key={r.agent.profile_id} className="border-b border-line/60 last:border-0">
                    <td className="py-1.5 pr-2">
                      {r.plan ? (
                        <Link href={`${detailBase}/${r.plan.id}`} className="font-medium text-brand-700 hover:underline">
                          {r.agent.full_name}
                        </Link>
                      ) : (
                        <span className="font-medium text-ink">{r.agent.full_name}</span>
                      )}
                    </td>
                    {r.score.components.map((c) => (
                      <td key={c.key} className="px-2 py-1.5 text-right tabular-nums">
                        {c.points == null ? <span className="text-subtle">—</span> : c.points}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right">
                      <ScoreBadge total={r.storedTotal ?? r.score.total} scored={r.scored} />
                      <span className="ml-1 text-[10px] text-subtle">
                        {r.scoreKind === "final" ? "эцсийн" : r.scoreKind === "preliminary" ? "урьдчилсан" : "одоогийн"}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted">{r.prev?.score ?? "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  return (
    <div className={cn("rounded-2xl border p-3", tone === "amber" ? "border-amber-200 bg-amber-50" : "border-line bg-surface")}>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}
