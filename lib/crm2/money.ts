import { CURRENCY_SYMBOL, PRICE_PERIOD_SUFFIX } from "@/lib/crm2/labels";
import type { Crm2Currency, Crm2PriceBasis, Crm2PricePeriod } from "@/lib/crm2/types";

/**
 * Мөнгөн дүн — сервер, хөтөч ижил мөр гаргахаар (Intl/locale-д найдахгүй)
 * гараар бүлэглэнэ: 1250000 → «1,250,000».
 */

export function formatAmount(n: number | null | undefined, maxFractionDigits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(maxFractionDigits);
  const [int, frac = ""] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const f = frac.replace(/0+$/, "");
  return `${neg ? "-" : ""}${grouped}${f ? `.${f}` : ""}`;
}

/** Богино: 1.25 тэрбум / 285 сая / 12,500. */
export function formatAmountShort(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  const a = Math.abs(n);
  if (a >= 1e9) return `${formatAmount(n / 1e9, 2)} тэрбум`;
  if (a >= 1e6) return `${formatAmount(n / 1e6, 1)} сая`;
  return formatAmount(n, 0);
}

export function currencySymbol(currency: string | null | undefined): string {
  return CURRENCY_SYMBOL[(currency ?? "MNT") as Crm2Currency] ?? currency ?? "";
}

/** Дүн + валют: «1,250,000₮», «$1,200». */
export function formatMoney(n: number | null | undefined, currency: string | null | undefined = "MNT", short = false): string {
  const amount = short ? formatAmountShort(n) : formatAmount(n);
  if (!amount) return "";
  return currency === "USD" ? `$${amount}` : `${amount}${short ? " " : ""}${currencySymbol(currency)}`;
}

/** Үнэ + валют + суурь + хугацаа: «12,000₮/м²/сар», «350,000,000₮». */
export function formatPrice(opts: {
  amount: number | null | undefined;
  currency?: string | null;
  period?: Crm2PricePeriod | null;
  basis?: Crm2PriceBasis | null;
  short?: boolean;
}): string {
  const money = formatMoney(opts.amount, opts.currency ?? "MNT", opts.short);
  if (!money) return "";
  const basis = opts.basis === "per_m2" ? "/м²" : "";
  const period = opts.period ? PRICE_PERIOD_SUFFIX[opts.period] : "";
  return `${money}${basis}${period}`;
}

/** Шимтгэл: хувь бол «3%», тогтмол бол дүн. */
export function formatCommission(type: "percent" | "fixed" | null | undefined, value: number | null | undefined, currency?: string | null): string {
  if (value === null || value === undefined) return "";
  return type === "percent" ? `${formatAmount(value, 2)}%` : formatMoney(value, currency ?? "MNT");
}
