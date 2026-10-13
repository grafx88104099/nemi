"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/ui/back-link";
import type { StatementRow } from "@/lib/queries-crm-rentals";

/**
 * Өмчлөгчийн тайлангийн print-оптимизацитай хуудас (D11 — F-562 «PDF татах»
 * = хөтчийн print-to-PDF). Санхүүгийн хураангуй F-561 бүтэцтэй.
 */

type IncomeRow = { paid_on: string; amount_mnt: number; method: string; lease: string | null };
type ControlRow = { paid_on: string; amount_mnt: number; lease: string | null };
type RepairRow = { description: string; amount: number; completed_on: string | null };
type FeeRow = { number: string; period_month: string | null; amount: number };

type StatementDetail = {
  income_payments?: IncomeRow[];
  control_payments?: ControlRow[];
  control_total?: number;
  repairs?: RepairRow[];
  mgmt_fee_invoices?: FeeRow[];
  fee_pct?: number;
};

export function StatementPrint({ statement }: { statement: StatementRow }) {
  const detail = (statement.detail ?? {}) as StatementDetail;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <BackLink href="/office/crm/rentals/statements" label="Тайлан руу буцах" className="mb-0" />
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> Хэвлэх / PDF
        </Button>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-8 print:rounded-none print:border-0 print:p-0">
        <div className="mb-6 border-b border-line pb-4">
          <h1 className="text-xl font-bold text-ink">ӨМЧЛӨГЧИЙН ТАЙЛАН (Owner Statement)</h1>
          <p className="text-sm text-muted">
            Гэрээ {statement.agreement_number} · {statement.owner_name} · Тайлант үе: {statement.period_start} →{" "}
            {statement.period_end}
          </p>
        </div>

        {/* Санхүүгийн хураангуй (F-561) */}
        <table className="mb-6 w-full text-sm">
          <tbody>
            <tr className="border-b border-line">
              <td className="py-2 text-muted">Түрээсийн орлого (орлогын бүртгэл)</td>
              <td className="py-2 text-right text-ink">{Number(statement.income).toLocaleString()}₮</td>
            </tr>
            <tr className="border-b border-line">
              <td className="py-2 text-muted">Засвар, зардал (өмчлөгчийн хариуцах)</td>
              <td className="py-2 text-right text-ink">−{Number(statement.expenses).toLocaleString()}₮</td>
            </tr>
            <tr className="border-b border-line">
              <td className="py-2 text-muted">
                Менежментийн үйлчилгээний хөлс{detail.fee_pct != null ? ` (${detail.fee_pct}%)` : ""}
              </td>
              <td className="py-2 text-right text-ink">−{Number(statement.mgmt_fee).toLocaleString()}₮</td>
            </tr>
            <tr>
              <td className="py-3 font-semibold text-ink">Цэвэр олголт</td>
              <td className="py-3 text-right text-lg font-bold text-ink">
                {Number(statement.net_payout).toLocaleString()}₮
              </td>
            </tr>
          </tbody>
        </table>

        {(detail.income_payments?.length ?? 0) > 0 && (
          <Section title="Түрээсийн төлбөрийн төлөв">
            {detail.income_payments!.map((p, i) => (
              <Line key={i} left={`${p.paid_on} · ${p.lease ?? ""} · ${p.method}`} right={`${Math.round(p.amount_mnt).toLocaleString()}₮`} />
            ))}
          </Section>
        )}

        {(detail.control_payments?.length ?? 0) > 0 && (
          <Section title="Хяналтын бүртгэл — PMC-ээр дамжаагүй (мэдээллийн чанартай, F-526а)">
            {detail.control_payments!.map((p, i) => (
              <Line key={i} left={`${p.paid_on} · ${p.lease ?? ""}`} right={`${Math.round(p.amount_mnt).toLocaleString()}₮`} />
            ))}
          </Section>
        )}

        {(detail.repairs?.length ?? 0) > 0 && (
          <Section title="Засвар, зардал">
            {detail.repairs!.map((r, i) => (
              <Line key={i} left={`${r.completed_on ?? ""} · ${r.description}`} right={`−${Number(r.amount).toLocaleString()}₮`} />
            ))}
          </Section>
        )}

        {(detail.mgmt_fee_invoices?.length ?? 0) > 0 && (
          <Section title="Үйлчилгээний хөлсний тооцоо">
            {detail.mgmt_fee_invoices!.map((f, i) => (
              <Line key={i} left={`${f.number}${f.period_month ? ` · ${f.period_month.slice(0, 7)}` : ""}`} right={`−${Number(f.amount).toLocaleString()}₮`} />
            ))}
          </Section>
        )}

        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4 text-xs text-subtle">
          <p>Илгээсэн: {statement.sent_at ? new Date(statement.sent_at).toLocaleDateString() : "Илгээгдээгүй"}</p>
          <p className="text-right">
            Хүлээн авсан: {statement.acknowledged_at ? new Date(statement.acknowledged_at).toLocaleDateString() : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="mb-2 text-sm font-semibold text-ink">{title}</h2>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Line({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed border-line pb-1 text-sm">
      <span className="text-muted">{left}</span>
      <span className="text-ink">{right}</span>
    </div>
  );
}
