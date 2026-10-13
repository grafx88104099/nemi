"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calculator, RefreshCcw, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import {
  generateCommissions,
  generateMonthlyPmCommissions,
  rollbackTransactionCommissions,
} from "@/lib/actions/crm-commissions";
import type { CommissionFilters, CommissionRow, CommissionSummary, TxnOption } from "@/lib/queries-crm-commissions";
import type { AgentOption } from "@/lib/queries-crm-leads";
import {
  COMMISSION_ROLE_LABEL,
  COMMISSION_STATUSES,
  COMMISSION_STATUS_LABEL,
  TXN_TYPE_LABEL,
  type CommissionStatus,
  type CrmRole,
} from "@/lib/constants-crm";

/**
 * Шимтгэлийн тооцооны жагсаалт (F-450–471): төлөвөөр шүүлт, нэгтгэлийн картууд,
 * F-454 гээгдлээс тооцоо үүсгэх, F-466 сарын PM дараалал ажиллуулах.
 * Агент талд (basePath=/agent/crm) RLS зөвхөн өөрийн мөрийг өгнө (F-471).
 */
export function CommissionsPageShell({
  rows,
  summary,
  filters,
  roles,
  basePath,
  agents = [],
  pendingTxns = [],
  pendingPmCount = 0,
  rollbackTxns = [],
}: {
  rows: CommissionRow[];
  summary: CommissionSummary;
  filters: CommissionFilters;
  roles: CrmRole[];
  basePath: string;
  agents?: AgentOption[];
  pendingTxns?: TxnOption[];
  pendingPmCount?: number;
  rollbackTxns?: TxnOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isOffice = basePath.startsWith("/office");
  const canGenerate =
    isOffice && roles.some((r) => ["finance", "sales_director", "ops_qc", "ceo"].includes(r));

  const [genOpen, setGenOpen] = useState(false);
  const [genTxn, setGenTxn] = useState("");
  const [rbOpen, setRbOpen] = useState(false);
  const [rbTxn, setRbTxn] = useState("");
  const [rbNote, setRbNote] = useState("");

  function applyFilter(patch: Partial<CommissionFilters>) {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams();
    if (next.status) params.set("status", next.status);
    if (next.source) params.set("source", next.source);
    if (next.recipientId) params.set("recipient", next.recipientId);
    if (next.month) params.set("month", next.month);
    if (next.q) params.set("q", next.q);
    router.push(`${basePath}/commissions${params.size ? `?${params}` : ""}`);
  }

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>, after?: (res: unknown) => void) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        return;
      }
      after?.(res);
      router.refresh();
    });
  }

  const SUMMARY_KEYS: CommissionStatus[] = ["calculated", "reviewed", "approved", "partially_paid", "paid", "hold"];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Шимтгэл</h1>
        {canGenerate && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                run(
                  () => generateMonthlyPmCommissions(),
                  (res) => {
                    const r = res as { created?: number; skipped?: number };
                    setInfo(
                      `Сарын PM тооцоо: ${r.created ?? 0} үүсэв, ${r.skipped ?? 0} алгасав/хүлээгдэж байна (F-466).`
                    );
                  }
                )
              }
            >
              <RefreshCcw className="size-4" /> PM сарын тооцоо
              {pendingPmCount > 0 && <Badge tone="amber">{pendingPmCount}</Badge>}
            </Button>
            <Button size="sm" disabled={pending} onClick={() => { setGenTxn(""); setGenOpen(true); }}>
              <Calculator className="size-4" /> Хэлцлээс тооцоолох
              {pendingTxns.length > 0 && <Badge tone="rose">{pendingTxns.length}</Badge>}
            </Button>
            {rollbackTxns.length > 0 && (
              <Button
                size="sm"
                variant="danger"
                disabled={pending}
                onClick={() => { setRbTxn(""); setRbNote(""); setRbOpen(true); }}
              >
                <Undo2 className="size-4" /> Rollback (F-462) <Badge tone="amber">{rollbackTxns.length}</Badge>
              </Button>
            )}
          </div>
        )}
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}
      {info && <p className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{info}</p>}

      {/* Нэгтгэл — төлөв бүрийн дүн */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {SUMMARY_KEYS.map((s) => (
          <Card key={s}>
            <CardBody>
              <p className={"text-lg font-bold " + (s === "hold" ? "text-rose-600" : "text-ink")}>
                {Math.round(summary[s].amount).toLocaleString()}₮
              </p>
              <p className="text-xs text-muted">
                {COMMISSION_STATUS_LABEL[s].label} · {summary[s].count}
              </p>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Шүүлт */}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Төлөв">
          <Select
            value={filters.status ?? ""}
            onChange={(e) => applyFilter({ status: (e.target.value || undefined) as CommissionStatus | undefined })}
            className="w-44"
          >
            <option value="">Бүгд</option>
            {COMMISSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {COMMISSION_STATUS_LABEL[s].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Эх сурвалж">
          <Select
            value={filters.source ?? ""}
            onChange={(e) =>
              applyFilter({ source: (e.target.value || undefined) as CommissionFilters["source"] })
            }
            className="w-44"
          >
            <option value="">Бүгд</option>
            <option value="transaction">Хэлцэл</option>
            <option value="lease_monthly">Сарын менежмент</option>
          </Select>
        </Field>
        {isOffice && agents.length > 0 && (
          <Field label="Хүлээн авагч">
            <Select
              value={filters.recipientId ?? ""}
              onChange={(e) => applyFilter({ recipientId: e.target.value || undefined })}
              className="w-48"
            >
              <option value="">Бүгд</option>
              {agents.map((a) => (
                <option key={a.profileId} value={a.profileId}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Сар">
          <Input
            type="month"
            value={filters.month ?? ""}
            onChange={(e) => applyFilter({ month: e.target.value || undefined })}
            className="w-40"
          />
        </Field>
        <Field label="Хайлт">
          <Input
            defaultValue={filters.q ?? ""}
            placeholder="Дугаар, нэр…"
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilter({ q: (e.target as HTMLInputElement).value || undefined });
            }}
            className="w-48"
          />
        </Field>
      </div>

      {/* Жагсаалт */}
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Хүлээн авагч</th>
              <th className="px-4 py-3 font-medium">Үүрэг</th>
              <th className="px-4 py-3 font-medium">Эх сурвалж</th>
              <th className="px-4 py-3 text-right font-medium">Хувь</th>
              <th className="px-4 py-3 text-right font-medium">Суурь</th>
              <th className="px-4 py-3 text-right font-medium">Дүн</th>
              <th className="px-4 py-3 text-right font-medium">Олгосон</th>
              <th className="px-4 py-3 font-medium">Төлөв</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted">
                  Тооцоо алга.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                <td className="px-4 py-3">
                  <Link href={`${basePath}/commissions/${r.id}`} className="font-semibold text-ink hover:underline">
                    {r.recipient_name ?? (r.recipient_type === "team" ? "ҮХХ баг" : "Компани")}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{COMMISSION_ROLE_LABEL[r.role]}</td>
                <td className="px-4 py-3 text-muted">
                  {r.source_type === "transaction" ? (
                    <>
                      {r.txn_number}
                      {r.txn_type && <span className="text-xs"> · {TXN_TYPE_LABEL[r.txn_type]}</span>}
                    </>
                  ) : (
                    <>
                      {r.lease_number ?? "Гэрээ"} · {r.record_month?.slice(0, 7)}
                    </>
                  )}
                </td>
                <td className="px-4 py-3 text-right">{r.applied_rate_pct}%</td>
                <td className="px-4 py-3 text-right">{Math.round(r.base_amount).toLocaleString()}₮</td>
                <td className="px-4 py-3 text-right font-semibold text-ink">
                  {Math.round(r.amount).toLocaleString()}₮
                </td>
                <td className="px-4 py-3 text-right">{Math.round(r.paid_amount).toLocaleString()}₮</td>
                <td className="px-4 py-3">
                  <Badge tone={COMMISSION_STATUS_LABEL[r.status].tone}>
                    {COMMISSION_STATUS_LABEL[r.status].label}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* F-454: хэлцлээс тооцоо үүсгэх */}
      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="Хэлцлээс шимтгэл тооцоолох (F-454)">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Зөвхөн амжилттай хаагдсан, Санхүү орлого баталгаажуулсан хэлцлээс тооцоо үүснэ.
            Хэсэгчилсэн орлогод пропорц тооцож, үлдэгдэл орж ирэхэд нэмэлт мөр автомат үүснэ (F-464).
          </p>
          <Field label="Хэлцэл (тооцоо үүсээгүй, хаагдсан)">
            <Select value={genTxn} onChange={(e) => setGenTxn(e.target.value)}>
              <option value="">— Сонгох —</option>
              {pendingTxns.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.number} · {TXN_TYPE_LABEL[t.type]} · {t.closed_on ?? ""}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setGenOpen(false)}>
              Болих
            </Button>
            <Button
              disabled={!genTxn || pending}
              onClick={() =>
                run(
                  () => generateCommissions({ txnId: genTxn }),
                  (res) => {
                    const r = res as { created?: number; held?: boolean; notes?: string[] };
                    setGenOpen(false);
                    setInfo(
                      `${r.created ?? 0} тооцооны мөр үүсэв${r.held ? " (F-461 нөхцөлөөр түдгэлзүүлсэн)" : ""}.` +
                        (r.notes?.length ? ` ${r.notes.join(" ")}` : "")
                    );
                  }
                )
              }
            >
              Тооцоолох
            </Button>
          </div>
        </div>
      </Modal>

      {/* F-462/463: цуцлагдсан хэлцлийн rollback */}
      <Modal open={rbOpen} onClose={() => setRbOpen(false)} title="Шимтгэлийн rollback (F-462/463)">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Цуцлагдсан/залруулагдсан хэлцлийн бүх тооцоог цуцалж, олгосон дүнд сөрөг гүйлгээний
            (clawback) ноорог үүсгэнэ. Clawback автоматаар хэрэгжихгүй — эрх бүхий удирдлага тусад нь батална.
          </p>
          <Field label="Хэлцэл (rollback хүлээж буй)">
            <Select value={rbTxn} onChange={(e) => setRbTxn(e.target.value)}>
              <option value="">— Сонгох —</option>
              {rollbackTxns.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.number} · {TXN_TYPE_LABEL[t.type]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Үндэслэл (заавал — F-463/473)">
            <Input value={rbNote} onChange={(e) => setRbNote(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRbOpen(false)}>
              Болих
            </Button>
            <Button
              variant="danger"
              disabled={!rbTxn || !rbNote.trim() || pending}
              onClick={() =>
                run(
                  () => rollbackTransactionCommissions(rbTxn, rbNote.trim()),
                  (res) => {
                    const r = res as { cancelled?: number; clawbacks?: number };
                    setRbOpen(false);
                    setInfo(
                      `Rollback: ${r.cancelled ?? 0} тооцоо цуцлагдаж, ${r.clawbacks ?? 0} clawback ноорог үүсэв (F-463).`
                    );
                  }
                )
              }
            >
              Rollback
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
