import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

import { splitDiff, type DiffRow } from "./publish-model";

/**
 * Нийтийн талбарын ялгаа (гарчиг, тайлбар ОРНО). Утсан дээр (375px) мөр бүр «Одоо → Дараа» гэж
 * доошоо, sm+ дэлгэцэд 3 баганатай. Өөрчлөгдөхгүй мөрүүд эвхэгдэнэ.
 * linking=false (шинэ зар) бол зөвхөн «Нийтэд гарах» багана.
 */
export function PublishDiff({ rows, linking }: { rows: DiffRow[]; linking: boolean }) {
  if (!linking) {
    return (
      <dl className="divide-y divide-line rounded-xl border border-line">
        {rows.map((r) => (
          <div key={r.key} className="grid gap-0.5 px-3 py-2 sm:grid-cols-[11rem_1fr] sm:gap-3">
            <dt className="text-xs text-muted">{r.label}</dt>
            <dd className={cn("min-w-0 break-words text-sm text-ink", longText(r) && "line-clamp-4 whitespace-pre-line")}>{r.next}</dd>
          </div>
        ))}
      </dl>
    );
  }

  const { changed, same } = splitDiff(rows);
  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[11rem_1fr_1fr] gap-3 px-3 text-[11px] font-semibold uppercase tracking-wide text-subtle sm:grid">
        <span>Талбар</span>
        <span>Одоогийн зар</span>
        <span>Шинэчилсний дараа</span>
      </div>
      {changed.length > 0 ? (
        <dl className="divide-y divide-line rounded-xl border border-amber-200">
          {changed.map((r) => (
            <DiffLine key={r.key} row={r} />
          ))}
        </dl>
      ) : (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">Нийтийн талбар өөрчлөгдөхгүй.</p>
      )}
      {same.length > 0 ? (
        <details className="group rounded-xl border border-line">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-xs font-semibold text-muted">
            Өөрчлөгдөхгүй {same.length} талбар
          </summary>
          <dl className="divide-y divide-line border-t border-line">
            {same.map((r) => (
              <DiffLine key={r.key} row={r} />
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}

function longText(r: DiffRow): boolean {
  return r.key === "description" || r.key === "title";
}

function DiffLine({ row }: { row: DiffRow }) {
  const clamp = longText(row) ? "line-clamp-4 whitespace-pre-line" : "";
  return (
    <div className="grid gap-1 px-3 py-2 sm:grid-cols-[11rem_1fr_1fr] sm:gap-3">
      <dt className="text-xs font-semibold text-muted">{row.label}</dt>
      <dd className="contents">
        <span className="min-w-0 break-words text-sm">
          <span className="text-[11px] text-subtle sm:hidden">Одоо: </span>
          <span className={cn(row.changed ? "text-muted line-through decoration-rose-300" : "text-ink", clamp)}>
            {row.current ?? "—"}
          </span>
        </span>
        <span className={cn("flex min-w-0 items-start gap-1 break-words text-sm", row.changed ? "font-semibold text-ink" : "text-ink")}>
          {row.changed ? <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-brand-600 sm:hidden" aria-hidden /> : null}
          <span className={cn("min-w-0", clamp)}>
            <span className="sr-only">Дараа: </span>
            {row.next}
          </span>
        </span>
      </dd>
    </div>
  );
}
