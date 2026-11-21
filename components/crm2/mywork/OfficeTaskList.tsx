import Link from "next/link";
import { ChevronRight, ClipboardList } from "lucide-react";

import { fmtDateTime } from "@/lib/format";
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/constants";
import type { TaskRow } from "@/lib/queries-tasks";
import { Badge } from "@/components/ui/badge";

/**
 * «Миний ажил» доторх оффисын даалгавар (төсөл, оффисын үүрэг). CRM-ийн
 * дараагийн алхамтай нэг жагсаалтад, хугацааны ижил бүлэгт харагдана —
 * агент хоёр газар ажлаа хайхгүй.
 */
export function OfficeTaskList({ items, basePath }: { items: TaskRow[]; basePath: string }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {items.map((t) => {
        const pr = TASK_PRIORITY_LABEL[t.priority];
        const st = TASK_STATUS_LABEL[t.status];
        return (
          <li key={t.id}>
            <Link
              href={`${basePath}/${t.id}`}
              className="flex min-h-14 items-center gap-3 px-3 py-2.5 transition hover:bg-surface-2"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                <ClipboardList className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{t.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span>Оффисын даалгавар</span>
                  {t.project ? <span>· {t.project.title}</span> : null}
                  {t.deadline ? <span>· {fmtDateTime(t.deadline)}</span> : null}
                </span>
              </span>
              <span className="hidden shrink-0 items-center gap-1 sm:flex">
                {t.priority === "high" || t.priority === "urgent" ? <Badge tone={pr.tone}>{pr.label}</Badge> : null}
                {t.status !== "pending" ? <Badge tone={st.tone}>{st.label}</Badge> : null}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
