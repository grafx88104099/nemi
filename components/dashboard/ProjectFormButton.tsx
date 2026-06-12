"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Loader2 } from "lucide-react";

import { createProject, updateProject, type ProjectInput } from "@/lib/actions/crm";
import { Modal } from "@/components/ui/modal";
import {
  PROJECT_TYPES, PROJECT_TYPE_LABEL,
  PROJECT_STATUSES, PROJECT_STATUS_LABEL,
  type ProjectType, type ProjectStatus,
} from "@/lib/constants";

export type ProjectInitial = {
  id: string;
  title: string;
  client_name: string | null;
  client_phone: string | null;
  type: string;
  status: string;
  budget_min: number | null;
  budget_max: number | null;
  target_area: string | null;
  deadline: string | null;
  note: string | null;
};

const sel = "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none";

function toMoney(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

export function ProjectFormButton({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: ProjectInitial;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [f, setF] = useState<ProjectInput>({
    title: initial?.title ?? "",
    clientName: initial?.client_name ?? "",
    clientPhone: initial?.client_phone ?? "",
    type: (initial?.type as ProjectType) ?? "buy",
    status: (initial?.status as ProjectStatus) ?? "active",
    budgetMin: initial?.budget_min ?? null,
    budgetMax: initial?.budget_max ?? null,
    targetArea: initial?.target_area ?? "",
    deadline: initial?.deadline ?? "",
    note: initial?.note ?? "",
  });
  const set = (k: keyof ProjectInput, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  function save() {
    setErr(null);
    if (!f.title.trim()) { setErr("Гарчиг оруулна уу."); return; }
    start(async () => {
      const res = mode === "edit" && initial ? await updateProject(initial.id, f) : await createProject(f);
      if ("error" in res && res.error) { setErr(res.error); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {mode === "create" ? (
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          <Plus className="size-4" /> Шинэ төсөл
        </button>
      ) : (
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-surface-2">
          <Pencil className="size-4" /> Засах
        </button>
      )}

      <Modal
        open={open}
        onClose={() => !saving && setOpen(false)}
        closeOnBackdrop={!saving}
        title={mode === "create" ? "Шинэ төсөл" : "Төсөл засах"}
        footer={
          <div className="flex justify-end gap-2 border-t border-line p-4">
            <button onClick={() => !saving && setOpen(false)} className="rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2">Болих</button>
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {saving && <Loader2 className="size-4 animate-spin" />} Хадгалах
            </button>
          </div>
        }
      >
        <div className="space-y-3 p-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted">Гарчиг *</span>
            <input className={sel} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="ж: Б.Болд — 3 өрөө худалдан авах" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Үйлчлүүлэгч</span>
              <input className={sel} value={f.clientName ?? ""} onChange={(e) => set("clientName", e.target.value)} placeholder="Нэр" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Утас</span>
              <input className={sel} value={f.clientPhone ?? ""} onChange={(e) => set("clientPhone", e.target.value)} placeholder="99112233" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Төрөл</span>
              <select className={sel} value={f.type} onChange={(e) => set("type", e.target.value)}>
                {PROJECT_TYPES.map((t) => <option key={t} value={t}>{PROJECT_TYPE_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Төлөв</span>
              <select className={sel} value={f.status} onChange={(e) => set("status", e.target.value)}>
                {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s].label}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Төсөв доод (₮)</span>
              <input inputMode="numeric" className={sel} value={f.budgetMin != null ? f.budgetMin.toLocaleString("en-US") : ""} onChange={(e) => set("budgetMin", toMoney(e.target.value))} placeholder="2,300,000,000" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Төсөв дээд (₮)</span>
              <input inputMode="numeric" className={sel} value={f.budgetMax != null ? f.budgetMax.toLocaleString("en-US") : ""} onChange={(e) => set("budgetMax", toMoney(e.target.value))} placeholder="—" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Хүссэн байршил</span>
              <input className={sel} value={f.targetArea ?? ""} onChange={(e) => set("targetArea", e.target.value)} placeholder="Дүүрэг, хороолол" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Эцсийн хугацаа</span>
              <input type="date" className={sel} value={f.deadline ?? ""} onChange={(e) => set("deadline", e.target.value)} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted">Тэмдэглэл</span>
            <textarea className="min-h-20 w-full rounded-xl border border-line bg-surface p-3 text-sm focus:border-brand-500 focus:outline-none" value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} placeholder="Шаардлага, нөхцөл, тэмдэглэл…" />
          </label>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
      </Modal>
    </>
  );
}
