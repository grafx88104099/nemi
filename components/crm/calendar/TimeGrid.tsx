"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { toast } from "@/components/ui/toast";
import {
  CALENDAR_DRAFT_KEY,
  CALENDAR_SCROLL_MINUTE,
  DAY_MINUTES,
  HOUR_PX,
  allDayRange,
  calendarDraftItem,
  clickCreateRange,
  dragCreateRange,
  dragMoveTimed,
  dragRange,
  dropAllowed,
  hmOf,
  itemTimeLabel,
  layoutAllDay,
  layoutDay,
  sameRange,
  shiftByDays,
  ubAt,
  ubDayStart,
  type CalendarItem,
  type TimeRange,
} from "@/lib/crm/calendar-view";
import { fmtDayWithWeekday, fmtWeekdayShort } from "@/lib/format";
import { cn } from "@/lib/utils";

import { SOURCE_ICON, type ColorClasses } from "./colors";
import { rectOf, usePointerGesture, type AnchorRect, type GesturePoint } from "./use-pointer-gesture";

/**
 * Өдөр / 7 хоногийн цагийн тор (Google Calendar маяг): 24 цаг, 15 минутын алхам,
 * УБ-ын одоогийн цагийн улаан шугам, бүтэн өдрийн мөр. Хоосон хэсэгт дарж/чирж
 * үүсгэнэ; зөөж болох зүйлийг чирж зөөнө, үйл явдлыг доод ирмэгээс сунгана.
 */

const PX_PER_MIN = HOUR_PX / 60;
const GRID_PX = 24 * HOUR_PX;
/** Богино зүйлийн дэлгэц дээрх хамгийн бага өндөр (минут). */
const MIN_ITEM_MINUTES = 20;
const LANE_PX = 22;
const EDGE_PX = 36;
/** Хоосон хэсэгт үүсгэхэд ирмэгийн автомат гүйлгэлт эхлэх босоо хөдөлгөөн. */
const SCROLL_START_PX = 4;
const HOURS = Array.from({ length: 23 }, (_, i) => i + 1);

type Preview =
  | { kind: "create"; range: TimeRange; allDay: boolean }
  | { kind: "item"; key: string; range: TimeRange; valid: boolean };

export type CalendarGridHandlers = {
  onOpen: (item: CalendarItem, anchor: AnchorRect | null) => void;
  /** Байхгүй бол хоосон хэсэгт дарж/чирж үүсгэхгүй (бусдын календарь). */
  onCreate?: (range: TimeRange, allDay: boolean, anchor: AnchorRect | null) => void;
  onMove: (item: CalendarItem, range: TimeRange) => void;
  onOpenDay: (day: string) => void;
};

export function TimeGrid({
  days,
  items,
  today,
  nowMs,
  colorOf,
  showPerson,
  height,
  containScroll = true,
  onOpen,
  onCreate,
  onMove,
  onOpenDay,
}: CalendarGridHandlers & {
  days: string[];
  /** Харуулах зүйлс (үүсгэж буй түр зүйлтэй). */
  items: CalendarItem[];
  today: string;
  nowMs: number;
  colorOf: (item: CalendarItem) => ColorClasses;
  showPerson: boolean;
  height: string;
  /** false = торын төгсгөлд гүйлгэлт хуудас руу үргэлжилнэ (хуудсанд суулгасан календарь). */
  containScroll?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const allDayRefs = useRef<(HTMLDivElement | null)[]>([]);
  const gesture = usePointerGesture();
  const [preview, setPreview] = useState<Preview | null>(null);

  // Чирэх үед ирмэгт ойртвол автоматаар гүйлгэнэ.
  const auto = useRef<{ raf: number; point: GesturePoint | null; update: ((p: GesturePoint) => void) | null }>({
    raf: 0,
    point: null,
    update: null,
  });

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = Math.max(0, CALENDAR_SCROLL_MINUTE * PX_PER_MIN - 8);
  }, []);

  useEffect(() => {
    const a = auto.current;
    return () => cancelAnimationFrame(a.raf);
  }, []);

  function startAutoScroll(update: (p: GesturePoint) => void) {
    const a = auto.current;
    a.update = update;
    const tick = () => {
      const el = scrollRef.current;
      const p = a.point;
      if (el && p) {
        const r = el.getBoundingClientRect();
        let dy = 0;
        if (p.y < r.top + EDGE_PX) dy = -Math.min(18, Math.ceil((r.top + EDGE_PX - p.y) / 3));
        else if (p.y > r.bottom - EDGE_PX) dy = Math.min(18, Math.ceil((p.y - (r.bottom - EDGE_PX)) / 3));
        if (dy) {
          el.scrollTop += dy;
          a.update?.(p);
        }
      }
      a.raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(a.raf);
    a.raf = requestAnimationFrame(tick);
  }

  function stopAutoScroll() {
    const a = auto.current;
    cancelAnimationFrame(a.raf);
    a.raf = 0;
    a.point = null;
    a.update = null;
  }

  const shown = useMemo(() => {
    if (preview?.kind !== "item") return items;
    return items.map((it) => (it.key === preview.key ? { ...it, start: preview.range.start, end: preview.range.end } : it));
  }, [items, preview]);

  // Хулганаар сонгож буй хэсэг (үүсгэх) — эцэг компонентын түр зүйлийг орлоно.
  const withDraft = useMemo(() => {
    if (preview?.kind !== "create") return shown;
    return [...shown.filter((i) => i.key !== CALENDAR_DRAFT_KEY), calendarDraftItem(preview.range, preview.allDay, "")];
  }, [shown, preview]);

  const allDay = useMemo(() => layoutAllDay(withDraft, days), [withDraft, days]);
  const perDay = useMemo(
    () => days.map((d) => layoutDay(withDraft, d, { minMinutes: MIN_ITEM_MINUTES })),
    [withDraft, days]
  );

  // ── Байрлалын тооцоо ──

  function colAt(refs: (HTMLDivElement | null)[], x: number): number {
    let best = 0;
    for (let i = 0; i < days.length; i += 1) {
      const r = refs[i]?.getBoundingClientRect();
      if (r && x >= r.left) best = i;
    }
    return best;
  }

  function minuteAt(i: number, y: number): number {
    const r = colRefs.current[i]?.getBoundingClientRect();
    if (!r || r.height <= 0) return 0;
    return Math.min(DAY_MINUTES, Math.max(0, ((y - r.top) / r.height) * DAY_MINUTES));
  }

  function slotRect(i: number, range: TimeRange): AnchorRect | null {
    const r = colRefs.current[i]?.getBoundingClientRect();
    if (!r) return null;
    const base = ubDayStart(days[i]).getTime();
    const s = (Date.parse(range.start) - base) / 60_000;
    const e = (Date.parse(range.end) - base) / 60_000;
    return { left: r.left, right: r.right, top: r.top + s * PX_PER_MIN, bottom: r.top + e * PX_PER_MIN };
  }

  function lockedHint(e: React.PointerEvent, item: CalendarItem) {
    if (!item.lockedReason || item.masked) return;
    gesture.start(e, { onActivate: () => toast(item.lockedReason ?? "") });
  }

  // ── Хоосон хэсэгт үүсгэх ──

  function onColumnPointerDown(e: React.PointerEvent, i: number) {
    const create = onCreate;
    if (!create || (e.target as HTMLElement).closest("[data-cal-item]")) return;
    const day = days[i];
    const anchorMin = minuteAt(i, e.clientY);
    const y0 = e.clientY;
    let scrolling = false;
    const update = (p: GesturePoint) => {
      auto.current.point = p;
      // Ирмэгийн автомат гүйлгэлт зөвхөн бодитоор чирсний дараа — энгийн товшилт торыг гүйлгэхгүй.
      if (!scrolling && Math.abs(p.y - y0) > SCROLL_START_PX) {
        scrolling = true;
        startAutoScroll(update);
      }
      setPreview({ kind: "create", allDay: false, range: dragCreateRange(day, anchorMin, minuteAt(i, p.y)) });
    };
    if (e.pointerType === "mouse") e.preventDefault();
    gesture.start(e, {
      immediate: true,
      onMove: update,
      onEnd: (p, info) => {
        stopAutoScroll();
        setPreview(null);
        const range = info.moved ? dragCreateRange(day, anchorMin, minuteAt(i, p.y)) : clickCreateRange(day, anchorMin);
        create(range, false, slotRect(i, range));
      },
      onCancel: () => {
        stopAutoScroll();
        setPreview(null);
      },
    });
  }

  function onAllDayPointerDown(e: React.PointerEvent, i: number) {
    const create = onCreate;
    if (!create || (e.target as HTMLElement).closest("[data-cal-item]")) return;
    const range = (j: number) => allDayRange(days[Math.min(i, j)], days[Math.max(i, j)]);
    if (e.pointerType === "mouse") e.preventDefault();
    gesture.start(e, {
      immediate: true,
      onMove: (p) => setPreview({ kind: "create", allDay: true, range: range(colAt(allDayRefs.current, p.x)) }),
      onEnd: (p, info) => {
        setPreview(null);
        const j = info.moved ? colAt(allDayRefs.current, p.x) : i;
        const a = allDayRefs.current[Math.min(i, j)]?.getBoundingClientRect();
        const b = allDayRefs.current[Math.max(i, j)]?.getBoundingClientRect();
        create(range(j), true, a && b ? { left: a.left, right: b.right, top: a.top, bottom: a.bottom } : null);
      },
      onCancel: () => setPreview(null),
    });
  }

  // ── Зөөх, сунгах ──

  function startItemDrag(e: React.PointerEvent, item: CalendarItem, compute: (p: GesturePoint) => TimeRange, scroll: boolean) {
    const origin = { start: item.start, end: item.end };
    const update = (p: GesturePoint) => {
      auto.current.point = p;
      const range = compute(p);
      setPreview({ kind: "item", key: item.key, range, valid: dropAllowed(item, range, today) });
    };
    gesture.start(e, {
      onActivate: () => {
        if (scroll) startAutoScroll(update);
      },
      onMove: update,
      onEnd: (p, info) => {
        stopAutoScroll();
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
      onCancel: () => {
        stopAutoScroll();
        setPreview(null);
      },
    });
  }

  function onTimedPointerDown(e: React.PointerEvent, item: CalendarItem, segDay: string, mode: "move" | "resize") {
    e.stopPropagation();
    if (item.key === CALENDAR_DRAFT_KEY) return;
    if (mode === "move" ? !item.canMove : !item.canResize) {
      lockedHint(e, item);
      return;
    }
    const origin = { start: item.start, end: item.end };
    const i = days.indexOf(segDay);
    const grab = minuteAt(i, e.clientY);
    startItemDrag(
      e,
      item,
      (p) => {
        if (mode === "resize") return dragRange(origin, minuteAt(i, p.y) - grab, "resize-end");
        const j = colAt(colRefs.current, p.x);
        return dragMoveTimed(origin, segDay, grab, days[j], minuteAt(j, p.y));
      },
      true
    );
  }

  function onBarPointerDown(e: React.PointerEvent, item: CalendarItem) {
    e.stopPropagation();
    if (item.key === CALENDAR_DRAFT_KEY) return;
    if (!item.canMove) {
      lockedHint(e, item);
      return;
    }
    const origin = { start: item.start, end: item.end };
    const grabDay = days[colAt(allDayRefs.current, e.clientX)];
    startItemDrag(e, item, (p) => shiftByDays(origin, grabDay, days[colAt(allDayRefs.current, p.x)]), false);
  }

  function onItemClick(e: React.MouseEvent<HTMLElement>, item: CalendarItem) {
    if (gesture.consumeClick() || item.key === CALENDAR_DRAFT_KEY) return;
    onOpen(item, rectOf(e.currentTarget));
  }

  const cols = `var(--cal-gutter) repeat(${days.length}, minmax(0, 1fr))`;
  const nowDayIndex = days.indexOf(today);
  const nowMin = (nowMs - ubDayStart(today).getTime()) / 60_000;
  const draggingKey = preview?.kind === "item" ? preview.key : null;
  const invalid = preview?.kind === "item" && !preview.valid;

  return (
    <div className="select-none overflow-hidden rounded-2xl border border-line bg-surface [--cal-gutter:2.75rem] [-webkit-touch-callout:none] sm:[--cal-gutter:3.5rem]">
      {/* Толгой: гараг, өдөр ба бүтэн өдрийн мөр (гүйлгэхгүй). */}
      <div className="overflow-hidden border-b border-line [scrollbar-gutter:stable]">
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          <div className="flex items-end justify-end pb-1 pr-1.5 text-[10px] text-subtle" title="Улаанбаатарын цаг (UTC+8)">
            УБ
          </div>
          {days.map((day) => {
            const isToday = day === today;
            const noon = ubAt(day, 720);
            return (
              <div key={day} className="flex justify-center border-l border-line py-1.5 first:border-l-0">
                <button
                  type="button"
                  onClick={() => onOpenDay(day)}
                  aria-label={`${fmtDayWithWeekday(noon)}${isToday ? " (өнөөдөр)" : ""} — өдрөөр харах`}
                  aria-current={isToday ? "date" : undefined}
                  className="flex flex-col items-center rounded-lg px-1 hover:bg-surface-2"
                >
                  <span className={cn("text-[11px] font-medium", isToday ? "text-brand-700" : "text-muted")}>
                    {fmtWeekdayShort(noon)}
                  </span>
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-full text-base font-semibold sm:text-lg",
                      isToday ? "bg-brand-500 text-white" : "text-ink"
                    )}
                  >
                    {Number(day.slice(8, 10))}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="grid border-t border-line" style={{ gridTemplateColumns: cols }}>
          <div className="flex items-center justify-end pr-1.5 text-right text-[10px] leading-tight text-subtle">
            Бүтэн өдөр
          </div>
          <div className="relative max-h-[5.75rem] overflow-y-auto" style={{ gridColumn: `span ${days.length}` }}>
            <div
              className="relative grid"
              style={{
                gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
                minHeight: Math.max(1, allDay.lanes) * LANE_PX + 4,
              }}
            >
              {days.map((day, i) => (
                <div
                  key={day}
                  ref={(el) => {
                    allDayRefs.current[i] = el;
                  }}
                  onPointerDown={(e) => onAllDayPointerDown(e, i)}
                  className="border-l border-line first:border-l-0"
                />
              ))}
              {allDay.placements.map((p) => {
                const it = p.item;
                const draft = it.key === CALENDAR_DRAFT_KEY;
                const color = colorOf(it);
                const Icon = SOURCE_ICON[it.source];
                return (
                  <button
                    key={it.key}
                    type="button"
                    data-cal-item=""
                    draggable={false}
                    tabIndex={draft ? -1 : undefined}
                    onPointerDown={(e) => onBarPointerDown(e, it)}
                    onClick={(e) => onItemClick(e, it)}
                    aria-label={`${it.title}, ${itemTimeLabel(it)}${showPerson && it.personName ? `, ${it.personName}` : ""}`}
                    title={it.lockedReason ?? it.title}
                    className={cn(
                      "absolute flex items-center gap-1 overflow-hidden rounded-md border-l-[3px] px-1.5 text-left text-[11px] font-semibold leading-none",
                      draft ? "border-brand-600 bg-brand-500 text-white shadow-md" : color.block,
                      p.continuesBefore && "rounded-l-none border-l-0",
                      p.continuesAfter && "rounded-r-none",
                      it.done && "opacity-60",
                      it.canMove ? "cursor-grab" : "cursor-pointer",
                      draggingKey === it.key && "z-20 shadow-lg ring-2 ring-brand-500",
                      draggingKey === it.key && invalid && "opacity-50 ring-danger"
                    )}
                    style={{
                      top: p.lane * LANE_PX + 2,
                      height: LANE_PX - 3,
                      left: `calc(${(p.startCol / days.length) * 100}% + 2px)`,
                      width: `calc(${(p.span / days.length) * 100}% - 4px)`,
                    }}
                  >
                    {draft ? null : <Icon className="size-3 shrink-0" aria-hidden />}
                    <span className="truncate">{it.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 24 цагийн тор. */}
      <div
        ref={scrollRef}
        className={cn("relative overflow-y-auto [scrollbar-gutter:stable]", containScroll && "overscroll-contain")}
        style={{ height }}
      >
        <div className="grid" style={{ gridTemplateColumns: cols, height: GRID_PX }}>
          <div className="relative" aria-hidden>
            {HOURS.map((h) => (
              <span
                key={h}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-subtle"
                style={{ top: h * HOUR_PX }}
              >
                {hmOf(h * 60)}
              </span>
            ))}
          </div>
          {days.map((day, i) => (
            <div
              key={day}
              ref={(el) => {
                colRefs.current[i] = el;
              }}
              role="group"
              aria-label={fmtDayWithWeekday(ubAt(day, 720))}
              onPointerDown={(e) => onColumnPointerDown(e, i)}
              className="relative border-l border-line"
              style={{
                backgroundImage: "linear-gradient(to bottom, var(--color-line) 1px, transparent 1px)",
                backgroundSize: `100% ${HOUR_PX}px`,
              }}
            >
              {perDay[i].map((seg) => {
                const it = seg.item;
                const draft = it.key === CALENDAR_DRAFT_KEY;
                const color = colorOf(it);
                const Icon = SOURCE_ICON[it.source];
                const top = seg.startMin * PX_PER_MIN;
                const h = Math.max(MIN_ITEM_MINUTES, seg.endMin - seg.startMin) * PX_PER_MIN - 2;
                const roomy = h >= 32;
                const time = itemTimeLabel(it);
                const dragging = draggingKey === it.key;
                return (
                  <button
                    key={`${it.key}:${day}`}
                    type="button"
                    data-cal-item=""
                    draggable={false}
                    tabIndex={draft ? -1 : undefined}
                    onPointerDown={(e) => onTimedPointerDown(e, it, day, "move")}
                    onClick={(e) => onItemClick(e, it)}
                    aria-label={`${it.title}, ${time}${showPerson && it.personName ? `, ${it.personName}` : ""}`}
                    title={it.lockedReason ?? `${it.title} · ${time}`}
                    className={cn(
                      "absolute overflow-hidden rounded-md border-l-[3px] px-1.5 text-left text-[11px] leading-4 shadow-sm",
                      draft ? "border-brand-600 bg-brand-500 text-white shadow-md" : color.block,
                      seg.continuesBefore && "rounded-t-none",
                      seg.continuesAfter && "rounded-b-none",
                      it.done && "opacity-60",
                      it.canMove ? "cursor-grab" : "cursor-pointer",
                      dragging && "z-20 shadow-lg ring-2 ring-brand-500",
                      dragging && invalid && "opacity-50 ring-danger"
                    )}
                    style={{
                      top,
                      height: h,
                      left: `calc(${seg.left * 100}% + 1px)`,
                      width: `calc(${seg.width * 100}% - 3px)`,
                      paddingTop: roomy ? 2 : 0,
                    }}
                  >
                    <span className={cn("flex items-center gap-1 font-semibold", it.done && "line-through decoration-1")}>
                      {draft ? null : <Icon className="size-3 shrink-0" aria-hidden />}
                      <span className="truncate">{it.title}</span>
                      {roomy ? null : <span className="shrink-0 font-normal opacity-80">{time}</span>}
                    </span>
                    {roomy ? (
                      <span className="block truncate opacity-80">
                        {time}
                        {it.subtitle ? ` · ${it.subtitle}` : ""}
                      </span>
                    ) : null}
                    {roomy && showPerson && it.personName ? (
                      <span className="block truncate opacity-70">{it.personName}</span>
                    ) : null}
                    {it.canResize && !seg.continuesAfter ? (
                      <span
                        aria-hidden
                        data-cal-resize=""
                        onPointerDown={(e) => onTimedPointerDown(e, it, day, "resize")}
                        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize touch-none"
                      />
                    ) : null}
                  </button>
                );
              })}
              {i === nowDayIndex && nowMin >= 0 && nowMin < DAY_MINUTES ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500"
                  style={{ top: nowMin * PX_PER_MIN - 1 }}
                >
                  <span className="absolute -left-1.5 -top-[7px] size-3 rounded-full bg-red-500" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
