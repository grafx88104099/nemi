"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInvoice } from "@/lib/qpay/client";

const PREMIER_PRICE = 99_000;

/** Нэвтэрсэн агентад Premier-ийн QPay нэхэмжлэх үүсгэнэ. */
export async function createPremierInvoice(): Promise<{
  qrImage?: string;
  qrText?: string;
  invoiceId?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "auth" };

  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!agent) return { error: "not_agent" };

  const admin = createAdminClient();
  const { data: sub, error: subErr } = await admin
    .from("subscriptions")
    .insert({ agent_id: agent.id, plan: "premier", status: "trialing" })
    .select("id")
    .single();
  if (subErr || !sub) return { error: "sub_failed" };

  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { invoice, error } = await createInvoice({
    senderInvoiceNo: sub.id,
    amount: PREMIER_PRICE,
    description: "Нэми Premier — 1 сар",
    callbackUrl: `${base}/api/qpay/webhook?sub=${sub.id}`,
  });

  if (error) {
    // Нэхэмжлэх амжилтгүй — subscription-ийг устгана
    await admin.from("subscriptions").delete().eq("id", sub.id);
    return { error };
  }

  await admin.from("subscriptions").update({ qpay_invoice_id: invoice!.invoiceId }).eq("id", sub.id);
  return { qrImage: invoice!.qrImage, qrText: invoice!.qrText, invoiceId: invoice!.invoiceId };
}
