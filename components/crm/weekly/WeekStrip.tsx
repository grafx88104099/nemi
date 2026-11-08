import Link from "next/link";
import { CalendarRange } from "lucide-react";

import { cn } from "@/lib/utils";
import { shortMNT } from "@/lib/format";
import { MEETING_KEY_CODES, WEEKLY_METRIC_BY_CODE, weeklyStatusLabel, type WeeklyMetricCode } from "@/lib/constants-crm-weekly";
import { formatMetricValue, gapRow, type WeeklyValues } from "@/lib/crm/weekly-score";
import { Badge } from "@/components/ui/badge";

/**
 * Долоо хоногийн зорилт ба гүйцэтгэлийн товч мөр (R-01, U8 агентын самбарт
 * залгана). Гүйцэтгэл системийн тооцоо, зорилт картаас.
 *
 *   <WeekStrip actuals targets planStatus href="/agent/crm/week" />
 */
export function WeekStrip({
  actuals,
  targets,
  planStatus,
  href,
  codes = MEETING_KEY_CODES,
  className,
}: {
  actuals: WeeklyValues;
  targets: WeeklyValues;
  planStatus: string | null;
  href?: string;
  codes?: WeeklyMetricCode[];
  className?: string;
}) {
  const status = planStatus ? weeklyStatusLabel(planStatus) : null;
  return (
    <div className={cn("rounded-2xl border border-line bg-surface p-3", className)}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <CalendarRange className="size-4 text-brand-600" />
        <span className="text-sm font-semibold text-ink">Энэ долоо хоногийн зорилт</span>
        {status ? <Badge tone={status.tone}>{status.label}</Badge> : <Badge tone="amber">Карт бөглөөгүй</Badge>}
        {href ? (
          <Link href={href} className="ml-auto text-xs font-medium text-brand-700 hover:underline">
            Карт нээх →
          </Link>
        ) : null}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {codes.map((code) => {
          const m = WEEKLY_METRIC_BY_CODE[code];
          const g = gapRow(actuals[code], targets[code], m.better);
          const pct = g.pct == null ? null : Math.min(100, g.pct);
          return (
            <div key={code} className="min-w-[7.5rem] shrink-0 rounded-xl bg-surface-2 px-2.5 py-2">
              <p className="truncate text-[11px] text-muted" title={m.label}>
                {m.label}
              </p>
              <p className="text-sm font-bold tabular-nums text-ink">
                {formatMetricValue(code, actuals[code], shortMNT)}
                <span className="text-xs font-medium text-subtle"> / {formatMetricValue(code, targets[code], shortMNT)}</span>
              </p>
              <div className="mt-1 h-1 rounded-full bg-line">
                <div
                  className={cn("h-1 rounded-full", g.met ? "bg-emerald-500" : "bg-brand-500")}
                  style={{ width: `${pct ?? 0}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
