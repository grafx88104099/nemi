"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Loader2, X } from "lucide-react";

import { createTask, updateTask } from "@/lib/actions/tasks";
import type { TaskInput } from "@/lib/validation/task";
import { Modal } from "@/components/ui/modal";
import {
  TASK_STATUSES, TASK_STATUS_LABEL,
  TASK_PRIORITIES, TASK_PRIORITY_LABEL,
  TASK_MEMBER_ROLES, TASK_MEMBER_ROLE_LABEL,
  type TaskStatus, type TaskPriority, type TaskMemberRole,
} from "@/lib/constants";
import type { AssigneeOption } from "@/lib/queries-tasks";

const sel = "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none";

export type TaskInitial = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string | null;
  responsible_id: string;
  project_id: string | null;
  tags: string[];
  members: { profile_id: string; role: TaskMemberRole }[];
};

/** ISO → datetime-local утга (локал цагаар). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function TaskFormButton({
  mode,
  assignees,
  projects = [],
  initial,
  defaultResponsibleId,
}: {
  mode: "create" | "edit";
  assignees: AssigneeOption[];
  projects?: { id: string; title: string }[];
  initial?: TaskInitial;
  defaultResponsibleId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const blank = {
    title: "",
    description: "",
    status: "pending" as TaskStatus,
    priority: "normal" as TaskPriority,
    deadline: "",
    responsibleId: defaultResponsibleId ?? assignees[0]?.profileId ?? "",
    projectId: "",
    tagsText: "",
    members: [] as { profileId: string; role: TaskMemberRole }[],
  };

  const [f, setF] = useState(() =>
    initial
      ? {
          title: initial.title,
          description: initial.description ?? "",
          status: initial.status,
          priority: initial.priority,
          deadline: toLocalInput(initial.deadline),
          responsibleId: initial.responsible_id,
          projectId: initial.project_id ?? "",
          tagsText: initial.tags.join(", "),
          members: initial.members.map((m) => ({ profileId: m.profile_id, role: m.role })),
        }
      : blank
  );
  const set = (k: keyof typeof f, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  const [memberPick, setMemberPick] = useState("");
  const [memberRole, setMemberRole] = useState<TaskMemberRole>("observer");

  const nameOf = (pid: string) => assignees.find((a) => a.profileId === pid)?.name ?? pid.slice(0, 8);
  const availableMembers = assignees.filter(
    (a) => a.profileId !== f.responsibleId && !f.members.some((m) => m.profileId === a.profileId)
  );

  function addMember() {
    if (!memberPick) return;
    set("members", [...f.members, { profileId: memberPick, role: memberRole }]);
    setMemberPick("");
  }

  function save() {
    setErr(null);
    if (!f.title.trim()) { setErr("Гарчиг оруулна уу."); return; }
    if (!f.responsibleId) { setErr("Хариуцагч сонгоно уу."); return; }
    const payload: TaskInput = {
      title: f.title,
      description: f.description,
      status: f.status,
      priority: f.priority,
      deadline: f.deadline ? new Date(f.deadline).toISOString() : null,
      responsibleId: f.responsibleId,
      projectId: f.projectId || null,
      tags: f.tagsText.split(",").map((s) => s.trim()).filter(Boolean),
      members: f.members.filter((m) => m.profileId !== f.responsibleId),
    };
    start(async () => {
      const res = mode === "edit" && initial ? await updateTask(initial.id, payload) : await createTask(payload);
      const failed = ("error" in res && res.error) || ("ok" in res && !res.ok);
      if (failed) {
        setErr(("error" in res && res.error) ? res.error : "Хадгалахад алдаа гарлаа.");
        return;
      }
      setOpen(false);
      if (mode === "create") setF(blank);
      router.refresh();
    });
  }

  return (
    <>
      {mode === "create" ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="size-4" /> Даалгавар үүсгэх
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-surface-2"
        >
          <Pencil className="size-4" /> Засах
        </button>
      )}

      <Modal
        open={open}
        onClose={() => !saving && setOpen(false)}
        closeOnBackdrop={!saving}
        title={mode === "create" ? "Шинэ даалгавар" : "Даалгавар засах"}
        footer={
          <div className="flex justify-end gap-2 border-t border-line p-4">
            <button
              onClick={() => !saving && setOpen(false)}
              disabled={saving}
              className="rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 disabled:opacity-50"
            >
              Болих
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="size-4 animate-spin" />} Хадгалах
            </button>
          </div>
        }
      >
        <div className="space-y-3 p-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted">Гарчиг *</span>
            <input className={sel} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Даалгаврын нэр" />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted">Тайлбар</span>
            <textarea
              className="min-h-20 w-full rounded-xl border border-line bg-surface p-3 text-sm focus:border-brand-500 focus:outline-none"
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Хариуцагч *</span>
              <select className={sel} value={f.responsibleId} onChange={(e) => set("responsibleId", e.target.value)}>
                {assignees.map((a) => (
                  <option key={a.profileId} value={a.profileId}>{a.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Дуусах хугацаа</span>
              <input type="datetime-local" className={sel} value={f.deadline} onChange={(e) => set("deadline", e.target.value)} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Төлөв</span>
              <select className={sel} value={f.status} onChange={(e) => set("status", e.target.value as TaskStatus)}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{TASK_STATUS_LABEL[s].label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Эрэмбэ</span>
              <select className={sel} value={f.priority} onChange={(e) => set("priority", e.target.value as TaskPriority)}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{TASK_PRIORITY_LABEL[p].label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Төсөл</span>
              <select className={sel} value={f.projectId} onChange={(e) => set("projectId", e.target.value)}>
                <option value="">— Сонгох —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Шошго (таслалаар)</span>
              <input className={sel} value={f.tagsText} onChange={(e) => set("tagsText", e.target.value)} placeholder="яаралтай, гэрээ" />
            </label>
          </div>

          {/* Ажиглагч / оролцогч */}
          <div className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
            <span className="text-xs font-medium text-muted">Ажиглагч / Оролцогч</span>
            {f.members.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {f.members.map((m) => (
                  <span key={m.profileId} className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs text-ink">
                    {nameOf(m.profileId)}
                    <span className="text-muted">· {TASK_MEMBER_ROLE_LABEL[m.role]}</span>
                    <button
                      type="button"
                      aria-label={`${nameOf(m.profileId)} хасах`}
                      onClick={() => set("members", f.members.filter((x) => x.profileId !== m.profileId))}
                      className="text-muted hover:text-danger"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <select className={sel} value={memberPick} onChange={(e) => setMemberPick(e.target.value)}>
                <option value="">— Хүн сонгох —</option>
                {availableMembers.map((a) => (
                  <option key={a.profileId} value={a.profileId}>{a.name}</option>
                ))}
              </select>
              <select
                className="h-10 shrink-0 rounded-xl border border-line bg-surface px-2 text-sm focus:border-brand-500 focus:outline-none"
                value={memberRole}
                onChange={(e) => setMemberRole(e.target.value as TaskMemberRole)}
              >
                {TASK_MEMBER_ROLES.map((r) => (
                  <option key={r} value={r}>{TASK_MEMBER_ROLE_LABEL[r]}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={addMember}
                disabled={!memberPick}
                className="h-10 shrink-0 rounded-xl border border-line px-3 text-sm font-medium text-ink hover:bg-surface disabled:opacity-50"
              >
                Нэмэх
              </button>
            </div>
          </div>

          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
      </Modal>
    </>
  );
}
