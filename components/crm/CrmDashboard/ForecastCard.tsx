import { Card, CardBody } from "@/components/ui/card";
import { shortMNT } from "@/lib/format";
import type { ForecastTotals } from "@/lib/queries-crm-reports";

/**
 * Жинлэсэн урсгал + 30/60/90 хоногийн төсөөлөл (R-06, нэгдсэн
 * тодорхойлолт: Σ(amount × шатны магадлал)).
 */
export function ForecastCard({ totals }: { totals: ForecastTotals }) {
  const windows = [
    { label: "30 хоног", value: totals.weighted_30 },
    { label: "60 хоног", value: totals.weighted_60 },
    { label: "90 хоног", value: totals.weighted_90 },
  ];
  const max = Math.max(totals.weighted_90, 1);
  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Борлуулалтын төсөөлөл</h2>
          <span className="text-xs text-muted">{totals.open_count} нээлттэй боломж</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <p className="text-2xl font-extrabold tabular-nums text-ink">{shortMNT(totals.weighted_amount)}</p>
            <p className="text-xs text-muted">Жинлэсэн урсгал</p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums text-ink">{shortMNT(totals.total_amount)}</p>
            <p className="text-xs text-muted">Нийт дүн</p>
          </div>
          {totals.aml_held_count > 0 ? (
            <div>
              <p className="text-lg font-bold tabular-nums text-danger">{totals.aml_held_count}</p>
              <p className="text-xs text-muted">МУТСТ саатуулсан</p>
            </div>
          ) : null}
        </div>
        <div className="mt-4 space-y-2">
          {windows.map((w) => (
            <div key={w.label} className="flex items-center gap-3 text-sm">
              <span className="w-20 shrink-0 text-muted">{w.label}</span>
              <div className="h-4 flex-1 overflow-hidden rounded-lg bg-surface-2">
                <div
                  className="h-full rounded-lg bg-brand-500"
                  style={{ width: `${Math.max(2, Math.round((100 * w.value) / max))}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-ink">{shortMNT(w.value)}</span>
            </div>
          ))}
        </div>
        {totals.byPipeline.length ? (
          <div className="mt-4 grid gap-1 border-t border-line pt-3 text-xs">
            {totals.byPipeline.map((p) => (
              <div key={p.pipeline_code} className="flex items-center justify-between">
                <span className="truncate text-muted">
                  {p.pipeline_code} · {p.pipeline_name}
                </span>
                <span className="shrink-0 tabular-nums text-ink">
                  {p.open_count} · {shortMNT(p.weighted_amount)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
