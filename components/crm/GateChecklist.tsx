"use client";

import { CheckCircle2, CircleAlert, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { GATE_LABEL, type GateCode } from "@/lib/constants-crm";

/**
 * Шилжих шалгуурын жагсаалт (§6.13, §6.14): дараагийн шатанд орох шаардлага
 * бүрийг хангагдсан/дутуу төлөвтэй нь харуулна. Эх үнэн — DB-ийн crm_check_gate;
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
          {allOk ? "Хангагдсан" : "Дутуу шаардлагатай"}
        </span>
      </div>
      {items.length === 0 ? (
        <EmptyState
          compact
          icon={ShieldCheck}
          title="Нэмэлт шаардлагагүй"
          description="Энэ шатанд шилжихэд тохируулсан шалгуур одоогоор алга."
        />
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
