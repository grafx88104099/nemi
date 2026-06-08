"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";

import { logActivity } from "@/lib/actions/crm";
import { ACTIVITY_KINDS, ACTIVITY_KIND_LABEL, type ActivityKind } from "@/lib/constants";

/** datetime-local-д тохирох орон нутгийн «одоо» утга. */
function localNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function LogActivityForm({ leadId, projectId }: { leadId?: string; projectId?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<ActivityKind>("call");
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  // Хоосон эхэлж, mount-ийн дараа клиент талд бөглөнө — сервер↔клиент
  // огнооны зөрүүгээс үүсэх hydration mismatch-аас сэргийлнэ.
  const [occurredAt, setOccurredAt] = useState("");
  const [duration, setDuration] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Зориуд: mount-ийн дараа клиентийн «одоо»-г тавина (hydration mismatch-аас сэргийлнэ).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOccurredAt(localNow());
  }, []);

  const sel = "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!summary.trim()) {
      setErr("Товч агуулга оруулна уу.");
      return;
    }
    start(async () => {
      const res = await logActivity({
        leadId,
        projectId,
        kind,
        summary,
        outcome: outcome || undefined,
        durationMin: duration ? Number(duration) : null,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
      });
      if (!res.ok) {
        setErr(res.error ?? "Хадгалахад алдаа гарлаа.");
        return;
      }
      setSummary("");
      setOutcome("");
      setDuration("");
      setOccurredAt(localNow());
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted">Төрөл</span>
          <select className={sel} value={kind} onChange={(e) => setKind(e.target.value as ActivityKind)}>
            {ACTIVITY_KINDS.map((k) => (
              <option key={k} value={k}>{ACTIVITY_KIND_LABEL[k]}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted">Огноо/цаг</span>
          <input
            type="datetime-local"
            className={sel}
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted">Үргэлжлэх (мин)</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className={sel}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="—"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted">Товч агуулга</span>
        <textarea
          className="min-h-20 w-full rounded-xl border border-line bg-surface p-3 text-sm focus:border-brand-500 focus:outline-none"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Ярианы товч агуулга, чухал зүйлс…"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted">Дараагийн алхам / үр дүн (заавал биш)</span>
        <input
          className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="ж: Маргааш үзлэг товлоно"
        />
      </label>

      {err && <p className="text-sm text-danger">{err}</p>}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Бүртгэх
      </button>
    </form>
  );
}
