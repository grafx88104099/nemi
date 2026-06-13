"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { setTaskStatus } from "@/lib/actions/tasks";
import { TASK_STATUSES, TASK_STATUS_LABEL, type TaskStatus } from "@/lib/constants";

export function TaskStatusSelect({ id, status }: { id: string; status: TaskStatus }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <select
      aria-label="Даалгаврын төлөв солих"
      defaultValue={status}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          await setTaskStatus(id, e.target.value as TaskStatus);
          router.refresh();
        })
      }
      className="h-8 rounded-lg border border-line bg-surface px-2 text-xs focus:border-brand-500 focus:outline-none disabled:opacity-50"
    >
      {TASK_STATUSES.map((s) => (
        <option key={s} value={s}>{TASK_STATUS_LABEL[s].label}</option>
      ))}
    </select>
  );
}
