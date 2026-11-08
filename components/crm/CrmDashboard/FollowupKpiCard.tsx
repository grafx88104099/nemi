import { CheckCircle2, AlertTriangle, MinusCircle } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import type { KpiResult } from "@/lib/crm/quality";
import { cn } from "@/lib/utils";

/**
 * §8.1 Эргэн холбогдох ажиллагааны 6 KPI — утга, тоологч/хуваагч, жишиг.
 * Тооцох бүртгэлгүй бол «хамааралгүй» (0% гэж харуулахгүй).
 */
export function FollowupKpiCard({ kpis, title = "Эргэн холбогдох ажиллагааны KPI" }: { kpis: KpiResult[]; title?: string }) {
  return (
    <Card>
      <CardBody>
        <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {kpis.map((k) => {
            const Icon = k.status === "ok" ? CheckCircle2 : k.status === "warn" ? AlertTriangle : MinusCircle;
            return (
              <div
                key={k.code}
                className={cn(
                  "rounded-xl border px-3 py-2.5",
                  k.status === "ok" && "border-emerald-200 bg-emerald-50/50",
                  k.status === "warn" && "border-rose-200 bg-rose-50/50",
                  k.status === "na" && "border-line bg-surface-2"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-muted">{k.label}</p>
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      k.status === "ok" ? "text-emerald-600" : k.status === "warn" ? "text-danger" : "text-subtle"
                    )}
                    aria-hidden
                  />
                </div>
                <p
                  className={cn(
                    "mt-1 text-2xl font-extrabold tabular-nums",
                    k.status === "warn" ? "text-danger" : "text-ink"
                  )}
                >
                  {k.value == null ? "—" : `${k.value}%`}
                </p>
                <p className="text-xs text-subtle">
                  {k.value == null ? "Тооцох бүртгэл алга" : `${k.num} / ${k.den}`} · Жишиг: {k.targetLabel}
                </p>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
