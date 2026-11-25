import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkPayment } from "@/lib/qpay/client";
import {
  PREMIER_PRICE,
  QPAY_CHECK_MAX,
  QPAY_CHECK_WINDOW_SECONDS,
  parseSubscriptionId,
  qpayCheckRateKey,
} from "@/lib/qpay/payments";

/**
 * QPay төлбөрийн callback.
 * QPay нэхэмжлэх төлөгдөхөд /api/qpay/webhook?sub=<subId> рүү дуудна.
 *
 * Callback-д итгэхгүй: төлбөрийг QPay-ийн серверээс (checkPayment, зөвхөн PAID мөр) шалгаад
 * qpay_record_payment RPC-ээр НЭГ транзакцид бүртгэнэ — нэхэмжлэх (subscription) аль хэдийн
 * бүртгэгдсэн, эсвэл QPay payment_id давхардсан бол дахин сунгахгүй (давталт/replay хоосон).
 * Дутуу төлсөн бол идэвхжүүлэхгүй. Сунгалт идэвхтэй хугацааны төгсгөлөөс (greatest(end, now)).
 *
 * GET-ийг үлдээв: QPay callback-ийн HTTP аргыг баталгаажуулаагүй; дуудлага бүр идэмпотент тул
 * GET-ээр дахин дуудах нь юу ч өөрчлөхгүй. QPay руу гарах хүсэлтийг хамгаална: төлөгдсөн нэхэмжлэхэд
 * QPay руу огт хандахгүй, бусад үед нэг subscription-д минутад 5 (rate_limit_hit) — 429.
 */
async function handle(rawSub: string | null) {
  const subId = parseSubscriptionId(rawSub);
  if (!subId) return NextResponse.json({ ok: false, error: "no_sub" }, { status: 400 });

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, qpay_invoice_id")
    .eq("id", subId)
    .maybeSingle();
  if (!sub?.qpay_invoice_id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  // Аль хэдийн бүртгэгдсэн нэхэмжлэх — QPay руу дахин хандахгүй (qpay_record_payment-ийн шалгалттай ижил).
  const { count: paidCount } = await admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("subscription_id", sub.id)
    .eq("status", "paid");
  if ((paidCount ?? 0) > 0) return NextResponse.json({ ok: true, duplicate: true });

  // Давтан дуудлага (GET холбоос, prefetcher) QPay-ийн token/check хязгаарыг шавхахгүй.
  const { data: allowed, error: rlErr } = await admin.rpc("rate_limit_hit", {
    p_key: qpayCheckRateKey(sub.id),
    p_window_seconds: QPAY_CHECK_WINDOW_SECONDS,
    p_max: QPAY_CHECK_MAX,
  });
  if (rlErr) console.error("qpay webhook rate_limit_hit:", rlErr.message);
  else if (allowed === false) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });

  const { paid, amount, paymentId, error: checkErr } = await checkPayment(sub.qpay_invoice_id);
  if (checkErr) console.error("qpay webhook check:", checkErr);
  if (!paid) return NextResponse.json({ ok: false, error: "unpaid" });

  const { data, error } = await admin.rpc("qpay_record_payment", {
    p_sub: sub.id,
    p_invoice: sub.qpay_invoice_id,
    p_payment_id: paymentId ?? sub.qpay_invoice_id,
    p_amount: Math.round(amount ?? 0),
    p_min_amount: PREMIER_PRICE,
  });
  if (error) {
    // QPay дахин оролдох боломжтой — 5xx.
    console.error("qpay_record_payment:", error.message);
    return NextResponse.json({ ok: false, error: "record_failed" }, { status: 500 });
  }
  const res = (data ?? {}) as { ok?: boolean; duplicate?: boolean; error?: string };
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error ?? "rejected" });
  return NextResponse.json({ ok: true, duplicate: !!res.duplicate });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return handle(searchParams.get("sub"));
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  return handle(searchParams.get("sub"));
}
