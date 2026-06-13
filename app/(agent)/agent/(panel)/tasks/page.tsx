import { createClient } from "@/lib/supabase/server";
import { getMyTasks, getAssigneeOptions, getProjectOptions, type TaskFilters } from "@/lib/queries-tasks";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { TasksPageShell } from "@/components/tasks/TasksPageShell";
import { TASK_STATUSES, TASK_ROLE_FILTERS, type TaskStatus, type TaskRoleFilter } from "@/lib/constants";

export const metadata = { title: "Даалгавар — Агент" };

export default async function AgentTasksPage({
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [tasks, assignees, projects] = await Promise.all([
    getMyTasks(filters),
    getAssigneeOptions(),
    getProjectOptions(),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mt-1"><DashboardNav /></div>
      <div className="mt-6">
        <TasksPageShell
          tasks={tasks}
          assignees={assignees}
          projects={projects}
          basePath="/agent/tasks"
          searchParams={sp}
          defaultResponsibleId={user?.id}
        />
      </div>
    </div>
  );
}
