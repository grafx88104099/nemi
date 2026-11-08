"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, FileText, Receipt, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { verifyPayment, createDealFeeInvoice } from "@/lib/actions/crm-invoices";
import { getDocumentUrl } from "@/lib/actions/crm-docs";
import type { FinanceQueueRow, FeePendingRow } from "@/lib/queries-crm-transactions";
import { PAYMENT_METHOD_LABEL } from "@/lib/crm/deal-flow";
import { TXN_STATUS_LABEL, TXN_TYPE_LABEL } from "@/lib/constants-crm";
import { fmtDate, fmtMNT } from "@/lib/format";

/**
 * Санхүүгийн баталгаажуулалт (§6.17 «Санхүү», «Төлбөр»): баримттай
 * төлбөрийг шалгаж баталгаажуулах, хөлсний нэхэмжлэхгүй хэлцэлд нэхэмжлэх
 * үүсгэх. Хаалтын босго эдгээрээс шууд хамаарна.
 */
export function FinanceVerifyList({
  payments,
  feePending,
  canVerify,
}: {
  payments: FinanceQueueRow[];
  feePending: FeePendingRow[];
  canVerify: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<FeePendingRow | null>(null);
  const [invAmount, setInvAmount] = useState("");
  const [invDue, setInvDue] = useState("");

  function openDoc(docId: string) {
    startTransition(async () => {
      const res = await getDocumentUrl(docId);
      if (res.url) window.open(res.url, "_blank", "noopener");
      else setError(res.error ?? "Баримт нээгдсэнгүй.");
    });
  }

  function verify(p: FinanceQueueRow) {
    setError(null);
    startTransition(async () => {
      const res = await verifyPayment(p.id);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success("Төлбөр баталгаажлаа");
      router.refresh();
    });
  }

  function submitInvoice() {
    if (!invoiceFor) return;
    setError(null);
    const amt = Number(invAmount);
    if (!(amt > 0)) return setError("Нэхэмжлэхийн дүнг оруулна уу.");
    if (!invDue) return setError("Төлөх огноог сонгоно уу.");
    startTransition(async () => {
      const res = await createDealFeeInvoice({
        transactionId: invoiceFor.id,
        amount: amt,
        dueOn: invDue,
        recipientContactId: invoiceFor.contact_id,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Хөлсний нэхэмжлэх үүслээ", { description: "Хэлцлийн хавтаснаас илгээнэ үү." });
      setInvoiceFor(null);
      setInvAmount("");
      setInvDue("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p> : null}

      <Card>
        <CardBody>
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
            <Wallet className="size-5 text-brand-600" /> Баталгаажуулах төлбөр ({payments.length})
          </h2>
          {payments.length === 0 ? (
            <EmptyState
              compact
              icon={BadgeCheck}
              title="Хүлээгдэж буй төлбөр алга"
              description="Агент хэлцэлд баримттай төлбөр бүртгэмэгц энд харагдана."
            />
          ) : (
            <ul className="divide-y divide-line">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">
                      {p.amount.toLocaleString("mn-MN")} {p.currency}
                      {p.currency !== "MNT" ? (
                        <span className="ml-1 text-xs font-normal text-muted">({fmtMNT(p.amount_mnt)})</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted">
                      {fmtDate(p.paid_on)} · {PAYMENT_METHOD_LABEL[p.method as keyof typeof PAYMENT_METHOD_LABEL] ?? p.method}
                      {p.kind === "income" ? " · Хөлсний орлого" : " · Хэлцлийн төлбөр"}
                      {p.invoice_number ? ` · Нэхэмжлэх ${p.invoice_number}` : ""}
                      {p.created_by_name ? ` · ${p.created_by_name}` : ""}
                    </p>
                    {p.transaction_id ? (
                      <Link
                        href={`/office/crm/transactions/${p.transaction_id}`}
                        className="text-xs font-medium text-brand-700 hover:underline"
                      >
                        Хэлцэл {p.transaction_number}
                      </Link>
                    ) : null}
                  </div>
                  {p.doc_id ? (
                    <Button size="sm" variant="ghost" onClick={() => openDoc(p.doc_id!)} disabled={pending}>
                      <FileText className="size-4" /> Баримт
                    </Button>
                  ) : (
                    <Badge tone="rose">Баримтгүй</Badge>
                  )}
                  {canVerify ? (
                    <Button
                      size="sm"
                      onClick={() => verify(p)}
                      disabled={pending || (!p.doc_id && Boolean(p.transaction_id))}
                    >
                      <BadgeCheck className="size-4" /> Баталгаажуулах
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
            <Receipt className="size-5 text-brand-600" /> Хөлсний нэхэмжлэхгүй хэлцэл ({feePending.length})
          </h2>
          {feePending.length === 0 ? (
            <EmptyState
              compact
              icon={Receipt}
              title="Бүх хэлцэлд нэхэмжлэх үүссэн"
              description="Гэрээ, төлбөрийн шатанд орсон хэлцэл бүрд хөлсний нэхэмжлэх үүсгэнэ."
            />
          ) : (
            <ul className="divide-y divide-line">
              {feePending.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/office/crm/transactions/${t.id}`} className="text-sm font-semibold text-brand-700 hover:underline">
                      {t.number}
                    </Link>
                    <p className="text-xs text-muted">
                      {TXN_TYPE_LABEL[t.type]} · {t.contact_name} · {t.amount.toLocaleString("mn-MN")} {t.currency}
                      {t.owner_name ? ` · ${t.owner_name}` : ""}
                    </p>
                  </div>
                  <Badge tone={TXN_STATUS_LABEL[t.status].tone}>{TXN_STATUS_LABEL[t.status].label}</Badge>
                  {canVerify ? (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => setInvoiceFor(t)}>
                      Нэхэмжлэх үүсгэх
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal
        open={invoiceFor !== null}
        onClose={() => setInvoiceFor(null)}
        title="Үйлчилгээний хөлсний нэхэмжлэх"
        footer={
          <>
            <Button variant="outline" onClick={() => setInvoiceFor(null)}>
              Болих
            </Button>
            <Button disabled={pending} onClick={submitInvoice}>
              Үүсгэх
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {invoiceFor ? (
            <p className="text-sm text-muted">
              {invoiceFor.number} · хүлээн авагч: <span className="font-medium text-ink">{invoiceFor.contact_name}</span>
            </p>
          ) : null}
          <Field label="Хөлсний дүн (₮)" htmlFor="fee-amount">
            <Input
              id="fee-amount"
              type="number"
              inputMode="numeric"
              min="0"
              value={invAmount}
              onChange={(e) => setInvAmount(e.target.value)}
            />
          </Field>
          <Field label="Төлөх огноо" htmlFor="fee-due">
            <Input id="fee-due" type="date" value={invDue} onChange={(e) => setInvDue(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
