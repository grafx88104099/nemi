import { cn } from "@/lib/utils";
import { EMPTY_VALUE } from "@/lib/crm2/labels";
import { formatPrice } from "@/lib/crm2/money";
import type { Crm2PriceBasis, Crm2PricePeriod } from "@/lib/crm2/types";

/**
 * Үнэ: дүн + валют (+ «/м²» суурь, «/сар», «/өдөр» хугацаа). Locale-гүй
 * бүлэглэлт тул сервер, хөтөч ижил харагдана. total — м²-ийн үнэтэй бол нийт дүн.
 */
export function Money({
  amount,
  currency = "MNT",
  period,
  basis,
  short = false,
  total,
  className,
  empty = EMPTY_VALUE,
}: {
  amount: number | null | undefined;
  currency?: string | null;
  period?: Crm2PricePeriod | null;
  basis?: Crm2PriceBasis | null;
  short?: boolean;
  /** price_total (м²-ийн үнэтэй үед нийт дүнг доор нь харуулна). */
  total?: number | null;
  className?: string;
  empty?: string;
}) {
  const text = formatPrice({ amount, currency, period, basis, short });
  if (!text) return <span className={cn("text-muted", className)}>{empty}</span>;
  const showTotal = basis === "per_m2" && total != null;
  return (
    <span className={cn("tabular-nums", className)}>
      <span className="font-semibold text-ink">{text}</span>
      {showTotal ? (
        <span className="ml-1 text-xs text-muted">
          (нийт {formatPrice({ amount: total, currency, period, short })})
        </span>
      ) : null}
    </span>
  );
}
