"use client";

import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { LEAD_GRADE_LABEL, type LeadGrade, type CrmLifecycle } from "@/lib/constants-crm";

/**
 * ⭐ Алтан дүрмийн блок (зарчим 5, F-125): идэвхтэй сэжимийн 5 бүрдэл —
 * эзэмшигч, ангилал, сүүлийн холболт, дараагийн алхам + огноо. Дутуу нь
 * улаанаар, хэтэрсэн алхам нь анхааруулгаар харагдана. DB CHECK эцсийн хаалт.
 */
export function NextStepGuard({
  status,
  ownerName,
  grade,
  lastContactAt,
  nextStep,
  nextStepDate,
}: {
  status: CrmLifecycle;
  ownerName: string | null;
  grade: LeadGrade | null;
  lastContactAt: string | null;
  nextStep: string | null;
  nextStepDate: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !!nextStepDate && nextStepDate < today;

  const items: { label: string; value: string | null; ok: boolean }[] = [
    { label: "Эзэмшигч", value: ownerName, ok: !!ownerName },
    { label: "Ангилал", value: grade ? LEAD_GRADE_LABEL[grade].label : null, ok: !!grade },
    {
      label: "Сүүлийн холболт",
      value: lastContactAt ? fmtDateTime(lastContactAt) : null,
      ok: !!lastContactAt,
    },
    { label: "Дараагийн алхам", value: nextStep, ok: !!nextStep },
    {
      label: "Алхмын огноо",
      value: nextStepDate ? fmtDate(nextStepDate) : null,
      ok: !!nextStepDate,
    },
  ];
  const missing = items.filter((i) => !i.ok);
  const violated = status === "active" && (missing.length > 0 || overdue);

  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        violated ? "border-rose-200 bg-rose-50" : "border-line bg-surface"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">⭐ Алтан дүрмийн 5 бүрдэл</h3>
        {violated ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
            <AlertTriangle className="size-3.5" /> Зөрчилтэй
          </span>
        ) : status === "active" ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="size-3.5" /> Бүрэн
          </span>
        ) : null}
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((i) => (
          <li key={i.label} className="rounded-xl border border-line bg-surface p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-subtle">
              {i.ok ? (
                <CheckCircle2 className="size-3.5 text-emerald-600" />
              ) : (
                <XCircle className="size-3.5 text-rose-500" />
              )}
              {i.label}
            </div>
            <div className={cn("mt-1 truncate text-sm font-medium", i.ok ? "text-ink" : "text-rose-600")}>
              {i.value ?? "Дутуу"}
            </div>
          </li>
        ))}
      </ul>
      {overdue ? (
        <p className="mt-2 text-xs font-semibold text-rose-700">
          Дараагийн алхмын огноо хэтэрсэн — өнөөдөрт багтаан шинэ алхам товлоно уу.
        </p>
      ) : null}
      {status === "active" && missing.length > 0 ? (
        <p className="mt-2 text-xs text-rose-700">
          Дутуу: {missing.map((m) => m.label).join(", ")} — идэвхтэй сэжим ийм байдлаар хадгалагдахгүй (F-125).
        </p>
      ) : null}
    </div>
  );
}
