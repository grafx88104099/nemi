"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CALENDAR_SOURCE_LABEL,
  CALENDAR_VIEW_LABEL,
  MAX_CALENDAR_PEOPLE,
  addMonths,
  monthGrid,
  ubAt,
  type CalendarColorKey,
  type CalendarPerson,
  type CalendarSource,
  type CalendarView,
} from "@/lib/crm/calendar-view";
import { fmtDayWithWeekday, fmtMonthYear, fmtWeekdayShort } from "@/lib/format";
import { cn } from "@/lib/utils";

import { COLOR_BY_KEY, COLOR_LEGEND, SOURCE_ICON, type ColorClasses } from "./colors";
import { rectOf, type AnchorRect } from "./use-pointer-gesture";

const VIEW_KEY: Record<CalendarView, string> = { day: "d", week: "w", month: "m", agenda: "a" };

// ── Толгой ────────────────────────────────────────────────

/**
 * «Өнөөдөр», өмнөх/дараах, мужийн гарчиг, харагдац сонгох. activeView = null —
 * hydration-оос өмнөх «автомат» төлөв: утсанд жагсаалт, бусадд 7 хоног (CSS-ээр).
 * onTitleClick — гарчиг дээр дарж огноо руу үсрэх (жижиг сар); navigation = false —
 * тогтмол 7 хоногт «Өнөөдөр», өмнөх/дараах товчгүй.
 */
export function CalendarHeader({
  title,
  autoTitles,
  activeView,
  autoViews,
  views,
  pending,
  navigation = true,
  onToday,
  onShift,
  onView,
  onTitleClick,
  extra,
}: {
  title: string | null;
  autoTitles: { phone: string; wide: string };
  activeView: CalendarView | null;
  autoViews: { phone: CalendarView; wide: CalendarView };
  views: readonly CalendarView[];
  pending: boolean;
  navigation?: boolean;
  onToday: () => void;
  onShift: (step: 1 | -1) => void;
  onView: (view: CalendarView) => void;
  onTitleClick?: (anchor: AnchorRect | null) => void;
  /** Баруун талын нэмэлт товч (утсанд: хүмүүс, нэмэх). */
  extra?: React.ReactNode;
}) {
  const activeClass = (v: CalendarView) => {
    if (activeView) return v === activeView ? "bg-surface text-ink shadow-sm" : "";
    return cn(
      v === autoViews.phone && "max-md:bg-surface max-md:text-ink max-md:shadow-sm",
      v === autoViews.wide && "md:bg-surface md:text-ink md:shadow-sm"
    );
  };
  const titleText = title ?? (
    <>
      <span className="md:hidden">{autoTitles.phone}</span>
      <span className="hidden md:inline">{autoTitles.wide}</span>
    </>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-1.5">
        {navigation ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={onToday} title="Өнөөдөр (t)">
              Өнөөдөр
            </Button>
            <button
              type="button"
              onClick={() => onShift(-1)}
              aria-label="Өмнөх"
              title="Өмнөх (← эсвэл k)"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onShift(1)}
              aria-label="Дараах"
              title="Дараах (→ эсвэл j)"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </>
        ) : null}
        <h2 aria-live="polite" className="min-w-0 truncate text-base font-bold text-ink sm:text-lg">
          {onTitleClick ? (
            <button
              type="button"
              onClick={(e) => onTitleClick(rectOf(e.currentTarget))}
              aria-haspopup="dialog"
              title="Огноо сонгох"
              className="inline-flex max-w-full items-center gap-1 rounded-lg px-1 py-0.5 text-left hover:bg-surface-2"
            >
              <span className="truncate">{titleText}</span>
              <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="sr-only"> — огноо сонгох</span>
            </button>
          ) : (
            titleText
          )}
        </h2>
        {pending ? (
          <span role="status" className="ml-1 size-2 shrink-0 animate-pulse rounded-full bg-brand-500">
            <span className="sr-only">Ачаалж байна</span>
          </span>
        ) : null}
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        {views.length > 1 ? (
          <div role="group" aria-label="Харагдац" className="flex min-w-0 flex-1 rounded-xl bg-surface-2 p-1 ring-1 ring-line sm:flex-none">
            {views.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => onView(v)}
                aria-pressed={activeView ? v === activeView : undefined}
                title={`${CALENDAR_VIEW_LABEL[v]} (${VIEW_KEY[v]})`}
                className={cn(
                  "min-h-8 min-w-0 flex-1 truncate rounded-lg px-1.5 text-xs font-semibold text-muted transition hover:text-ink sm:flex-none sm:px-2.5 sm:text-sm",
                  activeClass(v)
                )}
              >
                {CALENDAR_VIEW_LABEL[v]}
              </button>
            ))}
          </div>
        ) : null}
        {extra}
      </div>
    </div>
  );
}

// ── Жижиг сарын навигатор ─────────────────────────────────

export function MiniMonth({
  selected,
  today,
  rangeDays,
  markedDays,
  onPick,
  className,
}: {
  selected: string;
  today: string;
  /** Одоо харагдаж буй өдрүүд (тодруулна). */
  rangeDays: readonly string[];
  /** Зүйлтэй өдрүүд (цэг). */
  markedDays: ReadonlySet<string>;
  onPick: (day: string) => void;
  className?: string;
}) {
  const [month, setMonth] = useState(`${selected.slice(0, 7)}-01`);
  const grid = monthGrid(month, { fixedWeeks: true });
  const inRange = new Set(rangeDays);
  return (
    <div className={cn("rounded-2xl border border-line bg-surface p-3", className)}>
      <div className="mb-1 flex items-center gap-1">
        <p className="flex-1 pl-1 text-sm font-semibold text-ink">{fmtMonthYear(ubAt(month, 720))}</p>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, -1))}
          aria-label="Өмнөх сар"
          className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          aria-label="Дараагийн сар"
          className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-medium text-subtle" aria-hidden>
        {grid.weeks[0].map((d) => (
          <span key={d} className="py-1">
            {fmtWeekdayShort(ubAt(d, 720))}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.weeks.flat().map((d) => {
          const isToday = d === today;
          const isSel = d === selected;
          const out = d.slice(0, 7) !== grid.month;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-label={fmtDayWithWeekday(ubAt(d, 720))}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isSel}
              className={cn(
                "relative mx-auto my-0.5 grid size-7 place-items-center rounded-full text-[11px] tabular-nums",
                isToday ? "bg-brand-500 font-bold text-white" : isSel ? "bg-brand-100 font-semibold text-brand-800" : "",
                !isToday && !isSel && inRange.has(d) && "bg-surface-2",
                !isToday && !isSel && (out ? "text-subtle" : "text-ink"),
                !isToday && "hover:bg-brand-50"
              )}
            >
              {Number(d.slice(8, 10))}
              {markedDays.has(d) && !isToday ? (
                <span aria-hidden className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-brand-500" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Хүн сонгох (багийн ахлагч, удирдлага) ─────────────────

export function PeoplePicker({
  people,
  selected,
  colorOfPerson,
  showColors,
  onChange,
}: {
  people: readonly CalendarPerson[];
  selected: readonly string[];
  colorOfPerson: (profileId: string) => ColorClasses;
  showColors: boolean;
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const set = new Set(selected);
  const self = people.find((p) => p.isSelf);
  const q = query.trim().toLowerCase();
  const shown = q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  // URL ?people= дээд тал нь MAX_CALENDAR_PEOPLE (сервер илүүг нь хасна) — түүнээс олныг сонгуулахгүй.
  const full = set.size >= MAX_CALENDAR_PEOPLE;
  const toggle = (id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else if (full) return;
    else next.add(id);
    const ordered = people.map((p) => p.profileId).filter((pid) => next.has(pid));
    onChange(ordered.length ? ordered : self ? [self.profileId] : []);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Хэний календарь</p>
        {self && (selected.length !== 1 || selected[0] !== self.profileId) ? (
          <button
            type="button"
            onClick={() => onChange([self.profileId])}
            className="rounded-lg px-1.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
          >
            Зөвхөн би
          </button>
        ) : null}
      </div>
      {people.length > 8 ? (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Хүн хайх"
          aria-label="Хүн хайх"
          className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:text-sm"
        />
      ) : null}
      {full ? <p className="text-xs text-muted">Нэг дор {MAX_CALENDAR_PEOPLE} хүртэл хүний календарь харна.</p> : null}
      <ul className="max-h-72 space-y-0.5 overflow-y-auto overscroll-contain">
        {shown.map((p) => {
          const on = set.has(p.profileId);
          const color = colorOfPerson(p.profileId);
          return (
            <li key={p.profileId}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={!on && full}
                onClick={() => toggle(p.profileId)}
                className="flex min-h-9 w-full items-center gap-2 rounded-lg px-1.5 text-left text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded border",
                    on ? cn("border-transparent text-white", showColors ? color.dot : "bg-brand-500") : "border-line-strong"
                  )}
                >
                  {on ? <Check className="size-3" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">
                  {p.name}
                  {p.isSelf ? <span className="text-muted"> (би)</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Тайлбар ───────────────────────────────────────────────

export function CalendarLegend({
  colorKeys,
  sources,
  byPerson,
  className,
}: {
  /** Харагдаж буй өнгөнүүд (эх сурвалжаар будах үед). */
  colorKeys: ReadonlySet<CalendarColorKey>;
  /** Харагдаж буй эх сурвалжууд (хүнээр будах үед дүрсээр ялгана). */
  sources: ReadonlySet<CalendarSource>;
  byPerson: boolean;
  className?: string;
}) {
  if (byPerson) {
    const list = (Object.keys(SOURCE_ICON) as CalendarSource[]).filter((s) => sources.has(s));
    if (!list.length) return null;
    return (
      <ul className={cn("flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted", className)} aria-label="Тэмдэглэгээ">
        {list.map((s) => {
          const Icon = SOURCE_ICON[s];
          return (
            <li key={s} className="inline-flex items-center gap-1">
              <Icon className="size-3.5" aria-hidden /> {CALENDAR_SOURCE_LABEL[s]}
            </li>
          );
        })}
      </ul>
    );
  }
  const list = COLOR_LEGEND.filter((l) => colorKeys.has(l.key));
  if (!list.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted", className)} aria-label="Өнгөний тайлбар">
      {list.map((l) => (
        <li key={l.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 rounded-sm", COLOR_BY_KEY[l.key].dot)} /> {l.label}
        </li>
      ))}
    </ul>
  );
}
