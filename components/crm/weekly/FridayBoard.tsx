import Link from "next/link";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { shortMNT } from "@/lib/format";
import { FRIDAY_PROGRAM, MOVE_KIND_LABEL, weeklyStatusLabel, type MoveKind } from "@/lib/constants-crm-weekly";
import { averageOf, formatMetricValue, weekConversions, WEEK_CONVERSION_STEPS } from "@/lib/crm/weekly-score";
import { sumBoard, type LostReasonCount, type WeekBoardRow } from "@/lib/queries-crm-weekly";
import { MetricTable } from "@/components/crm/weekly/MetricTable";
import { ScoreBadge } from "@/components/crm/weekly/ScoreCard";

/**
 * §6.24 / §9.6 Баасан гарагийн дүн шинжилгээ — багийн нэгдсэн харагдац:
 * төлөвлөгөө ба гүйцэтгэл, хөрвөлт, урсгалын хөдөлгөөн, хугацаа хэтэрсэн
 * эргэн холбогдолт, алдсан шалтгаан, орлого, оноо. Бүх тоо CRM-ээс.
 */
export function FridayBoard({
  rows,
  lostReasons,
  detailBase,
}: {
  rows: WeekBoardRow[];
  lostReasons: LostReasonCount[];
  detailBase: string;
}) {
  if (!rows.length) {
    return <EmptyState title="Дүн шинжилгээ хийх агент алга" description="Энэ хүрээнд борлуулагч агент бүртгэгдээгүй байна." />;
  }
  const totalActual = sumBoard(rows, "actuals");
  const totalTarget = sumBoard(rows, "targets");
  const teamConv = weekConversions(totalActual);
  const moveKinds = Object.keys(MOVE_KIND_LABEL) as MoveKind[];
  const pending = rows.filter((r) => r.plan?.review_status !== "submitted" && r.plan?.review_status !== "approved");

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <h2 className="mb-2 text-sm font-semibold text-ink">Хөтөлбөр ба гаралт</h2>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {FRIDAY_PROGRAM.map((p, i) => (
              <p key={p.section} className="text-sm text-ink">
                <span className="tabular-nums text-muted">{i + 1}.</span> {p.section} <span className="text-muted">→ {p.output}</span>
              </p>
            ))}
          </div>
          {pending.length ? (
            <p className="mt-3 text-xs text-amber-700">
              Дүн шинжилгээгээ илгээгээгүй: {pending.map((r) => r.agent.full_name).join(", ")}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="mb-2 text-sm font-semibold text-ink">Төлөвлөгөө ба гүйцэтгэл (баг)</h2>
            <MetricTable actuals={totalActual} targets={totalTarget} filter="review" groupByTier={false} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="mb-2 text-sm font-semibold text-ink">Үнэлгээний оноо</h2>
            <ul className="space-y-1.5">
              {[...rows]
                .sort((a, b) => (b.storedTotal ?? b.score.total) - (a.storedTotal ?? a.score.total))
                .map((r) => (
                  <li key={r.agent.profile_id} className="flex items-center gap-2 text-sm">
                    {r.plan ? (
                      <Link href={`${detailBase}/${r.plan.id}`} className="truncate font-medium text-brand-700 hover:underline">
                        {r.agent.full_name}
                      </Link>
                    ) : (
                      <span className="truncate font-medium text-ink">{r.agent.full_name}</span>
                    )}
                    {r.plan?.review_status ? (
                      <Badge tone={weeklyStatusLabel(r.plan.review_status).tone}>{weeklyStatusLabel(r.plan.review_status).label}</Badge>
                    ) : null}
                    <ScoreBadge total={r.storedTotal ?? r.score.total} scored={r.scored} className="ml-auto" />
                  </li>
                ))}
            </ul>
            <p className="mt-2 text-xs text-subtle">
              Багийн дундаж: {averageOf(rows.filter((r) => r.scored).map((r) => r.storedTotal ?? r.score.total)) ?? "—"}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <h2 className="mb-2 text-sm font-semibold text-ink">Шатлал ба урсгалын хөдөлгөөн</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-2 font-medium">Агент</th>
                  {WEEK_CONVERSION_STEPS.map((s) => (
                    <th key={s.label} className="px-2 py-2 text-right font-medium">
                      {s.label}
                    </th>
                  ))}
                  {moveKinds.map((k) => (
                    <th key={k} className="px-2 py-2 text-right font-medium">
                      {MOVE_KIND_LABEL[k].label}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-medium">Хугацаа хэтэрсэн</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const conv = weekConversions(r.actuals);
                  return (
                    <tr key={r.agent.profile_id} className="border-b border-line/60 last:border-0">
                      <td className="py-1.5 pr-2 font-medium text-ink">{r.agent.full_name}</td>
                      {conv.map((c) => (
                        <td key={c.label} className="px-2 py-1.5 text-right tabular-nums">
                          {c.pct == null ? "—" : `${c.pct}%`}
                        </td>
                      ))}
                      {moveKinds.map((k) => (
                        <td key={k} className="px-2 py-1.5 text-right tabular-nums">
                          {r.moves[k]}
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.actuals.overdue_followups ?? 0}</td>
                    </tr>
                  );
                })}
                <tr className="bg-surface-2/60 font-semibold">
                  <td className="py-1.5 pr-2 text-ink">Баг</td>
                  {teamConv.map((c) => (
                    <td key={c.label} className="px-2 py-1.5 text-right tabular-nums">
                      {c.pct == null ? "—" : `${c.pct}%`}
                    </td>
                  ))}
                  {moveKinds.map((k) => (
                    <td key={k} className="px-2 py-1.5 text-right tabular-nums">
                      {rows.reduce((s, r) => s + r.moves[k], 0)}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums">{totalActual.overdue_followups ?? 0}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="mb-2 text-sm font-semibold text-ink">Алдсан шалтгаан</h2>
            {lostReasons.length === 0 ? (
              <p className="text-sm text-muted">Энэ долоо хоногт амжилтгүй хаагдсан хэлцэл алга.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {lostReasons.map((l, i) => (
                  <li key={l.label} className="flex items-center gap-2">
                    <span className="text-ink">{l.label}</span>
                    {i === 0 ? <Badge tone="rose">Давамгай</Badge> : null}
                    <span className="ml-auto tabular-nums font-semibold">{l.cnt}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="mb-2 text-sm font-semibold text-ink">Хаалт, орлого</h2>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Баталгаажсан орлого" value={formatMetricValue("revenue", totalActual.revenue, shortMNT)} />
              <Stat label="Хаасан хэлцэл" value={formatMetricValue("closed_deals", totalActual.closed_deals, shortMNT)} />
              <Stat
                label="Хүлээгдэж буй цэвэр орлого"
                value={formatMetricValue("expected_net_fee", totalActual.expected_net_fee, shortMNT)}
              />
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-base font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}
