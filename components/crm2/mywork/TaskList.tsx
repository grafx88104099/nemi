import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import type { TaskBucket } from "@/lib/crm2/datetime";
import { TASK_KIND_LABEL } from "@/lib/crm2/labels";
import type { Crm2Paths } from "@/lib/crm2/paths";
import type { Crm2TaskKind } from "@/lib/crm2/types";
import { CodeChip, TaskBucketBadge } from "@/components/crm2/ui";

import { TaskDoneButton } from "./TaskDoneButton";

/**
 * Нээлттэй ажлын (дараагийн алхам) мөрүүд — «Миний ажил» ба харилцагчийн карт.
 * Хугацаа хэтэрсэн нь улаан хүрээтэй. Гол холбоос: хэлцэл → хөрөнгө → харилцагч.
 */

export type TaskRowItem = {
  id: string;
  kind: Crm2TaskKind;
  dueAt: string | null;
  note: string | null;
  bucket: TaskBucket;
  assigneeName?: string | null;
  propertyId: string | null;
  propertyCode?: string | null;
  propertyPlace?: string | null;
  dealId: string | null;
  dealCode?: string | null;
  contactId: string | null;
  contactName?: string | null;
  /** «Хийсэн» товч харуулах. */
  canComplete: boolean;
};

export function taskHref(t: Pick<TaskRowItem, "dealId" | "propertyId" | "contactId">, paths: Crm2Paths): string | null {
  if (t.dealId && t.propertyId) return paths.deal(t.propertyId, t.dealId);
  if (t.propertyId) return paths.property(t.propertyId);
  if (t.contactId) return paths.contact(t.contactId);
  return null;
}

export function TaskList({
  items,
  paths,
  showAssignee = false,
  className,
}: {
  items: TaskRowItem[];
  paths: Crm2Paths;
  showAssignee?: boolean;
  className?: string;
}) {
  return (
    <ul className={cn("space-y-2", className)}>
      {items.map((t) => {
        const href = taskHref(t, paths);
        const overdue = t.bucket === "overdue";
        return (
          <li
            key={t.id}
            className={cn(
              "flex flex-col gap-2 rounded-xl border bg-surface p-3 sm:flex-row sm:items-center sm:gap-3",
              overdue ? "border-rose-300 bg-rose-50/60" : "border-line"
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-ink">{TASK_KIND_LABEL[t.kind] ?? t.kind}</span>
                {t.bucket !== "none" ? <TaskBucketBadge bucket={t.bucket} /> : null}
                {t.propertyCode && t.propertyId ? <CodeChip code={t.propertyCode} href={paths.property(t.propertyId)} /> : null}
                {t.dealCode && t.propertyId && t.dealId ? (
                  <CodeChip code={t.dealCode} href={paths.deal(t.propertyId, t.dealId)} />
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                <span className={cn("inline-flex items-center gap-1 tabular-nums", overdue && "font-semibold text-rose-700")}>
                  <CalendarClock className="size-3.5" aria-hidden />
                  {t.dueAt ? fmtDateTime(t.dueAt) : "Хугацаагүй"}
                </span>
                {t.contactName ? (
                  t.contactId ? (
                    <Link href={paths.contact(t.contactId)} className="truncate text-ink hover:text-brand-700 hover:underline">
                      {t.contactName}
                    </Link>
                  ) : (
                    <span className="truncate">{t.contactName}</span>
                  )
                ) : null}
                {t.propertyPlace ? <span className="truncate">{t.propertyPlace}</span> : null}
                {showAssignee && t.assigneeName ? <span className="truncate">Хариуцагч: {t.assigneeName}</span> : null}
              </div>
              {t.note ? <p className="mt-1 whitespace-pre-line break-words text-sm text-ink">{t.note}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {t.canComplete ? <TaskDoneButton taskId={t.id} /> : null}
              {href ? (
                <Link
                  href={href}
                  className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-medium text-brand-700 hover:bg-brand-50 sm:min-h-9"
                >
                  Нээх
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
