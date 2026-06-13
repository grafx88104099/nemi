import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { TASK_STATUS_LABEL } from "@/lib/constants";
import type { TaskRow } from "@/lib/queries-tasks";
import { buildMonthGrid, parseMonthParam, monthParam, localISODate, isTaskOverdue } from "./utils";

const WEEKDAYS = ["Да", "Мя", "Лх", "Пү", "Ба", "Бя", "Ня"];
const MONTH_NAMES = ["1-р сар", "2-р сар", "3-р сар", "4-р сар", "5-р сар", "6-р сар", "7-р сар", "8-р сар", "9-р сар", "10-р сар", "11-р сар", "12-р сар"];

const PILL_TONE: Record<string, string> = {
  neutral: "bg-surface-2 text-muted",
  blue: "bg-blue-50 text-blue-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
};

/** Сарын календарь — deadline-аар бүлэглэнэ (library-гүй өөрийн grid). */
export function TaskCalendar({
  tasks,
  basePath,
  monthStr,
  searchParams,
}: {
  tasks: TaskRow[];
  basePath: string;
  monthStr?: string;
  searchParams: Record<string, string | undefined>;
}) {
  const { year, month0 } = parseMonthParam(monthStr);
  const cells = buildMonthGrid(year, month0);

  const byDate = new Map<string, TaskRow[]>();
  const undated: TaskRow[] = [];
  for (const t of tasks) {
    if (!t.deadline) { undated.push(t); continue; }
    const key = localISODate(new Date(t.deadline));
    const list = byDate.get(key) ?? [];
    list.push(t);
    byDate.set(key, list);
  }

  const nav = (y: number, m0: number) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (v != null && k !== "m") next.set(k, v);
    next.set("m", monthParam(y, m0));
    return `${basePath}?${next.toString()}`;
  };
  const prev = month0 === 0 ? nav(year - 1, 11) : nav(year, month0 - 1);
  const next = month0 === 11 ? nav(year + 1, 0) : nav(year, month0 + 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink">{year} он · {MONTH_NAMES[month0]}</h2>
        <div className="flex gap-1">
          <Link href={prev} aria-label="Өмнөх сар" className="rounded-lg border border-line p-2 text-muted hover:bg-surface-2 hover:text-ink">
            <ChevronLeft className="size-4" />
          </Link>
          <Link href={next} aria-label="Дараах сар" className="rounded-lg border border-line p-2 text-muted hover:bg-surface-2 hover:text-ink">
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-7 border-b border-line bg-surface-2 text-center text-xs font-semibold text-muted">
          {WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((c) => {
            const items = byDate.get(c.iso) ?? [];
            return (
              <div
                key={c.iso}
                className={`min-h-24 border-b border-r border-line p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0 ${
                  c.inMonth ? "" : "bg-surface-2/50"
                }`}
              >
                <div
                  className={`mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs ${
                    c.isToday ? "bg-brand-600 font-bold text-white" : c.inMonth ? "text-ink" : "text-subtle"
                  }`}
                >
                  {c.date.getDate()}
                </div>
                <div className="space-y-1">
                  {items.slice(0, 3).map((t) => {
                    const overdue = isTaskOverdue(t);
                    const tone = overdue ? "bg-rose-50 text-rose-700" : PILL_TONE[TASK_STATUS_LABEL[t.status].tone] ?? PILL_TONE.neutral;
                    return (
                      <Link
                        key={t.id}
                        href={`${basePath}/${t.id}`}
                        title={t.title}
                        className={`block truncate rounded-md px-1.5 py-0.5 text-xs font-medium ${tone} hover:opacity-80`}
                      >
                        {t.title}
                      </Link>
                    );
                  })}
                  {items.length > 3 && <p className="px-1.5 text-xs text-muted">+{items.length - 3}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {undated.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <h3 className="mb-2 text-sm font-semibold text-muted">Хугацаагүй ({undated.length})</h3>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((t) => (
              <Link
                key={t.id}
                href={`${basePath}/${t.id}`}
                className="rounded-md bg-surface-2 px-2 py-1 text-xs font-medium text-ink hover:bg-line"
              >
                {t.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
