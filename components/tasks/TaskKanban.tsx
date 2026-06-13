import Link from "next/link";
import { MessageSquare, AlertTriangle, User } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { relativeDate } from "@/lib/format";
import { TASK_STATUSES, TASK_STATUS_LABEL, TASK_PRIORITY_LABEL } from "@/lib/constants";
import type { TaskRow } from "@/lib/queries-tasks";
import { TaskStatusSelect } from "./TaskStatusSelect";
import { isTaskOverdue } from "./utils";

/** Төлөвөөр бүлэглэсэн самбар (leads kanban загвар — dnd-гүй, select-ээр шилжүүлнэ). */
export function TaskKanban({ tasks, basePath }: { tasks: TaskRow[]; basePath: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {TASK_STATUSES.map((status) => {
        const items = tasks.filter((t) => t.status === status);
        return (
          <div key={status} className="rounded-2xl bg-surface-2 p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-semibold text-ink">{TASK_STATUS_LABEL[status].label}</span>
              <span className="rounded-full bg-surface px-2 text-xs text-muted">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((t) => {
                const overdue = isTaskOverdue(t);
                return (
                  <Card key={t.id}>
                    <CardBody className="space-y-1.5 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`${basePath}/${t.id}`} className="text-sm font-bold text-ink hover:underline">
                          {t.title}
                        </Link>
                        {t.priority !== "normal" && (
                          <Badge tone={TASK_PRIORITY_LABEL[t.priority].tone}>
                            {TASK_PRIORITY_LABEL[t.priority].label}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span className="inline-flex items-center gap-1">
                          <User className="size-3" /> {t.responsible?.full_name ?? "—"}
                        </span>
                        {t.deadline && (
                          <span className={overdue ? "inline-flex items-center gap-1 font-semibold text-rose-600" : ""}>
                            {overdue && <AlertTriangle className="size-3" />}
                            {relativeDate(t.deadline)}
                          </span>
                        )}
                        {t.comment_count > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <MessageSquare className="size-3" /> {t.comment_count}
                          </span>
                        )}
                      </div>
                      <TaskStatusSelect id={t.id} status={t.status} />
                    </CardBody>
                  </Card>
                );
              })}
              {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted">Хоосон</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
