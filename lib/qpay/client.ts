/**
 * QPay v2 merchant API клиент.
 * Env: QPAY_USERNAME, QPAY_PASSWORD, QPAY_INVOICE_CODE.
 * Тохируулаагүй бол { error: 'no_creds' } буцаана.
 */
const BASE = process.env.QPAY_BASE_URL || "https://merchant.qpay.mn/v2";

function creds() {
  const u = process.env.QPAY_USERNAME;
  const p = process.env.QPAY_PASSWORD;
  const code = process.env.QPAY_INVOICE_CODE;
  if (!u || !p || !code) return null;
  return { u, p, code };
}

async function getToken(u: string, p: string): Promise<string | null> {
  const res = await fetch(`${BASE}/auth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Basic " + Buffer.from(`${u}:${p}`).toString("base64"),
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ?? null;
}

export type QPayInvoice = {
  invoiceId: string;
  qrText: string;
  qrImage: string;
  urls: unknown;
};

export async function createInvoice(params: {
  senderInvoiceNo: string;
  amount: number;
  description: string;
  callbackUrl: string;
}): Promise<{ invoice?: QPayInvoice; error?: string }> {
  const c = creds();
  if (!c) return { error: "no_creds" };

  const token = await getToken(c.u, c.p);
  if (!token) return { error: "auth_failed" };

  const res = await fetch(`${BASE}/invoice`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      invoice_code: c.code,
      sender_invoice_no: params.senderInvoiceNo,
      invoice_receiver_code: "terminal",
      invoice_description: params.description,
      amount: params.amount,
      callback_url: params.callbackUrl,
    }),
  });
  if (!res.ok) return { error: `invoice_${res.status}` };
  const data = await res.json();
  return {
    invoice: {
      invoiceId: data.invoice_id,
      qrText: data.qr_text,
      qrImage: data.qr_image,
      urls: data.urls,
    },
  };
}

/** Төлбөр шалгах (webhook баталгаажуулалт). */
export async function checkPayment(invoiceId: string): Promise<{ paid: boolean; amount?: number; error?: string }> {
  const c = creds();
  if (!c) return { paid: false, error: "no_creds" };
  const token = await getToken(c.u, c.p);
  if (!token) return { paid: false, error: "auth_failed" };

  const res = await fetch(`${BASE}/payment/check`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      object_type: "INVOICE",
      object_id: invoiceId,
      offset: { page_number: 1, page_limit: 100 },
    }),
  });
  if (!res.ok) return { paid: false, error: `check_${res.status}` };
  const data = await res.json();
  const rows = data?.rows ?? [];
  const paidSum = rows.reduce((s: number, r: { payment_amount?: number }) => s + Number(r.payment_amount ?? 0), 0);
  return { paid: paidSum > 0, amount: paidSum };
}
