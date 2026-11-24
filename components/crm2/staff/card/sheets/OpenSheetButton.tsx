"use client";

import { Pencil } from "lucide-react";

import { useCardSheet } from "./use-card-sheet";
import type { CardSheetParam } from "./sheet-model";

/** Картын хэсгийн «Засах» — тухайн доод цонхыг нээнэ (≥44px утсанд). */
export function OpenSheetButton({ sheet, field, label = "Засах" }: { sheet: CardSheetParam; field?: string; label?: string }) {
  const { open } = useCardSheet();
  return (
    <button
      type="button"
      onClick={() => open(sheet, field ?? null)}
      className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 sm:min-h-8"
    >
      <Pencil className="size-3.5" aria-hidden /> {label}
    </button>
  );
}
