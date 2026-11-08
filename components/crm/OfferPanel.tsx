"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, FileText, HandCoins, Reply, ShieldCheck, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  recordOffer,
  decideOffer,
  requestOfferApproval,
  decideOfferApproval,
} from "@/lib/actions/crm-opportunities";
import { uploadDocument, getDocumentUrl } from "@/lib/actions/crm-docs";
import type { OfferRow } from "@/lib/queries-crm-pipeline";
import {
  ACCEPTANCE_CHANNELS,
  ACCEPTANCE_CHANNEL_LABEL,
  ACCEPTANCE_NOTE_MIN,
  APPROVAL_STATUS_LABEL,
  OFFER_SIDE_LABEL,
  OFFER_STATUS_LABEL,
  acceptanceEvidenceOk,
  canAcceptOffer,
  concessionPct,
  defaultOfferValidUntil,
  effectiveOfferStatus,
  needsConcessionApproval,
  relayDelayHours,
  type AcceptanceChannel,
  type DealFlowConfig,
} from "@/lib/crm/deal-flow";
import { fmtDate, fmtDateTime, fmtMNT } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CrmRole } from "@/lib/constants-crm";
import { toIsoDate } from "@/lib/crm/calendar";

/**
 * Үнийн санал ба хэлэлцээр (§6.16): нөхцөлийн талбар бүр, хүчинтэй хугацаа,
 * хүлээн авсан ба бүртгэсэн огноо (саатал ил), сүүлийн байр суурь, саад,
 * дараагийн алхам + огноо; хариу санал; харилцагчийн зөвшөөрлийг сувагтай,
 * нотолгоотой бүртгэх; материаллаг буултыг эрхийн дагуу батлуулах.
 */

/** Файлыг боломжийн хавтсанд байршуулж баримтын id буцаана. */
export async function uploadOpportunityEvidence(
  file: File,
  opportunityId: string,
  category: "contract" | "payment_proof" | "other" = "other"
): Promise<{ id?: string; error?: string }> {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("category", category);
  fd.set("entity", "opportunity");
  fd.set("entityId", opportunityId);
  return uploadDocument(fd);
}

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function today(): string {
  return toIsoDate(new Date());
}

type FormState = {
  direction: "offer" | "counter";
  side: "buyer" | "seller";
  parentOfferId: string | null;
  amount: string;
  receivedAt: string;
  paymentTerms: string;
  financing: string;
  handoverOn: string;
  inclusions: string;
  exclusions: string;
  validUntil: string;
  position: string;
  obstacle: string;
  nextStep: string;
  nextStepDate: string;
};

export function OfferPanel({
  opportunityId,
  listing,
  offers,
  askingPrice,
  cfg,
  roles,
  isOpen,
  id,
  openFormSignal,
}: {
  opportunityId: string;
  /** PL-2 листингийн карт: санал гаргагч нь ихэвчлэн худалдан авагч тал. */
  listing: boolean;
  offers: OfferRow[];
  askingPrice: number | null;
  cfg: DealFlowConfig;
  roles: CrmRole[];
  isOpen: boolean;
  id?: string;
  /** Эцэг компонентоос маягт нээх дохио (тоо өөрчлөгдөхөд нээгдэнэ). */
  openFormSignal?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const t = today();

  const blankForm = (parent?: OfferRow): FormState => ({
    direction: parent ? "counter" : "offer",
    side: parent ? (parent.side === "buyer" ? "seller" : "buyer") : "buyer",
    parentOfferId: parent?.id ?? null,
    amount: "",
    receivedAt: nowLocal(),
    paymentTerms: parent?.payment_terms ?? "",
    financing: parent?.financing ?? "",
    handoverOn: parent?.handover_on ?? "",
    inclusions: parent?.inclusions ?? "",
    exclusions: parent?.exclusions ?? "",
    validUntil: defaultOfferValidUntil(t, cfg),
    position: "",
    obstacle: "",
    nextStep: "",
    nextStepDate: t,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm());
  const fileRef = useRef<HTMLInputElement>(null);
  const [lastSignal, setLastSignal] = useState(openFormSignal ?? 0);
  if ((openFormSignal ?? 0) !== lastSignal) {
    setLastSignal(openFormSignal ?? 0);
    if (isOpen) {
      setForm(blankForm());
      setFormOpen(true);
    }
  }

  // Шийдвэр
  const [decideFor, setDecideFor] = useState<{ offer: OfferRow; action: "accept" | "reject" | "withdraw" } | null>(null);
  const [channel, setChannel] = useState<AcceptanceChannel | "">("");
  const [decisionNote, setDecisionNote] = useState("");
  const decisionFileRef = useRef<HTMLInputElement>(null);

  // Буулт
  const [approvalFor, setApprovalFor] = useState<OfferRow | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const isApprover = roles.some((r) => cfg.concessionApproverRoles.includes(r));

  const formPct = concessionPct(askingPrice, Number(form.amount) || 0);

  function patch(p: Partial<FormState>) {
    setForm((f) => ({ ...f, ...p }));
  }

  function openNew(parent?: OfferRow) {
    setError(null);
    setForm(blankForm(parent));
    setFormOpen(true);
  }

  function submitOffer() {
    setError(null);
    const amt = Number(form.amount);
    if (!(amt > 0)) return setError("Саналын дүнг зөв оруулна уу.");
    if (!form.paymentTerms.trim()) return setError("Төлбөрийн нөхцөлийг бичнэ үү.");
    if (!form.financing.trim()) return setError("Санхүүжилтийг бичнэ үү.");
    if (!form.validUntil || form.validUntil < t) return setError("Хүчинтэй хугацааг зөв сонгоно уу.");
    if (!form.position.trim()) return setError("Сүүлийн байр суурийг бичнэ үү.");
    if (form.nextStep.trim().length < 2 || !form.nextStepDate) return setError("Дараагийн алхам, огноог бичнэ үү.");
    startTransition(async () => {
      let docId: string | null = null;
      const file = fileRef.current?.files?.[0];
      if (file) {
        const up = await uploadOpportunityEvidence(file, opportunityId);
        if (up.error || !up.id) {
          setError(up.error ?? "Нотолгоо байршуулахад алдаа гарлаа.");
          return;
        }
        docId = up.id;
      }
      const res = await recordOffer({
        opportunityId,
        direction: form.direction,
        side: form.side,
        parentOfferId: form.parentOfferId,
        amount: amt,
        receivedAt: new Date(form.receivedAt).toISOString(),
        paymentTerms: form.paymentTerms.trim(),
        financing: form.financing.trim(),
        handoverOn: form.handoverOn || null,
        inclusions: form.inclusions.trim() || null,
        exclusions: form.exclusions.trim() || null,
        validUntil: form.validUntil,
        position: form.position.trim(),
        obstacle: form.obstacle.trim() || null,
        nextStep: form.nextStep.trim(),
        nextStepDate: form.nextStepDate,
        docId,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success(form.direction === "offer" ? "Үнийн санал бүртгэгдлээ" : "Сөрөг санал бүртгэгдлээ");
      setFormOpen(false);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  function submitDecision() {
    if (!decideFor) return;
    setError(null);
    const isAccept = decideFor.action === "accept";
    const file = decisionFileRef.current?.files?.[0];
    if (isAccept && !channel) return setError("Харилцагч ямар хэлбэрээр зөвшөөрснийг сонгоно уу.");
    if (isAccept && !acceptanceEvidenceOk(cfg, Boolean(file), decisionNote)) {
      return setError(`Зөвшөөрлийн нотолгоо: файл хавсаргах эсвэл дор хаяж ${ACCEPTANCE_NOTE_MIN} тэмдэгт тэмдэглэл бичнэ.`);
    }
    if (!isAccept && !decisionNote.trim()) return setError("Шийдвэрийн тайлбарыг бичнэ үү.");
    startTransition(async () => {
      let docId: string | null = null;
      if (file) {
        const up = await uploadOpportunityEvidence(file, opportunityId);
        if (up.error || !up.id) {
          setError(up.error ?? "Нотолгоо байршуулахад алдаа гарлаа.");
          return;
        }
        docId = up.id;
      }
      const res = await decideOffer({
        opportunityId,
        offerId: decideFor.offer.id,
        action: decideFor.action,
        channel: isAccept ? (channel as AcceptanceChannel) : null,
        note: decisionNote.trim() || null,
        docId,
      });
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success(isAccept ? "Харилцагчийн зөвшөөрөл бүртгэгдлээ" : "Шийдвэр бүртгэгдлээ");
      setDecideFor(null);
      setChannel("");
      setDecisionNote("");
      router.refresh();
    });
  }

  function submitApprovalRequest() {
    if (!approvalFor) return;
    setError(null);
    startTransition(async () => {
      const res = await requestOfferApproval(approvalFor.id, opportunityId, approvalNote);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success("Буултын зөвшөөрөл хүслээ");
      setApprovalFor(null);
      setApprovalNote("");
      router.refresh();
    });
  }

  function decideApproval(o: OfferRow, approve: boolean) {
    const note = approve ? "" : (window.prompt("Татгалзсан шалтгаан") ?? "");
    if (!approve && !note.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await decideOfferApproval(o.id, opportunityId, approve, note);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success(approve ? "Буулт батлагдлаа" : "Буултаас татгалзлаа");
      router.refresh();
    });
  }

  function openDoc(docId: string) {
    startTransition(async () => {
      const res = await getDocumentUrl(docId);
      if (res.url) window.open(res.url, "_blank", "noopener");
      else setError(res.error ?? "Баримт нээгдсэнгүй.");
    });
  }

  const ACCEPT_REASON: Record<string, string> = {
    not_open: "Сүүлийн нээлттэй саналыг л хүлээн зөвшөөрнө.",
    expired: "Хүчинтэй хугацаа дууссан.",
    approval_required: "Материаллаг буулт — эхлээд зөвшөөрөл хүснэ.",
    approval_pending: "Буултын зөвшөөрөл хүлээгдэж байна.",
    approval_rejected: "Буултаас татгалзсан — шинэ санал бүртгэнэ.",
  };

  return (
    <Card id={id}>
      <CardBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <HandCoins className="size-4 text-brand-600" /> Үнийн санал, хэлэлцээр ({offers.length})
          </h3>
          {isOpen ? (
            <Button size="sm" variant="outline" onClick={() => openNew()}>
              <HandCoins className="size-4" /> Санал бүртгэх
            </Button>
          ) : null}
        </div>

        {offers.length === 0 ? (
          <EmptyState
            compact
            icon={HandCoins}
            title="Үнийн санал бүртгэгдээгүй"
            description={
              listing
                ? "Худалдан авагч талаас ирсэн саналыг тэр даруй бүртгэж өмчлөгчид дамжуулна. Саналыг саатуулахгүй."
                : "Харилцагчийн саналыг тэр даруй бүртгэж, өмчлөгч талд дамжуулна. Саналыг саатуулахгүй."
            }
            action={isOpen ? { label: "Санал бүртгэх", onClick: () => openNew() } : undefined}
          />
        ) : (
          <ul className="space-y-2">
            {offers.map((o) => {
              const status = effectiveOfferStatus(o, t);
              const st = OFFER_STATUS_LABEL[status];
              const delay = relayDelayHours(o.received_at, o.relayed_at);
              const accept = canAcceptOffer(o, cfg, t);
              const needsApproval = needsConcessionApproval(o.concession_pct, cfg);
              const open = expanded === o.id;
              return (
                <li key={o.id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={o.direction === "offer" ? "blue" : "amber"}>
                      {o.direction === "offer" ? "Үнийн санал" : "Сөрөг санал"}
                    </Badge>
                    <span className="text-sm font-semibold text-ink">{fmtMNT(o.amount)}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {o.concession_pct != null && o.concession_pct > 0 ? (
                      <span className={cn("text-xs", needsApproval ? "font-medium text-rose-600" : "text-muted")}>
                        −{o.concession_pct}%
                      </span>
                    ) : null}
                    {needsApproval && o.approval_status !== "not_required" ? (
                      <Badge tone={APPROVAL_STATUS_LABEL[o.approval_status].tone}>
                        {APPROVAL_STATUS_LABEL[o.approval_status].label}
                      </Badge>
                    ) : null}
                    {!o.own ? <Badge tone="neutral">Ижил үл хөдлөхийн өөр карт</Badge> : null}
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : o.id)}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2"
                      aria-expanded={open}
                    >
                      Нөхцөл <ChevronDown className={cn("size-3.5 transition", open && "rotate-180")} />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {o.side ? OFFER_SIDE_LABEL[o.side] : ""}
                    {o.valid_until ? ` · ${fmtDate(o.valid_until)} хүртэл хүчинтэй` : ""}
                    {o.received_at ? ` · Хүлээн авсан ${fmtDateTime(o.received_at)}` : ""}
                    {delay != null && delay >= 1 ? (
                      <span className="text-amber-700"> · бүртгэхэд {delay} цаг саатсан</span>
                    ) : null}
                  </p>
                  {o.position || o.next_step ? (
                    <p className="mt-1 text-xs text-ink">
                      {o.position ? `Байр суурь: ${o.position}` : ""}
                      {o.obstacle ? ` · Саад: ${o.obstacle}` : ""}
                      {o.next_step ? ` · Дараагийн алхам: ${o.next_step}${o.next_step_date ? ` (${o.next_step_date})` : ""}` : ""}
                    </p>
                  ) : null}
                  {open ? (
                    <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg bg-surface-2 p-2 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-subtle">Төлбөрийн нөхцөл</dt>
                        <dd className="text-ink">{o.payment_terms ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-subtle">Санхүүжилт</dt>
                        <dd className="text-ink">{o.financing ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-subtle">Хүлээлцэх хугацаа</dt>
                        <dd className="text-ink">{o.handover_on ? fmtDate(o.handover_on) : "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-subtle">Асуусан үнэ</dt>
                        <dd className="text-ink">{o.asking_amount ? fmtMNT(o.asking_amount) : "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-subtle">Багтах зүйлс</dt>
                        <dd className="text-ink">{o.inclusions ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-subtle">Үл багтах зүйлс</dt>
                        <dd className="text-ink">{o.exclusions ?? "—"}</dd>
                      </div>
                      {o.accepted_at ? (
                        <div className="sm:col-span-2">
                          <dt className="text-subtle">Харилцагчийн зөвшөөрөл</dt>
                          <dd className="text-ink">
                            {fmtDateTime(o.accepted_at)} ·{" "}
                            {o.acceptance_channel
                              ? ACCEPTANCE_CHANNEL_LABEL[o.acceptance_channel as AcceptanceChannel]
                              : ""}
                            {o.acceptance_note ? ` · ${o.acceptance_note}` : ""}
                          </dd>
                        </div>
                      ) : null}
                      {o.decision_note ? (
                        <div className="sm:col-span-2">
                          <dt className="text-subtle">Шийдвэрийн тайлбар</dt>
                          <dd className="text-ink">{o.decision_note}</dd>
                        </div>
                      ) : null}
                      {o.approval_note ? (
                        <div className="sm:col-span-2">
                          <dt className="text-subtle">Буултын үндэслэл</dt>
                          <dd className="text-ink">{o.approval_note}</dd>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2 sm:col-span-2">
                        {o.doc_id ? (
                          <button type="button" className="inline-flex items-center gap-1 text-brand-700" onClick={() => openDoc(o.doc_id!)}>
                            <FileText className="size-3.5" /> Саналын нотолгоо
                          </button>
                        ) : null}
                        {o.acceptance_doc_id ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-brand-700"
                            onClick={() => openDoc(o.acceptance_doc_id!)}
                          >
                            <FileText className="size-3.5" /> Зөвшөөрлийн нотолгоо
                          </button>
                        ) : null}
                        <span className="text-subtle">Бүртгэсэн: {o.created_by_name ?? "—"}</span>
                      </div>
                    </dl>
                  ) : null}

                  {isOpen && (status === "open" || status === "countered") ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {status === "open" ? (
                        <Button
                          size="sm"
                          disabled={pending || !accept.ok}
                          title={accept.ok ? undefined : ACCEPT_REASON[accept.reason]}
                          onClick={() => {
                            setError(null);
                            setDecideFor({ offer: o, action: "accept" });
                          }}
                        >
                          <CheckCircle2 className="size-4" /> Харилцагч зөвшөөрсөн
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => openNew(o)}>
                        <Reply className="size-4" /> Хариу санал
                      </Button>
                      {needsApproval && o.status === "open" && (o.approval_status === "not_required" || o.approval_status === "rejected") ? (
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => setApprovalFor(o)}>
                          <ShieldCheck className="size-4" /> Буултын зөвшөөрөл хүсэх
                        </Button>
                      ) : null}
                      {isApprover && o.approval_status === "pending" ? (
                        <>
                          <Button size="sm" variant="secondary" disabled={pending} onClick={() => decideApproval(o, true)}>
                            Буулт батлах
                          </Button>
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => decideApproval(o, false)}>
                            Буултаас татгалзах
                          </Button>
                        </>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => {
                          setError(null);
                          setDecideFor({ offer: o, action: o.own ? "withdraw" : "reject" });
                        }}
                      >
                        <XCircle className="size-4" /> {o.own ? "Буцаах / татгалзах" : "Татгалзах"}
                      </Button>
                    </div>
                  ) : null}
                  {!accept.ok && status === "open" && accept.reason !== "not_open" ? (
                    <p className="mt-1 text-xs text-amber-700">{ACCEPT_REASON[accept.reason]}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {error && !formOpen && !decideFor && !approvalFor ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </CardBody>

      {/* Санал бүртгэх */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.direction === "offer" ? "Үнийн санал бүртгэх" : "Сөрөг санал бүртгэх"}
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Болих
            </Button>
            <Button disabled={pending} onClick={submitOffer}>
              {pending ? "Хадгалж байна…" : "Бүртгэх"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Төрөл" htmlFor="of-dir">
              <Select
                id="of-dir"
                value={form.direction}
                onChange={(e) => patch({ direction: e.target.value as "offer" | "counter" })}
              >
                <option value="offer">Үнийн санал</option>
                <option value="counter">Сөрөг санал</option>
              </Select>
            </Field>
            <Field label="Санал гаргасан тал" htmlFor="of-side">
              <Select id="of-side" value={form.side} onChange={(e) => patch({ side: e.target.value as "buyer" | "seller" })}>
                <option value="buyer">{OFFER_SIDE_LABEL.buyer}</option>
                <option value="seller">{OFFER_SIDE_LABEL.seller}</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Үнэ (₮)"
              htmlFor="of-amount"
              hint={
                formPct != null && formPct > 0
                  ? `Асуусан үнээс ${formPct}% бага${needsConcessionApproval(formPct, cfg) ? " — материаллаг буулт, зөвшөөрөл шаардлагатай" : ""}`
                  : askingPrice
                    ? `Асуусан үнэ: ${fmtMNT(askingPrice)}`
                    : undefined
              }
            >
              <Input
                id="of-amount"
                type="number"
                inputMode="numeric"
                min="0"
                value={form.amount}
                onChange={(e) => patch({ amount: e.target.value })}
              />
            </Field>
            <Field label="Хүлээн авсан огноо, цаг" htmlFor="of-received" hint="Саналыг хүлээн авсан бодит мөч">
              <Input
                id="of-received"
                type="datetime-local"
                value={form.receivedAt}
                onChange={(e) => patch({ receivedAt: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Төлбөрийн нөхцөл" htmlFor="of-pay">
            <Input
              id="of-pay"
              value={form.paymentTerms}
              onChange={(e) => patch({ paymentTerms: e.target.value })}
              placeholder="Урьдчилгаа, үлдэгдлийн хуваарь"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Санхүүжилт" htmlFor="of-fin">
              <Input
                id="of-fin"
                value={form.financing}
                onChange={(e) => patch({ financing: e.target.value })}
                placeholder="Бэлэн, зээл, холимог"
              />
            </Field>
            <Field label="Хүлээлцэх огноо" htmlFor="of-handover">
              <Input id="of-handover" type="date" value={form.handoverOn} onChange={(e) => patch({ handoverOn: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Багтах зүйлс" htmlFor="of-inc">
              <Input id="of-inc" value={form.inclusions} onChange={(e) => patch({ inclusions: e.target.value })} />
            </Field>
            <Field label="Үл багтах зүйлс" htmlFor="of-exc">
              <Input id="of-exc" value={form.exclusions} onChange={(e) => patch({ exclusions: e.target.value })} />
            </Field>
          </div>
          <Field label="Хүчинтэй хугацаа" htmlFor="of-valid">
            <Input id="of-valid" type="date" min={t} value={form.validUntil} onChange={(e) => patch({ validUntil: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Сүүлийн байр суурь" htmlFor="of-pos">
              <Input id="of-pos" value={form.position} onChange={(e) => patch({ position: e.target.value })} />
            </Field>
            <Field label="Саад" htmlFor="of-obs">
              <Input id="of-obs" value={form.obstacle} onChange={(e) => patch({ obstacle: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
            <Field label="Дараагийн алхам" htmlFor="of-next">
              <Input id="of-next" value={form.nextStep} onChange={(e) => patch({ nextStep: e.target.value })} />
            </Field>
            <Field label="Огноо" htmlFor="of-next-date">
              <Input
                id="of-next-date"
                type="date"
                min={t}
                value={form.nextStepDate}
                onChange={(e) => patch({ nextStepDate: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Бичгэн нотолгоо (заавал биш)" htmlFor="of-file" hint="Санал, гэрээний төсөл, мессежийн зураг">
            <input
              id="of-file"
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="block w-full text-sm text-ink file:mr-3 file:h-9 file:cursor-pointer file:rounded-xl file:border-0 file:bg-brand-50 file:px-3 file:text-sm file:font-semibold file:text-brand-700"
            />
          </Field>
          <p className="text-xs text-muted">Бүртгэсэн мөчийг систем хадгална, хүлээн авснаас хойшх саатал ил харагдана.</p>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </Modal>

      {/* Шийдвэр */}
      <Modal
        open={decideFor !== null}
        onClose={() => setDecideFor(null)}
        title={
          decideFor?.action === "accept"
            ? "Харилцагчийн зөвшөөрлийг бүртгэх"
            : decideFor?.action === "withdraw"
              ? "Саналыг буцаах"
              : "Саналаас татгалзах"
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDecideFor(null)}>
              Болих
            </Button>
            <Button
              variant={decideFor?.action === "accept" ? "primary" : "danger"}
              disabled={pending}
              onClick={submitDecision}
            >
              Хадгалах
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {decideFor ? (
            <p className="text-sm text-muted">
              {decideFor.offer.direction === "offer" ? "Үнийн санал" : "Сөрөг санал"}:{" "}
              <span className="font-semibold text-ink">{fmtMNT(decideFor.offer.amount)}</span>
            </p>
          ) : null}
          {decideFor?.action === "accept" ? (
            <>
              <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                Харилцагч өөрөө нөхцөлийг зөвшөөрснийг баталгаажуулна. Агент харилцагчийн өмнөөс зөвшөөрөхгүй.
              </p>
              <Field label="Зөвшөөрсөн хэлбэр" htmlFor="dec-channel">
                <Select id="dec-channel" value={channel} onChange={(e) => setChannel(e.target.value as AcceptanceChannel)}>
                  <option value="">— Сонгоно уу —</option>
                  {ACCEPTANCE_CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {ACCEPTANCE_CHANNEL_LABEL[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Нотолгоо (гарын үсэгтэй баримт, мессежийн зураг)" htmlFor="dec-file">
                <input
                  id="dec-file"
                  ref={decisionFileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  className="block w-full text-sm text-ink file:mr-3 file:h-9 file:cursor-pointer file:rounded-xl file:border-0 file:bg-brand-50 file:px-3 file:text-sm file:font-semibold file:text-brand-700"
                />
              </Field>
            </>
          ) : null}
          <Field
            label={decideFor?.action === "accept" ? "Тэмдэглэл" : "Шийдвэрийн тайлбар (заавал)"}
            htmlFor="dec-note"
            hint={
              decideFor?.action === "accept" && cfg.acceptanceEvidenceRequired
                ? `Файлгүй бол дор хаяж ${ACCEPTANCE_NOTE_MIN} тэмдэгт: хэзээ, хэнтэй, юуг зөвшөөрсөн`
                : undefined
            }
          >
            <Input id="dec-note" value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </Modal>

      {/* Буултын зөвшөөрөл */}
      <Modal
        open={approvalFor !== null}
        onClose={() => setApprovalFor(null)}
        title="Материаллаг буултын зөвшөөрөл хүсэх"
        footer={
          <>
            <Button variant="outline" onClick={() => setApprovalFor(null)}>
              Болих
            </Button>
            <Button disabled={pending || !approvalNote.trim()} onClick={submitApprovalRequest}>
              Хүсэлт илгээх
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {approvalFor ? (
            <p className="text-sm text-muted">
              {fmtMNT(approvalFor.amount)} — асуусан үнээс {approvalFor.concession_pct}% буулт (босго{" "}
              {cfg.materialConcessionPct}%).
            </p>
          ) : null}
          <Field label="Үндэслэл (өмчлөгч, харилцагчийн байр суурь)" htmlFor="appr-note">
            <Input id="appr-note" value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </Modal>
    </Card>
  );
}
