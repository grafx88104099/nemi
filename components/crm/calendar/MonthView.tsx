"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { toast } from "@/components/ui/toast";
import {
  CALENDAR_DRAFT_KEY,
  allDayRange,
  calendarDraftItem,
  dropAllowed,
  itemTimeLabel,
  layoutMonthWeek,
  monthGrid,
  sameRange,
  shiftByDays,
  ubAt,
  type CalendarItem,
  type TimeRange,
} from "@/lib/crm/calendar-view";
import { fmtDayWithWeekday, fmtTime, fmtWeekdayShort } from "@/lib/format";
import { cn } from "@/lib/utils";

import { SOURCE_ICON, type ColorClasses } from "./colors";
import type { CalendarGridHandlers } from "./TimeGrid";
import { rectOf, usePointerGesture, type AnchorRect, type GesturePoint } from "./use-pointer-gesture";

/**
 * Сарын тор (Даваагаас): олон өдрийн зурвас, цагтай зүйлс цэгтэй мөрөөр; багтахгүй
 * бол «+N» — дарвал тухайн өдөр нээгдэнэ. Хулганаар хоосон нүдэнд дарж/чирж бүтэн
 * өдрийн үйл явдал үүсгэнэ; зөөж болох зүйлийг өөр өдөр рүү чирнэ.
 */

const DATE_PX = 26;
const LINE_PX = 20;

type Preview =
  | { kind: "create"; range: TimeRange }
  | { kind: "item"; key: string; range: TimeRange; valid: boolean };

function dayAt(p: GesturePoint): string | null {
  for (const el of document.elementsFromPoint(p.x, p.y)) {
    const d = (el as HTMLElement).dataset?.calDay;
    if (d) return d;
  }
  return null;
}

export function MonthView({
  date,
  items,
  today,
  colorOf,
  showPerson,
  height,
  onOpen,
  onCreate,
  onMove,
  onOpenDay,
}: CalendarGridHandlers & {
  date: string;
  items: CalendarItem[];
  today: string;
  colorOf: (item: CalendarItem) => ColorClasses;
  showPerson: boolean;
  height: string;
}) {
  const grid = useMemo(() => monthGrid(date), [date]);
  const gesture = usePointerGesture();
  const [preview, setPreview] = useState<Preview | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [rowPx, setRowPx] = useState<number | null>(null);

  // Эхний мөрийн өндөр — callback ref: сар солигдоход (key = week[0]) шинэ мөрийг ажиглана.
  const rowRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry?.contentRect.height ?? 0;
      if (h > 0) setRowPx(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Popover-ийн зангуу: эхний ба сүүлийн сонгосон өдрийн нүд (нэг мөрөнд бол хамтад нь). */
  function cellsRect(from: string, to: string): AnchorRect | null {
    const cell = (d: string) => gridRef.current?.querySelector<HTMLElement>(`[data-cal-day="${d}"]`) ?? null;
    const a = rectOf(cell(from));
    const b = rectOf(cell(to));
    if (!a || !b) return a ?? b;
    if (a.top !== b.top) return b;
    return { top: a.top, bottom: a.bottom, left: Math.min(a.left, b.left), right: Math.max(a.right, b.right) };
  }

  const maxRows = rowPx ? Math.max(1, Math.floor((rowPx - DATE_PX - 2) / LINE_PX)) : 3;

  const shown = useMemo(() => {
    let list = items;
    if (preview?.kind === "item") {
      list = list.map((it) => (it.key === preview.key ? { ...it, start: preview.range.start, end: preview.range.end } : it));
    }
    if (preview?.kind === "create") {
      list = [...list.filter((i) => i.key !== CALENDAR_DRAFT_KEY), calendarDraftItem(preview.range, true, "")];
    }
    return list;
  }, [items, preview]);

  const weeks = useMemo(
    () => grid.weeks.map((week) => ({ week, layout: layoutMonthWeek(shown, week, maxRows) })),
    [grid, shown, maxRows]
  );

  function onCellPointerDown(e: React.PointerEvent, day: string) {
    if ((e.target as HTMLElement).closest("[data-cal-item]")) return;
    if (e.pointerType === "mouse") e.preventDefault();
    const range = (other: string | null) => {
      const b = other ?? day;
      return allDayRange(b < day ? b : day, b < day ? day : b);
    };
    let last: string | null = day;
    gesture.start(e, {
      immediate: true,
      onMove: (p) => {
        last = dayAt(p) ?? last;
        if (onCreate) setPreview({ kind: "create", range: range(last) });
      },
      onEnd: (p, info) => {
        setPreview(null);
        // Хуруугаар товшвол тухайн өдрийг нээнэ (утсанд нүд жижиг).
        if (info.touch && !info.activated) {
          onOpenDay(day);
          return;
        }
        if (!onCreate) return;
        const target = (info.moved ? (dayAt(p) ?? last) : day) ?? day;
        // e.currentTarget энд null (React dispatch дууссан) — нүдийг data-cal-day-ээр олно.
        onCreate(range(target), true, cellsRect(day, target));
      },
      onCancel: () => setPreview(null),
    });
  }

  function onItemPointerDown(e: React.PointerEvent, item: CalendarItem) {
    e.stopPropagation();
    if (item.key === CALENDAR_DRAFT_KEY) return;
    if (!item.canMove) {
      if (item.lockedReason && !item.masked) gesture.start(e, { onActivate: () => toast(item.lockedReason ?? "") });
      return;
    }
    const origin = { start: item.start, end: item.end };
    const grabDay = dayAt({ x: e.clientX, y: e.clientY });
    if (!grabDay) return;
    let last = grabDay;
    const compute = (p: GesturePoint) => {
      last = dayAt(p) ?? last;
      return shiftByDays(origin, grabDay, last);
    };
    gesture.start(e, {
      onMove: (p) => {
        const range = compute(p);
        setPreview({ kind: "item", key: item.key, range, valid: dropAllowed(item, range, today) });
      },
      onEnd: (p, info) => {
        setPreview(null);
        if (!info.activated) return;
        const range = compute(p);
        if (sameRange(range, origin)) return;
        if (!dropAllowed(item, range, today)) {
          toast.error("Дараагийн үйлдлийг өнгөрсөн өдөр рүү зөөхгүй.");
          return;
        }
        onMove(item, range);
      },
      onCancel: () => setPreview(null),
    });
  }

  function onItemClick(e: React.MouseEvent<HTMLElement>, item: CalendarItem) {
    if (gesture.consumeClick() || item.key === CALENDAR_DRAFT_KEY) return;
    onOpen(item, rectOf(e.currentTarget));
  }

  const draggingKey = preview?.kind === "item" ? preview.key : null;
  const invalid = preview?.kind === "item" && !preview.valid;
  const label = (it: CalendarItem) =>
    `${it.title}, ${itemTimeLabel(it)}${showPerson && it.personName ? `, ${it.personName}` : ""}`;

  return (
    <div
      ref={gridRef}
      className="flex select-none flex-col overflow-hidden rounded-2xl border border-line bg-surface [-webkit-touch-callout:none]"
      style={{ height }}
    >
      <div className="grid shrink-0 grid-cols-7 border-b border-line" aria-hidden>
        {grid.weeks[0].map((day) => (
          <div key={day} className="py-1.5 text-center text-[11px] font-medium text-muted">
            {fmtWeekdayShort(ubAt(day, 720))}
          </div>
        ))}
      </div>
      {weeks.map(({ week, layout }, wi) => (
        <div
          key={week[0]}
          ref={wi === 0 ? rowRef : undefined}
          className="relative grid min-h-0 flex-1 grid-cols-7 border-b border-line last:border-b-0"
        >
          {week.map((day) => {
            const isToday = day === today;
            const inMonth = day.slice(0, 7) === grid.month;
            return (
              <div
                key={day}
                data-cal-day={day}
                onPointerDown={(e) => onCellPointerDown(e, day)}
                className={cn("border-l border-line first:border-l-0", !inMonth && "bg-surface-2")}
              >
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    data-cal-item=""
                    onClick={() => onOpenDay(day)}
                    aria-label={`${fmtDayWithWeekday(ubAt(day, 720))}${isToday ? " (өнөөдөр)" : ""} — өдрөөр харах`}
                    aria-current={isToday ? "date" : undefined}
                    className={cn(
                      "grid size-6 place-items-center rounded-full text-xs font-medium hover:bg-surface-2",
                      isToday ? "bg-brand-500 text-white hover:bg-brand-600" : inMonth ? "text-ink" : "text-subtle"
                    )}
                  >
                    {Number(day.slice(8, 10))}
                  </button>
                </div>
              </div>
            );
          })}

          {layout.bars.map((p) => {
            const it = p.item;
            const draft = it.key === CALENDAR_DRAFT_KEY;
            const Icon = SOURCE_ICON[it.source];
            return (
              <button
                key={it.key}
                type="button"
                data-cal-item=""
                draggable={false}
                tabIndex={draft ? -1 : undefined}
                onPointerDown={(e) => onItemPointerDown(e, it)}
                onClick={(e) => onItemClick(e, it)}
                aria-label={label(it)}
                title={it.lockedReason ?? it.title}
                className={cn(
                  "absolute z-[1] flex items-center gap-1 overflow-hidden rounded border-l-[3px] px-1 text-left text-[11px] font-semibold leading-none",
                  draft ? "border-brand-600 bg-brand-500 text-white shadow-md" : colorOf(it).block,
                  p.continuesBefore && "rounded-l-none border-l-0",
                  p.continuesAfter && "rounded-r-none",
                  it.done && "opacity-60",
                  it.canMove ? "cursor-grab" : "cursor-pointer",
                  draggingKey === it.key && "z-20 shadow-lg ring-2 ring-brand-500",
                  draggingKey === it.key && invalid && "opacity-50 ring-danger"
                )}
                style={{
                  top: DATE_PX + p.lane * LINE_PX,
                  height: LINE_PX - 2,
                  left: `calc(${(p.startCol / 7) * 100}% + 2px)`,
                  width: `calc(${(p.span / 7) * 100}% - 4px)`,
                }}
              >
                {draft ? null : <Icon className="hidden size-3 shrink-0 sm:block" aria-hidden />}
                <span className="truncate">{it.title}</span>
              </button>
            );
          })}

          {layout.cells.map((c, col) => (
            <div key={`timed:${c.day}`} className="contents">
              {c.timed.map((seg, i) => {
                const it = seg.item;
                return (
                  <button
                    key={it.key}
                    type="button"
                    data-cal-item=""
                    draggable={false}
                    onPointerDown={(e) => onItemPointerDown(e, it)}
                    onClick={(e) => onItemClick(e, it)}
                    aria-label={label(it)}
                    title={it.lockedReason ?? `${it.title} · ${itemTimeLabel(it)}`}
                    className={cn(
                      "absolute z-[1] flex items-center gap-1 overflow-hidden rounded px-1 text-left text-[11px] leading-none text-ink hover:bg-surface-2",
                      it.done && "opacity-60",
                      it.canMove ? "cursor-grab" : "cursor-pointer",
                      draggingKey === it.key && "z-20 bg-surface shadow-lg ring-2 ring-brand-500",
                      draggingKey === it.key && invalid && "opacity-50 ring-danger"
                    )}
                    style={{
                      top: DATE_PX + (c.rowsTop + i) * LINE_PX,
                      height: LINE_PX - 2,
                      left: `calc(${(col / 7) * 100}% + 2px)`,
                      width: `calc(${100 / 7}% - 4px)`,
                    }}
                  >
                    <span aria-hidden className={cn("size-2 shrink-0 rounded-full", colorOf(it).dot)} />
                    <span className="hidden shrink-0 tabular-nums text-muted sm:inline">{fmtTime(it.start)}</span>
                    <span className={cn("truncate", it.done && "line-through decoration-1")}>{it.title}</span>
                  </button>
                );
              })}
              {c.hidden > 0 ? (
                <button
                  type="button"
                  data-cal-item=""
                  onClick={() => onOpenDay(c.day)}
                  aria-label={`Өөр ${c.hidden} зүйл — ${fmtDayWithWeekday(ubAt(c.day, 720))}`}
                  className="absolute z-[1] rounded px-1 text-left text-[11px] font-semibold leading-none text-muted hover:bg-surface-2 hover:text-ink"
                  style={{
                    top: DATE_PX + (c.rowsTop + c.timed.length) * LINE_PX,
                    height: LINE_PX - 2,
                    left: `calc(${(col / 7) * 100}% + 2px)`,
                    width: `calc(${100 / 7}% - 4px)`,
                  }}
                >
                  +{c.hidden}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
