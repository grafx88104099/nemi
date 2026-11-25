"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { missingItemLabel } from "@/lib/crm2/labels";

/** 16px гар утсанд (iOS томруулахгүй), 44px өндөр. */
export const INPUT_CLASS =
  "h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3.5 text-base text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50 sm:text-sm";

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

export type MissingRow = { key: string; label?: string; /** onOpen-оор нээж нөхөх боломжтой. */ openable?: boolean };

/**
 * Дутуу зүйлсийн жагсаалт (товч яагаад идэвхгүйг тайлбарлана). items — кодын жагсаалт (нэрийг
 * missingItemLabel-ээс) эсвэл мөр; openable мөрийг onOpen өгсөн үед товч болгоно (нөхөх цонхыг нээнэ).
 */
export function MissingList({
  items,
  title,
  id,
  className,
  tone = "amber",
  onOpen,
}: {
  items: readonly (string | MissingRow)[];
  title: string;
  id?: string;
  className?: string;
  /** amber — бүртгэлийг саатуулна; muted — саатуулахгүй (дараа нь нөхөж болно). */
  tone?: "amber" | "muted";
  onOpen?: (key: string) => void;
}) {
  if (!items.length) return null;
  const rows = items.map((i) => (typeof i === "string" ? { key: i } : i));
  return (
    <div
      id={id}
      className={cn(
        "min-w-0 rounded-xl border px-3 py-2 text-sm",
        tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-line bg-surface-2 text-ink",
        className
      )}
    >
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {rows.map((r) => {
          const label = r.label ?? missingItemLabel(r.key);
          return (
            <li key={r.key} className="min-w-0">
              {r.openable && onOpen ? (
                <button
                  type="button"
                  onClick={() => onOpen(r.key)}
                  className="flex min-h-11 w-full items-center gap-1 rounded-lg text-left font-medium underline-offset-2 hover:underline"
                >
                  <span className="min-w-0 flex-1 break-words">{label}</span>
                  <ChevronRight className="size-4 shrink-0" aria-hidden />
                </button>
              ) : (
                <span className="flex gap-2">
                  <span aria-hidden>•</span>
                  <span className="min-w-0 break-words">{label}</span>
                </span>
              )}
            </li>
          );
        })}
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
