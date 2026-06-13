import { Suspense } from "react";

import type { TaskRow, AssigneeOption } from "@/lib/queries-tasks";
import { TaskFilters } from "./TaskFilters";
import { TaskTable } from "./TaskTable";
import { TaskKanban } from "./TaskKanban";
import { TaskCalendar } from "./TaskCalendar";
import { TaskFormButton } from "./TaskFormButton";
import { isTaskOverdue } from "./utils";

/**
 * Даалгаврын хуудасны нийтлэг бүрхүүл — толгой, Create товч, шүүлтийн toolbar,
 * сонгосон харагдац (list | kanban | calendar). Оффис/агент хоёр панель хуваалцана.
 */
export function TasksPageShell({
  tasks,
  assignees,
  projects,
  basePath,
  searchParams,
  defaultResponsibleId,
}: {
  tasks: TaskRow[];
  assignees: AssigneeOption[];
  projects: { id: string; title: string }[];
  basePath: string;
  searchParams: Record<string, string | undefined>;
  defaultResponsibleId?: string;
}) {
  const view = searchParams.view ?? "list";
  const overdueAll = tasks.filter((t) => isTaskOverdue(t));
  // «Хоцорсон» chip идэвхтэй үед зөвхөн хоцорсныг харуулна.
  const visible = searchParams.overdue ? overdueAll : tasks;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-ink">Даалгавар ({tasks.length})</h1>
        <TaskFormButton
          mode="create"
          assignees={assignees}
          projects={projects}
          defaultResponsibleId={defaultResponsibleId}
        />
      </div>

      <Suspense>
        <TaskFilters overdueCount={overdueAll.length} />
      </Suspense>

      {view === "kanban" ? (
        <TaskKanban tasks={visible} basePath={basePath} />
      ) : view === "calendar" ? (
        <TaskCalendar tasks={visible} basePath={basePath} monthStr={searchParams.m} searchParams={searchParams} />
      ) : (
        <TaskTable tasks={visible} basePath={basePath} />
      )}
    </div>
  );
}
