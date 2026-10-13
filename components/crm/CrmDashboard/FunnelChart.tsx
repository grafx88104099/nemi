import { Card, CardBody } from "@/components/ui/card";
import { shortMNT } from "@/lib/format";
import type { LeadFunnelRow } from "@/lib/queries-crm-reports";

/**
 * Сэжимийн юүлүүр (R-06): Нийт → Идэвхтэй → Боломж болсон → Амжилттай.
 * Гар бичмэл CSS bar — гадны chart library ХОРИОТОЙ (DESIGN §5).
 */
export function FunnelChart({ rows }: { rows: LeadFunnelRow[] }) {
  const total = rows.reduce((s, r) => s + r.leads_total, 0);
  const active = rows.reduce((s, r) => s + r.leads_active, 0);
  const qualified = rows.reduce((s, r) => s + r.leads_qualified, 0);
  const won = rows.reduce((s, r) => s + r.leads_won, 0);
  const wonAmount = rows.reduce((s, r) => s + Number(r.won_amount), 0);
  const slaMet = rows.reduce((s, r) => s + r.sla_met, 0);
  const slaTotal = rows.reduce((s, r) => s + r.sla_total, 0);

  const steps = [
    { label: "Нийт сэжим", value: total, tone: "bg-brand-300" },
    { label: "Идэвхтэй", value: active, tone: "bg-brand-400" },
    { label: "Боломж болсон", value: qualified, tone: "bg-brand-500" },
    { label: "Амжилттай хаагдсан", value: won, tone: "bg-brand-700" },
  ];
  const max = Math.max(total, 1);
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "—");

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Сэжимийн юүлүүр</h2>
          <span className="text-xs text-muted">
            Эхний холболтын SLA: {pct(slaMet, slaTotal)} ({slaMet}/{slaTotal})
          </span>
        </div>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0 truncate text-muted">{s.label}</span>
              <div className="h-5 flex-1 overflow-hidden rounded-lg bg-surface-2">
                <div
                  className={`h-full rounded-lg ${s.tone}`}
                  style={{ width: `${Math.max(2, Math.round((100 * s.value) / max))}%` }}
                />
              </div>
              <span className="w-14 shrink-0 text-right font-semibold tabular-nums text-ink">{s.value}</span>
              <span className="w-12 shrink-0 text-right text-xs text-subtle">
                {i === 0 ? "100%" : pct(s.value, steps[i - 1].value)}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Амжилттай хаагдсан боломжийн дүн: <span className="font-semibold text-ink">{shortMNT(wonAmount)}</span>
        </p>
      </CardBody>
    </Card>
  );
}
