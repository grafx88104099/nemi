"use client";

import { ChevronRight, CircleCheck, Footprints } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NextStep } from "@/lib/crm2/checklist";

import { useCardSheet } from "./sheets/use-card-sheet";

/**
 * Картын гарчгийн доорх нэг мөр «Дараагийн алхам: …» (P3). Дарахад шалгах жагсаалт (4 бүлэг) нээгдэнэ.
 * Гар утсанд бүтэн өргөн, ≥44px.
 */
export function NextStepLine({ next, percent }: { next: NextStep; percent: number }) {
  const { open } = useCardSheet();
  const complete = !next.group;
  const Icon = complete ? CircleCheck : Footprints;
  return (
    <button
      type="button"
      onClick={() => open("checklist")}
      aria-label={`Дараагийн алхам: ${next.label}. Гүйцэтгэл ${percent}%. Шалгах жагсаалт нээх`}
      className={cn(
        "flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition sm:w-auto sm:max-w-full",
        complete ? "bg-emerald-50 text-emerald-900 hover:bg-emerald-100" : "bg-brand-50 text-brand-800 hover:bg-brand-100"
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 break-words">
        <span className="font-medium">Дараагийн алхам:</span> <span className="font-bold">{next.label}</span>
      </span>
      <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold tabular-nums">{percent}%</span>
      <ChevronRight className="size-4 shrink-0" aria-hidden />
    </button>
  );
}
