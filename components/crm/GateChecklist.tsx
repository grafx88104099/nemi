"use client";

import { CheckCircle2, CircleAlert, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { GATE_LABEL, type GateCode } from "@/lib/constants-crm";

/**
 * Гейтийн checklist (F-354): дараагийн шатны босго шаардлага бүрийг
 * хангагдсан/дутуу төлөвтэй нь жагсаана. Эх үнэн — DB-ийн crm_check_gate;
 * items-ийг серверээс (gate_requirements + gate_missing) угсарч дамжуулна.
 */
export function GateChecklist({
  gateCode,
  items,
  className,
}: {
  gateCode: GateCode;
  items: { label: string; ok: boolean }[];
  className?: string;
}) {
  const allOk = items.every((i) => i.ok);
  return (
    <div className={cn("rounded-xl border border-line bg-surface-2 p-4", className)}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
        <ShieldCheck className={cn("size-4", allOk ? "text-emerald-600" : "text-amber-600")} />
        {GATE_LABEL[gateCode]}
        <span className={cn("text-xs font-medium", allOk ? "text-emerald-700" : "text-amber-700")}>
          {allOk ? "Нээлттэй" : "Дутуу шаардлагатай"}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted">Энэ гейтэд идэвхтэй шаардлага тохируулаагүй байна.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.label} className="flex items-center gap-2 text-sm">
              {it.ok ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              ) : (
                <CircleAlert className="size-4 shrink-0 text-amber-600" />
              )}
              <span className={it.ok ? "text-muted line-through decoration-line" : "text-ink"}>{it.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
