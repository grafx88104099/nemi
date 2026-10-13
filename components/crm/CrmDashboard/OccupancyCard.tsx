import { Building2 } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import type { OccupancyRow } from "@/lib/queries-crm-reports";

/**
 * R-08 дүүргэлтийн товч карт: менежменттэй объект, дүүргэлт %,
 * сул хоног, түрээслүүлэх дундаж хоног (F-565–567).
 */
export function OccupancyCard({ rows }: { rows: OccupancyRow[] }) {
  const managed = rows.reduce((s, r) => s + r.managed_count, 0);
  const occupied = rows.reduce((s, r) => s + r.occupied_count, 0);
  const vacantDays = rows.reduce((s, r) => s + Number(r.vacant_days_total), 0);
  const pct = managed > 0 ? Math.round((100 * occupied) / managed) : null;
  const avgDaysVals = rows.map((r) => r.avg_days_to_rent).filter((x): x is number => x != null);
  const avgDays = avgDaysVals.length
    ? Math.round((avgDaysVals.reduce((s, x) => s + Number(x), 0) / avgDaysVals.length) * 10) / 10
    : null;

  return (
    <Card>
      <CardBody>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Building2 className="size-4 text-brand-600" /> Дүүргэлт (менежменттэй багц)
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <p className="text-2xl font-extrabold tabular-nums text-ink">{pct != null ? `${pct}%` : "—"}</p>
            <p className="text-xs text-muted">Дүүргэлт</p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums text-ink">
              {occupied}/{managed}
            </p>
            <p className="text-xs text-muted">Түрээслэгдсэн / нийт</p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums text-ink">{vacantDays}</p>
            <p className="text-xs text-muted">Сул зогсолтын хоног</p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums text-ink">{avgDays != null ? avgDays : "—"}</p>
            <p className="text-xs text-muted">Түрээслүүлэх дундаж хоног</p>
          </div>
        </div>
        {managed > 0 ? (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct ?? 0}%` }} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Менежменттэй объект бүртгэгдээгүй.</p>
        )}
      </CardBody>
    </Card>
  );
}
