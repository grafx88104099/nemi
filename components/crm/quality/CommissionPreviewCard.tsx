"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calculator, Info } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { previewMyCommissions, type CommissionPreviewRow } from "@/lib/actions/crm-commissions";
import { COMMISSION_ROLE_LABEL } from "@/lib/constants-crm";
import { shortMNT } from "@/lib/format";

const STATUS: Record<string, string> = { contract: "Гэрээ", payment: "Төлбөр" };

/**
 * R26: Агентын нээлттэй хэлцлүүдийн урамшууллын урьдчилсан тооцоо — албан
 * бус, юу ч хадгалахгүй. Дутуу нотолгоог мөр бүрд харуулна.
 */
export function CommissionPreviewCard({ basePath }: { basePath: string }) {
  const [rows, setRows] = useState<CommissionPreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    previewMyCommissions().then((res) => {
      if (!alive) return;
      if (res.error) setError(res.error);
      setRows(res.rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Card>
      <CardBody>
        <div className="mb-1 flex items-center gap-2">
          <Calculator className="size-4 text-muted" aria-hidden />
          <h2 className="text-sm font-semibold text-ink">Урьдчилсан тооцоо — нээлттэй хэлцлүүд</h2>
        </div>
        <p className="mb-3 flex items-start gap-1.5 text-xs text-amber-700">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Албан бус тооцоо. Эцсийн дүнг хэлцэл хаагдаж, Санхүү орлогыг баталгаажуулсны дараа журмын дагуу тооцно.
        </p>
        {rows == null ? (
          <p className="py-3 text-sm text-muted">{error ?? "Тооцож байна…"}</p>
        ) : rows.length === 0 ? (
          <EmptyState compact title="Нээлттэй хэлцэл алга" description="Таны үүрэг бүртгэгдсэн гэрээ, төлбөрийн шаттай хэлцэл энд харагдана." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.transactionId} className="py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`${basePath}/transactions/${r.transactionId}`} className="text-sm font-medium text-ink hover:underline">
                    {r.number} · {STATUS[r.status] ?? "Хэлцэл"}
                  </Link>
                  <span className="text-lg font-bold tabular-nums text-ink">{shortMNT(r.total)}</span>
                </div>
                <p className="text-xs text-muted">
                  {r.roles.length
                    ? r.roles.map((x) => `${COMMISSION_ROLE_LABEL[x.role] ?? "Үүрэг"} ${x.ratePct}%`).join(" · ")
                    : "Таны үүрэгт хувь тооцогдоогүй"}{" "}
                  · суурь {shortMNT(r.base)}
                </p>
                {r.gaps.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {r.gaps.map((g) => (
                      <li key={g} className="text-xs text-danger">
                        {g}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
