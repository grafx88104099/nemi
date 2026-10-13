"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Printer, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { buildOwnerStatement, markStatementAcknowledged, markStatementSent } from "@/lib/actions/crm-monthly";
import type { AgreementRow, StatementRow } from "@/lib/queries-crm-rentals";
import type { CrmRole } from "@/lib/constants-crm";

/**
 * Өмчлөгчийн тайлан (F-560–564): автомат угсралт (орлого − зардал − хөлс =
 * цэвэр олголт F-561), илгээлт/хүлээн авалтын бүртгэл (F-562), print (D11).
 */
export function OwnerStatementsShell({
  rows,
  agreements,
  roles,
}: {
  rows: StatementRow[];
  agreements: AgreementRow[];
  roles: CrmRole[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canWrite = roles.some((r) => ["property_manager", "finance"].includes(r));

  const [buildOpen, setBuildOpen] = useState(false);
  const now = new Date();
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const prevMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10);
  const [b, setB] = useState({ agreementId: "", periodStart: prevMonthStart, periodEnd: prevMonthEnd });

  function run(fn: () => Promise<{ ok?: boolean; id?: string; error?: string }>, close?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        return;
      }
      close?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Өмчлөгчийн тайлан</h1>
          <p className="text-sm text-muted">Орлого − зардал − менежментийн хөлс = цэвэр олголт (F-561); «Хугацаандаа тайлагнасан %» KPI зорилт 95% (F-564).</p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setBuildOpen(true)}>
            <Plus className="size-4" /> Тайлан угсрах (F-560)
          </Button>
        )}
      </div>
      {error && !buildOpen && <p className="text-sm text-danger">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Гэрээ / Өмчлөгч</th>
              <th className="px-4 py-3 font-medium">Тайлант үе</th>
              <th className="px-4 py-3 font-medium">Орлого</th>
              <th className="px-4 py-3 font-medium">Зардал</th>
              <th className="px-4 py-3 font-medium">Хөлс</th>
              <th className="px-4 py-3 font-medium">Цэвэр олголт</th>
              <th className="px-4 py-3 font-medium">Төлөв</th>
              <th className="px-4 py-3 font-medium">Үйлдэл</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-surface-2">
                <td className="px-4 py-3">
                  <span className="font-medium text-ink">{s.agreement_number}</span>
                  <span className="ml-2 text-muted">{s.owner_name}</span>
                </td>
                <td className="px-4 py-3 text-muted">
                  {s.period_start} → {s.period_end}
                </td>
                <td className="px-4 py-3 text-ink">{Number(s.income).toLocaleString()}₮</td>
                <td className="px-4 py-3 text-muted">−{Number(s.expenses).toLocaleString()}₮</td>
                <td className="px-4 py-3 text-muted">−{Number(s.mgmt_fee).toLocaleString()}₮</td>
                <td className="px-4 py-3 font-semibold text-ink">{Number(s.net_payout).toLocaleString()}₮</td>
                <td className="px-4 py-3">
                  {s.acknowledged_at ? (
                    <Badge tone="green">Хүлээн авсан</Badge>
                  ) : s.sent_at ? (
                    <Badge tone="blue">Илгээсэн</Badge>
                  ) : (
                    <Badge tone="neutral">Ноорог</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/office/crm/rentals/statements/${s.id}/print`}
                      className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
                      title="Хэвлэх / PDF (F-562)"
                    >
                      <Printer className="size-4" />
                    </Link>
                    {canWrite && !s.sent_at && (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => markStatementSent(s.id))}>
                        <Send className="size-4" /> Илгээсэн гэж бүртгэх
                      </Button>
                    )}
                    {canWrite && s.sent_at && !s.acknowledged_at && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => markStatementAcknowledged(s.id))}>
                        Хүлээн авалт бүртгэх
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted">
                  Тайлан алга — сар бүр Д-22 даалгавраар ҮХХ баг угсарна (F-563).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={buildOpen}
        onClose={() => setBuildOpen(false)}
        title="Өмчлөгчийн тайлан угсрах (F-560)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBuildOpen(false)}>
              Болих
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => buildOwnerStatement({ agreementId: b.agreementId, periodStart: b.periodStart, periodEnd: b.periodEnd }),
                  () => setBuildOpen(false)
                )
              }
            >
              Угсрах
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Менежментийн гэрээ">
            <Select value={b.agreementId} onChange={(e) => setB({ ...b, agreementId: e.target.value })}>
              <option value="">— Сонгох —</option>
              {agreements
                .filter((a) => a.status === "active")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.number} · {a.owner_name}
                  </option>
                ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Тайлант үе — эхлэх">
              <Input type="date" value={b.periodStart} onChange={(e) => setB({ ...b, periodStart: e.target.value })} />
            </Field>
            <Field label="Тайлант үе — дуусах">
              <Input type="date" value={b.periodEnd} onChange={(e) => setB({ ...b, periodEnd: e.target.value })} />
            </Field>
          </div>
          <p className="text-xs text-muted">
            Тайлант үеийн орлого (орлогын бүртгэл F-526б), өмчлөгчийн хариуцсан засварын зардал, менежментийн
            хөлсний нэхэмжлэхүүдээс автомат угсарна; PMC-ээр дамжаагүй төлбөр хяналтын бүртгэлээс мэдээллийн
            чанартай орно (F-561).
          </p>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
