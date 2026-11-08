"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Ban, BadgeCheck, FileSignature, Pencil, ShieldAlert, Wallet, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { CompletenessBar } from "@/components/crm/CompletenessBar";
import { ClosingChecklist } from "@/components/crm/ClosingChecklist";
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
  reviewContract,
} from "@/lib/actions/crm-transactions";
import { recordDealPayment, recordDealFeePayment, sendInvoice } from "@/lib/actions/crm-invoices";
import { uploadDocument } from "@/lib/actions/crm-docs";
import type { TxnDetail, CompletenessDetail, AuditRow, ContactOption, TxnScheduleLine, TxnInvoice } from "@/lib/queries-crm-transactions";
import type { DocRow } from "@/lib/queries-crm-docs";
import type { AgentOption } from "@/lib/queries-crm-leads";
import {
  PAYMENT_METHOD_LABEL,
  closingProgress,
  hasAnyRole,
  scheduleRemaining,
  type ClosingCheck,
  type DealFlowConfig,
} from "@/lib/crm/deal-flow";
import { toIsoDate } from "@/lib/crm/calendar";
import {
  TXN_TYPE_LABEL,
  TXN_STATUS_LABEL,
  INVOICE_STATUS_LABEL,
  DOC_CATEGORY_LABEL,
  type CrmRole,
  type InvoiceStatus,
} from "@/lib/constants-crm";

/**
 * Хэлцлийн хавтас (§6.17): хаах босго, оролцогч, үүрэг, гэрээ (батлагдсан
 * загвар, хяналт), төлбөр (хуваарь, баримттай төлбөр, хөлсний нэхэмжлэх),
 * хүлээлцэх, зөвшөөрөл, баримт, аудит. Агент, оффисын панель хоёулаа
 * (basePath). Төлөвийн машин — DB guard эцсийн үнэн.
 */

// Цуцлалтын ангилал — серверийн TXN_CANCEL_CATEGORIES-тэй ижил кодууд.
const TXN_CANCEL_CATEGORIES = ["client_fault", "executor_fault", "force_majeure", "compliance", "other"] as const;

const CANCEL_LABEL: Record<string, string> = {
  client_fault: "Харилцагчийн буруу",
  executor_fault: "Хэрэгжүүлэгчийн буруу",
  force_majeure: "Давагдашгүй хүчин зүйл",
  compliance: "Нийцэл",
  other: "Бусад",
};

const SCHEDULE_KIND_LABEL: Record<string, string> = {
  advance: "Урьдчилгаа",
  main: "Үндсэн төлбөр",
  final: "Эцсийн тооцоо",
  deposit: "Барьцаа",
  other: "Бусад",
};

type Method = keyof typeof PAYMENT_METHOD_LABEL;

async function uploadTxnDoc(file: File, txnId: string, category: "contract" | "payment_proof") {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("category", category);
  fd.set("entity", "transaction");
  fd.set("entityId", txnId);
  return uploadDocument(fd);
}

export function TransactionDetailShell({
  txn,
  completeness,
  docs,
  audit,
  agents,
  contactOptions,
  roles,
  basePath,
  closingChecks,
  contractTemplates,
  dealFlow,
}: {
  txn: TxnDetail;
  completeness: CompletenessDetail;
  docs: DocRow[];
  audit: AuditRow[];
  agents: AgentOption[];
  contactOptions: ContactOption[];
  roles: CrmRole[];
  /** "/office/crm" эсвэл "/agent/crm". */
  basePath: string;
  closingChecks: ClosingCheck[];
  contractTemplates: { code: string; label: string }[];
  dealFlow: DealFlowConfig;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("parties");
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  const isOffice = basePath.startsWith("/office");
  const dealHref = `${basePath}/${isOffice ? "deals" : "pipeline"}/${txn.opportunity_id}`;
  const isSdCeo = roles.some((r) => r === "sales_director" || r === "ceo");
  const isFinance = roles.some((r) => r === "finance" || r === "property_manager");
  const canReview = hasAnyRole(roles, dealFlow.contractReviewerRoles);
  const canCorrect = roles.some((r) => ["sales_director", "ops_qc", "ceo"].includes(r));
  const canFx = roles.some((r) => ["finance", "sales_director", "ops_qc", "ceo"].includes(r));
  const editable = txn.status !== "closed" && txn.status !== "cancelled";
  const blockingChecks = closingChecks.filter((c) => !c.ok && c.code !== "post_sale");
  const progress = closingProgress(closingChecks);

  // Цуцлалт
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelCat, setCancelCat] = useState<string>("client_fault");
  const [cancelNote, setCancelNote] = useState("");

  // Гэрээ
  const [contractOpen, setContractOpen] = useState(false);
  const [cTemplate, setCTemplate] = useState("");
  const [cType, setCType] = useState("");
  const [cNumber, setCNumber] = useState("");
  const [cSigned, setCSigned] = useState("");
  const [cDocId, setCDocId] = useState("");
  const contractDocs = docs.filter((d) => d.category === "contract");

  // Хуваарь
  const [lineOpen, setLineOpen] = useState(false);
  const [lDue, setLDue] = useState("");
  const [lAmount, setLAmount] = useState("");
  const [lKind, setLKind] = useState("advance");
  const [lNote, setLNote] = useState("");

  // Төлбөр бүртгэх
  const [payLine, setPayLine] = useState<TxnScheduleLine | null>(null);
  const [payInvoice, setPayInvoice] = useState<TxnInvoice | null>(null);
  const [payDate, setPayDate] = useState(toIsoDate(new Date()));
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<Method>("bank");
  const payFileRef = useRef<HTMLInputElement>(null);

  // Ханш, залруулга
  const [fxOpen, setFxOpen] = useState(false);
  const [fxRate, setFxRate] = useState(String(txn.fx_rate));
  const [fxReason, setFxReason] = useState("");
  const [corrOpen, setCorrOpen] = useState(false);
  const [corrAmount, setCorrAmount] = useState("");
  const [corrClosedOn, setCorrClosedOn] = useState("");
  const [corrRationale, setCorrRationale] = useState("");

  function run(fn: () => Promise<{ ok?: boolean; error?: string; missing?: string[] }>, okMsg?: string, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error || res.ok === false) {
        if (res.missing?.length) setMissing(res.missing);
        else setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      if (okMsg) toast.success(okMsg);
      after?.();
      router.refresh();
    });
  }

  function jump(target: string) {
    if (target === "opportunity") {
      router.push(dealHref);
      return;
    }
    if (target !== "overview") setTab(target);
  }

  function doAddContract() {
    if (!cTemplate) return setError("Гэрээний батлагдсан загварыг сонгоно уу.");
    run(
      () =>
        addContract({
          transactionId: txn.id,
          templateCode: cTemplate,
          contractType: cType.trim() || (contractTemplates.find((t) => t.code === cTemplate)?.label ?? ""),
          number: cNumber,
          signedOn: cSigned || null,
          docId: cDocId || null,
        }),
      "Гэрээ бүртгэгдлээ",
      () => {
        setContractOpen(false);
        setCTemplate("");
        setCType("");
        setCNumber("");
        setCSigned("");
        setCDocId("");
      }
    );
  }

  function doRecordPayment() {
    const file = payFileRef.current?.files?.[0];
    const amt = Number(payAmount);
    if (!(amt > 0)) return setError("Төлбөрийн дүнг оруулна уу.");
    if (!file) return setError("Төлбөрийн баримтыг (зураг, PDF) хавсаргана уу.");
    setError(null);
    startTransition(async () => {
      const up = await uploadTxnDoc(file, txn.id, "payment_proof");
      if (up.error || !up.id) {
        setError(up.error ?? "Баримт байршуулахад алдаа гарлаа.");
        return;
      }
      const res = payInvoice
        ? await recordDealFeePayment({ invoiceId: payInvoice.id, paidOn: payDate, amount: amt, method: payMethod, docId: up.id })
        : await recordDealPayment({
            transactionId: txn.id,
            scheduleLineId: payLine!.id,
            paidOn: payDate,
            amount: amt,
            method: payMethod,
            docId: up.id,
          });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Төлбөр бүртгэгдлээ", { description: "Санхүү баталгаажуулсны дараа хаалтад тооцогдоно." });
      setPayLine(null);
      setPayInvoice(null);
      setPayAmount("");
      if (payFileRef.current) payFileRef.current.value = "";
      router.refresh();
    });
  }

  const statusMeta = TXN_STATUS_LABEL[txn.status];
  const scheduleTotal = txn.schedule.reduce((s, l) => s + l.amount, 0);
  const schedulePaid = txn.schedule.reduce((s, l) => s + Math.min(l.paid_amount, l.amount), 0);
  const templateLabel = (code: string | null) => contractTemplates.find((t) => t.code === code)?.label ?? null;

  return (
    <div className="space-y-5">
      <BackLink href={`${basePath}/transactions`} label="Хэлцлийн жагсаалт" />

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
                МУТСТ түгжээ
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted">
            <Link href={dealHref} className="font-medium text-brand-700 hover:underline">
              {txn.contact_name}
            </Link>{" "}
            · {txn.property_number ? `${txn.property_number} — ` : ""}
            {txn.property_name ?? "?"} · Агент: {txn.owner_name ?? "—"}
          </p>
          <p className="text-sm text-ink">
            <span className="font-semibold">
              {txn.amount.toLocaleString("mn-MN")} {txn.currency}
            </span>
            {txn.currency !== "MNT" && (
              <span className="text-muted">
                {" "}
                (ханш {txn.fx_rate}
                {txn.fx_rate_source === "manual" ? " — гараар" : ""} · {Math.round(txn.amount_mnt).toLocaleString("mn-MN")}₮)
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
            <Button size="sm" onClick={() => run(() => setTxnStatus(txn.id, "contract"), "Хэлцэл гэрээний шатанд орлоо")} disabled={pending}>
              <ArrowRight className="size-4" />
              Гэрээ рүү
            </Button>
          )}
          {txn.status === "contract" && (
            <Button size="sm" onClick={() => run(() => setTxnStatus(txn.id, "payment"), "Хэлцэл төлбөрийн шатанд орлоо")} disabled={pending}>
              <ArrowRight className="size-4" />
              Төлбөр рүү
            </Button>
          )}
          {txn.status === "payment" && isSdCeo && (
            <Button
              size="sm"
              onClick={() => run(() => setTxnStatus(txn.id, "closed"), "Хэлцэл амжилттай хаагдлаа")}
              disabled={pending || blockingChecks.length > 0}
              title={blockingChecks.length ? `Дутуу: ${blockingChecks.map((c) => c.label).join(", ")}` : undefined}
            >
              <BadgeCheck className="size-4" />
              Хаалт баталгаажуулах
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
              Залруулга
            </Button>
          )}
        </div>
      </div>

      {txn.on_hold && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <ShieldAlert className="mr-1.5 inline size-4" />
          МУТСТ түгжээ идэвхтэй: төлөв урагшлуулах, гэрээ бүртгэх, орлогын төлбөр, шимтгэлийн тооцоо, хүлээлцэх
          баталгаажуулалт хориглогдсон. Суллах эрх зөвхөн МУТСТ ажилтанд.
        </div>
      )}
      {txn.zero_fee_note && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          {txn.zero_fee_note}
          {txn.original_number && ` (Анхны хэлцэл: ${txn.original_number})`}
        </div>
      )}
      {txn.status === "cancelled" && txn.cancellation_reason && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Цуцлагдсан: {txn.cancellation_reason}</div>
      )}
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}

      {txn.status !== "cancelled" ? <ClosingChecklist checks={closingChecks} onJump={jump} /> : null}
      {txn.status === "payment" && !isSdCeo && progress.total > 0 ? (
        <p className="text-xs text-muted">
          {blockingChecks.length
            ? "Босго бүрийг хангасны дараа Борлуулалт хариуцсан захирал хаалтыг баталгаажуулна."
            : "Бүх босго хангагдсан — Борлуулалт хариуцсан захирлын баталгаажуулалтыг хүлээж байна."}
        </p>
      ) : null}

      <Card>
        <CardBody>
          <CompletenessBar pct={txn.file_completeness_pct} required={completeness.required} />
        </CardBody>
      </Card>

      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "parties", label: `Оролцогч (${txn.parties.length})` },
          { value: "roles", label: `Үүрэг (${txn.agent_roles.length})` },
          { value: "contracts", label: `Гэрээ (${txn.contracts.length})` },
          { value: "payments", label: `Төлбөр (${txn.payments.length})` },
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
            <EmptyState
              compact
              icon={FileSignature}
              title="Гэрээ бүртгэгдээгүй"
              description="Батлагдсан загвараар байгуулсан, гарын үсэгтэй гэрээг «Баримт» табд байршуулаад энд бүртгэнэ. «Төлбөр» төлөвт орохын өмнө заавал."
            />
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {txn.contracts.map((ct) => (
                <li key={ct.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                  <FileSignature className="size-4 shrink-0 text-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">
                      {ct.contract_type} — {ct.number}
                    </p>
                    <p className="text-xs text-muted">
                      {templateLabel(ct.template_code) ?? "Загвар сонгоогүй"}
                      {ct.signed_on ? ` · Гарын үсэг: ${ct.signed_on}` : " · Гарын үсэггүй"}
                      {ct.reviewed_at ? ` · Хянасан: ${ct.reviewer_name ?? ""} ${ct.reviewed_at.slice(0, 10)}` : ""}
                    </p>
                  </div>
                  <Badge tone={ct.doc_id ? "green" : "amber"}>{ct.doc_id ? "Хавсралттай" : "Хавсралтгүй"}</Badge>
                  <Badge tone={ct.reviewed_at ? "green" : "amber"}>{ct.reviewed_at ? "Хянагдсан" : "Хяналт хүлээгдэж буй"}</Badge>
                  {!ct.reviewed_at && canReview && editable ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending || !ct.doc_id || !ct.template_code}
                      onClick={() => run(() => reviewContract(ct.id, txn.id), "Гэрээ хянагдлаа")}
                    >
                      Хянаж батлах
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {editable && (
            <Button variant="outline" size="sm" onClick={() => setContractOpen(true)} disabled={txn.on_hold}>
              Гэрээ бүртгэх
            </Button>
          )}
          {txn.on_hold && <p className="text-xs text-rose-600">МУТСТ түгжээтэй үед шинэ гэрээ бүртгэхгүй.</p>}
        </div>
      </TabPanel>

      <TabPanel when="payments" value={tab}>
        <div className="space-y-5">
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <h3 className="font-semibold text-ink">Төлбөрийн хуваарь</h3>
              <span className="text-muted">
                Нийт <span className="font-semibold text-ink">{scheduleTotal.toLocaleString("mn-MN")}</span> · Төлөгдсөн{" "}
                <span className="font-semibold text-emerald-600">{schedulePaid.toLocaleString("mn-MN")}</span> · Үлдэгдэл{" "}
                <span className="font-semibold text-amber-600">{(scheduleTotal - schedulePaid).toLocaleString("mn-MN")}</span>
              </span>
              {editable && (
                <Button variant="outline" size="sm" onClick={() => setLineOpen(true)}>
                  Мөр нэмэх
                </Button>
              )}
            </div>
            {txn.schedule.length === 0 ? (
              <EmptyState compact icon={Wallet} title="Төлбөрийн хуваарь хоосон" description="Хэлцлийн төлбөрийн үе шатыг огноо, дүнтэй нь бүртгэнэ." />
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {txn.schedule.map((l) => {
                  const remaining = scheduleRemaining(l);
                  return (
                    <li key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">
                          {SCHEDULE_KIND_LABEL[l.kind] ?? l.kind} · {l.amount.toLocaleString("mn-MN")}
                        </p>
                        <p className="text-xs text-muted">
                          {l.due_on}
                          {l.note ? ` · ${l.note}` : ""}
                        </p>
                      </div>
                      <span className={remaining > 0 ? "text-amber-600" : "text-emerald-600"}>
                        {remaining > 0 ? `Үлдэгдэл ${remaining.toLocaleString("mn-MN")}` : "Төлөгдсөн"}
                      </span>
                      {editable && remaining > 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={txn.on_hold}
                          onClick={() => {
                            setPayInvoice(null);
                            setPayLine(l);
                            setPayAmount(String(remaining));
                          }}
                        >
                          Төлбөр бүртгэх
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">Бүртгэсэн төлбөр</h3>
            {txn.payments.length === 0 ? (
              <p className="text-sm text-muted">Төлбөр бүртгэгдээгүй.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {txn.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">
                        {p.amount.toLocaleString("mn-MN")} {p.currency}
                      </p>
                      <p className="text-xs text-muted">
                        {p.paid_on} · {PAYMENT_METHOD_LABEL[p.method as Method] ?? p.method} ·{" "}
                        {p.kind === "income" ? "Хөлсний орлого" : "Хэлцлийн төлбөр"}
                      </p>
                    </div>
                    {!p.doc_id ? <Badge tone="rose">Баримтгүй</Badge> : null}
                    <Badge tone={p.finance_verified_at ? "green" : "amber"}>
                      {p.finance_verified_at ? "Санхүү баталгаажуулсан" : "Баталгаажуулалт хүлээгдэж буй"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            {isFinance && isOffice ? (
              <Link href="/office/crm/finance" className="text-xs font-medium text-brand-700 hover:underline">
                Санхүүгийн баталгаажуулалтын жагсаалт →
              </Link>
            ) : null}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">Үйлчилгээний хөлсний нэхэмжлэх</h3>
            {txn.invoices.length === 0 ? (
              <p className="text-sm text-muted">
                {txn.type === "replacement"
                  ? "Дахин түрээслүүлэлтэд хөлс авахгүй."
                  : "Нэхэмжлэх үүсээгүй — Санхүү хэлцлээс хөлсний нэхэмжлэх үүсгэнэ."}
              </p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {txn.invoices.map((inv) => {
                  const st = INVOICE_STATUS_LABEL[inv.status as InvoiceStatus];
                  return (
                    <li key={inv.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">
                          {inv.number} · {Number(inv.amount).toLocaleString("mn-MN")}₮
                        </p>
                        <p className="text-xs text-muted">Төлөх: {inv.due_on}</p>
                      </div>
                      {st ? <Badge tone={st.tone}>{st.label}</Badge> : null}
                      {isFinance && editable && inv.status === "planned" ? (
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => sendInvoice(inv.id), "Нэхэмжлэх илгээгдлээ")}>
                          Илгээх
                        </Button>
                      ) : null}
                      {isFinance && editable && (inv.status === "sent" || inv.status === "partially_paid") ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => {
                            setPayLine(null);
                            setPayInvoice(inv);
                            setPayAmount(String(inv.amount));
                          }}
                        >
                          Төлбөр бүртгэх
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
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
      <GateErrorDialog open={!!missing} missing={missing ?? []} stageName="Хаалт" onClose={() => setMissing(null)} />

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Хэлцэл цуцлах"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Болих
            </Button>
            <Button
              variant="danger"
              onClick={() => run(() => cancelTransaction(txn.id, cancelCat, cancelNote), "Хэлцэл цуцлагдлаа", () => setCancelOpen(false))}
              disabled={pending}
            >
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
          <Field label="Тайлбар" hint="«Бусад» сонговол заавал. Цуцлалт урамшууллын буцаалтыг эхлүүлнэ.">
            <Input value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={contractOpen}
        onClose={() => setContractOpen(false)}
        title="Гэрээ бүртгэх"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setContractOpen(false)}>
              Болих
            </Button>
            <Button onClick={doAddContract} disabled={pending || !cTemplate || !cNumber.trim()}>
              Бүртгэх
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Батлагдсан загвар">
            <Select value={cTemplate} onChange={(e) => setCTemplate(e.target.value)}>
              <option value="">— Сонгоно уу —</option>
              {contractTemplates.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Гэрээний нэр" hint="Хоосон бол загварын нэрээр">
            <Input value={cType} onChange={(e) => setCType(e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Дугаар">
              <Input value={cNumber} onChange={(e) => setCNumber(e.target.value)} />
            </Field>
            <Field label="Гарын үсэг зурсан огноо">
              <Input type="date" value={cSigned} onChange={(e) => setCSigned(e.target.value)} />
            </Field>
          </div>
          <Field
            label="Гарын үсэгтэй хавсралт"
            hint={
              contractDocs.length
                ? "«Баримт» табд «Гэрээ» ангиллаар байршуулсан файлаас сонгоно."
                : "Эхлээд «Баримт» табд гэрээг «Гэрээ» ангиллаар байршуулна уу."
            }
          >
            <Select value={cDocId} onChange={(e) => setCDocId(e.target.value)} disabled={!contractDocs.length}>
              <option value="">— Хавсралтгүй —</option>
              {contractDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} · {DOC_CATEGORY_LABEL[d.category]}
                </option>
              ))}
            </Select>
          </Field>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </Modal>

      <Modal
        open={lineOpen}
        onClose={() => setLineOpen(false)}
        title="Төлбөрийн хуваарийн мөр"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setLineOpen(false)}>
              Болих
            </Button>
            <Button
              onClick={() =>
                run(
                  async () => {
                    const r = await addScheduleLine({
                      transactionId: txn.id,
                      dueOn: lDue,
                      amount: Number(lAmount),
                      kind: lKind,
                      note: lNote || null,
                    });
                    return { ok: !r.error, error: r.error };
                  },
                  "Хуваарийн мөр нэмэгдлээ",
                  () => {
                    setLineOpen(false);
                    setLDue("");
                    setLAmount("");
                    setLNote("");
                  }
                )
              }
              disabled={pending || !lDue || !(Number(lAmount) > 0)}
            >
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
              <Input type="number" inputMode="numeric" value={lAmount} onChange={(e) => setLAmount(e.target.value)} />
            </Field>
          </div>
          <Field label="Төрөл">
            <Select value={lKind} onChange={(e) => setLKind(e.target.value)}>
              {Object.entries(SCHEDULE_KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Тайлбар">
            <Input value={lNote} onChange={(e) => setLNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={payLine !== null || payInvoice !== null}
        onClose={() => {
          setPayLine(null);
          setPayInvoice(null);
        }}
        title={payInvoice ? `Хөлсний төлбөр — ${payInvoice.number}` : "Төлбөр бүртгэх"}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setPayLine(null);
                setPayInvoice(null);
              }}
            >
              Болих
            </Button>
            <Button onClick={doRecordPayment} disabled={pending}>
              {pending ? "Хадгалж байна…" : "Бүртгэх"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {payLine ? (
            <p className="text-sm text-muted">
              {SCHEDULE_KIND_LABEL[payLine.kind] ?? payLine.kind} · {payLine.due_on} · үлдэгдэл{" "}
              {scheduleRemaining(payLine).toLocaleString("mn-MN")}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Төлсөн огноо">
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </Field>
            <Field label="Дүн">
              <Input type="number" inputMode="numeric" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </Field>
          </div>
          <Field label="Хэлбэр">
            <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as Method)}>
              {(Object.keys(PAYMENT_METHOD_LABEL) as Method[]).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Төлбөрийн баримт (заавал)" hint="Банкны хуулга, баримтын зураг — утсан дээр камераар авч болно">
            <input
              ref={payFileRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="block w-full text-sm text-ink file:mr-3 file:h-9 file:cursor-pointer file:rounded-xl file:border-0 file:bg-brand-50 file:px-3 file:text-sm file:font-semibold file:text-brand-700"
            />
          </Field>
          <p className="text-xs text-muted">Бэлэн, гадаад валют, виртуал хөрөнгийн их дүнтэй төлбөр МУТСТ-ийн хяналтад автоматаар орно.</p>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </Modal>

      <Modal
        open={fxOpen}
        onClose={() => setFxOpen(false)}
        title="Ханшийг гараар өөрчлөх"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFxOpen(false)}>
              Болих
            </Button>
            <Button
              onClick={() => run(() => setFxRateManual(txn.id, Number(fxRate), fxReason), "Ханш шинэчлэгдлээ", () => setFxOpen(false))}
              disabled={pending || !(Number(fxRate) > 0) || !fxReason.trim()}
            >
              Хадгалах
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label={`Ханш (1 ${txn.currency} = ? ₮)`}>
            <Input type="number" value={fxRate} onChange={(e) => setFxRate(e.target.value)} />
          </Field>
          <Field label="Шалтгаан" hint="Гараар өөрчилсөн бүр аудитад бүртгэгдэнэ.">
            <Input value={fxReason} onChange={(e) => setFxReason(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={corrOpen}
        onClose={() => setCorrOpen(false)}
        title="Хаагдсан хэлцлийн залруулга"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCorrOpen(false)}>
              Болих
            </Button>
            <Button
              onClick={() => {
                const changes: Record<string, string | number | null> = {};
                if (corrAmount) changes.amount = Number(corrAmount);
                if (corrClosedOn) changes.closed_on = corrClosedOn;
                run(() => applyCorrection(txn.id, changes, corrRationale), "Залруулга хийгдлээ", () => setCorrOpen(false));
              }}
              disabled={pending || !corrRationale.trim() || (!corrAmount && !corrClosedOn)}
            >
              Залруулга хийх
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">Хаагдсан хэлцэл өөрчлөгдөхгүй — зөвхөн энэ тусгай урсгалаар, бүрэн аудиттай.</p>
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
