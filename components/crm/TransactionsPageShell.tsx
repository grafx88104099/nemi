"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Plus, Search, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { createTransaction, exportTransactions } from "@/lib/actions/crm-transactions";
import type { TxnRow, TxnFilters, OppOption } from "@/lib/queries-crm-transactions";
import type { AgentOption } from "@/lib/queries-crm-leads";
import {
  TXN_TYPES,
  TXN_TYPE_LABEL,
  TXN_STATUSES,
  TXN_STATUS_LABEL,
  type TxnType,
  type TxnStatus,
  type CrmRole,
} from "@/lib/constants-crm";

/**
 * Хэлцлийн жагсаалт (F-418): төрөл/төлөв/агент/огноогоор шүүх + CSV экспорт
 * (аудиттай server action-аар). Шинэ хэлцэл — нээлттэй боломжоос (F-402 холбоос).
 */
export function TransactionsPageShell({
  rows,
  agents,
  oppOptions,
  filters,
  roles,
}: {
  rows: TxnRow[];
  agents: AgentOption[];
  oppOptions: OppOption[];
  filters: TxnFilters;
  roles: CrmRole[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Шинэ хэлцлийн модал
  const [createOpen, setCreateOpen] = useState(false);
  const [oppId, setOppId] = useState("");
  const [txnType, setTxnType] = useState<TxnType>("sale");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("MNT");
  const [originalId, setOriginalId] = useState("");

  const isManager = roles.some((r) => ["team_lead", "sales_director", "ops_qc", "ceo", "finance"].includes(r));

  function applyFilter(patch: Partial<TxnFilters>) {
    const next = { ...filters, ...patch, q: q || undefined };
    const params = new URLSearchParams();
    if (next.type) params.set("type", next.type);
    if (next.status) params.set("status", next.status);
    if (next.agentId) params.set("agent", next.agentId);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    if (next.q) params.set("q", next.q);
    router.push(`/office/crm/transactions${params.size ? `?${params}` : ""}`);
  }

  function exportCsv() {
    startTransition(async () => {
      const res = await exportTransactions(filters);
      if (res.error || !res.csv) {
        setError(res.error ?? "Экспорт амжилтгүй.");
        return;
      }
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `heltsel-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function create() {
    setError(null);
    if (!oppId) {
      setError("Боломж сонгоно уу (F-402).");
      return;
    }
    const amt = Number(amount);
    if (!(amt > 0)) {
      setError("Дүн оруулна уу.");
      return;
    }
    if (txnType === "replacement" && !originalId) {
      setError("Replacement хэлцэлд анхны хэлцлийн ID заавал (F-413).");
      return;
    }
    startTransition(async () => {
      const res = await createTransaction({
        opportunityId: oppId,
        type: txnType,
        amount: amt,
        currency,
        originalTransactionId: originalId || null,
      });
      if (res.error || !res.id) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setCreateOpen(false);
      router.push(`/office/crm/transactions/${res.id}`);
    });
  }

  const selectedOpp = oppOptions.find((o) => o.id === oppId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Хэлцэл</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={pending}>
            <Download className="size-4" />
            Экспорт (F-418)
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Шинэ хэлцэл
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilter({});
            }}
            placeholder="Дугаараар хайх…"
            className="pl-9"
          />
        </div>
        <Select
          className="w-44"
          value={filters.type ?? ""}
          onChange={(e) => applyFilter({ type: (e.target.value || undefined) as TxnType | undefined })}
        >
          <option value="">Бүх төрөл</option>
          {TXN_TYPES.map((t) => (
            <option key={t} value={t}>
              {TXN_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <Select
          className="w-40"
          value={filters.status ?? ""}
          onChange={(e) => applyFilter({ status: (e.target.value || undefined) as TxnStatus | undefined })}
        >
          <option value="">Бүх төлөв</option>
          {TXN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TXN_STATUS_LABEL[s].label}
            </option>
          ))}
        </Select>
        {isManager && (
          <Select
            className="w-44"
            value={filters.agentId ?? ""}
            onChange={(e) => applyFilter({ agentId: e.target.value || undefined })}
          >
            <option value="">Бүх агент</option>
            {agents.map((a) => (
              <option key={a.profileId} value={a.profileId}>
                {a.name}
              </option>
            ))}
          </Select>
        )}
        <Input
          type="date"
          className="w-40"
          value={filters.from ?? ""}
          onChange={(e) => applyFilter({ from: e.target.value || undefined })}
        />
        <Input
          type="date"
          className="w-40"
          value={filters.to ?? ""}
          onChange={(e) => applyFilter({ to: e.target.value || undefined })}
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">Хэлцэл олдсонгүй.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Дугаар</th>
                <th className="px-4 py-3 font-medium">Төрөл</th>
                <th className="px-4 py-3 font-medium">Төлөв</th>
                <th className="px-4 py-3 font-medium">Дүн</th>
                <th className="px-4 py-3 font-medium">₮ дүйцэл</th>
                <th className="px-4 py-3 font-medium">Бүрэн %</th>
                <th className="px-4 py-3 font-medium">Агент</th>
                <th className="px-4 py-3 font-medium">Объект</th>
                <th className="px-4 py-3 font-medium">Нээсэн</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link
                      href={`/office/crm/transactions/${r.id}`}
                      className="font-semibold text-brand-700 hover:underline"
                    >
                      {r.number}
                    </Link>
                    {r.aml_hold && (
                      <ShieldAlert className="ml-1.5 inline size-4 text-rose-600" aria-label="МУТСТ hold" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{TXN_TYPE_LABEL[r.type]}</td>
                  <td className="px-4 py-3">
                    <Badge tone={TXN_STATUS_LABEL[r.status].tone}>{TXN_STATUS_LABEL[r.status].label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {r.amount.toLocaleString()} {r.currency}
                  </td>
                  <td className="px-4 py-3 text-muted">{Math.round(r.amount_mnt).toLocaleString()}₮</td>
                  <td className="px-4 py-3">
                    <span className={r.file_completeness_pct >= 100 ? "text-emerald-600" : "text-amber-600"}>
                      {Math.round(r.file_completeness_pct)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{r.owner_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {r.property_number ? `${r.property_number}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.opened_on}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Шинэ хэлцэл (F-400)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Болих
            </Button>
            <Button onClick={create} disabled={pending}>
              {pending ? "Үүсгэж байна…" : "Үүсгэх"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Боломж (нээлттэй, идэвхтэй хэлцэлгүй)" hint="Хэлцэл боломж/объект/харилцагчтай заавал холбогдоно (F-402).">
            <Select value={oppId} onChange={(e) => setOppId(e.target.value)}>
              <option value="">— Сонгох —</option>
              {oppOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.pipeline_code} · {o.contact_name}
                  {o.property_name ? ` · ${o.property_name}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          {selectedOpp && !selectedOpp.property_id && (
            <p className="text-sm text-amber-600">
              Энэ боломжид объект холбогдоогүй — эхлээд боломж дээрээ объектоо сонгоно уу.
            </p>
          )}
          <Field label="Төрөл">
            <Select value={txnType} onChange={(e) => setTxnType(e.target.value as TxnType)}>
              {TXN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TXN_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          {txnType === "replacement" && (
            <Field label="Анхны хэлцлийн ID (F-413)">
              <Input value={originalId} onChange={(e) => setOriginalId(e.target.value)} placeholder="UUID" />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Дүн">
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Валют" hint="MNT биш бол өнөөдрийн ханш автомат (F-419)">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="MNT">MNT</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="CNY">CNY</option>
                <option value="KRW">KRW</option>
                <option value="JPY">JPY</option>
              </Select>
            </Field>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
