"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle } from "lucide-react";

import { deleteAgentFully } from "@/lib/actions/agent-account";

export function DeleteAgentButton({
  agentId,
  agentName,
  listingsCount,
}: {
  agentId: string;
  agentName: string;
  listingsCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const match = value.trim() === agentName.trim();

  function onDelete() {
    if (!match) return;
    setErr(null);
    start(async () => {
      const res = await deleteAgentFully(agentId, value);
      if (!res.ok) {
        setErr(res.error ?? "Устгаж чадсангүй");
        return;
      }
      router.push("/office/agents");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
      >
        <Trash2 className="size-4" /> Агентыг бүрэн устгах
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
      <div className="flex items-start gap-2 text-sm text-rose-700">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">Энэ үйлдэл эргэшгүй.</p>
          <p className="mt-0.5">
            «{agentName}» агент, {listingsCount} зар, бүх лид, сэтгэгдэл, мөн нэвтрэлтийн
            бүртгэл бүрмөсөн устана.
          </p>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-rose-700">
          Баталгаажуулахын тулд «{agentName}» гэж бичнэ үү
        </label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={agentName}
          autoFocus
          className="mt-1 w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-rose-500"
        />
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDelete}
          disabled={!match || pending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-40"
        >
          <Trash2 className="size-4" /> {pending ? "Устгаж байна..." : "Бүрмөсөн устгах"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setValue("");
            setErr(null);
          }}
          disabled={pending}
          className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-muted transition hover:bg-surface-2"
        >
          Цуцлах
        </button>
      </div>
    </div>
  );
}
