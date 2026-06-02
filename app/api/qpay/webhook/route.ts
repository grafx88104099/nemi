import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkPayment } from "@/lib/qpay/client";

/**
 * QPay төлбөрийн callback.
 * QPay нэхэмжлэх төлөгдөхөд /api/qpay/webhook?sub=<subId> рүү дуудна.
 * Төлбөрийг шалгаж, subscription идэвхжүүлж, agent.premier=true болгоно.
 */
async function handle(subId: string | null) {
  if (!subId) return NextResponse.json({ ok: false, error: "no_sub" }, { status: 400 });

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, agent_id, qpay_invoice_id, status")
    .eq("id", subId)
    .single();
  if (!sub?.qpay_invoice_id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const { paid, amount } = await checkPayment(sub.qpay_invoice_id);
  if (!paid) return NextResponse.json({ ok: false, error: "unpaid" });

  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await admin
    .from("subscriptions")
    .update({ status: "active", current_period_end: periodEnd.toISOString() })
    .eq("id", sub.id);
  await admin.from("agents").update({ premier: true }).eq("id", sub.agent_id);
  await admin.from("payments").insert({
    subscription_id: sub.id,
    agent_id: sub.agent_id,
    amount: amount ?? 0,
    currency: "MNT",
    qpay_payment_id: sub.qpay_invoice_id,
    status: "paid",
    paid_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return handle(searchParams.get("sub"));
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  return handle(searchParams.get("sub"));
}
