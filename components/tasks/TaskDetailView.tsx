import Link from "next/link";
import { ArrowLeft, AlertTriangle, CalendarClock, User, FolderKanban, UserPlus } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime, relativeDate } from "@/lib/format";
import { TASK_STATUS_LABEL, TASK_PRIORITY_LABEL, TASK_MEMBER_ROLE_LABEL } from "@/lib/constants";
import type { TaskDetail, AssigneeOption } from "@/lib/queries-tasks";
import { TaskFormButton, type TaskInitial } from "./TaskFormButton";
import { DeleteTaskButton } from "./DeleteTaskButton";
import { TaskStatusSelect } from "./TaskStatusSelect";
import { TaskChecklist } from "./TaskChecklist";
import { TaskComments } from "./TaskComments";
import { isTaskOverdue } from "./utils";

/** Даалгаврын дэлгэрэнгүй — оффис/агент хоёр панель хуваалцана. */
export function TaskDetailView({
  task,
  assignees,
  projects,
  basePath,
}: {
  task: TaskDetail;
  assignees: AssigneeOption[];
  projects: { id: string; title: string }[];
  basePath: string;
}) {
  const overdue = isTaskOverdue(task);
  const statusMeta = TASK_STATUS_LABEL[task.status];
  const initial: TaskInitial = {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    deadline: task.deadline,
    responsible_id: task.responsible_id,
    project_id: task.project?.id ?? null,
    tags: task.tags,
    members: task.members,
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={basePath} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Даалгавар
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">{task.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
            {task.priority !== "normal" && (
              <Badge tone={TASK_PRIORITY_LABEL[task.priority].tone}>{TASK_PRIORITY_LABEL[task.priority].label}</Badge>
            )}
            <span>
              {task.creator?.full_name ?? "—"} үүсгэсэн · {relativeDate(task.created_at)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TaskStatusSelect id={task.id} status={task.status} />
          <TaskFormButton mode="edit" assignees={assignees} projects={projects} initial={initial} />
          <DeleteTaskButton id={task.id} redirectTo={basePath} />
        </div>
      </div>

      {/* Гол мэдээлэл */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardBody>
            <CalendarClock className={`size-5 ${overdue ? "text-rose-600" : "text-amber-600"}`} />
            <div className={`mt-1 font-bold ${overdue ? "inline-flex items-center gap-1 text-rose-600" : "text-ink"}`}>
              {overdue && <AlertTriangle className="size-4" />}
              {task.deadline ? fmtDateTime(task.deadline) : "—"}
            </div>
            <div className="text-xs text-muted">Дуусах хугацаа</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <User className="size-5 text-brand-600" />
            <div className="mt-1 font-bold text-ink">{task.responsible?.full_name ?? "—"}</div>
            <div className="text-xs text-muted">Хариуцагч</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <FolderKanban className="size-5 text-emerald-600" />
            <div className="mt-1 font-bold text-ink">{task.project?.title ?? "—"}</div>
            <div className="text-xs text-muted">Төсөл</div>
          </CardBody>
        </Card>
      </div>

      {(task.description || task.tags.length > 0 || task.memberProfiles.length > 0) && (
        <Card className="mt-3">
          <CardBody className="space-y-3">
            {task.description && <p className="whitespace-pre-wrap text-sm text-ink">{task.description}</p>}
            {task.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {task.tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">{tag}</span>
                ))}
              </div>
            )}
            {task.memberProfiles.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <UserPlus className="size-4 text-muted" />
                {task.memberProfiles.map((m) => (
                  <span key={m.profile_id} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink">
                    {m.full_name ?? "—"} <span className="text-muted">· {TASK_MEMBER_ROLE_LABEL[m.role]}</span>
                  </span>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardBody>
            <TaskChecklist taskId={task.id} items={task.checklist} />
          </CardBody>
        </Card>
        <div>
          <TaskComments taskId={task.id} comments={task.comments} />
        </div>
      </div>
    </div>
  );
}
