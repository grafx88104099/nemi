"use client";

import { CheckCircle2, CircleAlert, ClipboardCheck } from "lucide-react";

import { CLOSING_CHECK_TAB, closingProgress, type ClosingCheck } from "@/lib/crm/deal-flow";
import { cn } from "@/lib/utils";

/**
 * Хэлцэл хаах босго (§6.17): харилцагчийн баталгаа, гэрээ, төлбөр, баримт,
 * хөлс, хүлээлцэх, CRM, санхүү, борлуулалтын дараах үйлчилгээ (+ МУТСТ).
 * Эх үнэн — DB-ийн crm_txn_closing_checks; мөр бүрээс засах хэсэг рүү.
 */
export function ClosingChecklist({
  checks,
  onJump,
  className,
}: {
  checks: ClosingCheck[];
  /** Мөр дээр дарахад хавтасны тухайн таб руу шилжинэ. */
  onJump?: (tab: string) => void;
  className?: string;
}) {
  const { done, total, ready } = closingProgress(checks);
  const pct = total ? Math.round((done * 100) / total) : 0;
  return (
    <div className={cn("rounded-2xl border border-line bg-surface p-4", className)}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ClipboardCheck className={cn("size-5", ready ? "text-emerald-600" : "text-amber-600")} />
        <h3 className="text-sm font-semibold text-ink">Хэлцэл хаах босго</h3>
        <span className={cn("text-xs font-medium", ready ? "text-emerald-700" : "text-amber-700")}>
          {total ? `${done}/${total} хангагдсан` : "Ачаалж чадсангүй"}
        </span>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className={cn("h-full rounded-full", ready ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${pct}%` }} />
      </div>
      {total === 0 ? (
        <p className="text-sm text-muted">Хаалтын босгыг ачаалж чадсангүй. Хуудсыг шинэчилнэ үү.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {checks.map((c) => {
            const tab = CLOSING_CHECK_TAB[c.code];
            const content = (
              <>
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                ) : (
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                )}
                <span className="min-w-0">
                  <span className={cn("block text-sm", c.ok ? "text-muted" : "font-medium text-ink")}>{c.label}</span>
                  {!c.ok && c.hint ? <span className="block text-xs text-muted">{c.hint}</span> : null}
                </span>
              </>
            );
            return (
              <li key={c.code}>
                {!c.ok && tab && onJump ? (
                  <button
                    type="button"
                    onClick={() => onJump(tab)}
                    className="flex w-full items-start gap-2 rounded-lg p-1.5 text-left hover:bg-surface-2"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex items-start gap-2 p-1.5">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {ready ? (
        <p className="mt-2 text-xs text-emerald-700">
          Бүх босго хангагдсан — Борлуулалт хариуцсан захирал хаалтыг баталгаажуулна.
        </p>
      ) : null}
    </div>
  );
}
