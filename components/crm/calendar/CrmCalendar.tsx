"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useOptimistic, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { deleteEvent, rescheduleItem, updateEvent } from "@/lib/actions/crm-calendar";
import {
  CALENDAR_DRAFT_TITLE,
  CALENDAR_VIEWS,
  autoCalendarViews,
  calendarDraftItem,
  calendarHref,
  calendarPeopleParam,
  calendarSearch,
  calendarShortcut,
  calendarViewRange,
  calendarViewTitle,
  defaultCreateRange,
  dropAllowed,
  itemDays,
  itemPersonId,
  itemWhenLabel,
  overlapsRange,
  personColorIndex,
  rangeToFormTimes,
  shiftCalendarDate,
  ubDay,
  type CalendarColorKey,
  type CalendarItem,
  type CalendarPerson,
  type CalendarSource,
  type CalendarView,
  type TimeRange,
} from "@/lib/crm/calendar-view";
import { cn } from "@/lib/utils";

import { AgendaView } from "./AgendaView";
import type { Attendee } from "./AttendeePicker";
import { CalendarHeader, CalendarLegend, MiniMonth, PeoplePicker } from "./CalendarChrome";
import { CalendarPopover } from "./CalendarPopover";
import { COLOR_BY_KEY, personColor, type ColorClasses } from "./colors";
import { EventDetail } from "./EventDetail";
import { EventForm, type EventFormValues } from "./EventForm";
import { MonthView } from "./MonthView";
import { TimeGrid } from "./TimeGrid";
import { rectOf, useMediaQuery, type AnchorRect } from "./use-pointer-gesture";

/**
 * CRM календарь (Google Calendar маяг) — өөрийн үйл явдал, даалгавар, дараагийн
 * үйлдэл, үзлэг, боломжийн уулзалт, сайтын үзлэгийг нэг дор. Өгөгдлийг сервер
 * (CrmCalendarSection) URL-ийн ?view=&date=&people=-ээр уншина; энд харагдац,
 * чирэлт (optimistic, алдаа гарвал буцаана), popover, товчлолыг удирдана.
 *
 * pinned — 7 хоногийн төлөвлөгөөнд суулгасан тогтмол 7 хоног: URL-ийг өөрчлөхгүй,
 * «Өнөөдөр», өмнөх/дараах, хүн сонгогчгүй; 7 хоног ↔ жагсаалт дотроо солигдоно;
 * өдөр нээвэл бүтэн календарь (basePath/calendar) руу шилжинэ.
 */

export type CrmCalendarProps = {
  /** CRM-ийн үндсэн зам — бүтэн календарийн холбоос (calendarHref.calendar). */
  basePath: "/agent/crm" | "/office/crm";
  /** getCalendarFeed()-ийн зүйлс (calendarFetchRange(view, date) мужид). */
  items: CalendarItem[];
  /** URL-ийн харагдац; null = автомат (утсанд жагсаалт, бусадд 7 хоног). */
  view: CalendarView | null;
  /** УБ-ын огноо 'YYYY-MM-DD'. */
  date: string;
  /** Серверийн одоогийн агшин (hydration-д тогтвортой «одоо» шугам). */
  nowIso: string;
  viewerId: string;
  /** Сонгож болох хүмүүс (getCalendarPeople); 1-ээс олон бол хүн сонгогч гарна. */
  people: CalendarPerson[];
  /** Харуулж буй хүмүүс (≥ 1). */
  selectedPeople: string[];
  /** Зөвшөөрөх харагдацууд (анхдагч: бүгд). */
  views?: readonly CalendarView[];
  /** Цагийн тор/сарын өндөр (CSS урт). */
  gridHeight?: string;
  /** Зүүн талын жижиг сар, хүн сонгогч, тайлбар (lg+). Суулгахад false. */
  sidebar?: boolean;
  /** Google маягийн товчлол (t, d/w/m/a, ←/→, j/k, c). */
  shortcuts?: boolean;
  /** Тогтмол 7 хоног (date = тэр 7 хоногийн аль нэг өдөр) — дээрх тайлбарыг үз. */
  pinned?: boolean;
  /** false = шинэ үйл явдал үүсгэхгүй (бусдын календарийг харах үед). Зөөх эрх — зүйл бүрт. */
  canCreate?: boolean;
  /** Толгойн доорх нэмэлт мөр (жишээ нь харагдаж буй 7 хоногийн картын төлөв). */
  toolbar?: React.ReactNode;
  className?: string;
};

type Popover =
  | { kind: "create"; range: TimeRange; allDay: boolean; anchor: AnchorRect | null }
  | { kind: "detail"; key: string; anchor: AnchorRect | null }
  | { kind: "edit"; key: string; anchor: AnchorRect | null }
  | { kind: "people"; anchor: AnchorRect | null }
  | { kind: "jump"; anchor: AnchorRect | null };

type Patch = { type: "move"; key: string; range: TimeRange } | { type: "remove"; key: string };

const DEFAULT_GRID_HEIGHT = "max(26rem, calc(100dvh - 18rem))";
const SAVE_ERR = "Хадгалж чадсангүй. Дахин оролдоно уу.";

function applyPatch(state: CalendarItem[], p: Patch): CalendarItem[] {
  if (p.type === "remove") return state.filter((i) => i.key !== p.key);
  return state.map((i) => (i.key === p.key ? { ...i, start: p.range.start, end: p.range.end } : i));
}

function editValues(item: CalendarItem): EventFormValues | null {
  const e = item.event;
  if (!e) return null;
  return {
    title: item.title,
    kind: e.kind,
    location: e.location ?? "",
    description: e.description ?? "",
    isPrivate: e.isPrivate,
    times: rangeToFormTimes(item, item.allDay),
    attendees: e.attendees,
    link: e.leadId
      ? { kind: "lead", id: e.leadId, label: e.linkLabel ?? "Холбосон сэжим" }
      : e.contactId
        ? { kind: "contact", id: e.contactId, label: e.linkLabel ?? "Холбосон харилцагч" }
        : null,
  };
}

function createValues(range: TimeRange, allDay: boolean, attendees: Attendee[] = []): EventFormValues {
  return {
    title: "",
    kind: "meeting",
    location: "",
    description: "",
    isPrivate: false,
    times: rangeToFormTimes(range, allDay),
    attendees,
    link: null,
  };
}

export function CrmCalendar({
  basePath,
  items,
  view,
  date,
  nowIso,
  viewerId,
  people,
  selectedPeople,
  views = CALENDAR_VIEWS,
  gridHeight = DEFAULT_GRID_HEIGHT,
  sidebar = true,
  shortcuts = true,
  pinned = false,
  canCreate = true,
  toolbar = null,
  className,
}: CrmCalendarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const phone = useMediaQuery("(max-width: 767px)");
  const [navPending, startNav] = useTransition();
  const [, startMutation] = useTransition();
  const [nav, setNav] = useOptimistic({ view, date, people: selectedPeople });
  // Тогтмол 7 хоногт харагдацыг URL-д бичихгүй (төлөвлөгөөний хуудасны URL хэвээр).
  const [pinnedView, setPinnedView] = useState<CalendarView | null>(view);
  const navView = pinned ? pinnedView : nav.view;
  const [shownItems, patchItems] = useOptimistic(items, applyPatch);
  const [pop, setPop] = useState<Popover | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CalendarItem | null>(null);

  // «Одоо» — серверийн агшнаас эхэлж, хагас минут тутам шинэчилнэ (УБ-ын цагаар тооцно).
  const [nowMs, setNowMs] = useState(() => Date.parse(nowIso));
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const today = ubDay(nowMs);

  // ── Харагдац ──
  const autoViews = autoCalendarViews(views);
  const urlView = navView && views.includes(navView) ? navView : null;
  const active: CalendarView | null =
    urlView ??
    (autoViews.phone === autoViews.wide ? autoViews.wide : phone === null ? null : phone ? autoViews.phone : autoViews.wide);
  const effective = active ?? autoViews.wide;
  const range = useMemo(() => calendarViewRange(effective, nav.date, pinned), [effective, nav.date, pinned]);
  const viewDays = useMemo(
    () =>
      Object.fromEntries(CALENDAR_VIEWS.map((v) => [v, calendarViewRange(v, nav.date, pinned).days])) as Record<
        CalendarView,
        string[]
      >,
    [nav.date, pinned]
  );

  const canPickPeople = !pinned && people.length > 1;
  const byPerson = nav.people.length > 1;
  // Өнгө сонгосон хүмүүсийн дотор байрлалаар (жагсаалтын дарааллаар) — 8 хүртэл давхцахгүй.
  const colorOrder = useMemo(
    () => people.map((p) => p.profileId).filter((id) => nav.people.includes(id)),
    [people, nav.people]
  );
  // Суулгасан календарь нэг хүнийх (хэсгийн гарчигт нэр нь) — зүйл бүрт нэр давтахгүй.
  const showPerson = byPerson || (!pinned && nav.people.some((id) => id !== viewerId));
  const viewerShown = nav.people.includes(viewerId);

  const colorOfPerson = useCallback(
    (profileId: string): ColorClasses => personColor(personColorIndex(profileId, colorOrder)),
    [colorOrder]
  );
  const colorOf = useCallback(
    (it: CalendarItem): ColorClasses =>
      byPerson && it.personId ? colorOfPerson(itemPersonId(it, nav.people)) : COLOR_BY_KEY[it.colorKey],
    [byPerson, colorOfPerson, nav.people]
  );

  const draft = useMemo(
    () => (pop?.kind === "create" ? calendarDraftItem(pop.range, pop.allDay, viewerId) : null),
    [pop, viewerId]
  );
  // Үйл явдлын эзэн үргэлж үүсгэгч. Өөрийгөө харуулалгүй нэг хүний календарь дээр үүсгэвэл
  // тэр хүнийг урьж эхэлнэ — эс бөгөөс хадгалсан үйл явдал энэ харагдацад гарахгүй.
  const createAttendees = useMemo<Attendee[]>(() => {
    if (viewerShown || nav.people.length !== 1) return [];
    const p = people.find((x) => x.profileId === nav.people[0]);
    return p ? [{ profileId: p.profileId, name: p.name }] : [];
  }, [viewerShown, nav.people, people]);
  const viewItems = useMemo(() => (draft ? [...shownItems, draft] : shownItems), [shownItems, draft]);

  const legend = useMemo(() => {
    const colorKeys = new Set<CalendarColorKey>();
    const sources = new Set<CalendarSource>();
    for (const it of shownItems) {
      if (!overlapsRange(it, range.from, range.to)) continue;
      colorKeys.add(it.colorKey);
      sources.add(it.source);
    }
    return { colorKeys, sources };
  }, [shownItems, range]);

  const markedDays = useMemo(() => {
    const s = new Set<string>();
    for (const it of shownItems) for (const d of itemDays(it).slice(0, 62)) s.add(d);
    return s;
  }, [shownItems]);

  // ── Навигаци (URL) ──
  /** Бүтэн календарийн хуудас руу (суулгасан календариас өдөр, огноо нээх). */
  function openFull(next: { view: CalendarView | null; date: string }) {
    const href = calendarHref.calendar(basePath, next.date, {
      view: next.view,
      people: calendarPeopleParam(nav.people, viewerId),
    });
    startNav(() => router.push(href));
  }

  function go(patch: { view?: CalendarView; date?: string; people?: string[] }) {
    const next = {
      view: patch.view ?? active ?? navView,
      date: patch.date ?? nav.date,
      people: patch.people ?? nav.people,
    };
    if (pinned) {
      if (patch.date === undefined && patch.people === undefined) setPinnedView(next.view);
      else openFull(next);
      return;
    }
    const search = calendarSearch(window.location.search, {
      view: next.view,
      date: next.date,
      people: calendarPeopleParam(next.people, viewerId),
    });
    startNav(() => {
      setNav(next);
      router.push(`${pathname}${search}`, { scroll: false });
    });
  }

  const shift = (step: 1 | -1) => {
    setPop(null);
    go({ date: shiftCalendarDate(effective, nav.date, step) });
  };
  const goToday = () => {
    setPop(null);
    go({ date: today });
  };
  const goView = (v: CalendarView) => {
    setPop(null);
    go({ view: v });
  };
  const openDay = (day: string) => {
    setPop(null);
    if (pinned) openFull({ view: "day", date: day });
    else go({ view: views.includes("day") ? "day" : effective, date: day });
  };
  const openCreate = (anchor: AnchorRect | null = null) => {
    if (!canCreate) return;
    const day = range.days.includes(today) ? today : nav.date;
    setPop({ kind: "create", range: defaultCreateRange(day, nowMs), allDay: false, anchor });
  };

  // ── Зөөх, устгах (optimistic) ──
  function moveItem(item: CalendarItem, to: TimeRange, isUndo = false) {
    const prev = { start: item.start, end: item.end };
    startMutation(async () => {
      patchItems({ type: "move", key: item.key, range: to });
      const res =
        item.source === "event"
          ? await updateEvent({ id: item.id, startsAt: to.start, endsAt: to.end })
          : await rescheduleItem(item.source, item.id, to.start, null);
      if (!res.ok) {
        toast.error(res.error ?? SAVE_ERR);
        return;
      }
      const moved = { ...item, ...to };
      const undo = !isUndo && dropAllowed(item, prev, ubDay(Date.now()));
      toast.success(`«${item.title}» — ${itemWhenLabel(moved)}`, {
        action: undo ? { label: "Буцаах", onClick: () => moveItem(moved, prev, true) } : undefined,
      });
    });
  }

  function removeItem(item: CalendarItem) {
    setConfirmDelete(null);
    startMutation(async () => {
      patchItems({ type: "remove", key: item.key });
      const res = await deleteEvent(item.id);
      if (!res.ok) toast.error(res.error ?? "Устгаж чадсангүй.");
      else toast.success("Үйл явдлыг устгалаа");
    });
  }

  // ── Товчлол ──
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (!shortcuts || e.defaultPrevented) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']")) return;
    if (document.querySelector('[aria-modal="true"]')) return;
    const sc = calendarShortcut(e);
    if (!sc) return;
    if (sc.type === "view" && !views.includes(sc.view)) return;
    e.preventDefault();
    if (sc.type === "today") goToday();
    else if (sc.type === "view") goView(sc.view);
    else if (sc.type === "shift") shift(sc.step);
    else openCreate();
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  // ── Харагдац зурах ──
  const handlers = {
    onOpen: (item: CalendarItem, anchor: AnchorRect | null) => setPop({ kind: "detail", key: item.key, anchor }),
    onCreate: canCreate
      ? (r: TimeRange, allDay: boolean, anchor: AnchorRect | null) => setPop({ kind: "create", range: r, allDay, anchor })
      : undefined,
    onMove: moveItem,
    onOpenDay: openDay,
  };

  function renderView(v: CalendarView) {
    const days = viewDays[v];
    if (v === "month") {
      return (
        <MonthView
          date={nav.date}
          items={viewItems}
          today={today}
          colorOf={colorOf}
          showPerson={showPerson}
          height={gridHeight}
          {...handlers}
        />
      );
    }
    if (v === "agenda") {
      return (
        <AgendaView
          days={days}
          items={shownItems}
          today={today}
          colorOf={colorOf}
          showPerson={showPerson}
          onOpen={handlers.onOpen}
          onOpenDay={openDay}
          onCreateClick={canCreate ? () => openCreate() : undefined}
        />
      );
    }
    return (
      <TimeGrid
        days={days}
        items={viewItems}
        today={today}
        nowMs={nowMs}
        colorOf={colorOf}
        showPerson={showPerson}
        height={gridHeight}
        containScroll={!pinned}
        {...handlers}
      />
    );
  }

  const primary = active ?? autoViews.wide;
  const secondary = active ? null : autoViews.phone;

  // ── Popover-ийн агуулга ──
  const popItem = pop && (pop.kind === "detail" || pop.kind === "edit") ? shownItems.find((i) => i.key === pop.key) : null;
  const isOwner = (it: CalendarItem) => it.source === "event" && !it.masked && it.event?.ownerId === viewerId;
  const editInitial = pop?.kind === "edit" && popItem && isOwner(popItem) ? editValues(popItem) : null;

  const peoplePicker = (
    <PeoplePicker
      people={people}
      selected={nav.people}
      colorOfPerson={colorOfPerson}
      showColors={byPerson}
      onChange={(next) => go({ people: next })}
    />
  );

  return (
    <section
      aria-label="Календарь"
      className={cn("grid grid-cols-1 gap-4", sidebar && "lg:grid-cols-[15rem_minmax(0,1fr)]", className)}
    >
      {sidebar ? (
        <aside className="hidden space-y-4 lg:block">
          {canCreate ? (
            <Button type="button" onClick={(e) => openCreate(rectOf(e.currentTarget))} className="w-full" title="Үйл явдал нэмэх (c)">
              <Plus className="size-4" aria-hidden /> Үйл явдал нэмэх
            </Button>
          ) : null}
          <MiniMonth
            key={nav.date.slice(0, 7)}
            selected={nav.date}
            today={today}
            rangeDays={range.days}
            markedDays={markedDays}
            onPick={(d) => {
              setPop(null);
              go({ date: d });
            }}
          />
          {canPickPeople ? <div className="rounded-2xl border border-line bg-surface p-3">{peoplePicker}</div> : null}
          <CalendarLegend colorKeys={legend.colorKeys} sources={legend.sources} byPerson={byPerson} />
          <p className="text-[11px] leading-relaxed text-subtle">
            Товчлол: t — өнөөдөр, d/w/m/a — харагдац, ←/→ эсвэл j/k — шилжих, c — шинэ үйл явдал, Esc — хаах.
          </p>
        </aside>
      ) : null}

      <div className="min-w-0 space-y-3">
        <CalendarHeader
          title={active ? calendarViewTitle(active, nav.date, pinned) : null}
          autoTitles={{
            phone: calendarViewTitle(autoViews.phone, nav.date, pinned),
            wide: calendarViewTitle(autoViews.wide, nav.date, pinned),
          }}
          activeView={active}
          autoViews={autoViews}
          views={views}
          pending={navPending}
          navigation={!pinned}
          onToday={goToday}
          onShift={shift}
          onView={goView}
          onTitleClick={pinned ? undefined : (anchor) => setPop({ kind: "jump", anchor })}
          extra={
            <div className={cn("flex items-center gap-2", sidebar && "lg:hidden")}>
              {canPickPeople ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => setPop({ kind: "people", anchor: rectOf(e.currentTarget) })}
                  aria-label={`Хэний календарь (${nav.people.length})`}
                >
                  <Users className="size-4" aria-hidden />
                  <span className="tabular-nums">{nav.people.length}</span>
                </Button>
              ) : null}
              {canCreate ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={(e) => openCreate(rectOf(e.currentTarget))}
                  aria-label="Үйл явдал нэмэх"
                  title={shortcuts ? "Үйл явдал нэмэх (c)" : "Үйл явдал нэмэх"}
                >
                  <Plus className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Нэмэх</span>
                </Button>
              ) : null}
            </div>
          }
        />

        {toolbar ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{toolbar}</div> : null}

        <div aria-busy={navPending} className={cn("transition-opacity", navPending && "opacity-60")}>
          <div className={secondary ? "hidden md:block" : undefined}>{renderView(primary)}</div>
          {secondary ? <div className="md:hidden">{renderView(secondary)}</div> : null}
        </div>

        <CalendarLegend
          colorKeys={legend.colorKeys}
          sources={legend.sources}
          byPerson={byPerson}
          className={cn(sidebar && "lg:hidden")}
        />
        {byPerson ? (
          <ul className={cn("flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted", sidebar && "lg:hidden")} aria-label="Хүмүүсийн өнгө">
            {people
              .filter((p) => nav.people.includes(p.profileId))
              .map((p) => (
                <li key={p.profileId} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className={cn("size-2.5 rounded-sm", colorOfPerson(p.profileId).dot)} /> {p.name}
                </li>
              ))}
          </ul>
        ) : null}
      </div>

      {/* Шинэ үйл явдал */}
      <CalendarPopover
        open={pop?.kind === "create"}
        anchor={pop?.anchor ?? null}
        onClose={() => setPop(null)}
        title="Шинэ үйл явдал"
      >
        {pop?.kind === "create" ? (
          <EventForm
            key={`${pop.range.start}|${pop.range.end}|${pop.allDay}`}
            initial={createValues(pop.range, pop.allDay, createAttendees)}
            viewerId={viewerId}
            onCancel={() => setPop(null)}
            onSaved={(msg) => {
              setPop(null);
              toast.success(viewerShown ? msg : `${msg} (таны календарьт)`);
            }}
          />
        ) : null}
      </CalendarPopover>

      {/* Дэлгэрэнгүй */}
      <CalendarPopover
        open={pop?.kind === "detail" && !!popItem}
        anchor={pop?.anchor ?? null}
        onClose={() => setPop(null)}
        title={popItem?.title ?? CALENDAR_DRAFT_TITLE}
        hideTitle
        width={360}
        actions={
          popItem && isOwner(popItem) ? (
            <>
              <button
                type="button"
                onClick={() => setPop({ kind: "edit", key: popItem.key, anchor: pop?.anchor ?? null })}
                aria-label="Засах"
                title="Засах"
                className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
              >
                <Pencil className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => {
                  setPop(null);
                  setConfirmDelete(popItem);
                }}
                aria-label="Устгах"
                title="Устгах"
                className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-danger"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </>
          ) : null
        }
      >
        {pop?.kind === "detail" && popItem ? (
          <EventDetail item={popItem} color={colorOf(popItem)} showPerson={showPerson} viewerId={viewerId} />
        ) : null}
      </CalendarPopover>

      {/* Засах */}
      <CalendarPopover
        open={pop?.kind === "edit" && !!editInitial}
        anchor={pop?.anchor ?? null}
        onClose={() => setPop(null)}
        title="Үйл явдал засах"
      >
        {pop?.kind === "edit" && popItem && editInitial ? (
          <EventForm
            key={popItem.key}
            eventId={popItem.id}
            initial={editInitial}
            viewerId={viewerId}
            onCancel={() => setPop({ kind: "detail", key: popItem.key, anchor: pop.anchor })}
            onSaved={(msg) => {
              setPop(null);
              toast.success(msg);
            }}
          />
        ) : null}
      </CalendarPopover>

      {/* Огноо руу үсрэх (гарчиг дээр дарахад) — ирээдүйн 7 хоног, сар руу шууд. */}
      <CalendarPopover
        open={pop?.kind === "jump"}
        anchor={pop?.anchor ?? null}
        onClose={() => setPop(null)}
        title="Огноо сонгох"
        hideTitle
        width={300}
      >
        {pop?.kind === "jump" ? (
          <MiniMonth
            selected={nav.date}
            today={today}
            rangeDays={range.days}
            markedDays={markedDays}
            className="border-0 bg-transparent p-0"
            onPick={(d) => {
              setPop(null);
              go({ date: d });
            }}
          />
        ) : null}
      </CalendarPopover>

      {/* Хүн сонгох (утас, таблет) */}
      <CalendarPopover
        open={pop?.kind === "people"}
        anchor={pop?.anchor ?? null}
        onClose={() => setPop(null)}
        title="Хэний календарь"
        hideTitle
        width={320}
      >
        {peoplePicker}
      </CalendarPopover>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Үйл явдал устгах уу?"
        footer={
          <div className="flex justify-end gap-2 border-t border-line p-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
              Болих
            </Button>
            <Button type="button" variant="danger" size="sm" onClick={() => confirmDelete && removeItem(confirmDelete)}>
              Устгах
            </Button>
          </div>
        }
      >
        <p className="p-4 text-sm text-ink">
          «{confirmDelete?.title}» устгагдана. Урьсан хүмүүсийн календараас ч арилна. Энэ үйлдлийг буцаах боломжгүй.
        </p>
      </Modal>
    </section>
  );
}
