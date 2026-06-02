import * as React from "react";

import { cn } from "@/lib/utils";

type Tone = "neutral" | "green" | "rose" | "amber" | "blue" | "brand";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-line",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  blue: "bg-sky-50 text-sky-700 border-sky-200",
  brand: "bg-brand-50 text-brand-700 border-brand-200",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold [&_svg]:size-3",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
