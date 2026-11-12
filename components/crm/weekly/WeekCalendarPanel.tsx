import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { getCalendarPeople } from "@/lib/queries-crm-calendar";
import { calendarHref, calendarPeopleParam } from "@/lib/crm/calendar-view";
import { CrmCalendarSection } from "@/components/crm/calendar/CrmCalendarSection";

/** Суулгасан календарийн цагийн торын өндөр (төлөвлөгөөний маягт гол хэвээр). */
const GRID_HEIGHT = "min(34rem, 70dvh)";

export const WEEK_CALENDAR_ANCHOR = "week-calendar";

/**
 * 7 хоногийн төлөвлөгөөний хуудасны календарь: тухайн 7 хоногийн (Даваа–Ням, УБ)
 * уулзалт, дуудлага, үзлэг, даалгаврын хугацаа, дараагийн үйлдэл. Агент өөрийнхөө
 * календарьт үйл явдал нэмж, зөөж болно; ахлагч, удирдлага картын эзнийхийг өөрийн
 * эрхээр харна (үүсгэхгүй, зөөх эрхгүй зүйл түгжээтэй, хувийнх «Завгүй»).
 * Календарийг нь харах эрхгүй бол (жишээ нь sysadmin) хэсэг харагдахгүй.
 * «Календарь дээр харах» — бүтэн календарь тэр 7 хоногоор (цааш ирээдүй рүү чөлөөтэй).
 */
export async function WeekCalendarPanel({
  basePath,
  week,
  agentId,
  viewerId,
}: {
  basePath: "/agent/crm" | "/office/crm";
  /** 7 хоногийн Даваа 'YYYY-MM-DD'. */
  week: string;
  /** Картын эзэн (агент). */
  agentId: string;
  viewerId: string;
}) {
  const person = (await getCalendarPeople()).find((p) => p.profileId === agentId);
  if (!person) return null;
  const isSelf = agentId === viewerId;
  const fullHref = calendarHref.calendar(basePath, week, {
    view: "week",
    people: calendarPeopleParam([agentId], viewerId),
  });
  const headingId = `${WEEK_CALENDAR_ANCHOR}-title`;

  return (
    <section id={WEEK_CALENDAR_ANCHOR} aria-labelledby={headingId} className="scroll-mt-4 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h2 id={headingId} className="text-base font-semibold text-ink">
            {isSelf ? "Энэ 7 хоногийн календарь" : `${person.name} — 7 хоногийн календарь`}
          </h2>
          <p className="text-sm text-muted">
            {isSelf
              ? "Уулзалт, дуудлага, үзлэгээ төлөвлөж, хоосон цаг дээр дарж нэмнэ. Даалгавар, дараагийн үйлдэл автоматаар орно."
              : "Уулзалт, үзлэг, даалгаврын хугацаа, дараагийн үйлдэл. Хувийн үйл явдал «Завгүй» гэж харагдана."}
          </p>
        </div>
        <Link
          href={fullHref}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
        >
          Календарь дээр харах <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </div>
      <Suspense
        fallback={
          <div
            role="status"
            className="animate-pulse rounded-2xl border border-line bg-surface-2"
            style={{ height: `calc(${GRID_HEIGHT} + 7rem)` }}
          >
            <span className="sr-only">Календарь ачаалж байна</span>
          </div>
        }
      >
        <CrmCalendarSection
          basePath={basePath}
          pinnedWeek={week}
          people={[agentId]}
          canCreate={isSelf}
          gridHeight={GRID_HEIGHT}
        />
      </Suspense>
    </section>
  );
}
