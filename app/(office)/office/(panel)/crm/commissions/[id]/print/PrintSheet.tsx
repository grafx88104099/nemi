"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/ui/back-link";
import type { CommissionSheet } from "@/lib/queries-crm-commissions";
import { COMMISSION_POLICY_LABEL } from "@/lib/crm/commission";
import {
  COMMISSION_ROLE_LABEL,
  COMMISSION_STATUS_LABEL,
  TXN_TYPE_LABEL,
} from "@/lib/constants-crm";

/**
 * F-472: тооцооны хуудас — журмын талбарын бүтцээр, хөтчийн print-to-PDF
 * (D11 хэв — InvoicePrint загвар). Дэлгэцэнд удирдлага, print үед зөвхөн баримт.
 */
export function PrintSheet({ sheet }: { sheet: CommissionSheet }) {
  const d = sheet.detail;
  const remaining = Math.max(0, d.amount - d.paid_amount);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <BackLink href={`/office/crm/commissions/${d.id}`} label="Тооцоо руу буцах" className="mb-0" />
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> Хэвлэх / PDF
        </Button>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-8 print:rounded-none print:border-0 print:p-0">
        <div className="mb-6 flex items-start justify-between border-b border-line pb-4">
          <div>
            <h1 className="text-xl font-bold text-ink">ШИМТГЭЛИЙН ТООЦООНЫ ХУУДАС</h1>
            <p className="text-sm text-muted">{sheet.officeName ?? ""}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold text-ink">{d.config?.policy_code ?? "—"}</p>
            <p className="text-muted">
              {d.config
                ? COMMISSION_POLICY_LABEL[d.config.policy_code as keyof typeof COMMISSION_POLICY_LABEL] ?? ""
                : ""}
            </p>
            <p className="text-muted">Төлөв: {COMMISSION_STATUS_LABEL[d.status].label}</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="mb-1 font-semibold text-ink">Хүлээн авагч</p>
            <p className="text-muted">
              {d.recipient_name ?? (d.recipient_type === "team" ? "ҮХХ баг" : "Компани")}
            </p>
            <p className="text-muted">Үүрэг: {COMMISSION_ROLE_LABEL[d.role]}</p>
          </div>
          <div className="text-right">
            {d.source_type === "transaction" ? (
              <>
                <p className="text-muted">Хэлцэл: {d.txn_number ?? "—"}</p>
                {d.txn_type && <p className="text-muted">Төрөл: {TXN_TYPE_LABEL[d.txn_type]}</p>}
                {d.txn_detail?.closed_on && <p className="text-muted">Хаагдсан: {d.txn_detail.closed_on}</p>}
              </>
            ) : (
              <>
                <p className="text-muted">Түрээсийн гэрээ: {d.lease_number ?? "—"}</p>
                <p className="text-muted">Тайлант сар: {d.record_month?.slice(0, 7) ?? "—"}</p>
              </>
            )}
            <p className="text-muted">Тооцсон огноо: {new Date(d.created_at).toLocaleDateString()}</p>
          </div>
        </div>

        <table className="mb-6 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-2 font-medium">Талбар (журмын бүтцээр)</th>
              <th className="py-2 text-right font-medium">Утга</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <td className="py-2 text-muted">Тооцооллын суурь (Санхүү баталгаажуулсан, татварын дараах — F-455)</td>
              <td className="py-2 text-right font-medium text-ink">{d.base_amount.toLocaleString()}₮</td>
            </tr>
            <tr className="border-b border-line">
              <td className="py-2 text-muted">Хэрэглэсэн хувь (тохиргооны хувилбараар — F-453)</td>
              <td className="py-2 text-right font-medium text-ink">{d.applied_rate_pct}%</td>
            </tr>
            <tr className="border-b border-line">
              <td className="py-2 text-muted">Тооцсон дүн</td>
              <td className="py-2 text-right font-bold text-ink">{d.amount.toLocaleString()}₮</td>
            </tr>
            <tr className="border-b border-line">
              <td className="py-2 text-muted">Олгосон дүн (F-464)</td>
              <td className="py-2 text-right font-medium text-ink">{d.paid_amount.toLocaleString()}₮</td>
            </tr>
            <tr>
              <td className="py-2 text-muted">Хүлээгдэж буй үлдэгдэл</td>
              <td className="py-2 text-right font-medium text-ink">{remaining.toLocaleString()}₮</td>
            </tr>
          </tbody>
        </table>

        {d.hold_reason && (
          <p className="mb-4 text-sm text-rose-600">Түдгэлзүүлсэн шалтгаан (F-461): {d.hold_reason}</p>
        )}

        <div className="mb-6">
          <p className="mb-2 text-sm font-semibold text-ink">Баталгаажуулалтын түүх (F-460/473)</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-1.5 font-medium">Шилжилт</th>
                <th className="py-1.5 font-medium">Шийдвэрлэгч</th>
                <th className="py-1.5 text-right font-medium">Огноо</th>
              </tr>
            </thead>
            <tbody>
              {d.history.map((h) => (
                <tr key={h.id} className="border-b border-line last:border-0">
                  <td className="py-1.5 text-ink">
                    {h.from_status ? COMMISSION_STATUS_LABEL[h.from_status].label : "—"} →{" "}
                    {COMMISSION_STATUS_LABEL[h.to_status].label}
                  </td>
                  <td className="py-1.5 text-muted">{h.decided_name ?? "Систем"}</td>
                  <td className="py-1.5 text-right text-muted">{new Date(h.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {d.clawbacks.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-sm font-semibold text-ink">Буцаалт (F-462)</p>
            <ul className="space-y-1 text-sm text-muted">
              {d.clawbacks.map((cb) => (
                <li key={cb.id}>
                  {cb.amount.toLocaleString()}₮ · {cb.reason_category} ·{" "}
                  {cb.approved_at ? `батлав: ${cb.approved_name ?? ""}` : "баталгаажуулалт хүлээж буй"}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-10 grid grid-cols-2 gap-8 text-sm text-muted">
          <div>
            <p>Хянасан (Борлуулалтын захирал / ЧМТ): ______________________</p>
          </div>
          <div>
            <p>Баталгаажуулсан (Ерөнхий захирал): ______________________</p>
          </div>
        </div>
      </div>
    </div>
  );
}
