"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Хөнгөн таб — Radix-гүй гар хийц (UI kit хэв маяг).
 * Controlled: value + onValueChange; хүртээмж: role=tablist/tab + arrow навигаци.
 */

export type TabItem = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

export function Tabs({
  items,
  value,
  onValueChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const enabled = items.filter((t) => !t.disabled);
    const idx = enabled.findIndex((t) => t.value === value);
    if (idx === -1) return;
    const next =
      e.key === "ArrowRight"
        ? enabled[(idx + 1) % enabled.length]
        : enabled[(idx - 1 + enabled.length) % enabled.length];
    onValueChange(next.value);
    const btn = listRef.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`);
    btn?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={onKeyDown}
      className={cn("flex items-center gap-1 overflow-x-auto border-b border-line", className)}
    >
      {items.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            data-value={t.value}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onValueChange(t.value)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition disabled:opacity-50",
              active
                ? "border-brand-500 text-brand-700"
                : "border-transparent text-muted hover:border-line-strong hover:text-ink"
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** Табын агуулгын хэсэг — идэвхтэй үед л render хийнэ. */
export function TabPanel({
  when,
  value,
  children,
  className,
}: {
  when: string;
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (when !== value) return null;
  return (
    <div role="tabpanel" className={className}>
      {children}
    </div>
  );
}
