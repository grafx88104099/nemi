"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";

import { addTaskComment } from "@/lib/actions/tasks";
import { relativeDate } from "@/lib/format";
import type { TaskComment } from "@/lib/queries-tasks";

/** Дэлгэрэнгүй хуудасны сэтгэгдлийн хэсэг — түүх + нэмэх форм. */
export function TaskComments({ taskId, comments }: { taskId: string; comments: TaskComment[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function send() {
    const v = body.trim();
    if (!v) return;
    setErr(null);
    start(async () => {
      const res = await addTaskComment(taskId, v);
      if (res.error) { setErr(res.error); return; }
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-ink">Сэтгэгдэл ({comments.length})</h2>

      <div className="space-y-2">
        {comments.map((c) => (
          <div key={c.id} className="rounded-xl border border-line bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">{c.author?.full_name ?? "—"}</span>
              <span className="text-xs text-muted">{relativeDate(c.created_at)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{c.body}</p>
          </div>
        ))}
        {comments.length === 0 && (
          <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">
            Сэтгэгдэл алга. Эхний сэтгэгдлийг үлдээнэ үү.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Сэтгэгдэл бичих…"
          className="min-h-16 w-full rounded-xl border border-line bg-surface p-3 text-sm focus:border-brand-500 focus:outline-none"
        />
        {err && <p className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={send}
            disabled={pending || !body.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Илгээх
          </button>
        </div>
      </div>
    </div>
  );
}
