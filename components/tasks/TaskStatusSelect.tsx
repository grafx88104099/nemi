"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { setTaskStatus } from "@/lib/actions/tasks";
import { TASK_STATUSES, TASK_STATUS_LABEL, type TaskStatus } from "@/lib/constants";

/** `touch` — утасны картад 44px өндөр (хүрэх талбайн дүрэм); анхдагч нь хүснэгтийн нягт хэмжээ. */
export function TaskStatusSelect({ id, status, size = "sm" }: { id: string; status: TaskStatus; size?: "sm" | "touch" }) {
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
      className={
        size === "touch"
          ? "h-11 rounded-lg border border-line bg-surface px-2 text-base focus:border-brand-500 focus:outline-none disabled:opacity-50"
          : "h-8 rounded-lg border border-line bg-surface px-2 text-xs focus:border-brand-500 focus:outline-none disabled:opacity-50"
      }
    >
      {TASK_STATUSES.map((s) => (
        <option key={s} value={s}>{TASK_STATUS_LABEL[s].label}</option>
      ))}
    </select>
  );
}
