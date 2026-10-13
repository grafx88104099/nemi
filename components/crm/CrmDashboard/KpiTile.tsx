import type { LucideIcon } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * KPI-ийн нэг тоон карт (R-06/R-14). Утга ЗӨВХӨН view-ээс ирнэ —
 * зарчим 9: гар оруулсан дүн самбарт харагдахгүй.
 */
export function KpiTile({
  label,
  value,
  sub,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  tone?: "neutral" | "green" | "rose" | "amber" | "brand";
}) {
  const toneCls =
    tone === "green"
      ? "text-green-700"
      : tone === "rose"
        ? "text-danger"
        : tone === "amber"
          ? "text-amber-700"
          : tone === "brand"
            ? "text-brand-700"
            : "text-ink";
  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted">{label}</p>
            <p className={cn("mt-1 text-2xl font-extrabold tabular-nums", toneCls)}>{value}</p>
            {sub ? <p className="mt-0.5 text-xs text-subtle">{sub}</p> : null}
          </div>
          {Icon ? (
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Icon className="size-4" />
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
