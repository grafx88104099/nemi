import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { QUALITY_CRITERION_LABEL, type QualityCriterion } from "@/lib/crm/quality";
import { cn } from "@/lib/utils";

/**
 * §8.5(8) CRM-ийн нийцэл (12 шалгуурын тэнцсэн хувь) — самбарт хураангуй:
 * хамгийн сул 3 шалгуур, дэлгэрэнгүй рүү холбоос.
 */
export function DataQualityCard({
  pct,
  rows,
  href = "/office/crm/quality?tab=data",
  threshold,
}: {
  pct: number | null;
  rows: { criterion: QualityCriterion; total: number; passed: number; pct: number | null }[];
  href?: string;
  threshold?: number;
}) {
  const weakest = rows
    .filter((r) => r.total > 0 && r.pct != null && r.pct < 100)
    .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))
    .slice(0, 3);
  const ok = pct != null && (threshold == null || pct >= threshold);
  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-muted">CRM-ийн нийцэл</p>
            <p className={cn("mt-1 text-2xl font-extrabold tabular-nums", ok ? "text-ink" : "text-danger")}>
              {pct == null ? "—" : `${pct}%`}
            </p>
          </div>
          <div className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <ShieldCheck className="size-4" />
          </div>
        </div>
        {weakest.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs">
            {weakest.map((w) => (
              <li key={w.criterion} className="flex justify-between gap-2">
                <span className="truncate text-muted">{QUALITY_CRITERION_LABEL[w.criterion].label}</span>
                <span className="font-semibold tabular-nums text-danger">{w.pct}%</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-subtle">{pct == null ? "Шалгах бүртгэл алга" : "Бүх шалгуур тэнцсэн"}</p>
        )}
        <Link href={href} className="mt-2 inline-block text-xs font-semibold text-brand-700 hover:underline">
          Дутуу бүртгэлүүд
        </Link>
      </CardBody>
    </Card>
  );
}
