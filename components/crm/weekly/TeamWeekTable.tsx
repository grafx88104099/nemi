import Link from "next/link";
import { AlertTriangle, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { shortMNT } from "@/lib/format";
import {
  ANOMALY_LABEL,
  WEEKLY_METRIC_BY_CODE,
  weeklyStatusLabel,
  type WeeklyMetricCode,
} from "@/lib/constants-crm-weekly";
import { formatMetricValue } from "@/lib/crm/weekly-score";
import type { WeekBoardRow } from "@/lib/queries-crm-weekly";
import { ScoreBadge } from "@/components/crm/weekly/ScoreCard";

const COLS: WeeklyMetricCode[] = ["meaningful_conversations", "qualified_leads", "showings", "offers", "closed_deals"];

/** Агент бүрийн карт, дүн шинжилгээний төлөв, гол тоо, оноо, «Анхаарах» дохио. */
export function TeamWeekTable({ rows, detailBase }: { rows: WeekBoardRow[]; detailBase: string }) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={Users}
        title="Энэ хүрээнд борлуулагч агент алга"
        description="Агент дүртэй идэвхтэй ажилтан энд харагдана. Шүүлтээ өөрчилж үзнэ үү."
      />
    );
  }
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-2 pr-2 font-medium">Агент</th>
              <th className="px-2 py-2 font-medium">Карт</th>
              <th className="px-2 py-2 font-medium">Дүн шинжилгээ</th>
              {COLS.map((c) => (
                <th key={c} className="px-2 py-2 text-right font-medium">
                  {WEEKLY_METRIC_BY_CODE[c].label}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium">Оноо</th>
              <th className="px-2 py-2 font-medium">Анхаарах</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.agent.profile_id} className="border-b border-line/60 align-top last:border-0">
                <td className="py-2 pr-2">
                  {r.plan ? (
                    <Link href={`${detailBase}/${r.plan.id}`} className="font-medium text-brand-700 hover:underline">
                      {r.agent.full_name}
                    </Link>
                  ) : (
                    <span className="font-medium text-ink">{r.agent.full_name}</span>
                  )}
                  <span className="block text-xs text-muted">{r.agent.team_name ?? r.agent.branch_name ?? "Баггүй"}</span>
                </td>
                <td className="px-2 py-2">
                  <StatusBadge status={r.plan?.status ?? null} empty="Бөглөөгүй" />
                </td>
                <td className="px-2 py-2">
                  <StatusBadge status={r.plan?.review_status ?? null} empty="Хийгээгүй" />
                </td>
                {COLS.map((c) => (
                  <td key={c} className="px-2 py-2 text-right tabular-nums">
                    {formatMetricValue(c, r.actuals[c], shortMNT)}
                    <span className="text-xs text-subtle">/{formatMetricValue(c, r.targets[c], shortMNT)}</span>
                  </td>
                ))}
                <td className="px-2 py-2 text-right">
                  <ScoreBadge total={r.storedTotal ?? r.score.total} scored={r.scored} />
                </td>
                <td className="px-2 py-2">
                  <Anomalies list={r.anomalies} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 md:hidden">
        {rows.map((r) => (
          <div key={r.agent.profile_id} className="rounded-xl border border-line bg-surface p-3">
            <div className="flex items-center gap-2">
              {r.plan ? (
                <Link href={`${detailBase}/${r.plan.id}`} className="font-medium text-brand-700">
                  {r.agent.full_name}
                </Link>
              ) : (
                <span className="font-medium text-ink">{r.agent.full_name}</span>
              )}
              <ScoreBadge total={r.storedTotal ?? r.score.total} scored={r.scored} className="ml-auto" />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <StatusBadge status={r.plan?.status ?? null} empty="Карт бөглөөгүй" prefix="Карт" />
              <StatusBadge status={r.plan?.review_status ?? null} empty="Дүн шинжилгээгүй" prefix="Дүн" />
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {COLS.map(
                (c) =>
                  `${WEEKLY_METRIC_BY_CODE[c].label} ${formatMetricValue(c, r.actuals[c], shortMNT)}/${formatMetricValue(c, r.targets[c], shortMNT)}`
              ).join(" · ")}
            </p>
            <div className="mt-1.5">
              <Anomalies list={r.anomalies} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function StatusBadge({ status, empty, prefix }: { status: string | null; empty: string; prefix?: string }) {
  if (!status) return <Badge tone="rose">{empty}</Badge>;
  const s = weeklyStatusLabel(status);
  return <Badge tone={s.tone}>{prefix ? `${prefix}: ${s.label}` : s.label}</Badge>;
}

export function Anomalies({ list }: { list: WeekBoardRow["anomalies"] }) {
  if (!list.length) return <span className="text-xs text-subtle">—</span>;
  return (
    <ul className="space-y-0.5">
      {list.map((a) => (
        <li key={a} className="flex items-start gap-1 text-xs text-rose-700">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          {ANOMALY_LABEL[a]}
        </li>
      ))}
    </ul>
  );
}
