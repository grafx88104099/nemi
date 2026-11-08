"use client";

import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { ubToday } from "@/lib/crm/agent-core";
import { LEAD_GRADE_LABEL, type LeadGrade, type CrmLifecycle } from "@/lib/constants-crm";

/**
 * Идэвхтэй сэжимийн заавал бүрдэл (§6.1): эзэмшигч, шат, ангилал, сүүлийн
 * холболт, дараагийн үйлдэл ба огноо. Дутуу нь улаанаар, хэтэрсэн нь
 * анхааруулгаар харагдана. DB CHECK эцсийн хамгаалалт.
 */
export function NextStepGuard({
  status,
  ownerName,
  grade,
  lastContactAt,
  nextStep,
  nextStepDate,
  stageName,
}: {
  status: CrmLifecycle;
  ownerName: string | null;
  grade: LeadGrade | null;
  lastContactAt: string | null;
  nextStep: string | null;
  nextStepDate: string | null;
  /** Холбоотой боломжийн шат (байхгүй бол сэжимийн эхний шат). */
  stageName?: string | null;
}) {
  const today = ubToday();
  const overdue = !!nextStepDate && nextStepDate < today && (status === "active" || status === "new");

  const items: { label: string; value: string | null; ok: boolean }[] = [
    { label: "Эзэмшигч", value: ownerName, ok: !!ownerName },
    { label: "Шат", value: stageName ?? (status === "new" ? "Шинэ" : "Холбогдсон"), ok: true },
    { label: "Ангилал", value: grade ? LEAD_GRADE_LABEL[grade].label : null, ok: !!grade },
    { label: "Сүүлийн холболт", value: lastContactAt ? fmtDateTime(lastContactAt) : null, ok: !!lastContactAt },
    { label: "Дараагийн үйлдэл", value: nextStep, ok: !!nextStep },
    { label: "Үйлдлийн огноо", value: nextStepDate ? fmtDate(nextStepDate) : null, ok: !!nextStepDate },
  ];
  const missing = items.filter((i) => !i.ok);
  const violated = status === "active" && (missing.length > 0 || overdue);

  return (
    <div className={cn("rounded-2xl border p-4", violated || overdue ? "border-rose-200 bg-rose-50" : "border-line bg-surface")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">Идэвхтэй сэжимийн заавал бүрдэл</h3>
        {violated ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
            <AlertTriangle className="size-3.5" /> Анхаарах
          </span>
        ) : status === "active" ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="size-3.5" /> Бүрэн
          </span>
        ) : null}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((i) => (
          <li key={i.label} className="rounded-xl border border-line bg-surface p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-subtle">
              {i.ok ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <XCircle className="size-3.5 text-rose-500" />}
              {i.label}
            </div>
            <div className={cn("mt-1 truncate text-sm font-medium", i.ok ? "text-ink" : "text-rose-600")}>{i.value ?? "Дутуу"}</div>
          </li>
        ))}
      </ul>
      {overdue ? (
        <p className="mt-2 text-xs font-semibold text-rose-700">
          Дараагийн үйлдлийн огноо хэтэрсэн — өнөөдөр арга хэмжээ авч, шинэ үйлдлээ товлоно уу.
        </p>
      ) : null}
      {status === "active" && missing.length > 0 ? (
        <p className="mt-2 text-xs text-rose-700">Дутуу: {missing.map((m) => m.label).join(", ")}.</p>
      ) : null}
    </div>
  );
}
