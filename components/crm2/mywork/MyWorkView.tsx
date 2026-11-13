import Link from "next/link";
import { CalendarDays, CalendarClock, ChevronRight, Eye, ListTodo } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtDateTime, fmtDayWithWeekday, fmtTime } from "@/lib/format";
import { getCrm2Context } from "@/lib/crm2/context";
import { TASK_BUCKET_LABEL, type TaskBucket } from "@/lib/crm2/datetime";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { groupTasks, listMyScheduledShowings, listMyTasks, type TaskListItem } from "@/lib/crm2/queries/tasks";
import { Card, CardBody } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { CodeChip, Crm2Empty, LoadErrorState, NoAccessState } from "@/components/crm2/ui";

import { TaskList, type TaskRowItem } from "./TaskList";

/**
 * «Миний ажил» (1-р шатны энгийн хувилбар): надад оноогдсон нээлттэй ажил хугацаагаар
 * (хэтэрсэн нь тодорхой), дараагийн 7 хоногийн товлосон үзүүлэлт. Сануулга, хүлээлэг — 2-р шатанд.
 */

const WEEK_MS = 7 * 86_400_000;
const BUCKETS: TaskBucket[] = ["overdue", "today", "upcoming", "none"];

function toRow(t: TaskListItem): TaskRowItem {
  return {
    id: t.id,
    kind: t.kind,
    dueAt: t.due_at,
    note: t.note,
    bucket: t.bucket,
    propertyId: t.property_id,
    propertyCode: t.property?.code ?? null,
    propertyPlace: [t.property?.district, t.property?.location_text].filter(Boolean).join(", ") || null,
    dealId: t.deal_id,
    dealCode: t.deal?.code ?? null,
    contactId: t.contact?.id ?? null,
    contactName: t.contact?.full_name ?? null,
    canComplete: t.status === "open",
  };
}

/** Дараагийн 7 хоногийн (ба цаг нь өнгөрсөн ч үр дүнгүй) товлосон үзүүлэлт. */
function nextWeek<T extends { scheduled_at: string | null }>(items: T[]): { now: number; items: T[] } {
  const now = Date.now();
  return { now, items: items.filter((s) => !!s.scheduled_at && Date.parse(s.scheduled_at) <= now + WEEK_MS) };
}

export async function MyWorkView({ panel }: { panel: Crm2Panel }) {
  const ctx = await getCrm2Context();
  if (!ctx?.isMember) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:py-6 md:px-6">
        <NoAccessState description="CRM-ийн эрхтэй ажилтанд харагдана." />
      </div>
    );
  }
  const paths = crm2Paths(panel);
  const [taskList, showingList] = await Promise.all([listMyTasks(), listMyScheduledShowings()]);
  const tasks = taskList.items;
  const groups = groupTasks(tasks);
  const { now, items: upcomingShowings } = nextWeek(showingList.items);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:py-6 md:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-ink sm:text-2xl">Миний ажил</h1>
          <p className="text-sm text-muted">Танд оноогдсон дараагийн алхмууд ба ойрын үзүүлэлтүүд.</p>
        </div>
        <ButtonLink href={paths.calendar()} variant="outline" size="touch" className="self-start sm:self-auto">
          <CalendarDays className="size-4" aria-hidden />
          Календарь
        </ButtonLink>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {BUCKETS.map((b) => {
          const tile = (
            <>
              <span className="block text-xs text-muted">{TASK_BUCKET_LABEL[b]}</span>
              <span
                className={cn(
                  "text-lg font-bold tabular-nums",
                  b === "overdue" && groups.overdue.length ? "text-rose-700" : "text-ink"
                )}
              >
                {/* Ачаалж чадаагүй бол «0» гэж харуулахгүй (доор алдааны төлөв). */}
                {taskList.error ? "—" : groups[b].length}
              </span>
            </>
          );
          const cls = cn(
            "rounded-xl border bg-surface px-3 py-2",
            b === "overdue" && groups.overdue.length ? "border-rose-300" : "border-line"
          );
          // Хоосон бүлгийн хэсэг харагдахгүй тул «0» хавтанг холбоос болгохгүй.
          return groups[b].length > 0 ? (
            <a key={b} href={`#bucket-${b}`} className={cn(cls, "transition hover:bg-surface-2")}>
              {tile}
            </a>
          ) : (
            <div key={b} className={cls}>
              {tile}
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="min-w-0 space-y-4 lg:col-span-2" aria-labelledby="mywork-tasks">
          <h2 id="mywork-tasks" className="sr-only">
            Ажил
          </h2>
          {taskList.error ? (
            <LoadErrorState retryHref={paths.myWork()} />
          ) : tasks.length === 0 ? (
            <Crm2Empty
              icon={ListTodo}
              title="Нээлттэй ажил алга"
              description="Дуудлага бүртгэхдээ «дараагийн алхам» сонговол энд харагдана."
              action={{ label: "Staff руу", href: paths.staff() }}
            />
          ) : (
            BUCKETS.filter((b) => groups[b].length > 0).map((b) => (
              <div key={b} id={`bucket-${b}`} className="scroll-mt-24">
                <h3 className={cn("mb-2 text-sm font-bold", b === "overdue" ? "text-rose-700" : "text-ink")}>
                  {TASK_BUCKET_LABEL[b]} <span className="font-normal text-muted">({groups[b].length})</span>
                </h3>
                <TaskList items={groups[b].map(toRow)} paths={paths} />
              </div>
            ))
          )}
        </section>

        <aside className="min-w-0" aria-labelledby="mywork-showings">
          <Card>
            <CardBody className="p-4">
              <h2 id="mywork-showings" className="flex items-center gap-2 font-bold text-ink">
                <Eye className="size-4 text-brand-600" aria-hidden />
                Товлосон үзүүлэлт · 7 хоног
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Цаг нь өнгөрсөн үзүүлэлт автоматаар «үзүүлсэн» болохгүй — үр дүнгээ хэлцэл дээрээ бүртгэнэ үү.
              </p>
              {showingList.error ? (
                <LoadErrorState compact className="mt-2" retryHref={paths.myWork()} />
              ) : upcomingShowings.length === 0 ? (
                <Crm2Empty icon={CalendarClock} title="Ойрын 7 хоногт үзүүлэлт алга" compact className="mt-2" />
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {upcomingShowings.map((s) => {
                    const past = !!s.scheduled_at && Date.parse(s.scheduled_at) < now;
                    const href = s.deal_id && s.property_id ? paths.deal(s.property_id, s.deal_id) : null;
                    return (
                      <li key={s.id} className="py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={cn("text-sm font-semibold tabular-nums", past ? "text-amber-700" : "text-ink")}>
                              {s.scheduled_at ? `${fmtDayWithWeekday(s.scheduled_at)} · ${fmtTime(s.scheduled_at)}` : "—"}
                            </p>
                            {past ? (
                              <p className="text-xs font-medium text-amber-700">
                                Үр дүнг бүртгээгүй ({s.scheduled_at ? fmtDateTime(s.scheduled_at) : ""})
                              </p>
                            ) : null}
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted">
                              {s.property ? <CodeChip code={s.property.code} href={paths.property(s.property.id)} /> : null}
                              {s.deal && s.property_id ? <CodeChip code={s.deal.code} href={paths.deal(s.property_id, s.deal.id)} /> : null}
                              {s.contact ? (
                                <Link href={paths.contact(s.contact.id)} className="truncate text-ink hover:underline">
                                  {s.contact.full_name}
                                </Link>
                              ) : null}
                            </div>
                            {s.property ? (
                              <p className="mt-0.5 truncate text-xs text-muted">
                                {[s.property.district, s.property.location_text].filter(Boolean).join(", ")}
                              </p>
                            ) : null}
                          </div>
                          {href ? (
                            <Link
                              href={href}
                              aria-label="Хэлцэл нээх"
                              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-brand-700 hover:bg-brand-50 sm:size-9"
                            >
                              <ChevronRight className="size-4" aria-hidden />
                            </Link>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
          <p className="mt-3 text-xs text-muted">
            Эргэж залгах, гэрээ сунгах сануулга ба хүлээлгийн үйлчлүүлэгчийн жагсаалт дараагийн шатанд нэмэгдэнэ.
          </p>
        </aside>
      </div>
    </div>
  );
}
