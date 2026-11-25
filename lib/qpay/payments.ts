/**
 * QPay төлбөрийн цэвэр туслахууд (DOM, сүлжээгүй — unit тесттэй).
 */

/** Premier-ийн сарын үнэ (₮). Нэхэмжлэх ба webhook-ийн «дутуу төлсөн» шалгалт нэг утгаар. */
export const PREMIER_PRICE = 99_000;

export type PaidSummary = { paid: boolean; amount: number; paymentId: string | null };

/**
 * /v2/payment/check хариунаас ЗӨВХӨН `payment_status = "PAID"` мөрийг тооцно
 * (NEW, FAILED, REFUNDED тоологдохгүй). paymentId — эхний PAID мөрийн QPay payment_id.
 */
export function summarizePaidRows(data: unknown): PaidSummary {
  const rows = (data as { rows?: unknown } | null | undefined)?.rows;
  if (!Array.isArray(rows)) return { paid: false, amount: 0, paymentId: null };
  let amount = 0;
  let paymentId: string | null = null;
  for (const raw of rows) {
    const r = (raw ?? {}) as { payment_status?: unknown; payment_amount?: unknown; payment_id?: unknown };
    if (String(r.payment_status ?? "").toUpperCase() !== "PAID") continue;
    const n = Number(r.payment_amount ?? 0);
    if (!Number.isFinite(n) || n <= 0) continue;
    amount += n;
    if (paymentId === null && r.payment_id != null && String(r.payment_id).trim()) paymentId = String(r.payment_id).trim();
  }
  return { paid: amount > 0, amount, paymentId };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Callback-ийн ?sub= — зөвхөн uuid (бусад нь DB-д хүрэхгүй). */
export function parseSubscriptionId(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return UUID_RE.test(v) ? v.toLowerCase() : null;
}

/**
 * Callback-ийн QPay шалгалтын (token + /v2/payment/check) хязгаар — нэг subscription-д минутад 5.
 * GET-ийг (QPay callback-ийн аргыг баталгаажуулаагүй) үлдээсэн тул холбоос / prefetcher-ээр
 * давтан дуудахад QPay-ийн rate limit-ийг шавхахгүй.
 */
export const QPAY_CHECK_WINDOW_SECONDS = 60;
export const QPAY_CHECK_MAX = 5;

export function qpayCheckRateKey(subId: string): string {
  return `qpay:check:${subId}`;
}
