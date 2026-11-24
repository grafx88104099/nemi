import Link from "next/link";
import { ChevronRight, UserRoundSearch } from "lucide-react";

import type { IncompleteItem } from "@/lib/crm2/queries/incomplete";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { OWNER_PENDING_LABEL, PROPERTY_STATUS_LABEL } from "@/lib/crm2/labels";
import { cn } from "@/lib/utils";

import { PERCENT_TONE_CLASS, clampPercent, percentTone } from "./incomplete-model";

/**
 * Утасны «Миний дутуу хөрөнгө» жагсаалт: мөр бүр (≥64px) — код, гарчиг, %, дараагийн алхам,
 * «Эзнийг шалгах» тэмдэг; дарахад картын шалгах жагсаалт (?sheet=checklist), эзэн хүлээгдэж буй
 * бол эзний цонх (?sheet=owner).
 */
export function IncompleteList({
  items,
  panel,
  showAgent,
}: {
  items: IncompleteItem[];
  panel: Crm2Panel;
  showAgent?: boolean;
}) {
  const p = crm2Paths(panel);
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {items.map((it) => {
        const pct = clampPercent(it.percent);
        const tone = PERCENT_TONE_CLASS[percentTone(pct)];
        const href = p.property(it.id, undefined, { sheet: it.ownerPending ? "owner" : "checklist" });
        return (
          <li key={it.id}>
            <Link href={href} className="flex min-h-16 items-center gap-3 px-3 py-2.5 active:bg-surface-2 hover:bg-surface-2">
              <span className="shrink-0" aria-hidden>
                <PercentRing percent={pct} className={tone.text} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-semibold text-ink">{it.code}</span>
                  <span className="truncate text-sm font-medium text-ink">{it.title}</span>
                </span>
                <span className="mt-0.5 block truncate text-sm text-muted">
                  <span className="sr-only">{pct}% гүйцсэн. Дараагийн алхам: </span>
                  {it.next.label}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  {it.ownerPending ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                      <UserRoundSearch className="size-3.5" aria-hidden />
                      {OWNER_PENDING_LABEL}
                    </span>
                  ) : null}
                  {it.status !== "draft" ? (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{PROPERTY_STATUS_LABEL[it.status]}</span>
                  ) : null}
                  {it.staleEmpty ? (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-800">14+ хоног хоосон</span>
                  ) : null}
                  {showAgent && it.listingAgentName ? <span className="truncate text-xs text-subtle">{it.listingAgentName}</span> : null}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Жижиг дугуй явцын дүрс (SVG) — тоо нь дотор нь. */
function PercentRing({ percent, className }: { percent: number; className?: string }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <span className={cn("relative flex size-11 items-center justify-center", className)}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 size-11 -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(percent / 100) * c} ${c}`}
        />
      </svg>
      <span className="text-[11px] font-bold tabular-nums">{percent}%</span>
    </span>
  );
}
