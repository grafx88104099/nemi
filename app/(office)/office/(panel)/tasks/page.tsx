import { getOfficeTasks, getAssigneeOptions, getProjectOptions, type TaskFilters } from "@/lib/queries-tasks";
import { TasksPageShell } from "@/components/tasks/TasksPageShell";
import { TASK_STATUSES, TASK_ROLE_FILTERS, type TaskStatus, type TaskRoleFilter } from "@/lib/constants";

export const metadata = { title: "Даалгавар — Оффис" };

export default async function OfficeTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filters: TaskFilters = {
    status: TASK_STATUSES.includes(sp.status as TaskStatus) ? (sp.status as TaskStatus) : undefined,
    role: TASK_ROLE_FILTERS.includes(sp.role as TaskRoleFilter) ? (sp.role as TaskRoleFilter) : undefined,
    q: sp.q || undefined,
  };

  const [tasks, assignees, projects] = await Promise.all([
    getOfficeTasks(filters),
    getAssigneeOptions(),
    getProjectOptions(),
  ]);

  return (
    <div className="p-8">
      <TasksPageShell
        tasks={tasks}
        assignees={assignees}
        projects={projects}
        basePath="/office/tasks"
        searchParams={sp}
      />
    </div>
  );
}
