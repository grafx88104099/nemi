"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { approveForecastSnapshot, saveMgmtReview, takeForecastSnapshot } from "@/lib/actions/crm-budget";
import { fmtDateNum, shortMNT } from "@/lib/format";
import { monthLabel } from "@/lib/crm/quality";
import type { ForecastSnapshotRow, MgmtReviewRow } from "@/lib/queries-crm-kpi";

/**
 * Удирдлагын самбарын үйлдэлтэй хэсгүүд: сарын төсөөллийн агшин зураг ба
 * батлалт (§5 RACI — Борлуулалт хариуцсан захирал A), төсөөллийн нарийвчлал
 * (§8.5(3)), удирдлагын дүн шинжилгээний гаралт (§9(12)).
 */

export function ForecastPanel({
  snapshots,
  history,
  canTake,
  canApprove,
}: {
  snapshots: ForecastSnapshotRow[];
  history: { month: string; forecast: number; actual: number; accuracy: number | null; status: string }[];
  canTake: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [approveId, setApproveId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  function take() {
    start(async () => {
      const res = await takeForecastSnapshot();
      if (!res.ok) {
        toast.error(res.error ?? "Төсөөлөл бүртгэж чадсангүй.");
        return;
      }
      toast.success("Төсөөллийн агшин зураг бүртгэгдлээ");
      router.refresh();
    });
  }

  function approve() {
    if (!approveId) return;
    start(async () => {
      const res = await approveForecastSnapshot({ id: approveId, note });
      if (!res.ok) {
        toast.error(res.error ?? "Баталж чадсангүй.");
        return;
      }
      toast.success("Төсөөлөл батлагдлаа");
      setApproveId(null);
      setNote("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-ink">Борлуулалтын төсөөлөл ба нарийвчлал</h2>
            <p className="text-xs text-muted">
              Сар бүрийн эхэнд систем агшин зураг авна. Нарийвчлал = 100 − |бодит − төсөөлөл| ÷ бодит × 100.
            </p>
          </div>
          {canTake && (
            <Button size="sm" variant="outline" disabled={pending} onClick={take} className="print:hidden">
              <Camera className="size-4" /> Одоогийн төсөөллийг бүртгэх
            </Button>
          )}
        </div>

        {history.length > 0 && (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1.5 pr-3">Сар</th>
                  <th className="py-1.5 pr-3">Төсөөлөл</th>
                  <th className="py-1.5 pr-3">Бодит орлого</th>
                  <th className="py-1.5">Нарийвчлал</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.month} className="border-t border-line">
                    <td className="py-1.5 pr-3 text-ink">{monthLabel(h.month)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{shortMNT(h.forecast)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{shortMNT(h.actual)}</td>
                    <td className="py-1.5 font-semibold tabular-nums">{h.accuracy == null ? "—" : `${h.accuracy}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {snapshots.length === 0 ? (
          <EmptyState
            compact
            title="Төсөөллийн агшин зураг алга"
            description="Сарын эхэнд автоматаар бүртгэгдэнэ; шаардлагатай бол гараар бүртгэж болно."
          />
        ) : (
          <ul className="divide-y divide-line">
            {snapshots.slice(0, 6).map((s) => (
              <li key={s.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {monthLabel(s.month)} · {s.kind === "month_start" ? "Сарын эхний" : "Нэмэлт"} агшин зураг
                  </p>
                  <p className="text-xs text-muted">
                    {fmtDateNum(s.taken_at)} · {s.open_count} боломж · сард хаагдах жинлэсэн
                    хөлс {shortMNT(s.month_weighted_fee_mnt)} · нийт жинлэсэн дүн {shortMNT(s.weighted_amount_mnt)}
                    {s.approval_note ? ` · ${s.approval_note}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {s.status === "approved" ? (
                    <Badge tone="green">
                      <CheckCircle2 /> Батлагдсан{s.approved_name ? ` · ${s.approved_name}` : ""}
                    </Badge>
                  ) : (
                    <>
                      <Badge tone="amber">Батлагдаагүй</Badge>
                      {canApprove && (
                        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setApproveId(s.id)} className="print:hidden">
                          Батлах
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <Modal open={approveId != null} onClose={() => setApproveId(null)} title="Төсөөлөл батлах">
          <div className="space-y-4">
            <p className="text-sm text-muted">Батлагдсан төсөөлөл өөрчлөгдөхгүй бөгөөд сарын нарийвчлалын суурь болно.</p>
            <Field label="Тайлбар (заавал биш)">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Эрсдэл, таамаглал…" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setApproveId(null)}>
                Болих
              </Button>
              <Button disabled={pending} onClick={approve}>
                Батлах
              </Button>
            </div>
          </div>
        </Modal>
      </CardBody>
    </Card>
  );
}

const PERIOD_LABEL: Record<string, string> = { week: "Долоо хоног", month: "Сар", quarter: "Улирал" };

export function MgmtReviewPanel({ reviews, canWrite }: { reviews: MgmtReviewRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ periodKind: "month" as "week" | "month" | "quarter", findings: "", decisions: "" });

  function submit() {
    start(async () => {
      const res = await saveMgmtReview(form);
      if (!res.ok) {
        toast.error(res.error ?? "Хадгалж чадсангүй.");
        return;
      }
      toast.success("Дүгнэлт бүртгэгдлээ");
      setOpen(false);
      setForm({ periodKind: "month", findings: "", decisions: "" });
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-ink">Удирдлагын дүн шинжилгээ</h2>
            <p className="text-xs text-muted">Дүгнэлт бүртгэх үеийн гол тоо хамт хадгалагдана.</p>
          </div>
          {canWrite && (
            <Button size="sm" onClick={() => setOpen(true)} className="print:hidden">
              <FileText className="size-4" /> Дүгнэлт бүртгэх
            </Button>
          )}
        </div>
        {reviews.length === 0 ? (
          <EmptyState compact title="Дүгнэлт бүртгэгдээгүй" />
        ) : (
          <ul className="space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl border border-line px-3 py-2.5">
                <p className="text-xs text-muted">
                  {PERIOD_LABEL[r.period_kind] ?? ""} · {r.period_start.replaceAll("-", ".")} · {r.reviewer_name ?? "—"} ·{" "}
                  {fmtDateNum(r.created_at)}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-ink">{r.findings}</p>
                {r.decisions && (
                  <p className="mt-1 whitespace-pre-line text-sm text-muted">
                    <span className="font-semibold text-ink">Шийдвэр: </span>
                    {r.decisions}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <Modal open={open} onClose={() => setOpen(false)} title="Удирдлагын дүгнэлт бүртгэх">
          <div className="space-y-4">
            <Field label="Хугацаа">
              <Select
                value={form.periodKind}
                onChange={(e) => setForm({ ...form, periodKind: e.target.value as "week" | "month" | "quarter" })}
              >
                <option value="week">Энэ долоо хоног</option>
                <option value="month">Энэ сар</option>
                <option value="quarter">Энэ улирал</option>
              </Select>
            </Field>
            <Field label="Дүгнэлт">
              <textarea
                className="min-h-28 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink"
                value={form.findings}
                onChange={(e) => setForm({ ...form, findings: e.target.value })}
                placeholder="Төсвийн биелэлт, урсгал, эрсдэл…"
              />
            </Field>
            <Field label="Шийдвэр, хариуцагч">
              <textarea
                className="min-h-20 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink"
                value={form.decisions}
                onChange={(e) => setForm({ ...form, decisions: e.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Болих
              </Button>
              <Button disabled={pending || form.findings.trim().length < 10} onClick={submit}>
                Хадгалах
              </Button>
            </div>
          </div>
        </Modal>
      </CardBody>
    </Card>
  );
}
