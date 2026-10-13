"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Banknote,
  CircleAlert,
  CircleCheck,
  History,
  Lock,
  Printer,
  Scale,
  Undo2,
  Unlock,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { BackLink } from "@/components/ui/back-link";
import { EvidencePanel } from "@/components/crm/EvidencePanel";
import { AuditTrail } from "@/components/crm/AuditTrail";
import type { AuditRow } from "@/lib/queries-crm-transactions";
import {
  approveClawback,
  createDispute,
  decideDispute,
  holdCommission,
  recordClawback,
  recordPayout,
  releaseCommissionHold,
  setCommissionStatus,
} from "@/lib/actions/crm-commissions";
import type { CommissionDetail } from "@/lib/queries-crm-commissions";
import { COMMISSION_POLICY_LABEL } from "@/lib/crm/commission";
import {
  COMMISSION_ROLE_LABEL,
  COMMISSION_STATUS_LABEL,
  TXN_TYPE_LABEL,
  type CommissionStatus,
  type CrmRole,
} from "@/lib/constants-crm";

/**
 * Шимтгэлийн тооцооны дэлгэрэнгүй (F-471): задаргаа, нотолгоо (EvidencePanel),
 * төлөвийн урсгалын үйлдлүүд ДҮРЭЭР (F-460 — DB guard эцсийн үнэн),
 * hold/release (F-461), олголт (F-464), clawback (F-462), маргаан (F-474),
 * түүх + аудит (F-473), тооцооны хуудас руу print холбоос (F-472).
 */

const CLAWBACK_CATEGORIES = [
  ["client_fault", "Харилцагчийн буруу"],
  ["agent_fault", "Хэрэгжүүлэгчийн буруу"],
  ["force_majeure", "Давагдашгүй хүчин зүйл"],
  ["compliance", "Нийцэл"],
  ["transaction_rollback", "Хэлцлийн буцаалт"],
  ["other", "Бусад"],
] as const;

const FLOW: CommissionStatus[] = ["calculated", "reviewed", "approved", "paid"];

export function CommissionDetailShell({
  detail,
  roles,
  basePath,
  audit = [],
}: {
  detail: CommissionDetail;
  roles: CrmRole[];
  basePath: string;
  audit?: AuditRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isOffice = basePath.startsWith("/office");

  const isSdOps = roles.some((r) => r === "sales_director" || r === "ops_qc");
  const isCeo = roles.includes("ceo");
  const isFinance = roles.includes("finance");
  const isManager = isSdOps || isCeo;
  const canHold = isSdOps || isCeo || isFinance;

  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelNote, setCancelNote] = useState("");
  const [clawOpen, setClawOpen] = useState(false);
  const [claw, setClaw] = useState({ amount: "", category: "client_fault" });
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeContent, setDisputeContent] = useState("");
  const [decideId, setDecideId] = useState<string | null>(null);
  const [decide, setDecide] = useState({ decision: "", rationale: "" });

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

  const status = detail.status;
  const remaining = Math.max(0, detail.amount - detail.paid_amount);
  const stepIdx = status === "partially_paid" ? 3 : FLOW.indexOf(status);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <BackLink href={`${basePath}/commissions`} label="Шимтгэлийн жагсаалт руу" />
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-ink">
              {detail.recipient_name ?? (detail.recipient_type === "team" ? "ҮХХ баг" : "Компани")} ·{" "}
              {COMMISSION_ROLE_LABEL[detail.role]}
            </h1>
            <Badge tone={COMMISSION_STATUS_LABEL[status].tone}>{COMMISSION_STATUS_LABEL[status].label}</Badge>
          </div>
          <p className="text-sm text-muted">
            {detail.source_type === "transaction"
              ? `Хэлцэл: ${detail.txn_number ?? "—"}${detail.txn_type ? ` (${TXN_TYPE_LABEL[detail.txn_type]})` : ""}`
              : `Түрээсийн гэрээ: ${detail.lease_number ?? "—"} · тайлант сар ${detail.record_month?.slice(0, 7) ?? "—"}`}
          </p>
        </div>
        {isOffice && (
          <ButtonLink variant="outline" size="sm" href={`/office/crm/commissions/${detail.id}/print`}>
            <Printer className="size-4" /> Тооцооны хуудас (F-472)
          </ButtonLink>
        )}
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}

      {status === "hold" && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Түдгэлзүүлсэн (F-461)</p>
            <p>{detail.hold_reason ?? "Шалтгаан бүртгэгдээгүй."}</p>
          </div>
        </div>
      )}

      {/* Урсгалын stepper (F-460) */}
      <div className="flex flex-wrap items-center gap-2">
        {FLOW.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-6 bg-line" />}
            <span
              className={
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold " +
                (i < stepIdx
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : i === stepIdx && status !== "hold" && status !== "cancelled"
                    ? "border-brand-200 bg-brand-50 text-brand-700"
                    : "border-line bg-surface-2 text-muted")
              }
            >
              {i < stepIdx && <CircleCheck className="size-3" />}
              {COMMISSION_STATUS_LABEL[s].label}
            </span>
          </div>
        ))}
        {status === "partially_paid" && (
          <Badge tone="amber">{COMMISSION_STATUS_LABEL.partially_paid.label}</Badge>
        )}
        {status === "cancelled" && <Badge tone="rose">{COMMISSION_STATUS_LABEL.cancelled.label}</Badge>}
      </div>

      {/* Задаргаа */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardBody>
            <p className="text-lg font-bold text-ink">{detail.applied_rate_pct}%</p>
            <p className="text-xs text-muted">Хэрэглэсэн хувь</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-lg font-bold text-ink">{Math.round(detail.base_amount).toLocaleString()}₮</p>
            <p className="text-xs text-muted">Суурь (татварын дараах, F-455)</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-lg font-bold text-ink">{Math.round(detail.amount).toLocaleString()}₮</p>
            <p className="text-xs text-muted">Тооцсон дүн</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-lg font-bold text-emerald-700">{Math.round(detail.paid_amount).toLocaleString()}₮</p>
            <p className="text-xs text-muted">Олгосон (F-464)</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-lg font-bold text-amber-600">{Math.round(remaining).toLocaleString()}₮</p>
            <p className="text-xs text-muted">Хүлээгдэж буй</p>
          </CardBody>
        </Card>
      </div>

      {/* Үйлдлүүд — дүрээр (DB guard эцсийн үнэн) */}
      {isOffice && (
        <div className="flex flex-wrap gap-2">
          {status === "calculated" && isSdOps && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => setCommissionStatus({ id: detail.id, to: "reviewed" }))}
            >
              <BadgeCheck className="size-4" /> Хянасан (SD/ЧМТ)
            </Button>
          )}
          {status === "reviewed" && isCeo && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => setCommissionStatus({ id: detail.id, to: "approved" }))}
            >
              <BadgeCheck className="size-4" /> Баталгаажуулах (CEO)
            </Button>
          )}
          {(status === "approved" || status === "partially_paid") && isFinance && (
            <Button size="sm" disabled={pending} onClick={() => { setPayoutAmount(String(remaining)); setPayoutOpen(true); }}>
              <Banknote className="size-4" /> Олголт бүртгэх
            </Button>
          )}
          {status !== "hold" && status !== "cancelled" && status !== "paid" && canHold && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => { setHoldReason(""); setHoldOpen(true); }}>
              <Lock className="size-4" /> Түдгэлзүүлэх
            </Button>
          )}
          {status === "hold" && isManager && (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => releaseCommissionHold(detail.id))}
            >
              <Unlock className="size-4" /> Hold нээх (удирдлага)
            </Button>
          )}
          {status !== "cancelled" && (isManager || isFinance) && (
            <Button size="sm" variant="danger" disabled={pending} onClick={() => { setCancelNote(""); setCancelOpen(true); }}>
              <Undo2 className="size-4" /> Цуцлах
            </Button>
          )}
          {(isFinance || isSdOps) && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => { setClaw({ amount: "", category: "client_fault" }); setClawOpen(true); }}>
              <Undo2 className="size-4" /> Clawback (F-462)
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Нотолгоо (F-451) */}
        <Card>
          <CardBody>
            <EvidencePanel evidence={detail.evidence} />
            {detail.config && (
              <p className="mt-3 text-xs text-muted">
                Журам: <span className="font-medium text-ink">{detail.config.policy_code}</span> —{" "}
                {COMMISSION_POLICY_LABEL[detail.config.policy_code as keyof typeof COMMISSION_POLICY_LABEL] ?? ""}
                <br />
                Тохиргооны хувилбар: {new Date(detail.config.valid_from).toLocaleDateString()} (F-453 — хэлцэлд
                тухайн үед хүчинтэй байсан хувилбар үйлчилнэ)
              </p>
            )}
            {detail.source_type === "transaction" && detail.txn_detail && (
              <p className="mt-2 text-xs text-muted">
                Хавтасны бүрэн байдал: {detail.txn_detail.file_completeness_pct}% (F-409 — 100% биш бол «Хянасан»
                хориглоно)
              </p>
            )}
            {detail.source_type === "lease_monthly" && detail.monthly_detail && (
              <p className="mt-2 text-xs text-muted">
                Сарын бүртгэл: {detail.monthly_detail.completeness_pct}% бөглөгдсөн
                {detail.monthly_detail.commission_hold ? " · чанарын босго хангаагүй (F-559)" : ""}
              </p>
            )}
          </CardBody>
        </Card>

        {/* Түүх (F-460/473) */}
        <Card>
          <CardBody>
            <div className="mb-2 flex items-center gap-2">
              <History className="size-4 text-muted" />
              <span className="text-sm font-semibold text-ink">Төлөвийн түүх</span>
            </div>
            {detail.history.length === 0 && <p className="py-4 text-center text-sm text-muted">Түүх алга.</p>}
            <ul className="space-y-2">
              {detail.history.map((h) => (
                <li key={h.id} className="rounded-xl border border-line px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">
                      {h.from_status ? COMMISSION_STATUS_LABEL[h.from_status].label : "—"} →{" "}
                      {COMMISSION_STATUS_LABEL[h.to_status].label}
                    </span>
                    <span className="text-xs text-muted">{new Date(h.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-muted">
                    {h.decided_name ?? "Систем"}
                    {h.note ? ` · ${h.note}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      {/* Clawback жагсаалт (F-462) */}
      {detail.clawbacks.length > 0 && (
        <Card>
          <CardBody>
            <p className="mb-2 text-sm font-semibold text-ink">Буцаалт — сөрөг гүйлгээ (F-462/463)</p>
            <ul className="space-y-2">
              {detail.clawbacks.map((cb) => (
                <li key={cb.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                  <div>
                    <span className="font-semibold text-rose-600">{Math.round(cb.amount).toLocaleString()}₮</span>
                    <span className="ml-2 text-muted">
                      {CLAWBACK_CATEGORIES.find(([c]) => c === cb.reason_category)?.[1] ?? cb.reason_category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {cb.approved_at ? (
                      <Badge tone="green">Батлагдсан · {cb.approved_name ?? ""}</Badge>
                    ) : (
                      <>
                        <Badge tone="amber">
                          <CircleAlert /> Баталгаажуулалт хүлээж буй
                        </Badge>
                        {isOffice && (isCeo || roles.includes("sales_director")) && (
                          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => approveClawback(cb.id))}>
                            Батлах
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* Маргаан (F-474) */}
      {detail.source_type === "transaction" && (
        <Card>
          <CardBody>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Scale className="size-4 text-muted" />
                <span className="text-sm font-semibold text-ink">Үүрэг/эзэмшлийн маргаан (F-474)</span>
              </div>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => { setDisputeContent(""); setDisputeOpen(true); }}>
                Маргаан бүртгэх
              </Button>
            </div>
            {detail.disputes.length === 0 && (
              <p className="py-3 text-center text-sm text-muted">Энэ хэлцэлд маргаан бүртгэгдээгүй.</p>
            )}
            <ul className="space-y-2">
              {detail.disputes.map((d) => (
                <li key={d.id} className="rounded-xl border border-line px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-ink">{d.content}</p>
                    {d.decision ? (
                      <Badge tone="green">Шийдвэрлэсэн</Badge>
                    ) : isOffice && isManager ? (
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => { setDecide({ decision: "", rationale: "" }); setDecideId(d.id); }}>
                        Шийдвэрлэх
                      </Button>
                    ) : (
                      <Badge tone="amber">Нээлттэй</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    {d.creator_name ?? ""} · {new Date(d.created_at).toLocaleDateString()}
                    {d.decision ? ` · Шийдвэр: ${d.decision} (${d.decider_name ?? ""}) — ${d.rationale ?? ""}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* Аудит (F-473) — эрхтэй дүрд серверээс rows ирнэ */}
      {audit.length > 0 && (
        <Card>
          <CardBody>
            <p className="mb-2 text-sm font-semibold text-ink">Аудит (F-473)</p>
            <AuditTrail rows={audit} />
          </CardBody>
        </Card>
      )}

      {/* Модалууд */}
      <Modal open={payoutOpen} onClose={() => setPayoutOpen(false)} title="Олголт бүртгэх (F-464)">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Хүлээгдэж буй: {Math.round(remaining).toLocaleString()}₮. Хэсэгчилсэн дүнд «Хэсэгчлэн олгосон», бүрэн
            дүнд «Олгосон» төлөв автомат.
          </p>
          <Field label="Олгох дүн (₮)">
            <Input type="number" min={1} value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPayoutOpen(false)}>Болих</Button>
            <Button
              disabled={pending || !Number(payoutAmount)}
              onClick={() =>
                run(() => recordPayout({ id: detail.id, amount: Number(payoutAmount) }), () => setPayoutOpen(false))
              }
            >
              Бүртгэх
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={holdOpen} onClose={() => setHoldOpen(false)} title="Түдгэлзүүлэх (F-461)">
        <div className="space-y-4">
          <Field label="Шалтгаан (заавал)">
            <Input
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              placeholder="Сарын бүртгэл дутуу / хүлээлцэх бүрэн бус / нотолгоо дутуу / ноцтой гомдол…"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setHoldOpen(false)}>Болих</Button>
            <Button
              variant="danger"
              disabled={pending || !holdReason.trim()}
              onClick={() => run(() => holdCommission(detail.id, holdReason), () => setHoldOpen(false))}
            >
              Түдгэлзүүлэх
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Тооцоо цуцлах (F-462/463)">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Цуцлалт түүхэнд бүрэн хадгалагдана; олгосон дүнтэй бол clawback тусад нь бүртгэнэ.
          </p>
          <Field label="Үндэслэл (заавал)">
            <Input value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Болих</Button>
            <Button
              variant="danger"
              disabled={pending || !cancelNote.trim()}
              onClick={() =>
                run(() => setCommissionStatus({ id: detail.id, to: "cancelled", note: cancelNote }), () => setCancelOpen(false))
              }
            >
              Цуцлах
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={clawOpen} onClose={() => setClawOpen(false)} title="Clawback — сөрөг гүйлгээ (F-462)">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Автоматаар хэрэгжихгүй: Санхүү/Борлуулалт/ЧМТ бүртгэж, эрх бүхий удирдлага (CEO/Борлуулалтын захирал)
            тусад нь батална.
          </p>
          <Field label="Буцаах дүн (₮, эерэгээр оруулна — сөрөг гүйлгээ болж хадгалагдана)">
            <Input type="number" min={1} value={claw.amount} onChange={(e) => setClaw({ ...claw, amount: e.target.value })} />
          </Field>
          <Field label="Шалтгааны ангилал">
            <select
              className="h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink"
              value={claw.category}
              onChange={(e) => setClaw({ ...claw, category: e.target.value })}
            >
              {CLAWBACK_CATEGORIES.map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setClawOpen(false)}>Болих</Button>
            <Button
              variant="danger"
              disabled={pending || !Number(claw.amount)}
              onClick={() =>
                run(
                  () => recordClawback({ recordId: detail.id, amount: Number(claw.amount), reasonCategory: claw.category }),
                  () => setClawOpen(false)
                )
              }
            >
              Бүртгэх
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={disputeOpen} onClose={() => setDisputeOpen(false)} title="Маргаан бүртгэх (F-474)">
        <div className="space-y-4">
          <Field label="Агуулга">
            <Input
              value={disputeContent}
              onChange={(e) => setDisputeContent(e.target.value)}
              placeholder="Үүрэг/сэжимийн эзэмшлийн маргааны агуулга…"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDisputeOpen(false)}>Болих</Button>
            <Button
              disabled={pending || disputeContent.trim().length < 5 || !detail.transaction_id}
              onClick={() =>
                run(
                  () => createDispute({ transactionId: detail.transaction_id!, content: disputeContent.trim() }),
                  () => setDisputeOpen(false)
                )
              }
            >
              Бүртгэх
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={decideId != null} onClose={() => setDecideId(null)} title="Маргаан шийдвэрлэх (F-474)">
        <div className="space-y-4">
          <Field label="Шийдвэр">
            <Input value={decide.decision} onChange={(e) => setDecide({ ...decide, decision: e.target.value })} />
          </Field>
          <Field label="Үндэслэл (заавал — F-473)">
            <Input value={decide.rationale} onChange={(e) => setDecide({ ...decide, rationale: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDecideId(null)}>Болих</Button>
            <Button
              disabled={pending || decide.decision.trim().length < 2 || decide.rationale.trim().length < 5}
              onClick={() =>
                run(
                  () => decideDispute({ id: decideId!, decision: decide.decision.trim(), rationale: decide.rationale.trim() }),
                  () => setDecideId(null)
                )
              }
            >
              Шийдвэрлэх
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
