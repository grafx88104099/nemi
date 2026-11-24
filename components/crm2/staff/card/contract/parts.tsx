"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { missingItemLabel } from "@/lib/crm2/labels";

/** 16px гар утсанд (iOS томруулахгүй), 44px өндөр. */
export const INPUT_CLASS =
  "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-base text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50 sm:text-sm";

export const TEXTAREA_CLASS =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50 sm:text-sm";

/** Урьдчилан бөглөсөн (шар) талбарын хүрээ. */
export const PREFILLED_CLASS = "border-amber-300 bg-amber-50";

/** Сонголтын чип (≥44px). */
export function Chip({
  on,
  onClick,
  disabled,
  children,
  className,
}: {
  on?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition disabled:opacity-50",
        on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink hover:bg-surface-2",
        className
      )}
    >
      {children}
    </button>
  );
}

/** «Оффисын анхдагч · шалгана уу [Зөв]» мөр. */
export function PrefillTag({ onConfirm, disabled, label = "оффисын анхдагч · шалгана уу" }: { onConfirm: () => void; disabled?: boolean; label?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-2 py-1">
      <span className="text-xs font-semibold text-amber-900">{label}</span>
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 sm:min-h-9"
      >
        <Check className="size-4" aria-hidden /> Зөв
      </button>
    </div>
  );
}

/** Дутуу зүйлсийн жагсаалт (илгээх товч яагаад идэвхгүйг тайлбарлана). */
export function MissingList({
  items,
  title,
  id,
  className,
}: {
  items: readonly string[];
  title: string;
  id?: string;
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <div id={id} className={cn("rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900", className)}>
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {items.map((m) => (
          <li key={m}>{missingItemLabel(m)}</li>
        ))}
      </ul>
    </div>
  );
}

export function SectionTitle({ children, step }: { children: React.ReactNode; step?: string }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
      {step ? <span className="flex size-6 items-center justify-center rounded-full bg-brand-50 text-xs text-brand-700">{step}</span> : null}
      {children}
    </h3>
  );
}
