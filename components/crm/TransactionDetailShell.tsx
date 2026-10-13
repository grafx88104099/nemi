"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Ban, FileSignature, Pencil, ShieldAlert, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { CompletenessBar } from "@/components/crm/CompletenessBar";
import { PartyEditor } from "@/components/crm/PartyEditor";
import { AgentRoleEditor } from "@/components/crm/AgentRoleEditor";
import { HandoverChecklist } from "@/components/crm/HandoverChecklist";
import { ApprovalPanel } from "@/components/crm/ApprovalPanel";
import { EntityDocs } from "@/components/crm/EntityDocs";
import { AuditTrail } from "@/components/crm/AuditTrail";
import { AmlAlertButton } from "@/components/crm/AmlAlertButton";
import { GateErrorDialog } from "@/components/crm/GateErrorDialog";
import {
  setTxnStatus,
  cancelTransaction,
  addContract,
  addScheduleLine,
  setFxRateManual,
  applyCorrection,
} from "@/lib/actions/crm-transactions";
import type { TxnDetail, CompletenessDetail, AuditRow, ContactOption } from "@/lib/queries-crm-transactions";
import type { DocRow } from "@/lib/queries-crm-docs";
import type { AgentOption } from "@/lib/queries-crm-leads";
import {
  TXN_TYPE_LABEL,
  TXN_STATUS_LABEL,
  type CrmRole,
} from "@/lib/constants-crm";

/**
 * Хэлцлийн хавтас (F-400–421): талууд, үүрэг, гэрээ, төлбөрийн хуваарь,
 * хүлээлцэх, бүрэн байдлын %, зөвшөөрөл, баримт, аудит. Төлөвийн машин —
 * DB guard эцсийн үнэн; энд зөвхөн дүрээр товч харуулж, exception-ыг задална.
 */

// Цуцлалтын ангилал (F-415) — серверийн TXN_CANCEL_CATEGORIES-тэй ижил кодууд.
const TXN_CANCEL_CATEGORIES = ["client_fault", "executor_fault", "force_majeure", "compliance", "other"] as const;

const CANCEL_LABEL: Record<string, string> = {
  client_fault: "Харилцагчийн буруу",
  executor_fault: "Хэрэгжүүлэгчийн буруу",
  force_majeure: "Давагдашгүй хүчин зүйл",
  compliance: "Нийцэл",
  other: "Бусад",
};

export function TransactionDetailShell({
  txn,
  completeness,
  docs,
  audit,
  agents,
  contactOptions,
  roles,
}: {
  txn: TxnDetail;
  completeness: CompletenessDetail;
  docs: DocRow[];
  audit: AuditRow[];
  agents: AgentOption[];
  contactOptions: ContactOption[];
  roles: CrmRole[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState("parties");
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  const isSdCeo = roles.some((r) => r === "sales_director" || r === "ceo");
  const canCorrect = roles.some((r) => ["sales_director", "ops_qc", "ceo"].includes(r));
  const canFx = roles.some((r) => ["finance", "sales_director", "ops_qc", "ceo"].includes(r));
  const editable = txn.status !== "closed" && txn.status !== "cancelled";

  // Цуцлалтын модал
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelCat, setCancelCat] = useState<string>("client_fault");
  const [cancelNote, setCancelNote] = useState("");

  // Гэрээ нэмэх модал
  const [contractOpen, setContractOpen] = useState(false);
  const [cType, setCType] = useState("");
  const [cNumber, setCNumber] = useState("");
  const [cSigned, setCSigned] = useState("");
  const [cDocId, setCDocId] = useState("");

  // Хуваарийн мөр нэмэх
  const [lineOpen, setLineOpen] = useState(false);
  const [lDue, setLDue] = useState("");
  const [lAmount, setLAmount] = useState("");
  const [lKind, setLKind] = useState("advance");
  const [lNote, setLNote] = useState("");

  // FX гар override
  const [fxOpen, setFxOpen] = useState(false);
  const [fxRate, setFxRate] = useState(String(txn.fx_rate));
  const [fxReason, setFxReason] = useState("");

  // Залруулга (F-417)
  const [corrOpen, setCorrOpen] = useState(false);
  const [corrAmount, setCorrAmount] = useState("");
  const [corrClosedOn, setCorrClosedOn] = useState("");
  const [corrRationale, setCorrRationale] = useState("");

  function moveStatus(to: string) {
    setError(null);
    startTransition(async () => {
      const res = await setTxnStatus(txn.id, to);
      if (!res.ok) {
        if (res.missing?.length) setMissing(res.missing);
        else setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      router.refresh();
    });
  }

  function doCancel() {
    setError(null);
    startTransition(async () => {
      const res = await cancelTransaction(txn.id, cancelCat, cancelNote);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setCancelOpen(false);
      router.refresh();
    });
  }

  function doAddContract() {
    setError(null);
    startTransition(async () => {
      const res = await addContract({
        transactionId: txn.id,
        contractType: cType,
        number: cNumber,
        signedOn: cSigned || null,
        docId: cDocId || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setContractOpen(false);
      setCType("");
      setCNumber("");
      setCSigned("");
      setCDocId("");
      router.refresh();
    });
  }

  function doAddLine() {
    setError(null);
    startTransition(async () => {
      const res = await addScheduleLine({
        transactionId: txn.id,
        dueOn: lDue,
        amount: Number(lAmount),
        kind: lKind,
        note: lNote || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setLineOpen(false);
      setLDue("");
      setLAmount("");
      setLNote("");
      router.refresh();
    });
  }

  function doFx() {
    setError(null);
    startTransition(async () => {
      const res = await setFxRateManual(txn.id, Number(fxRate), fxReason);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setFxOpen(false);
      router.refresh();
    });
  }

  function doCorrection() {
    setError(null);
    const changes: Record<string, string | number | null> = {};
    if (corrAmount) changes.amount = Number(corrAmount);
    if (corrClosedOn) changes.closed_on = corrClosedOn;
    startTransition(async () => {
      const res = await applyCorrection(txn.id, changes, corrRationale);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setCorrOpen(false);
      router.refresh();
    });
  }

  const statusMeta = TXN_STATUS_LABEL[txn.status];
  const scheduleTotal = txn.schedule.reduce((s, l) => s + l.amount, 0);
  const schedulePaid = txn.schedule.reduce((s, l) => s + l.paid_amount, 0);

  return (
    <div className="space-y-5">
      <BackLink href="/office/crm/transactions" label="Хэлцлийн жагсаалт" />

      {/* Толгой */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-ink">{txn.number}</h1>
            <Badge tone="blue">{TXN_TYPE_LABEL[txn.type]}</Badge>
            <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
            {txn.on_hold && (
              <Badge tone="rose">
                <ShieldAlert className="size-3" />
                МУТСТ hold
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted">
            {txn.contact_name} · {txn.property_number ? `${txn.property_number} — ` : ""}
            {txn.property_name ?? "?"} · Агент: {txn.owner_name ?? "—"}
            {txn.pipeline_code ? ` · ${txn.pipeline_code}` : ""}
          </p>
          <p className="text-sm text-ink">
            <span className="font-semibold">
              {txn.amount.toLocaleString()} {txn.currency}
            </span>
            {txn.currency !== "MNT" && (
              <span className="text-muted">
                {" "}
                (ханш {txn.fx_rate}
                {txn.fx_rate_source === "manual" ? " — гар" : ""} · {Math.round(txn.amount_mnt).toLocaleString()}₮)
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AmlAlertButton contactId={txn.contact_id} transactionId={txn.id} amountMnt={txn.amount_mnt} />
          {canFx && editable && txn.currency !== "MNT" && (
            <Button variant="outline" size="sm" onClick={() => setFxOpen(true)}>
              <Pencil className="size-4" />
              Ханш
            </Button>
          )}
          {txn.status === "draft" && (
            <Button size="sm" onClick={() => moveStatus("contract")} disabled={pending}>
              <ArrowRight className="size-4" />
              Гэрээ рүү
            </Button>
          )}
          {txn.status === "contract" && (
            <Button size="sm" onClick={() => moveStatus("payment")} disabled={pending}>
              <ArrowRight className="size-4" />
              Төлбөр рүү
            </Button>
          )}
          {txn.status === "payment" && isSdCeo && (
            <Button size="sm" onClick={() => moveStatus("closed")} disabled={pending}>
              <ArrowRight className="size-4" />
              Хаах (F-408)
            </Button>
          )}
          {editable && isSdCeo && (
            <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)} disabled={pending}>
              <Ban className="size-4" />
              Цуцлах
            </Button>
          )}
          {txn.status === "closed" && canCorrect && (
            <Button variant="outline" size="sm" onClick={() => setCorrOpen(true)}>
              <Wrench className="size-4" />
              Залруулга (F-417)
            </Button>
          )}
        </div>
      </div>

      {txn.on_hold && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <ShieldAlert className="mr-1.5 inline size-4" />
          МУТСТ түгжээ идэвхтэй: төлөв урагшлуулах, гэрээ бүртгэх, орлогын төлбөр, шимтгэлийн тооцоо,
          хүлээлцэх баталгаажуулалт хориглогдсон (§7.5). Суллах эрх зөвхөн МУТСТ ажилтанд.
        </div>
      )}
      {txn.zero_fee_note && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          {txn.zero_fee_note}
          {txn.original_number && ` (Анхны хэлцэл: ${txn.original_number})`}
        </div>
      )}
      {txn.status === "cancelled" && txn.cancellation_reason && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Цуцлагдсан: {txn.cancellation_reason}
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      <Card>
        <CardBody>
          <CompletenessBar pct={txn.file_completeness_pct} required={completeness.required} />
        </CardBody>
      </Card>

      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "parties", label: `Талууд (${txn.parties.length})` },
          { value: "roles", label: `Үүрэг (${txn.agent_roles.length})` },
          { value: "contracts", label: `Гэрээ (${txn.contracts.length})` },
          { value: "schedule", label: `Төлбөрийн хуваарь (${txn.schedule.length})` },
          { value: "handover", label: "Хүлээлцэх" },
          { value: "approvals", label: `Зөвшөөрөл (${txn.approvals.length})` },
          { value: "docs", label: `Баримт (${docs.length})` },
          ...(audit.length ? [{ value: "audit", label: "Аудит" }] : []),
        ]}
      />

      <TabPanel when="parties" value={tab}>
        <PartyEditor
          txnId={txn.id}
          txnType={txn.type}
          txnStatus={txn.status}
          parties={txn.parties}
          contactOptions={contactOptions}
          editable={editable}
        />
      </TabPanel>

      <TabPanel when="roles" value={tab}>
        <AgentRoleEditor txnId={txn.id} existing={txn.agent_roles} agents={agents} editable={editable} />
      </TabPanel>

      <TabPanel when="contracts" value={tab}>
        <div className="space-y-3">
          {txn.contracts.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">
              Гэрээний бүртгэл алга — «Төлбөр» төлөвт орохын өмнө гарын үсэгтэй хавсралт бүхий гэрээ заавал (F-403).
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {txn.contracts.map((ct) => (
                <li key={ct.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <FileSignature className="size-4 shrink-0 text-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">
                      {ct.contract_type} — {ct.number}
                    </p>
                    <p className="text-xs text-muted">
                      {ct.signed_on ? `Гарын үсэг: ${ct.signed_on}` : "Гарын үсэггүй"}
                      {ct.valid_from && ` · ${ct.valid_from} — ${ct.valid_to ?? "…"}`}
                    </p>
                  </div>
                  <Badge tone={ct.doc_id ? "green" : "amber"}>{ct.doc_id ? "Хавсралттай" : "Хавсралтгүй"}</Badge>
                </li>
              ))}
            </ul>
          )}
          {editable && (
            <Button variant="outline" size="sm" onClick={() => setContractOpen(true)} disabled={txn.on_hold}>
              Гэрээ бүртгэх
            </Button>
          )}
          {txn.on_hold && <p className="text-xs text-rose-600">Hold үед шинэ гэрээ бүртгэхийг хориглоно (§7.5).</p>}
        </div>
      </TabPanel>

      <TabPanel when="schedule" value={tab}>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">
              Нийт: <span className="font-semibold text-ink">{scheduleTotal.toLocaleString()}</span> · Төлөгдсөн:{" "}
              <span className="font-semibold text-emerald-600">{schedulePaid.toLocaleString()}</span> · Үлдэгдэл:{" "}
              <span className="font-semibold text-amber-600">{(scheduleTotal - schedulePaid).toLocaleString()}</span>
            </span>
            {editable && (
              <Button variant="outline" size="sm" onClick={() => setLineOpen(true)}>
                Мөр нэмэх
              </Button>
            )}
          </div>
          {txn.schedule.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Төлбөрийн хуваарь хоосон (F-405).</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-3 py-2 font-medium">Огноо</th>
                    <th className="px-3 py-2 font-medium">Төрөл</th>
                    <th className="px-3 py-2 font-medium">Дүн</th>
                    <th className="px-3 py-2 font-medium">Төлөгдсөн</th>
                    <th className="px-3 py-2 font-medium">Тайлбар</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {txn.schedule.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2 text-ink">{l.due_on}</td>
                      <td className="px-3 py-2 text-muted">{l.kind}</td>
                      <td className="px-3 py-2 text-ink">{l.amount.toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <span className={l.paid_amount >= l.amount ? "text-emerald-600" : "text-amber-600"}>
                          {l.paid_amount.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted">{l.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </TabPanel>

      <TabPanel when="handover" value={tab}>
        <HandoverChecklist txnId={txn.id} items={txn.handover} editable={editable} onHold={txn.on_hold} />
      </TabPanel>

      <TabPanel when="approvals" value={tab}>
        <ApprovalPanel txnId={txn.id} approvals={txn.approvals} roles={roles} />
      </TabPanel>

      <TabPanel when="docs" value={tab}>
        <EntityDocs entity="transaction" entityId={txn.id} docs={docs} roles={roles} canUpload={editable} />
      </TabPanel>

      <TabPanel when="audit" value={tab}>
        <AuditTrail rows={audit} />
      </TabPanel>

      {/* ── Модалууд ── */}
      <GateErrorDialog open={!!missing} missing={missing ?? []} onClose={() => setMissing(null)} />

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Хэлцэл цуцлах (F-415)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Болих
            </Button>
            <Button variant="danger" onClick={doCancel} disabled={pending}>
              {pending ? "Цуцалж байна…" : "Цуцлах"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Шалтгааны ангилал">
            <Select value={cancelCat} onChange={(e) => setCancelCat(e.target.value)}>
              {TXN_CANCEL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CANCEL_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Тайлбар" hint="«Бусад» сонговол заавал; цуцлалт шимтгэлийн буцаалт (F-462/463) өдөөнө.">
            <Input value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={contractOpen}
        onClose={() => setContractOpen(false)}
        title="Гэрээний бүртгэл (F-403)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setContractOpen(false)}>
              Болих
            </Button>
            <Button onClick={doAddContract} disabled={pending || !cType.trim() || !cNumber.trim()}>
              Бүртгэх
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Гэрээний төрөл">
            <Input value={cType} onChange={(e) => setCType(e.target.value)} placeholder="Худалдах-худалдан авах…" />
          </Field>
          <Field label="Дугаар">
            <Input value={cNumber} onChange={(e) => setCNumber(e.target.value)} />
          </Field>
          <Field label="Гарын үсэг зурсан огноо">
            <Input type="date" value={cSigned} onChange={(e) => setCSigned(e.target.value)} />
          </Field>
          <Field
            label="Гарын үсэгтэй хавсралтын баримтын ID"
            hint="«Баримт» табаас contract ангиллаар байршуулаад ID-г нь холбоно — «Төлбөр» шатанд заавал."
          >
            <Input value={cDocId} onChange={(e) => setCDocId(e.target.value)} placeholder="UUID" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={lineOpen}
        onClose={() => setLineOpen(false)}
        title="Төлбөрийн хуваарийн мөр (F-405)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setLineOpen(false)}>
              Болих
            </Button>
            <Button onClick={doAddLine} disabled={pending || !lDue || !(Number(lAmount) > 0)}>
              Нэмэх
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Огноо">
              <Input type="date" value={lDue} onChange={(e) => setLDue(e.target.value)} />
            </Field>
            <Field label="Дүн">
              <Input type="number" value={lAmount} onChange={(e) => setLAmount(e.target.value)} />
            </Field>
          </div>
          <Field label="Төрөл">
            <Select value={lKind} onChange={(e) => setLKind(e.target.value)}>
              <option value="advance">Урьдчилгаа</option>
              <option value="main">Үндсэн төлбөр</option>
              <option value="final">Эцсийн тооцоо</option>
              <option value="deposit">Барьцаа</option>
              <option value="other">Бусад</option>
            </Select>
          </Field>
          <Field label="Тайлбар">
            <Input value={lNote} onChange={(e) => setLNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={fxOpen}
        onClose={() => setFxOpen(false)}
        title="Ханшийн гар өөрчлөлт (F-419)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFxOpen(false)}>
              Болих
            </Button>
            <Button onClick={doFx} disabled={pending || !(Number(fxRate) > 0) || !fxReason.trim()}>
              Хадгалах
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label={`Ханш (1 ${txn.currency} = ? ₮)`}>
            <Input type="number" value={fxRate} onChange={(e) => setFxRate(e.target.value)} />
          </Field>
          <Field label="Шалтгаан" hint="Гар override бүр аудитад бүртгэгдэнэ.">
            <Input value={fxReason} onChange={(e) => setFxReason(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={corrOpen}
        onClose={() => setCorrOpen(false)}
        title="Хаагдсан хэлцлийн залруулга (F-417)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCorrOpen(false)}>
              Болих
            </Button>
            <Button
              onClick={doCorrection}
              disabled={pending || !corrRationale.trim() || (!corrAmount && !corrClosedOn)}
            >
              Залруулга хийх
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Хаагдсан хэлцэл immutable — өөрчлөлт зөвхөн энэ тусгай урсгалаар, бүрэн аудиттай.
          </p>
          <Field label="Шинэ дүн (хоосон бол өөрчлөхгүй)">
            <Input type="number" value={corrAmount} onChange={(e) => setCorrAmount(e.target.value)} />
          </Field>
          <Field label="Шинэ хаасан огноо (хоосон бол өөрчлөхгүй)">
            <Input type="date" value={corrClosedOn} onChange={(e) => setCorrClosedOn(e.target.value)} />
          </Field>
          <Field label="Үндэслэл">
            <Input value={corrRationale} onChange={(e) => setCorrRationale(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
