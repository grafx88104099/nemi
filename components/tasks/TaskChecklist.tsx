"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";

import { addChecklistItem, toggleChecklistItem, deleteChecklistItem } from "@/lib/actions/tasks";
import type { TaskChecklistItem } from "@/lib/queries-tasks";

/** Дэлгэрэнгүй хуудасны чеклист — нэмэх, тэмдэглэх, устгах. */
export function TaskChecklist({ taskId, items }: { taskId: string; items: TaskChecklistItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const done = items.filter((i) => i.done).length;

  function add() {
    const v = label.trim();
    if (!v) return;
    start(async () => {
      const res = await addChecklistItem(taskId, v);
      if (!res.error) setLabel("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-ink">Чеклист</h2>
        {items.length > 0 && (
          <span className="text-xs text-muted">{done}/{items.length}</span>
        )}
      </div>

      {items.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${(done / items.length) * 100}%` }}
          />
        </div>
      )}

      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-surface-2">
            <input
              type="checkbox"
              checked={i.done}
              disabled={pending}
              onChange={(e) =>
                start(async () => {
                  await toggleChecklistItem(i.id, e.target.checked);
                  router.refresh();
                })
              }
              className="size-4 accent-emerald-600"
            />
            <span className={`flex-1 text-sm ${i.done ? "text-muted line-through" : "text-ink"}`}>{i.label}</span>
            <button
              type="button"
              aria-label={`${i.label} устгах`}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await deleteChecklistItem(i.id);
                  router.refresh();
                })
              }
              className="text-muted opacity-0 transition hover:text-danger group-hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Алхам нэмэх…"
          className="h-9 w-full rounded-xl border border-line bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={pending || !label.trim()}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl border border-line px-3 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Нэмэх
        </button>
      </div>
    </div>
  );
}
