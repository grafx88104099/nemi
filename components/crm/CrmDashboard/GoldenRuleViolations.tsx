import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GoldenRuleRow } from "@/lib/queries-crm-reports";

const MISSING_LABEL: Record<string, string> = {
  owner: "Эзэмшигч",
  grade: "Ангилал",
  last_contact: "Сүүлийн холболт",
  next_step: "Дараагийн алхам",
  next_step_date: "Алхмын огноо",
};

/**
 * ⭐ Алтан дүрмийн зөрчил (F-125): 5 бүрдэл дутуу идэвхтэй сэжим —
 * DB CHECK-ийг тойрсон түүхэн/гар засварын мөрийн integrity самбар.
 */
export function GoldenRuleViolations({
  rows,
  basePath = "/office/crm",
}: {
  rows: GoldenRuleRow[];
  basePath?: string;
}) {
  return (
    <Card>
      <CardBody>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <AlertTriangle className="size-4 text-amber-600" /> Алтан дүрмийн зөрчил
          <Badge tone={rows.length ? "rose" : "green"}>{rows.length}</Badge>
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Зөрчил алга — идэвхтэй сэжим бүр 5 бүрдэлтэй.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Link
                key={r.id}
                href={`${basePath}/leads/${r.id}`}
                className="flex flex-wrap items-center gap-2 text-sm hover:text-brand-700"
              >
                <span className="truncate font-medium text-ink">{r.contact_name ?? "?"}</span>
                <span className="truncate text-xs text-muted">{r.owner_name ?? "Эзэмшигчгүй"}</span>
                <span className="ml-auto flex shrink-0 flex-wrap gap-1">
                  {r.missing.map((m) => (
                    <Badge key={m} tone="rose">
                      {MISSING_LABEL[m] ?? m}
                    </Badge>
                  ))}
                </span>
              </Link>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
