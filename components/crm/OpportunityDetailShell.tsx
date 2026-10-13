"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  ArrowRight,
  Building2,
  ChevronRight,
  Flame,
  HandCoins,
  History,
  Pencil,
  ShieldAlert,
  User,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { GateChecklist } from "@/components/crm/GateChecklist";
import { GateErrorDialog } from "@/components/crm/GateErrorDialog";
import { ActivityComposer } from "@/components/crm/ActivityComposer";
import { ActivityTimeline } from "@/components/crm/ActivityTimeline";
import {
  moveStage,
  closeLost,
  transferPipeline,
  updateOpportunity,
  reassignOpportunity,
  recordOffer,
} from "@/lib/actions/crm-opportunities";
import { fmtMNT, fmtDate, fmtDateTime, daysSince } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  OPP_STATE_LABEL,
  KYC_STATUS_LABEL,
  PL_CODES,
  PL_LABEL,
  type CrmRole,
  type GateCode,
} from "@/lib/constants-crm";
import type {
  OpportunityDetail,
  TransitionOption,
  ActivityRow,
} from "@/lib/queries-crm-pipeline";

/**
 * Боломжийн карт (F-350–362): шатны stepper + GateChecklist, шилжилтийн
 * товчнууд (DB guard «ижил босго»), санал/хэлэлцээр (P-02 §2.4, Д-06),
 * үйл ажиллагааны гурвалсан холбоост түүх (F-309), шатны түүх (F-357),
 * урсгал шилжүүлэлт (F-361), эзэмшигч шилжүүлэлт (зарчим 6).
 */

type LookupLite = { id: string; label: string; requires_note: boolean };

const REASSIGN_REASONS: { code: string; label: string }[] = [
  { code: "client_request", label: "Харилцагчийн хүсэлт" },
  { code: "sla_breach", label: "SLA зөрчил" },
  { code: "inactivity", label: "Идэвхгүй байдал" },
  { code: "zoning", label: "Бүсчлэл" },
  { code: "offboarding", label: "Ажилтан гарч байгаа" },
];

export function OpportunityDetailShell({
  opp,
  activities,
  gateLabels,
  lostReasons,
  objections,
  agents,
  roles,
  currentProfileId,
  basePath,
}: {
  opp: OpportunityDetail;
  activities: ActivityRow[];
  /** Гейт код → идэвхтэй шаардлагуудын монгол нэрс (crm_gate_requirements-ээс). */
  gateLabels: Partial<Record<GateCode, string[]>>;
  lostReasons: LookupLite[];
  objections: LookupLite[];
  agents: { profileId: string; name: string }[];
  roles: CrmRole[];
  currentProfileId: string;
  basePath: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [gateError, setGateError] = useState<{ missing: string[]; stageName: string } | null>(null);
  const [reasonFor, setReasonFor] = useState<TransitionOption | null>(null);
  const [reason, setReason] = useState("");
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReasonId, setLostReasonId] = useState("");
  const [lostNote, setLostNote] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [amount, setAmount] = useState(opp.amount != null ? String(opp.amount) : "");
  const [expectedCloseOn, setExpectedCloseOn] = useState(opp.expected_close_on ?? "");
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerDirection, setOfferDirection] = useState<"offer" | "counter">("offer");
  const [offerAmount, setOfferAmount] = useState("");
  const [offerTerms, setOfferTerms] = useState("");
  const [offerValidUntil, setOfferValidUntil] = useState("");
  const [offerPosition, setOfferPosition] = useState("");
  const [offerObstacle, setOfferObstacle] = useState("");
  const [offerNextStep, setOfferNextStep] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferCode, setTransferCode] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [newOwner, setNewOwner] = useState("");
  const [reassignReason, setReassignReason] = useState("client_request");
  const [reassignNote, setReassignNote] = useState("");

  const isOpen = opp.state === "open";
  const canManage = roles.some((r) => ["team_lead", "sales_director", "ops_qc", "sysadmin"].includes(r));
  const stateBadge = OPP_STATE_LABEL[opp.state];
  const kycBadge = KYC_STATUS_LABEL[opp.contact.kyc_public_status];
  const currentStage = opp.stages.find((s) => s.id === opp.stage_id);
  const linearStages = opp.stages.filter((s) => s.terminal_state !== "lost");
  const currentIdx = linearStages.findIndex((s) => s.id === opp.stage_id);
  const selectedLostReason = lostReasons.find((r) => r.id === lostReasonId);

  // Дараагийн урагш шилжилт — гейт checklist-ийг түүн дээр үзүүлнэ.
  const nextForward = opp.transitions.find((t) => t.kind === "forward");
  const gatedPreview = nextForward?.gate_code
    ? {
        gateCode: nextForward.gate_code,
        items: (gateLabels[nextForward.gate_code] ?? []).map((label) => ({
          label,
          ok: !nextForward.gate_missing.includes(label),
        })),
        stageName: nextForward.to_stage_name,
      }
    : null;

  function doMove(tr: TransitionOption, moveReason?: string) {
    setError(null);
    startTransition(async () => {
      const res = await moveStage(opp.id, tr.to_stage_id, moveReason);
      if (!res.ok) {
        if (res.missing?.length) setGateError({ missing: res.missing, stageName: tr.to_stage_name });
        else setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setReasonFor(null);
      setReason("");
      router.refresh();
    });
  }

  function initiate(tr: TransitionOption) {
    if (tr.terminal_state === "lost") {
      setLostOpen(true);
      return;
    }
    if (tr.requires_reason || tr.kind === "backward") {
      setReasonFor(tr);
      return;
    }
    doMove(tr);
  }

  function submitLost() {
    setError(null);
    startTransition(async () => {
      const res = await closeLost(opp.id, lostReasonId, lostNote.trim() || undefined);
      if (!res.ok) {
        if (res.missing?.length) setGateError({ missing: res.missing, stageName: "Алдсан" });
        else setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setLostOpen(false);
      router.refresh();
    });
  }

  function submitEdit() {
    setError(null);
    const amt = amount.trim() === "" ? null : Number(amount);
    if (amt != null && (Number.isNaN(amt) || amt < 0)) {
      setError("Дүн буруу байна.");
      return;
    }
    startTransition(async () => {
      const res = await updateOpportunity({
        id: opp.id,
        amount: amt,
        expectedCloseOn: expectedCloseOn || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setEditOpen(false);
      router.refresh();
    });
  }

  function submitOffer() {
    setError(null);
    const amt = Number(offerAmount);
    if (!offerAmount.trim() || Number.isNaN(amt) || amt <= 0) {
      setError("Саналын дүнг зөв оруулна уу.");
      return;
    }
    startTransition(async () => {
      const res = await recordOffer({
        opportunityId: opp.id,
        direction: offerDirection,
        amount: amt,
        terms: offerTerms.trim() || null,
        validUntil: offerValidUntil || null,
        position: offerPosition.trim() || null,
        obstacle: offerObstacle.trim() || null,
        nextStep: offerNextStep.trim() || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOfferOpen(false);
      setOfferAmount("");
      setOfferTerms("");
      setOfferValidUntil("");
      setOfferPosition("");
      setOfferObstacle("");
      setOfferNextStep("");
      router.refresh();
    });
  }

  function submitTransfer() {
    setError(null);
    startTransition(async () => {
      const res = await transferPipeline(opp.id, transferCode, transferReason.trim());
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setTransferOpen(false);
      router.refresh();
    });
  }

  function submitReassign() {
    setError(null);
    startTransition(async () => {
      const res = await reassignOpportunity(opp.id, newOwner, reassignReason, reassignNote.trim() || undefined);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setReassignOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Толгой */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`${basePath}/contacts/${opp.contact.id}`}
                  className="text-xl font-bold text-ink hover:text-brand-700"
                >
                  {opp.contact.display_name}
                </Link>
                <span className="font-mono text-xs text-subtle">{opp.contact.number}</span>
                <Badge tone={stateBadge.tone}>{stateBadge.label}</Badge>
                <Badge tone={kycBadge.tone}>KYC: {kycBadge.label}</Badge>
                {opp.aml_hold ? (
                  <Badge tone="rose">
                    <ShieldAlert className="size-3" /> МУТСТ түгжээ
                  </Badge>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                <span>
                  {opp.pipeline.code} · {opp.pipeline.name}
                </span>
                {opp.contact.phone ? <span>{opp.contact.phone}</span> : null}
                <span className="inline-flex items-center gap-1">
                  <User className="size-3.5" /> {opp.owner_name ?? "—"}
                </span>
                {opp.property ? (
                  <Link
                    href={`${basePath}/properties/${opp.property.id}`}
                    className="inline-flex items-center gap-1 hover:text-brand-700"
                  >
                    <Building2 className="size-3.5" /> {opp.property.name}{" "}
                    <span className="font-mono text-xs">{opp.property.number}</span>
                  </Link>
                ) : null}
                {opp.lead_id ? (
                  <Link
                    href={`${basePath}/leads/${opp.lead_id}`}
                    className="inline-flex items-center gap-1 hover:text-brand-700"
                  >
                    <Flame className="size-3.5" /> Сэжим
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-ink">{opp.amount != null ? fmtMNT(opp.amount) : "Дүн —"}</p>
              <p className="text-xs text-muted">
                Хаагдах төлөв: {opp.expected_close_on ? fmtDate(opp.expected_close_on) : "—"}
                {isOpen &&
                opp.expected_close_on &&
                opp.expected_close_on < new Date().toISOString().slice(0, 10) ? (
                  <span className="ml-1 font-medium text-rose-600">(хэтэрсэн — F-359)</span>
                ) : null}
              </p>
              {isOpen ? (
                <Button variant="ghost" size="sm" className="mt-1" onClick={() => setEditOpen(true)}>
                  <Pencil className="size-4" /> Засах
                </Button>
              ) : null}
            </div>
          </div>

          {/* Шатны stepper */}
          <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
            {linearStages.map((s, i) => {
              const isCurrent = s.id === opp.stage_id;
              const done = currentIdx >= 0 && i < currentIdx;
              return (
                <div key={s.id} className="flex shrink-0 items-center gap-1">
                  {i > 0 ? <ChevronRight className="size-3.5 text-subtle" /> : null}
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium",
                      isCurrent
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : done
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-line bg-surface text-muted"
                    )}
                    title={`${s.probability}%${s.gate_code ? ` · гейт ${s.gate_code.toUpperCase()}` : ""}`}
                  >
                    {s.name}
                  </span>
                </div>
              );
            })}
            {opp.state === "lost" ? (
              <span className="ml-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                Алдсан{opp.lost_reason_label ? `: ${opp.lost_reason_label}` : ""}
              </span>
            ) : null}
          </div>

          {currentStage ? (
            <p className="mt-2 text-xs text-muted">
              Одоогийн шатанд {daysSince(opp.stage_entered_at)} хоног ({fmtDateTime(opp.stage_entered_at)}-с хойш).
            </p>
          ) : null}

          {/* Шилжилтийн товчнууд + үйлдлүүд */}
          {isOpen ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {opp.transitions
                .filter((t) => t.allowed_roles.some((r) => roles.includes(r)))
                .map((t) => (
                  <Button
                    key={t.to_stage_id}
                    size="sm"
                    variant={t.kind === "forward" ? (t.terminal_state === "lost" ? "danger" : "primary") : "outline"}
                    disabled={pending}
                    onClick={() => initiate(t)}
                    title={
                      t.kind === "backward"
                        ? "Буцаах шилжилт — шалтгаантай (F-355)"
                        : t.kind === "skip"
                          ? "Алгасалт — зөвхөн Борлуулалтын захирал"
                          : undefined
                    }
                  >
                    {t.kind === "backward" ? "←" : <ArrowRight className="size-4" />} {t.to_stage_name}
                    {t.gate_code && t.gate_missing.length > 0 ? (
                      <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700">
                        {t.gate_missing.length}
                      </span>
                    ) : null}
                  </Button>
                ))}
              <span className="mx-1 h-5 w-px bg-line" aria-hidden />
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setOfferOpen(true)}>
                <HandCoins className="size-4" /> Санал бүртгэх
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight className="size-4" /> Урсгал шилжүүлэх
              </Button>
              {canManage ? (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setReassignOpen(true)}>
                  <User className="size-4" /> Эзэмшигч шилжүүлэх
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setLostOpen(true)}>
                <XCircle className="size-4" /> Алдсанаар хаах
              </Button>
            </div>
          ) : null}

          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {/* Гейт checklist (дараагийн урагш шилжилт) */}
          {isOpen && gatedPreview ? (
            <GateChecklist gateCode={gatedPreview.gateCode} items={gatedPreview.items} />
          ) : null}

          {/* Санал / хэлэлцээр */}
          <Card>
            <CardBody>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <HandCoins className="size-4 text-brand-600" /> Санал, хэлэлцээр ({opp.offers.length})
              </h3>
              {opp.offers.length === 0 ? (
                <p className="text-sm text-muted">Санал бүртгэгдээгүй — G2 гейт саналын бүртгэл шаардана.</p>
              ) : (
                <div className="space-y-2">
                  {opp.offers.map((o) => (
                    <div key={o.id} className="rounded-xl border border-line p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={o.direction === "offer" ? "blue" : "amber"}>
                          {o.direction === "offer" ? "Санал" : "Сөрөг санал"}
                        </Badge>
                        <span className="text-sm font-semibold text-ink">{fmtMNT(o.amount)}</span>
                        {o.valid_until ? (
                          <span className="text-xs text-muted">Хүчинтэй: {fmtDate(o.valid_until)}</span>
                        ) : null}
                        <span className="ml-auto text-xs text-subtle">
                          Дамжуулсан: {o.relayed_at ? fmtDateTime(o.relayed_at) : "—"}
                        </span>
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-xs text-muted">
                        {o.position ? <p>Байр суурь: {o.position}</p> : null}
                        {o.obstacle ? <p>Саад: {o.obstacle}</p> : null}
                        {o.next_step ? <p>Дараагийн алхам: {o.next_step}</p> : null}
                        {o.created_by_name ? <p className="text-subtle">Бүртгэсэн: {o.created_by_name}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Шатны түүх */}
          <Card>
            <CardBody>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <History className="size-4 text-brand-600" /> Шатны түүх (F-357)
              </h3>
              <div className="space-y-2">
                {opp.history.map((h) => (
                  <div key={h.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted">{h.from_stage_name ?? "Үүсгэсэн"}</span>
                    <ChevronRight className="size-3.5 text-subtle" />
                    <span className="font-medium text-ink">{h.to_stage_name}</span>
                    {h.reason ? <span className="text-xs text-amber-700">({h.reason})</span> : null}
                    <span className="ml-auto text-xs text-subtle">
                      {fmtDateTime(h.entered_at)}
                      {h.moved_by_name ? ` · ${h.moved_by_name}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Үйл ажиллагаа */}
        <div className="space-y-4">
          {isOpen ? (
            <ActivityComposer
              contactId={opp.contact.id}
              opportunityId={opp.id}
              leadId={opp.lead_id}
              propertyId={opp.property?.id ?? null}
              leadActive={Boolean(opp.lead_id)}
              objections={objections}
            />
          ) : null}
          <ActivityTimeline rows={activities} currentProfileId={currentProfileId} />
        </div>
      </div>

      <GateErrorDialog
        open={gateError !== null}
        missing={gateError?.missing ?? []}
        stageName={gateError?.stageName}
        onClose={() => setGateError(null)}
      />

      {/* Шалтгаант шилжилт */}
      <Modal
        open={reasonFor !== null}
        onClose={() => setReasonFor(null)}
        title={reasonFor?.kind === "backward" ? "Буцаах шилжилт — шалтгаан заавал" : "Шилжилтийн шалтгаан"}
        footer={
          <>
            <Button variant="outline" onClick={() => setReasonFor(null)}>
              Болих
            </Button>
            <Button disabled={pending || !reason.trim()} onClick={() => reasonFor && doMove(reasonFor, reason.trim())}>
              Шилжүүлэх
            </Button>
          </>
        }
      >
        <Field label="Шалтгаан" htmlFor="opp-move-reason" hint="Аудит логт бүртгэгдэнэ (F-355)">
          <Input id="opp-move-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>

      {/* Алдсанаар хаах */}
      <Modal
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        title="Алдсанаар хаах — шалтгаан заавал (F-356)"
        footer={
          <>
            <Button variant="outline" onClick={() => setLostOpen(false)}>
              Болих
            </Button>
            <Button
              variant="danger"
              disabled={pending || !lostReasonId || Boolean(selectedLostReason?.requires_note && !lostNote.trim())}
              onClick={submitLost}
            >
              Алдсанаар хаах
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Алдсан шалтгаан" htmlFor="opp-lost-reason">
            <Select id="opp-lost-reason" value={lostReasonId} onChange={(e) => setLostReasonId(e.target.value)}>
              <option value="">— Сонгоно уу —</option>
              {lostReasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={selectedLostReason?.requires_note ? "Тайлбар (заавал)" : "Тайлбар"} htmlFor="opp-lost-note">
            <Input id="opp-lost-note" value={lostNote} onChange={(e) => setLostNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* Дүн/огноо засах */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Боломж засах"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Болих
            </Button>
            <Button disabled={pending} onClick={submitEdit}>
              Хадгалах
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Дүн (₮)" htmlFor="opp-amount">
            <Input
              id="opp-amount"
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Хаагдах төлөв огноо (F-359)" htmlFor="opp-close-on">
            <Input
              id="opp-close-on"
              type="date"
              value={expectedCloseOn}
              onChange={(e) => setExpectedCloseOn(e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      {/* Санал бүртгэх */}
      <Modal
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        title="Санал / сөрөг санал бүртгэх (P-02)"
        footer={
          <>
            <Button variant="outline" onClick={() => setOfferOpen(false)}>
              Болих
            </Button>
            <Button disabled={pending} onClick={submitOffer}>
              Бүртгэх
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Чиглэл" htmlFor="offer-dir">
              <Select
                id="offer-dir"
                value={offerDirection}
                onChange={(e) => setOfferDirection(e.target.value as "offer" | "counter")}
              >
                <option value="offer">Санал</option>
                <option value="counter">Сөрөг санал</option>
              </Select>
            </Field>
            <Field label="Дүн (₮)" htmlFor="offer-amount">
              <Input
                id="offer-amount"
                type="number"
                min="0"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Нөхцөл" htmlFor="offer-terms" hint="Төлбөрийн нөхцөл, санхүүжилт, багтах/үл багтах зүйлс">
            <Input id="offer-terms" value={offerTerms} onChange={(e) => setOfferTerms(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Хүчинтэй хугацаа" htmlFor="offer-valid">
              <Input
                id="offer-valid"
                type="date"
                value={offerValidUntil}
                onChange={(e) => setOfferValidUntil(e.target.value)}
              />
            </Field>
            <Field label="Дараагийн алхам" htmlFor="offer-next">
              <Input id="offer-next" value={offerNextStep} onChange={(e) => setOfferNextStep(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Сүүлийн байр суурь" htmlFor="offer-pos">
              <Input id="offer-pos" value={offerPosition} onChange={(e) => setOfferPosition(e.target.value)} />
            </Field>
            <Field label="Саад" htmlFor="offer-obs">
              <Input id="offer-obs" value={offerObstacle} onChange={(e) => setOfferObstacle(e.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-muted">
            Дамжуулсан огноог систем автоматаар хадгална; бүртгэгдмэгц эргэн холбогдох даалгавар үүснэ (Д-06).
          </p>
        </div>
      </Modal>

      {/* Урсгал шилжүүлэх */}
      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Урсгал хооронд шилжүүлэх (F-361)"
        footer={
          <>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              Болих
            </Button>
            <Button disabled={pending || !transferCode || !transferReason.trim()} onClick={submitTransfer}>
              Шилжүүлэх
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Зорилтот урсгал" htmlFor="transfer-code">
            <Select id="transfer-code" value={transferCode} onChange={(e) => setTransferCode(e.target.value)}>
              <option value="">— Сонгоно уу —</option>
              {PL_CODES.filter((c) => c !== opp.pipeline.code).map((c) => (
                <option key={c} value={c}>
                  {c} · {PL_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Шалтгаан (заавал)" htmlFor="transfer-reason" hint="Түүх хадгалагдаж, шинэ урсгалын эхний тохирох шатанд орно">
            <Input
              id="transfer-reason"
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      {/* Эзэмшигч шилжүүлэх */}
      <Modal
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        title="Эзэмшигч шилжүүлэх"
        footer={
          <>
            <Button variant="outline" onClick={() => setReassignOpen(false)}>
              Болих
            </Button>
            <Button disabled={pending || !newOwner} onClick={submitReassign}>
              Шилжүүлэх
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Шинэ эзэмшигч" htmlFor="reassign-owner">
            <Select id="reassign-owner" value={newOwner} onChange={(e) => setNewOwner(e.target.value)}>
              <option value="">— Сонгоно уу —</option>
              {agents
                .filter((a) => a.profileId !== opp.owner_id)
                .map((a) => (
                  <option key={a.profileId} value={a.profileId}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Шалтгаан" htmlFor="reassign-reason">
            <Select
              id="reassign-reason"
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
            >
              {REASSIGN_REASONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Тэмдэглэл" htmlFor="reassign-note">
            <Input id="reassign-note" value={reassignNote} onChange={(e) => setReassignNote(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
