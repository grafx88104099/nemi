import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getCalendarFeed, getCalendarPeople } from "@/lib/queries-crm-calendar";
import { calendarFetchRange, parseCalendarQuery, type CalendarView } from "@/lib/crm/calendar-view";

import { CrmCalendar } from "./CrmCalendar";

/**
 * Календарийн серверийн хэсэг: URL-ийн ?view=&date=&people=-ийг уншиж, харах эрхтэй
 * хүмүүсийн зүйлсийг хэрэглэгчийн өөрийн эрхээр (RLS) татаж CrmCalendar-д өгнө.
 */
export async function CrmCalendarSection({
  basePath,
  searchParams = {},
  defaultView = null,
  defaultDate = null,
  views,
  canCreate = true,
  gridHeight,
  sidebar,
  shortcuts,
  className,
}: {
  basePath: "/agent/crm" | "/office/crm";
  /** Хуудасны searchParams. */
  searchParams?: Record<string, string | string[] | undefined>;
  /** URL-д ?view байхгүй үеийн харагдац; null = автомат (утсанд жагсаалт, бусадд 7 хоног). */
  defaultView?: CalendarView | null;
  /** URL-д ?date байхгүй үеийн огноо (анхдагч — өнөөдөр, УБ). */
  defaultDate?: string | null;
  views?: readonly CalendarView[];
  /** false = шинэ үйл явдал үүсгэхгүй (бусдын календарь харах үед). Зөөх эрх зүйл бүрт. */
  canCreate?: boolean;
  gridHeight?: string;
  sidebar?: boolean;
  shortcuts?: boolean;
  className?: string;
}) {
  const ctx = await getCrmStaffContext();
  if (!ctx) return null;

  const now = new Date();
  const q = parseCalendarQuery(searchParams, now, { view: defaultView, date: defaultDate });
  const view = q.view && (!views || views.includes(q.view)) ? q.view : null;

  const calendarPeople = await getCalendarPeople();
  const allowed = new Set(calendarPeople.map((p) => p.profileId));
  const picked = q.people.filter((id) => allowed.has(id));
  const selectedPeople = picked.length ? picked : [ctx.profileId];

  const range = calendarFetchRange(view, q.date, views);
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
      views={views}
      canCreate={canCreate}
      gridHeight={gridHeight}
      sidebar={sidebar}
      shortcuts={shortcuts}
      className={className}
    />
  );
}
