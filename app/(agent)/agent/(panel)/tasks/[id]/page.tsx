import { notFound } from "next/navigation";

import { getTask, getAssigneeOptions, getProjectOptions } from "@/lib/queries-tasks";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { TaskDetailView } from "@/components/tasks/TaskDetailView";

export const metadata = { title: "Даалгавар — Агент" };

export default async function AgentTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [task, assignees, projects] = await Promise.all([
    getTask(id),
    getAssigneeOptions(),
    getProjectOptions(),
  ]);
  if (!task) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mt-1"><DashboardNav /></div>
      <div className="mt-6">
        <TaskDetailView task={task} assignees={assignees} projects={projects} basePath="/agent/tasks" />
      </div>
    </div>
  );
}
