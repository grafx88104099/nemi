import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CONVERSION_LABELS, type FunnelStep } from "@/lib/crm/quality";

/**
 * §8.2 Борлуулалтын шатлалын 10 алхмын хөрвөлт + §8.3 хөрвөлтийн 4 үзүүлэлт.
 * Гар бичмэл CSS bar (гадны chart сангүй). Шат алгассан бол өмнөх алхмыг
 * давсанд тооцно.
 */
export function Funnel10Chart({
  steps,
  conversions,
  title = "Борлуулалтын шатлалын хөрвөлт",
}: {
  steps: FunnelStep[];
  conversions: (number | null)[];
  title?: string;
}) {
  const max = Math.max(steps[0]?.count ?? 0, 1);
  return (
    <Card>
      <CardBody>
        <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
        {(steps[0]?.count ?? 0) === 0 ? (
          <EmptyState compact title="Энэ хугацаанд сэжим ирээгүй" description="Хугацаагаа өөрчилж харна уу." />
        ) : (
          <>
            <div className="space-y-1.5">
              {steps.map((s, i) => (
                <div key={s.label} className="flex items-center gap-2 text-sm">
                  <span className="w-36 shrink-0 truncate text-muted sm:w-44">
                    {i + 1}. {s.label}
                  </span>
                  <div className="h-5 min-w-0 flex-1 overflow-hidden rounded-lg bg-surface-2">
                    <div
                      className="h-full rounded-lg bg-brand-500"
                      style={{ width: `${Math.max(2, Math.round((100 * s.count) / max))}%`, opacity: 1 - i * 0.05 }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-ink">{s.count}</span>
                  <span className="w-12 shrink-0 text-right text-xs text-subtle">
                    {s.fromPrev == null ? "" : `${s.fromPrev}%`}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 border-t border-line pt-3 sm:grid-cols-2">
              {CONVERSION_LABELS.map((label, i) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-muted">{label}</span>
                  <span className="font-semibold tabular-nums text-ink">
                    {conversions[i] == null ? "—" : `${conversions[i]}%`}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-subtle">
              Шат бүрийн жишиг түвшинг эхний 3–6 сарын өгөгдөл цугларсны дараа тогтооно; гадны жишгийг KPI болгохгүй.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}
