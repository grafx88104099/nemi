"use client";

import { useMemo } from "react";
import { CalendarDays } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { agendaGroups, itemTimeLabel, ubAt, type CalendarItem } from "@/lib/crm/calendar-view";
import { fmtDayWithWeekday, fmtWeekdayShort } from "@/lib/format";
import { cn } from "@/lib/utils";

import { SOURCE_ICON, type ColorClasses } from "./colors";
import { rectOf, type AnchorRect } from "./use-pointer-gesture";

/** Жагсаалт (agenda): өдрөөр бүлэглэсэн, хоосон өдрийг алгасна — утсанд анхдагч харагдац. */
export function AgendaView({
  days,
  items,
  today,
  colorOf,
  showPerson,
  onOpen,
  onOpenDay,
  onCreateClick,
}: {
  days: string[];
  items: CalendarItem[];
  today: string;
  colorOf: (item: CalendarItem) => ColorClasses;
  showPerson: boolean;
  onOpen: (item: CalendarItem, anchor: AnchorRect | null) => void;
  onOpenDay: (day: string) => void;
  /** Байхгүй бол хоосон үед «нэмэх» товчгүй (бусдын календарь). */
  onCreateClick?: () => void;
}) {
  const groups = useMemo(() => agendaGroups(items, days), [items, days]);

  if (!groups.length) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Энэ хугацаанд төлөвлөсөн зүйл алга"
        description="Уулзалт, дуудлага, үзлэгээ нэмбэл энд өдрөөр жагсана. Даалгавар, дараагийн үйлдэл ч автоматаар орно."
        action={onCreateClick ? { label: "Үйл явдал нэмэх", onClick: onCreateClick } : undefined}
        className="bg-surface"
      />
    );
  }

  return (
    <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {groups.map((g) => {
        const noon = ubAt(g.day, 720);
        const isToday = g.day === today;
        return (
          <li key={g.day} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-1 px-2 py-2 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:px-3">
            <button
              type="button"
              onClick={() => onOpenDay(g.day)}
              aria-label={`${fmtDayWithWeekday(noon)}${isToday ? " (өнөөдөр)" : ""} — өдрөөр харах`}
              aria-current={isToday ? "date" : undefined}
              className="flex h-fit flex-col items-center gap-0.5 rounded-lg py-1 hover:bg-surface-2 sm:flex-row sm:gap-2 sm:px-1"
            >
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full text-base font-semibold",
                  isToday ? "bg-brand-500 text-white" : "text-ink"
                )}
              >
                {Number(g.day.slice(8, 10))}
              </span>
              <span className={cn("text-[11px] font-medium", isToday ? "text-brand-700" : "text-muted")}>
                {fmtWeekdayShort(noon)}
                <span className="hidden sm:inline">, {Number(g.day.slice(5, 7))}-р сар</span>
              </span>
            </button>
            <ul className="space-y-0.5">
              {g.entries.map((en) => {
                const it = en.item;
                const Icon = SOURCE_ICON[it.source];
                const meta = [it.subtitle, showPerson ? it.personName : null].filter(Boolean).join(" · ");
                return (
                  <li key={it.key}>
                    <button
                      type="button"
                      onClick={(e) => onOpen(it, rectOf(e.currentTarget))}
                      className={cn(
                        "flex min-h-11 w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2",
                        it.done && "opacity-60"
                      )}
                    >
                      <span aria-hidden className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", colorOf(it).dot)} />
                      <span className="w-[5.25rem] shrink-0 pt-0.5 text-xs tabular-nums text-muted sm:w-24">
                        {en.allDay ? "Бүтэн өдөр" : itemTimeLabel(it)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("flex items-center gap-1 text-sm font-medium text-ink", it.done && "line-through decoration-1")}>
                          <Icon className="size-3.5 shrink-0 text-muted" aria-hidden />
                          <span className="truncate">{it.title}</span>
                        </span>
                        {meta ? <span className="block truncate text-xs text-muted">{meta}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
