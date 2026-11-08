import Link from "next/link";
import { Target } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { shortMNT } from "@/lib/format";
import type { Variance } from "@/lib/crm/quality";
import { cn } from "@/lib/utils";

type Row = { label: string; actual: number; budget: number; variance: Variance };

/**
 * §8.5(1) Хаагдсан орлого ба төсвийн харьцуулалт (долоо хоног, сар).
 * Орлого = Санхүү баталгаажуулсан зуучлалын орлого. Төсөвгүй бол
 * тохируулах холбоос харуулна.
 */
export function BudgetVsActualCard({ rows, budgetHref }: { rows: Row[]; budgetHref?: string }) {
  const noBudget = rows.every((r) => r.budget <= 0);
  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Хаагдсан орлого ба төсөв</h2>
          <Target className="size-4 text-muted" aria-hidden />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((r) => {
            const width = r.budget > 0 ? Math.min(100, Math.round((100 * r.actual) / r.budget)) : 0;
            return (
              <div key={r.label} className="rounded-xl border border-line px-3 py-2.5">
                <p className="text-xs font-medium text-muted">{r.label}</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums text-ink">{shortMNT(r.actual)}</p>
                <p className="text-xs text-subtle">Төсөв: {r.budget > 0 ? shortMNT(r.budget) : "тогтоогоогүй"}</p>
                {r.budget > 0 && (
                  <>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={cn("h-full rounded-full", r.variance.status === "ok" ? "bg-emerald-500" : "bg-amber-500")}
                        style={{ width: `${Math.max(2, width)}%` }}
                      />
                    </div>
                    <p className={cn("mt-1 text-xs font-semibold", r.variance.variance >= 0 ? "text-emerald-700" : "text-danger")}>
                      Зөрүү: {r.variance.variance >= 0 ? "+" : "−"}
                      {shortMNT(Math.abs(r.variance.variance))} · биелэлт {r.variance.pct ?? "—"}%
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {noBudget && budgetHref && (
          <p className="mt-3 text-xs text-muted">
            Төсөв оруулаагүй байна.{" "}
            <Link href={budgetHref} className="font-semibold text-brand-700 hover:underline">
              Төсөв тохируулах
            </Link>
          </p>
        )}
      </CardBody>
    </Card>
  );
}
