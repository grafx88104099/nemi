import Link from "next/link";
import { AlarmClock } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { shortMNT } from "@/lib/format";
import type { ArrearsRow } from "@/lib/queries-crm-reports";

export const BUCKET_LABEL: Record<string, { label: string; tone: "neutral" | "amber" | "rose" | "blue" }> = {
  upcoming: { label: "Хугацаа болоогүй", tone: "neutral" },
  d1_3: { label: "1–3 хоног", tone: "blue" },
  d4_7: { label: "4–7 хоног", tone: "amber" },
  d8_plus: { label: "8+ хоног", tone: "rose" },
};

/**
 * R-09 насжилтын товч блок (R-06/R-08-д): бүлэг бүрийн үлдэгдэл +
 * хамгийн удаан хоцорсон мөрүүд. Бүлэглэл PMC-PM-POL-001 6.4-тэй ижил.
 */
export function ArrearsAging({
  rows,
  limit = 6,
  basePath = "/office/crm",
}: {
  rows: ArrearsRow[];
  limit?: number;
  basePath?: string;
}) {
  const buckets = ["d1_3", "d4_7", "d8_plus"] as const;
  const sums = buckets.map((b) => ({
    bucket: b,
    cnt: rows.filter((r) => r.bucket === b).length,
    balance: rows.filter((r) => r.bucket === b).reduce((s, r) => s + Number(r.balance), 0),
  }));
  const overdue = rows.filter((r) => r.bucket !== "upcoming").slice(0, limit);

  return (
    <Card>
      <CardBody>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <AlarmClock className="size-4 text-brand-600" /> Авлагын насжилт
          <Link href={`${basePath}/rentals/invoices`} className="ml-auto text-xs font-medium text-brand-700 hover:underline">
            Бүгдийг харах →
          </Link>
        </h2>
        <div className="mb-3 grid grid-cols-3 gap-2">
          {sums.map((s) => (
            <div key={s.bucket} className="rounded-xl bg-surface-2 p-2 text-center">
              <Badge tone={BUCKET_LABEL[s.bucket].tone}>{BUCKET_LABEL[s.bucket].label}</Badge>
              <p className="mt-1 text-lg font-bold tabular-nums text-ink">{s.cnt}</p>
              <p className="text-xs text-muted">{shortMNT(s.balance)}</p>
            </div>
          ))}
        </div>
        {overdue.length === 0 ? (
          <p className="text-sm text-muted">Хоцролттой нэхэмжлэх алга.</p>
        ) : (
          <div className="space-y-1.5">
            {overdue.map((r) => (
              <div key={r.invoice_id} className="flex items-center gap-2 text-sm">
                <span className="truncate font-medium text-ink">{r.number}</span>
                <span className="truncate text-xs text-muted">{r.lease_number ?? "—"}</span>
                <span className="ml-auto shrink-0 tabular-nums text-ink">{shortMNT(Number(r.balance))}</span>
                <Badge tone={BUCKET_LABEL[r.bucket]?.tone ?? "neutral"}>{r.overdue_days} хоног</Badge>
                {r.last_step ? <Badge tone="neutral">Шат {r.last_step}</Badge> : null}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
