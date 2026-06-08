"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Loader2 } from "lucide-react";

import { createLead, updateLead, type LeadInput } from "@/lib/actions/crm";
import { Modal } from "@/components/ui/modal";
import {
  LEAD_SOURCES, LEAD_SOURCE_LABEL,
  LEAD_STAGES, LEAD_STAGE_LABEL,
  type LeadSource, type LeadStage,
} from "@/lib/constants";

export type LeadInitial = {
  id: string;
  name: string;
  phone: string | null;
  source: string;
  stage: string;
  score: number | null;
  note: string | null;
  listing_id: string | null;
  project_id: string | null;
};

const sel = "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none";

export function LeadFormButton({
  mode,
  listings,
  projects = [],
  initial,
  defaultProjectId,
}: {
  mode: "create" | "edit";
  listings: { id: string; title: string }[];
  projects?: { id: string; title: string }[];
  initial?: LeadInitial;
  defaultProjectId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [f, setF] = useState<LeadInput>({
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    source: (initial?.source as LeadSource) ?? "referral",
    stage: (initial?.stage as LeadStage) ?? "new",
    score: initial?.score ?? null,
    note: initial?.note ?? "",
    listingId: initial?.listing_id ?? "",
    projectId: initial?.project_id ?? defaultProjectId ?? "",
  });
  const set = (k: keyof LeadInput, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  function save() {
    setErr(null);
    if (!f.name.trim()) { setErr("Нэр оруулна уу."); return; }
    start(async () => {
      const res = mode === "edit" && initial
        ? await updateLead(initial.id, f)
        : await createLead(f);
      if ("error" in res && res.error) { setErr(res.error); return; }
      setOpen(false);
      if (mode === "create") {
        setF({ name: "", phone: "", source: "referral", stage: "new", score: null, note: "", listingId: "", projectId: defaultProjectId ?? "" });
      }
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
          <Plus className="size-4" /> Лид нэмэх
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
        title={mode === "create" ? "Шинэ лид" : "Лид засах"}
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
            <span className="text-xs font-medium text-muted">Нэр *</span>
            <input className={sel} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Үйлчлүүлэгчийн нэр" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Утас</span>
              <input className={sel} value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="99112233" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Оноо</span>
              <input type="number" inputMode="numeric" className={sel} value={f.score ?? ""} onChange={(e) => set("score", e.target.value ? Number(e.target.value) : null)} placeholder="—" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Эх сурвалж</span>
              <select className={sel} value={f.source} onChange={(e) => set("source", e.target.value)}>
                {LEAD_SOURCES.map((s) => <option key={s} value={s}>{LEAD_SOURCE_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Шат</span>
              <select className={sel} value={f.stage} onChange={(e) => set("stage", e.target.value)}>
                {LEAD_STAGES.map((s) => <option key={s} value={s}>{LEAD_STAGE_LABEL[s]}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted">Холбоотой зар</span>
              <select className={sel} value={f.listingId ?? ""} onChange={(e) => set("listingId", e.target.value)}>
                <option value="">— Сонгох —</option>
                {listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted">Төсөл</span>
              <select className={sel} value={f.projectId ?? ""} onChange={(e) => set("projectId", e.target.value)}>
                <option value="">— Сонгох —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted">Тэмдэглэл</span>
            <textarea className="min-h-20 w-full rounded-xl border border-line bg-surface p-3 text-sm focus:border-brand-500 focus:outline-none" value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} placeholder="Хэрэгцээ, төсөв, тэмдэглэл…" />
          </label>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
      </Modal>
    </>
  );
}
