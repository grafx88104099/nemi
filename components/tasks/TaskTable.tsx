import Link from "next/link";
import { MessageSquare, AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime, relativeDate } from "@/lib/format";
import { TASK_PRIORITY_LABEL } from "@/lib/constants";
import type { TaskRow } from "@/lib/queries-tasks";
import { TaskStatusSelect } from "./TaskStatusSelect";
import { isTaskOverdue } from "./utils";

/** Bitrix маягийн жагсаалт — Нэр, Дуусах хугацаа, Үүсгэсэн, Хариуцагч, Төсөл, Шошго, Төлөв. */
export function TaskTable({ tasks, basePath }: { tasks: TaskRow[]; basePath: string }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <caption className="sr-only">Даалгаврын жагсаалт</caption>
        <thead className="border-b border-line bg-surface-2 text-left text-muted">
          <tr>
            <th scope="col" className="p-3 font-medium">Нэр</th>
            <th scope="col" className="p-3 font-medium">Дуусах хугацаа</th>
            <th scope="col" className="p-3 font-medium">Үүсгэсэн</th>
            <th scope="col" className="p-3 font-medium">Хариуцагч</th>
            <th scope="col" className="p-3 font-medium">Төсөл</th>
            <th scope="col" className="p-3 font-medium">Шошго</th>
            <th scope="col" className="p-3 font-medium">Төлөв</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const overdue = isTaskOverdue(t);
            return (
              <tr key={t.id} className="border-b border-line last:border-0">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Link href={`${basePath}/${t.id}`} className="font-medium text-ink hover:underline">
                      {t.title}
                    </Link>
                    {t.priority !== "normal" && (
                      <Badge tone={TASK_PRIORITY_LABEL[t.priority].tone}>{TASK_PRIORITY_LABEL[t.priority].label}</Badge>
                    )}
                    {t.comment_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <MessageSquare className="size-3.5" /> {t.comment_count}
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  {t.deadline ? (
                    <span
                      title={fmtDateTime(t.deadline)}
                      className={overdue ? "inline-flex items-center gap-1 font-semibold text-rose-600" : "text-ink"}
                    >
                      {overdue && <AlertTriangle className="size-3.5" />}
                      {fmtDateTime(t.deadline)}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="p-3 text-muted">{t.creator?.full_name ?? "—"}</td>
                <td className="p-3 text-ink">{t.responsible?.full_name ?? "—"}</td>
                <td className="p-3 text-muted">{t.project?.title ?? "—"}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {t.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-muted">{tag}</span>
                    ))}
                    {t.tags.length > 3 && <span className="text-xs text-muted">+{t.tags.length - 3}</span>}
                  </div>
                </td>
                <td className="p-3"><TaskStatusSelect id={t.id} status={t.status} /></td>
              </tr>
            );
          })}
          {tasks.length === 0 && (
            <tr>
              <td colSpan={7} className="p-10 text-center text-muted">
                Даалгавар алга. «Даалгавар үүсгэх» товчоор эхлүүлнэ үү.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
