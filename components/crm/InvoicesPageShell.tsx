"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import {
  cancelInvoice,
  createBrokerageInvoice,
  createCorrectionInvoice,
  createExtraServiceInvoice,
  sendInvoice,
} from "@/lib/actions/crm-invoices";
import type { AgingSummary, InvoiceFilters, InvoiceRow, LeaseRow, RentalContactOption } from "@/lib/queries-crm-rentals";
import { AGING_BUCKET_LABEL } from "@/lib/crm/arrears";
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABEL,
  INVOICE_TYPES,
  INVOICE_TYPE_LABEL,
  type CrmRole,
  type InvoiceStatus,
  type InvoiceType,
} from "@/lib/constants-crm";

/**
 * Нэхэмжлэхийн жагсаалт + насжилтын бүлэглэл (F-524): шүүлт, илгээх (F-521),
 * хүчингүй (F-522 — үндэслэлтэй, төлөгдсөнийг залруулгаар), нэмэлт үйлчилгээ
 * (F-523 — бичгэн зөвшөөрөлтэй), зуучлалын хөлс (F-516б — шатлалаар автомат).
 */
export function InvoicesPageShell({
  rows,
  aging,
  leases,
  contacts,
  filters,
  roles,
}: {
  rows: InvoiceRow[];
  aging: AgingSummary;
  leases: LeaseRow[];
  contacts: RentalContactOption[];
  filters: InvoiceFilters;
  roles: CrmRole[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canWrite = roles.some((r) => ["property_manager", "finance"].includes(r));

  const [extraOpen, setExtraOpen] = useState(false);
  const [ex, setEx] = useState({ leaseId: "", recipientContactId: "", amount: "", dueOn: "", approvalDocId: "" });
  const [brokOpen, setBrokOpen] = useState(false);
  const [br, setBr] = useState({ leaseId: "", amount: "", dueOn: "" });
  const [brSuggested, setBrSuggested] = useState<number | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [corrId, setCorrId] = useState<string | null>(null);
  const [corr, setCorr] = useState({ amount: "", dueOn: "" });

  function applyFilter(patch: Partial<InvoiceFilters>) {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams();
    if (next.status) params.set("status", next.status);
    if (next.type) params.set("type", next.type);
    if (next.q) params.set("q", next.q);
    router.push(`/office/crm/rentals/invoices${params.size ? `?${params}` : ""}`);
  }

  function run(fn: () => Promise<{ ok?: boolean; id?: string; error?: string; suggested?: number }>, close?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        if (res.suggested != null) setBrSuggested(res.suggested);
        return;
      }
      close?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Нэхэмжлэх</h1>
        {canWrite && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setBrSuggested(null); setBrokOpen(true); }}>
              <Plus className="size-4" /> Зуучлалын хөлс (F-516б)
            </Button>
            <Button size="sm" onClick={() => setExtraOpen(true)}>
              <Plus className="size-4" /> Нэмэлт үйлчилгээ (F-523)
            </Button>
          </div>
        )}
      </div>

      {/* Насжилт (F-524) */}
      <div className="grid gap-3 sm:grid-cols-4">
        {(["current", "d1_3", "d4_7", "d8_plus"] as const).map((b) => (
          <Card key={b}>
            <CardBody>
              <p className={"text-xl font-bold " + (b === "d8_plus" ? "text-rose-600" : b === "current" ? "text-ink" : "text-amber-600")}>
                {Math.round(aging.buckets[b].amount).toLocaleString()}₮
              </p>
              <p className="text-xs text-muted">
                {AGING_BUCKET_LABEL[b]} · {aging.buckets[b].count} нэхэмжлэх
              </p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-44"
          value={filters.status ?? ""}
          onChange={(e) => applyFilter({ status: (e.target.value || undefined) as InvoiceStatus | undefined })}
        >
          <option value="">Бүх төлөв</option>
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {INVOICE_STATUS_LABEL[s].label}
            </option>
          ))}
        </Select>
        <Select
          className="w-48"
          value={filters.type ?? ""}
          onChange={(e) => applyFilter({ type: (e.target.value || undefined) as InvoiceType | undefined })}
        >
          <option value="">Бүх төрөл</option>
          {INVOICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {INVOICE_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <Input
          className="w-56"
          placeholder="Дугаараар хайх…"
          defaultValue={filters.q ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyFilter({ q: (e.target as HTMLInputElement).value || undefined });
          }}
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Дугаар</th>
              <th className="px-4 py-3 font-medium">Төрөл</th>
              <th className="px-4 py-3 font-medium">Гэрээ</th>
              <th className="px-4 py-3 font-medium">Хүлээн авагч</th>
              <th className="px-4 py-3 font-medium">Эцсийн хугацаа</th>
              <th className="px-4 py-3 font-medium">Дүн</th>
              <th className="px-4 py-3 font-medium">Төлсөн</th>
              <th className="px-4 py-3 font-medium">Төлөв</th>
              <th className="px-4 py-3 font-medium">Үйлдэл</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const st = INVOICE_STATUS_LABEL[r.status];
              return (
                <tr key={r.id} className="hover:bg-surface-2">
                  <td className="px-4 py-3 font-semibold text-ink">
                    {r.number}
                    {r.corrected_invoice_id && (
                      <Badge tone="amber" className="ml-2">
                        Залруулга
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{INVOICE_TYPE_LABEL[r.type]}</td>
                  <td className="px-4 py-3 text-muted">
                    {r.lease_id ? (
                      <Link href={`/office/crm/rentals/leases/${r.lease_id}`} className="text-brand-700 hover:underline">
                        {r.lease_number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.recipient_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{r.due_on}</td>
                  <td className="px-4 py-3 text-ink">{Number(r.amount).toLocaleString()}₮</td>
                  <td className="px-4 py-3 text-muted">{Math.round(r.paid_mnt).toLocaleString()}₮</td>
                  <td className="px-4 py-3">
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/office/crm/rentals/invoices/${r.id}/print`}
                        className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
                        title="Хэвлэх / PDF (F-521)"
                      >
                        <Printer className="size-4" />
                      </Link>
                      {canWrite && r.status === "planned" && (
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => sendInvoice(r.id))}>
                          Илгээх
                        </Button>
                      )}
                      {canWrite && r.status !== "paid" && r.status !== "cancelled" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setCancelId(r.id);
                            setCancelReason("");
                          }}
                        >
                          Хүчингүй
                        </Button>
                      )}
                      {canWrite && r.status === "paid" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setCorrId(r.id);
                            setCorr({ amount: "", dueOn: "" });
                          }}
                        >
                          Залруулга
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted">
                  Нэхэмжлэх олдсонгүй. Менежменттэй идэвхтэй гэрээнд сарын нэхэмжлэх сар бүрийн 1-нд автомат
                  үүснэ (Д-13); сул объектод үүсэхгүй (Д-14).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Нэмэлт үйлчилгээ (F-516в/523) */}
      <Modal
        open={extraOpen}
        onClose={() => setExtraOpen(false)}
        title="Нэмэлт үйлчилгээний нэхэмжлэх (F-523)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setExtraOpen(false)}>
              Болих
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    createExtraServiceInvoice({
                      leaseId: ex.leaseId || null,
                      recipientContactId: ex.recipientContactId,
                      amount: Number(ex.amount),
                      dueOn: ex.dueOn,
                      approvalDocId: ex.approvalDocId,
                    }),
                  () => setExtraOpen(false)
                )
              }
            >
              Үүсгэх
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Гэрээ (сонголтоор)">
            <Select value={ex.leaseId} onChange={(e) => setEx({ ...ex, leaseId: e.target.value })}>
              <option value="">— Гэрээгүй —</option>
              {leases.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.number} · {l.tenant_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Хүлээн авагч">
            <Select value={ex.recipientContactId} onChange={(e) => setEx({ ...ex, recipientContactId: e.target.value })}>
              <option value="">— Сонгох —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Дүн (₮)">
              <Input type="number" value={ex.amount} onChange={(e) => setEx({ ...ex, amount: e.target.value })} />
            </Field>
            <Field label="Эцсийн хугацаа">
              <Input type="date" value={ex.dueOn} onChange={(e) => setEx({ ...ex, dueOn: e.target.value })} />
            </Field>
          </div>
          <Field label="Бичгэн зөвшөөрлийн баримтын ID (F-523 — заавал)">
            <Input value={ex.approvalDocId} onChange={(e) => setEx({ ...ex, approvalDocId: e.target.value })} placeholder="UUID" />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>

      {/* Зуучлалын хөлс (F-516б/465) */}
      <Modal
        open={brokOpen}
        onClose={() => setBrokOpen(false)}
        title="Энгийн түрээсийн зуучлалын хөлс (F-516б)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBrokOpen(false)}>
              Болих
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    createBrokerageInvoice({
                      leaseId: br.leaseId,
                      amount: br.amount ? Number(br.amount) : null,
                      dueOn: br.dueOn,
                    }),
                  () => setBrokOpen(false)
                )
              }
            >
              Үүсгэх
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Дүнг хугацааны шатлалаар (rental_fee_tiers) автомат санал болгоно (F-465); зөрүүтэй дүнд
            батлагдсан зөвшөөрөл шаардлагатай (F-411).
          </p>
          <Field label="Гэрээ (энгийн түрээс)">
            <Select value={br.leaseId} onChange={(e) => setBr({ ...br, leaseId: e.target.value })}>
              <option value="">— Сонгох —</option>
              {leases
                .filter((l) => !l.is_managed)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.number} · {l.monthly_rent.toLocaleString()}₮/сар · {l.duration_tier ?? "?"}
                  </option>
                ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Дүн (хоосон → автомат)" hint={brSuggested != null ? `Стандарт: ${brSuggested.toLocaleString()}₮` : undefined}>
              <Input type="number" value={br.amount} onChange={(e) => setBr({ ...br, amount: e.target.value })} />
            </Field>
            <Field label="Эцсийн хугацаа">
              <Input type="date" value={br.dueOn} onChange={(e) => setBr({ ...br, dueOn: e.target.value })} />
            </Field>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>

      {/* Хүчингүй болгох (F-522) */}
      <Modal
        open={cancelId != null}
        onClose={() => setCancelId(null)}
        title="Нэхэмжлэх хүчингүй болгох (F-522)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelId(null)}>
              Болих
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => run(() => cancelInvoice(cancelId!, cancelReason), () => setCancelId(null))}
            >
              Хүчингүй болгох
            </Button>
          </div>
        }
      >
        <Field label="Үндэслэлийн тэмдэглэл (заавал)">
          <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
        </Field>
        <p className="mt-2 text-xs text-muted">Төлөгдсөн нэхэмжлэхийг хүчингүй болгохгүй — залруулгын нэхэмжлэхээр (F-522).</p>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>

      {/* Залруулгын нэхэмжлэх (F-522) */}
      <Modal
        open={corrId != null}
        onClose={() => setCorrId(null)}
        title="Залруулгын нэхэмжлэх (F-522)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCorrId(null)}>
              Болих
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => createCorrectionInvoice(corrId!, { amount: Number(corr.amount), dueOn: corr.dueOn }),
                  () => setCorrId(null)
                )
              }
            >
              Үүсгэх
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Залруулгын дүн (₮)">
            <Input type="number" value={corr.amount} onChange={(e) => setCorr({ ...corr, amount: e.target.value })} />
          </Field>
          <Field label="Эцсийн хугацаа">
            <Input type="date" value={corr.dueOn} onChange={(e) => setCorr({ ...corr, dueOn: e.target.value })} />
          </Field>
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>
    </div>
  );
}
