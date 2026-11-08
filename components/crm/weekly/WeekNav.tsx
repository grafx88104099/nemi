import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { weekLabel, type WeekPhase } from "@/lib/crm/week";

/** Долоо хоногийн шилжүүлэгч: өмнөх / одоогийн / дараах (Даваа–Ням, УБ). */
export function WeekNav({
  week,
  phase,
  prevHref,
  nextHref,
  currentHref,
}: {
  week: string;
  phase: WeekPhase;
  prevHref: string;
  nextHref: string;
  currentHref?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={prevHref}
        className="inline-flex size-9 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:bg-surface-2"
        aria-label="Өмнөх долоо хоног"
      >
        <ChevronLeft className="size-4" />
      </Link>
      <span className="min-w-[10rem] text-center text-sm font-semibold tabular-nums text-ink">{weekLabel(week)}</span>
      <Link
        href={nextHref}
        className="inline-flex size-9 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:bg-surface-2"
        aria-label="Дараах долоо хоног"
      >
        <ChevronRight className="size-4" />
      </Link>
      <WeekPhaseBadge phase={phase} />
      {!phase.isCurrent && currentHref ? (
        <Link href={currentHref} className="text-xs font-medium text-brand-700 hover:underline">
          Энэ долоо хоног
        </Link>
      ) : null}
    </div>
  );
}

export function WeekPhaseBadge({ phase }: { phase: WeekPhase }) {
  if (phase.finalLocked)
    return (
      <Badge tone="neutral">
        <Lock className="mr-1 inline size-3" />
        Эцсийн дүн түгжигдсэн
      </Badge>
    );
  if (phase.preliminary) return <Badge tone="amber">Урьдчилсан дүн</Badge>;
  if (phase.isFuture) return <Badge tone="blue">Ирэх долоо хоног</Badge>;
  return <Badge tone="green">Явагдаж буй</Badge>;
}
