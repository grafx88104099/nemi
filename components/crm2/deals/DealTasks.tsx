"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, ListTodo, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { TaskBucketBadge, TaskStatusBadge } from "@/components/crm2/ui/badges";
import { createTask, setTaskStatus, updateTask } from "@/lib/crm2/actions/tasks";
import { isoToUbInput, taskBucket } from "@/lib/crm2/datetime";
import { CALL_NEXT_ACTIONS, TASK_KIND_LABEL } from "@/lib/crm2/labels";
import type { Crm2TaskKind, Crm2TaskStatus } from "@/lib/crm2/types";
import { fmtDateTime } from "@/lib/format";

export type DealTaskView = {
  id: string;
  kind: Crm2TaskKind;
  status: Crm2TaskStatus;
  due_at: string | null;
  note: string | null;
  assignee_id: string;
  assigneeName: string | null;
  done_at: string | null;
};

/**
 * Хэлцлийн ажил (дараагийн алхам): нээлттэй нь хугацааны бүлэгтэй, «Хийсэн» /
 * «Цуцлах» / «Хугацаа өөрчлөх»; хаагдсан нь эвхмэл жагсаалтад. Нээлттэй хэлцэлд
 * засах эрхтэн «Ажил нэмэх». Эрхийг DB шалгана (алдааг цонхондоо харуулна).
 */
export function DealTasks({
  tasks,
  me,
  canEdit,
  now,
  dealId,
  dealOpen,
  assigneeId,
}: {
  tasks: DealTaskView[];
  me: string | null;
  canEdit: boolean;
  now: number;
  dealId: string;
  /** Хаагдсан/цуцлагдсан хэлцэлд шинэ ажил нэмэхгүй. */
  dealOpen: boolean;
  /** Шинэ ажлын хариуцагч (хэлцлийн хариуцагч, эрхгүй бол өөрөө). */
  assigneeId: string | null;
}) {
  const [adding, setAdding] = React.useState(false);
  const open = tasks
    .filter((t) => t.status === "open")
    .sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));
  const closed = tasks.filter((t) => t.status !== "open");
  const canAdd = canEdit && dealOpen;

  return (
    <div className="space-y-3">
      {tasks.length === 0 && !adding ? (
        <p className="text-sm text-muted">Ажил алга. Дуудлага бүртгэхдээ эсвэл «Ажил нэмэх»-ээр дараагийн алхам нэмнэ.</p>
      ) : null}
      {open.length ? (
        <ul className="space-y-2">
          {open.map((t) => (
            <TaskRow key={t.id} t={t} canAct={canEdit || t.assignee_id === me} now={now} />
          ))}
        </ul>
      ) : tasks.length ? (
        <p className="text-sm text-muted">Нээлттэй ажил алга.</p>
      ) : null}

      {canAdd ? (
        adding ? (
          <AddTaskForm dealId={dealId} assigneeId={assigneeId} onDone={() => setAdding(false)} />
        ) : (
          <Button type="button" size="touch" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> Ажил нэмэх
          </Button>
        )
      ) : null}

      {closed.length ? (
        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-ink">Хаагдсан ажил ({closed.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {closed.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <TaskStatusBadge status={t.status} />
                <span className="font-medium text-ink">{TASK_KIND_LABEL[t.kind]}</span>
                {t.done_at ? <span>· {fmtDateTime(t.done_at)}</span> : null}
                {t.note ? <span className="min-w-0 truncate">· {t.note}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function AddTaskForm({ dealId, assigneeId, onDone }: { dealId: string; assigneeId: string | null; onDone: () => void }) {
  const router = useRouter();
  const ids = React.useId();
  const [kind, setKind] = React.useState<Crm2TaskKind>(CALL_NEXT_ACTIONS[0]);
  const [due, setDue] = React.useState("");
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await createTask({ kind, due_at: due, note, deal_id: dealId, assignee_id: assigneeId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Ажил нэмэгдлээ", { description: "«Миний ажил»-д харагдана." });
      router.refresh();
      onDone();
    } catch (err) {
      console.error("AddTaskForm:", err);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Ажил" htmlFor={`${ids}-kind`}>
          <Select id={`${ids}-kind`} value={kind} onChange={(e) => setKind(e.target.value as Crm2TaskKind)}>
            {CALL_NEXT_ACTIONS.map((k) => (
              <option key={k} value={k}>
                {TASK_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Хугацаа" htmlFor={`${ids}-due`}>
          <Input id={`${ids}-due`} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      <Field label="Тэмдэглэл (заавал биш)" htmlFor={`${ids}-note`}>
        <Input id={`${ids}-note`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </Field>
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" size="touch" variant="ghost" onClick={onDone} disabled={pending}>
          Болих
        </Button>
        <Button type="submit" size="touch" disabled={pending}>
          {pending ? "Хадгалж байна…" : "Ажил хадгалах"}
        </Button>
      </div>
    </form>
  );
}

function TaskRow({ t, canAct, now }: { t: DealTaskView; canAct: boolean; now: number }) {
  const router = useRouter();
  const ids = React.useId();
  const [pending, setPending] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [due, setDue] = React.useState(() => isoToUbInput(t.due_at));
  const [error, setError] = React.useState<string | null>(null);

  async function set(status: Crm2TaskStatus) {
    setPending(true);
    setError(null);
    try {
      const res = await setTaskStatus(t.id, status);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Санамсаргүй дарсан бол буцаана (DB: хийсэн/цуцалсан → нээлттэй зөвшөөрнө).
      toast.success(status === "done" ? "Ажил хийгдлээ" : "Ажил цуцлагдлаа", {
        action: {
          label: "Буцаах",
          onClick: () => {
            void setTaskStatus(t.id, "open").then((r) => {
              if (r.ok) {
                toast.info("Ажлыг дахин нээлээ");
                router.refresh();
              } else toast.error(r.error);
            });
          },
        },
      });
      router.refresh();
    } catch (err) {
      console.error("TaskRow:", err);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  async function saveDue(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await updateTask({ task_id: t.id, due_at: due });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Хугацаа шинэчлэгдлээ");
      setEditing(false);
      router.refresh();
    } catch (err) {
      console.error("TaskRow due:", err);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <ListTodo className="size-4 shrink-0 text-muted" aria-hidden />
        <span className="text-sm font-medium text-ink">{TASK_KIND_LABEL[t.kind]}</span>
        <TaskBucketBadge bucket={taskBucket(t.due_at, now)} />
      </div>
      <p className="mt-1 text-xs text-muted">
        {t.due_at ? fmtDateTime(t.due_at) : "Хугацаагүй"} · {t.assigneeName ?? "Ажилтан"}
      </p>
      {t.note ? <p className="mt-1 break-words text-sm text-ink">{t.note}</p> : null}
      {canAct && editing ? (
        <form onSubmit={saveDue} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Field label="Шинэ хугацаа" htmlFor={`${ids}-due`}>
              <Input id={`${ids}-due`} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="touch" disabled={pending}>
              Хадгалах
            </Button>
            <Button
              type="button"
              size="touch"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setDue(isoToUbInput(t.due_at));
                setError(null);
              }}
            >
              Болих
            </Button>
          </div>
        </form>
      ) : canAct ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="touch" variant="secondary" onClick={() => void set("done")} disabled={pending}>
            <Check className="size-4" aria-hidden /> Хийсэн
          </Button>
          <Button type="button" size="touch" variant="ghost" onClick={() => setEditing(true)} disabled={pending}>
            <CalendarClock className="size-4" aria-hidden /> Хугацаа өөрчлөх
          </Button>
          <Button type="button" size="touch" variant="ghost" onClick={() => void set("cancelled")} disabled={pending}>
            <X className="size-4" aria-hidden /> Цуцлах
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}
    </li>
  );
}
