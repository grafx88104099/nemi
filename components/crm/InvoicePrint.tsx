"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/ui/back-link";
import type { InvoicePrintDetail } from "@/lib/queries-crm-rentals";
import { INVOICE_STATUS_LABEL, INVOICE_TYPE_LABEL } from "@/lib/constants-crm";

/**
 * Нэхэмжлэхийн print-оптимизацитай хуудас (D11 — F-521 «PDF татах» =
 * хөтчийн print-to-PDF). Дэлгэцэнд удирдлагатай, print үед зөвхөн баримт.
 */
export function InvoicePrint({ invoice }: { invoice: InvoicePrintDetail }) {
  const remaining = Math.max(0, Number(invoice.amount) - invoice.paid_mnt);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <BackLink href="/office/crm/rentals/invoices" label="Нэхэмжлэх рүү буцах" className="mb-0" />
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> Хэвлэх / PDF
        </Button>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-8 print:rounded-none print:border-0 print:p-0">
        <div className="mb-6 flex items-start justify-between border-b border-line pb-4">
          <div>
            <h1 className="text-xl font-bold text-ink">НЭХЭМЖЛЭХ</h1>
            <p className="text-sm text-muted">{invoice.number}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold text-ink">{INVOICE_TYPE_LABEL[invoice.type]}</p>
            <p className="text-muted">Төлөв: {INVOICE_STATUS_LABEL[invoice.status].label}</p>
            {invoice.cancel_reason && <p className="text-rose-600">Хүчингүй: {invoice.cancel_reason}</p>}
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="mb-1 font-semibold text-ink">Хүлээн авагч</p>
            <p className="text-muted">{invoice.recipient_name ?? "—"}</p>
            {invoice.tenant_name && <p className="text-muted">Түрээслэгч: {invoice.tenant_name}</p>}
          </div>
          <div className="text-right">
            {invoice.property_number && (
              <p className="text-muted">
                Объект: {invoice.property_number} · {invoice.property_name}
              </p>
            )}
            {invoice.lease_number && <p className="text-muted">Гэрээ: {invoice.lease_number}</p>}
            {invoice.period_month && <p className="text-muted">Тайлант сар: {invoice.period_month.slice(0, 7)}</p>}
          </div>
        </div>

        <table className="mb-6 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-2 font-medium">Тайлбар</th>
              <th className="py-2 text-right font-medium">Дүн</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <td className="py-3 text-ink">
                {INVOICE_TYPE_LABEL[invoice.type]}
                {invoice.period_month ? ` — ${invoice.period_month.slice(0, 7)} сар` : ""}
              </td>
              <td className="py-3 text-right text-ink">{Number(invoice.amount).toLocaleString()}₮</td>
            </tr>
            <tr className="border-b border-line">
              <td className="py-2 text-muted">Төлөгдсөн</td>
              <td className="py-2 text-right text-muted">{Math.round(invoice.paid_mnt).toLocaleString()}₮</td>
            </tr>
            <tr>
              <td className="py-3 font-semibold text-ink">Төлөх үлдэгдэл</td>
              <td className="py-3 text-right text-lg font-bold text-ink">{Math.round(remaining).toLocaleString()}₮</td>
            </tr>
          </tbody>
        </table>

        <div className="grid grid-cols-3 gap-4 text-sm text-muted">
          <p>Үүсгэсэн: {invoice.issued_on}</p>
          <p>Эцсийн хугацаа: {invoice.due_on}</p>
          <p>{invoice.sent_at ? `Илгээсэн: ${new Date(invoice.sent_at).toLocaleDateString()}` : "Илгээгдээгүй"}</p>
        </div>

        <p className="mt-8 border-t border-line pt-4 text-xs text-subtle">
          Энэхүү нэхэмжлэх PMC CRM системээс автомат үүссэн (F-517/518). Залруулга зөвхөн залруулгын
          нэхэмжлэхээр хийгдэнэ (F-522).
        </p>
      </div>
    </div>
  );
}
