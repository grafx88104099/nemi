"use client";

import { CheckCircle2, Circle } from "lucide-react";

import { cn } from "@/lib/utils";
import { DOC_CATEGORY_LABEL, type DocCategory } from "@/lib/constants-crm";

/**
 * Хавтасны бүрэн байдлын % (F-409) — шаардлагатай баримтын ангилал бүрийн
 * бүрдэлтэй прогресс. 100% биш бол хаалт + шимтгэлийн «Хянасан» хоёул хаалттай.
 */
export function CompletenessBar({
  pct,
  required,
}: {
  pct: number;
  required: { category: string; label: string; present: boolean }[];
}) {
  const full = pct >= 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-ink">Хавтасны бүрэн байдал</span>
        <span className={cn("font-semibold", full ? "text-emerald-600" : "text-amber-600")}>
          {Math.round(pct)}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full rounded-full transition-all", full ? "bg-emerald-500" : "bg-amber-500")}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      {required.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {required.map((r) => (
            <span
              key={r.category}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                r.present
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-line bg-surface-2 text-muted"
              )}
            >
              {r.present ? <CheckCircle2 className="size-3" /> : <Circle className="size-3" />}
              {DOC_CATEGORY_LABEL[r.category as DocCategory] ?? r.label}
            </span>
          ))}
        </div>
      )}
      {!full && (
        <p className="text-xs text-muted">
          100% болтол хаалтын шат болон шимтгэлийн «Хянасан» төлөв хориглогдоно (F-409/416).
        </p>
      )}
    </div>
  );
}
