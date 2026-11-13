import { ArrowRight, History } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { describeHistory, type HistoryLookup } from "@/lib/crm2/history";
import type { Json } from "@/types/database";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Өөрчлөлтийн түүх (crm2_history мөрүүд): хэзээ (УБ), хэн, юу — талбар: хуучин → шинэ,
 * шалтгаан. lookup — агентын нэр (staff directory), тохиргооны жагсаалт (төрөл, онцлог,
 * цуцлах шалтгаан, ангиллын нэр), холбоосын нэр (төсөл г.м.).
 */

export type HistoryListRow = {
  id: number;
  entity: string;
  action: string;
  field: string | null;
  old_value: Json | null;
  new_value: Json | null;
  reason: string | null;
  actor_id: string | null;
  created_at: string;
  actor?: { full_name: string | null } | null;
};

export function HistoryList({
  rows,
  lookup,
  showEntity = false,
  emptyText = "Өөрчлөлтийн түүх алга",
  className,
}: {
  rows: HistoryListRow[];
  lookup?: HistoryLookup;
  /** Хэд хэдэн объектын түүх холилдсон үед «Зуучлалын гэрээ», «Медиа» г.м. шошго. */
  showEntity?: boolean;
  emptyText?: string;
  className?: string;
}) {
  if (rows.length === 0) {
    return <EmptyState icon={History} title={emptyText} compact className={className} />;
  }
  return (
    <ol className={cn("divide-y divide-line", className)}>
      {rows.map((row) => {
        const line = describeHistory(row, lookup);
        return (
          <li key={line.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
            <div className="shrink-0 text-xs text-muted sm:w-36">
              <time dateTime={line.at} className="tabular-nums">
                {fmtDateTime(line.at)}
              </time>
              <div className="truncate font-medium text-ink">{line.actor}</div>
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-ink">
                {showEntity ? <span className="mr-1.5 text-xs font-semibold text-muted">{line.entityLabel}:</span> : null}
                {line.field ? (
                  <span className="font-medium">{line.field}</span>
                ) : (
                  <span className="font-medium">
                    {line.action}
                    {showEntity ? "" : ` · ${line.entityLabel}`}
                  </span>
                )}
              </p>
              {line.from !== null || line.to !== null ? (
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 break-words text-muted">
                  <span className="line-through decoration-subtle/60">{line.from}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-subtle" aria-label="→" />
                  <span className="text-ink">{line.to}</span>
                </p>
              ) : null}
              {line.reason ? <p className="mt-0.5 text-xs text-muted">Шалтгаан: {line.reason}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
