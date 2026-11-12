import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getCalendarFeed, getCalendarPeople } from "@/lib/queries-crm-calendar";
import {
  calendarFetchRange,
  calendarPlanWeek,
  calendarRange,
  calendarWeekStart,
  normalizeCalendarDate,
  parseCalendarQuery,
  pinnedCalendarViews,
  type CalendarView,
} from "@/lib/crm/calendar-view";
import { EmptyState } from "@/components/ui/empty-state";
import { WeekPlanStatusLink } from "@/components/crm/weekly/WeekPlanStatusLink";

import { CrmCalendar } from "./CrmCalendar";

/**
 * Календарийн серверийн хэсэг: URL-ийн ?view=&date=&people=-ийг уншиж, харах эрхтэй
 * хүмүүсийн зүйлсийг хэрэглэгчийн өөрийн эрхээр (RLS) татаж CrmCalendar-д өгнө.
 *
 * 7 хоногийн төлөвлөгөөнд суулгахдаа pinnedWeek (+ people) өгнө: тэр 7 хоногийг
 * тогтмол харуулна (URL-ийг уншихгүй, өмнөх/дараах, хүн сонгогчгүй; 7 хоног ба
 * тухайн 7 хоногийн жагсаалт), өдөр нээвэл бүтэн календарь руу шилжинэ.
 */
export async function CrmCalendarSection({
  basePath,
  searchParams = {},
  defaultView = null,
  defaultDate = null,
  views,
  pinnedWeek = null,
  people,
  canCreate = true,
  planStatus = false,
  gridHeight,
  sidebar,
  shortcuts,
  className,
}: {
  basePath: "/agent/crm" | "/office/crm";
  /** Хуудасны searchParams (pinnedWeek үед хэрэггүй). */
  searchParams?: Record<string, string | string[] | undefined>;
  /** URL-д ?view байхгүй үеийн харагдац; null = автомат (утсанд жагсаалт, бусадд 7 хоног). */
  defaultView?: CalendarView | null;
  /** URL-д ?date байхгүй үеийн огноо (анхдагч — өнөөдөр, УБ). */
  defaultDate?: string | null;
  views?: readonly CalendarView[];
  /** Тогтмол харуулах 7 хоног (тухайн долоо хоногийн аль ч өдөр; Даваа руу шилжүүлнэ). */
  pinnedWeek?: string | null;
  /** pinnedWeek үед хэний календарь (анхдагч — өөрөө). Харах эрхгүй бол мэдэгдэл. */
  people?: readonly string[] | null;
  /** false = шинэ үйл явдал үүсгэхгүй (бусдын календарь харах үед). Зөөх эрх зүйл бүрт. */
  canCreate?: boolean;
  /** Харагдаж буй 7 хоногийн картын төлөвийг толгойд харуулах (нэг хүн харж буй үед). */
  planStatus?: boolean;
  gridHeight?: string;
  sidebar?: boolean;
  shortcuts?: boolean;
  className?: string;
}) {
  const ctx = await getCrmStaffContext();
  if (!ctx) return null;

  const now = new Date();
  const pinned = pinnedWeek ? calendarWeekStart(normalizeCalendarDate(pinnedWeek, now)) : null;
  const allowedViews = pinned ? pinnedCalendarViews(views) : views;
  const q = pinned
    ? { view: defaultView, date: pinned, people: [...(people ?? [])] }
    : parseCalendarQuery(searchParams, now, { view: defaultView, date: defaultDate });
  const view = q.view && (!allowedViews || allowedViews.includes(q.view)) ? q.view : null;

  const calendarPeople = await getCalendarPeople();
  const allowed = new Set(calendarPeople.map((p) => p.profileId));
  const picked = q.people.filter((id) => allowed.has(id));
  if (pinned && q.people.length && !picked.length) {
    return (
      <EmptyState
        compact
        title="Энэ хүний календарийг харах эрхгүй"
        description="Календарийг өөрөө, багийн ахлагч, удирдлага л харна."
        className={className}
      />
    );
  }
  const selectedPeople = picked.length ? picked : [ctx.profileId];

  const range = pinned ? calendarRange("week", pinned) : calendarFetchRange(view, q.date, allowedViews);
  const planWeek = planStatus && selectedPeople.length === 1 ? (pinned ?? calendarPlanWeek(view, q.date)) : null;
  const items = await getCalendarFeed({ from: range.from, to: range.to, people: selectedPeople, basePath });

  return (
    <CrmCalendar
      basePath={basePath}
      items={items}
      view={view}
      date={q.date}
      nowIso={now.toISOString()}
      viewerId={ctx.profileId}
      people={calendarPeople}
      selectedPeople={selectedPeople}
      views={allowedViews}
      pinned={!!pinned}
      canCreate={canCreate}
      toolbar={
        planWeek ? <WeekPlanStatusLink basePath={basePath} week={planWeek} agentId={selectedPeople[0]} viewer={ctx} /> : null
      }
      gridHeight={gridHeight}
      sidebar={pinned ? false : sidebar}
      shortcuts={pinned ? false : shortcuts}
      className={className}
    />
  );
}
