import { notFound } from "next/navigation";

import { getTask, getAssigneeOptions, getProjectOptions } from "@/lib/queries-tasks";
import { TaskDetailView } from "@/components/tasks/TaskDetailView";

export const metadata = { title: "Даалгавар — Оффис" };

export default async function OfficeTaskDetailPage({
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
    <div className="p-8">
      <TaskDetailView task={task} assignees={assignees} projects={projects} basePath="/office/tasks" />
    </div>
  );
}
