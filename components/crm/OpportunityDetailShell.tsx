"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  ArrowRight,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Flame,
  History,
  Lightbulb,
  Pencil,
  Ruler,
  Search,
  ShieldAlert,
  User,
  X,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { GateChecklist } from "@/components/crm/GateChecklist";
import { GateErrorDialog } from "@/components/crm/GateErrorDialog";
import { ActivityComposer } from "@/components/crm/ActivityComposer";
import { ActivityTimeline } from "@/components/crm/ActivityTimeline";
import { OfferPanel } from "@/components/crm/OfferPanel";
import { ShowingPanel } from "@/components/crm/ShowingPanel";
import {
  moveStage,
  closeLost,
  transferPipeline,
  updateOpportunity,
  reassignOpportunity,
  setOpportunityNextStep,
  scheduleOwnerMeeting,
  recordPriceAnalysis,
  searchOpportunityProperties,
  listContactNeedProfiles,
} from "@/lib/actions/crm-opportunities";
import { createTransaction } from "@/lib/actions/crm-transactions";
import { fmtMNT, fmtDate, fmtDateTime, daysSince } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  avgPricePerM2,
  priceAnalysisError,
  stageHealth,
  type Comparable,
  type DealFlowConfig,
} from "@/lib/crm/deal-flow";
import {
  OPP_STATE_LABEL,
  KYC_STATUS_LABEL,
  PL_CODES,
  PL_LABEL,
  GATE_CHECKER_LABEL,
  TXN_STATUS_LABEL,
  TXN_TYPES,
  TXN_TYPE_LABEL,
  type CrmRole,
  type GateCode,
  type GateCheckerKind,
  type PlCode,
  type TxnType,
  type TxnStatus,
} from "@/lib/constants-crm";
import type {
  OpportunityDetail,
  TransitionOption,
  ActivityRow,
  PropertyOption,
  NeedProfileOption,
} from "@/lib/queries-crm-pipeline";
import { toIsoDate } from "@/lib/crm/calendar";

/**
 * Боломжийн карт (§6.13, §6.14): шатны зам + зөвлөмж, дараагийн шатны
 * шилжих шалгуур (дутуу мөр бүрээс шууд үйлдэл), дараагийн үйлдэл, үнийн
 * санал, үзлэг, листингийн уулзалт ба үнийн дүн шинжилгээ, хэлцлийн хавтас,
 * үйл ажиллагаа, шатны түүх. Амжилттай хаагдсан шат зөвхөн хэлцэл
 * хаагдахад автоматаар.
 */

type LookupLite = { id: string; label: string; requires_note: boolean };

const REASSIGN_REASONS: { code: string; label: string }[] = [
  { code: "client_request", label: "Харилцагчийн хүсэлт" },
  { code: "sla_breach", label: "Хариу өгөх хугацаа хэтэрсэн" },
  { code: "inactivity", label: "Идэвхгүй байдал" },
  { code: "zoning", label: "Бүсчлэл" },
  { code: "offboarding", label: "Ажилтан гарч байгаа" },
];

const DEFAULT_TXN_TYPE: Partial<Record<PlCode, TxnType>> = {
  "PL-1": "sale",
  "PL-2": "sale",
  "PL-3": "standard_rental",
  "PL-4": "managed_rental",
  "PL-5": "international_sale",
};

/** Дэлгэцийн шошго → шалгагчийн төрөл (DB-ийн дутуу жагсаалттай ижил шошго). */
const LABEL_TO_KIND: Record<string, GateCheckerKind> = Object.fromEntries(
  (Object.entries(GATE_CHECKER_LABEL) as [GateCheckerKind, string][]).map(([k, v]) => [v, k])
);
function kindOfLabel(label: string): GateCheckerKind | null {
  if (LABEL_TO_KIND[label]) return LABEL_TO_KIND[label];
  if (label.startsWith(GATE_CHECKER_LABEL.docs_complete)) return "docs_complete";
  return null;
}

function todayIso(): string {
  return toIsoDate(new Date());
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

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
  dealFlow,
  feedbackHours,
}: {
  opp: OpportunityDetail;
  activities: ActivityRow[];
  /** Шилжих шалгуурын код → идэвхтэй шаардлагуудын шошго (crm_gate_requirements-ээс). */
  gateLabels: Partial<Record<GateCode, string[]>>;
  lostReasons: LookupLite[];
  objections: LookupLite[];
  agents: { profileId: string; name: string }[];
  roles: CrmRole[];
  currentProfileId: string;
  basePath: string;
  dealFlow: DealFlowConfig;
  feedbackHours: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [, startSearch] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [gateError, setGateError] = useState<{ missing: string[]; stageName: string } | null>(null);
  const [reasonFor, setReasonFor] = useState<TransitionOption | null>(null);
  const [reason, setReason] = useState("");
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReasonId, setLostReasonId] = useState("");
  const [lostNote, setLostNote] = useState("");
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [offerSignal, setOfferSignal] = useState(0);

  // Засах
  const [editOpen, setEditOpen] = useState(false);
  const [amount, setAmount] = useState(opp.amount != null ? String(opp.amount) : "");
  const [fee, setFee] = useState(opp.expected_fee_mnt != null ? String(opp.expected_fee_mnt) : "");
  const [expectedCloseOn, setExpectedCloseOn] = useState(opp.expected_close_on ?? "");
  const [editProperty, setEditProperty] = useState<{ id: string; label: string } | null>(
    opp.property ? { id: opp.property.id, label: `${opp.property.name} ${opp.property.number}` } : null
  );
  const [propertyQ, setPropertyQ] = useState("");
  const [propertyResults, setPropertyResults] = useState<PropertyOption[]>([]);
  const [profiles, setProfiles] = useState<NeedProfileOption[] | null>(null);
  const [needProfileId, setNeedProfileId] = useState(opp.need_profile_id ?? "");

  // Дараагийн үйлдэл
  const [nextOpen, setNextOpen] = useState(false);
  const [nextStep, setNextStep] = useState(opp.next_step ?? "");
  const [nextStepDate, setNextStepDate] = useState(opp.next_step_date ?? todayIso());

  // Уулзалт (листинг)
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingAt, setMeetingAt] = useState("");
  const [meetingPlace, setMeetingPlace] = useState(opp.meeting_place ?? "");

  // Үнийн дүн шинжилгээ
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const blankComp = (): Comparable => ({ address: "", price: 0, area_m2: null, note: null });
  const [comps, setComps] = useState<Comparable[]>(() =>
    Array.from({ length: Math.max(dealFlow.priceAnalysisMinComparables, 1) }, blankComp)
  );
  const [recommended, setRecommended] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [analysisNote, setAnalysisNote] = useState("");

  // Хэлцэл үүсгэх
  const [txnOpen, setTxnOpen] = useState(false);
  const [txnType, setTxnType] = useState<TxnType>(DEFAULT_TXN_TYPE[opp.pipeline.code as PlCode] ?? "sale");
  const [txnAmount, setTxnAmount] = useState(opp.amount != null ? String(opp.amount) : "");

  // Урсгал, эзэмшигч
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferCode, setTransferCode] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [newOwner, setNewOwner] = useState("");
  const [reassignReason, setReassignReason] = useState("client_request");
  const [reassignNote, setReassignNote] = useState("");

  const isOpen = opp.state === "open";
  const isListing = opp.pipeline.code === "PL-2";
  const canManage = roles.some((r) => ["team_lead", "sales_director", "ops_qc", "sysadmin"].includes(r));
  const stateBadge = OPP_STATE_LABEL[opp.state];
  const kycBadge = KYC_STATUS_LABEL[opp.contact.kyc_public_status];
  const currentStage = opp.stages.find((s) => s.id === opp.stage_id);
  const linearStages = opp.stages.filter((s) => s.terminal_state !== "lost");
  const currentIdx = linearStages.findIndex((s) => s.id === opp.stage_id);
  const selectedLostReason = lostReasons.find((r) => r.id === lostReasonId);
  const today = todayIso();
  const health = stageHealth(
    {
      stageCode: currentStage?.code ?? "",
      stageEnteredAt: opp.stage_entered_at,
      nextStepDate: opp.next_step_date,
      open: isOpen,
    },
    today,
    dealFlow
  );
  const askingPrice = opp.property
    ? opp.property.service_kind === "sale"
      ? opp.property.price
      : opp.property.rent_price
    : null;
  const nextIsClosing =
    opp.transitions.find((t) => t.kind === "forward" && !t.is_terminal)?.to_stage_code === "contract" ||
    currentStage?.code === "contract" ||
    currentStage?.is_closing_direction;

  // Дараагийн урагш шилжилт — шалгуурын жагсаалтыг түүн дээр үзүүлнэ.
  const nextForward = opp.transitions.find((t) => t.kind === "forward" && t.terminal_state !== "lost");
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
  const missingItems = gatedPreview?.items.filter((i) => !i.ok) ?? [];

  // ── Шилжилт ─────────────────────────────────────────────

  function doMove(tr: TransitionOption, moveReason?: string) {
    setError(null);
    startTransition(async () => {
      const res = await moveStage(opp.id, tr.to_stage_id, moveReason);
      if (!res.ok) {
        if (res.missing?.length) setGateError({ missing: res.missing, stageName: tr.to_stage_name });
        else setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success(`«${tr.to_stage_name}» шат руу шилжлээ`);
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
        if (res.missing?.length) setGateError({ missing: res.missing, stageName: "Амжилтгүй хаагдсан" });
        else setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setLostOpen(false);
      router.refresh();
    });
  }

  // ── Засах ────────────────────────────────────────────────

  function openEdit() {
    setEditOpen(true);
    if (!isListing && profiles === null) {
      startSearch(async () => setProfiles(await listContactNeedProfiles(opp.contact.id)));
    }
  }

  function onPropertyQuery(q: string) {
    setPropertyQ(q);
    startSearch(async () => setPropertyResults(await searchOpportunityProperties(q)));
  }

  function submitEdit() {
    setError(null);
    const amt = amount.trim() === "" ? null : Number(amount);
    const feeAmt = fee.trim() === "" ? null : Number(fee);
    if ((amt != null && (Number.isNaN(amt) || amt < 0)) || (feeAmt != null && (Number.isNaN(feeAmt) || feeAmt < 0))) {
      setError("Дүн буруу байна.");
      return;
    }
    startTransition(async () => {
      const res = await updateOpportunity({
        id: opp.id,
        amount: amt,
        expectedFeeMnt: feeAmt,
        expectedCloseOn: expectedCloseOn || null,
        propertyId: editProperty?.id ?? null,
        ...(isListing ? {} : { needProfileId: needProfileId || null }),
      });
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success("Боломж шинэчлэгдлээ");
      setEditOpen(false);
      router.refresh();
    });
  }

  function submitNextStep() {
    setError(null);
    startTransition(async () => {
      const res = await setOpportunityNextStep({ id: opp.id, nextStep: nextStep.trim(), nextStepDate });
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success("Дараагийн үйлдэл хадгалагдлаа");
      setNextOpen(false);
      router.refresh();
    });
  }

  function submitMeeting() {
    setError(null);
    if (!meetingAt) {
      setError("Уулзалтын огноо, цагийг сонгоно уу.");
      return;
    }
    startTransition(async () => {
      const res = await scheduleOwnerMeeting({
        id: opp.id,
        meetingAt: new Date(meetingAt).toISOString(),
        place: meetingPlace.trim(),
      });
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success("Уулзалт товлогдлоо");
      setMeetingOpen(false);
      router.refresh();
    });
  }

  function submitAnalysis() {
    setError(null);
    const rec = Number(recommended);
    const min = priceMin ? Number(priceMin) : null;
    const max = priceMax ? Number(priceMax) : null;
    const clean = comps.filter((c) => c.address.trim() || c.price > 0);
    const err = priceAnalysisError(clean, rec, min, max, dealFlow);
    if (err) {
      setError(err);
      return;
    }
    startTransition(async () => {
      const res = await recordPriceAnalysis({
        opportunityId: opp.id,
        comparables: clean.map((c) => ({
          address: c.address.trim(),
          price: c.price,
          area_m2: c.area_m2 || null,
          note: c.note?.trim() || null,
        })),
        priceMin: min,
        priceMax: max,
        recommendedPrice: rec,
        note: analysisNote.trim() || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Үнийн дүн шинжилгээ бүртгэгдлээ");
      setAnalysisOpen(false);
      router.refresh();
    });
  }

  function submitTxn() {
    setError(null);
    const amt = Number(txnAmount);
    if (!(amt > 0)) {
      setError("Хэлцлийн дүнг оруулна уу.");
      return;
    }
    startTransition(async () => {
      const res = await createTransaction({ opportunityId: opp.id, type: txnType, amount: amt, currency: "MNT" });
      if (res.error || !res.id) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success("Хэлцлийн хавтас нээгдлээ");
      setTxnOpen(false);
      router.push(`${basePath}/transactions/${res.id}`);
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

  // ── Дутуу шаардлагаас шууд үйлдэл ────────────────────────

  function actionFor(label: string): { text: string; run?: () => void; href?: string } | null {
    const kind = kindOfLabel(label);
    if (!kind || !isOpen) return null;
    switch (kind) {
      case "next_step_set":
        return { text: "Дараагийн үйлдэл товлох", run: () => setNextOpen(true) };
      case "meaningful_contact":
        return { text: "Холболтын үр дүн бүртгэх", run: () => scrollToId("opp-activity") };
      case "need_profile_complete":
        return { text: "Профайл бөглөх", href: `${basePath}/contacts/${opp.contact.id}` };
      case "match_suggested":
        return { text: "Үл хөдлөх холбох", run: openEdit };
      case "showing_logged":
      case "interest_confirmed":
      case "showing_on_property":
        return { text: "Үзлэг рүү", run: () => scrollToId("opp-showings") };
      case "offer_recorded":
      case "counter_recorded":
        return { text: "Санал бүртгэх", run: () => setOfferSignal((n) => n + 1) };
      case "offer_accepted":
        return { text: "Саналын шийдвэр", run: () => scrollToId("opp-offers") };
      case "meeting_scheduled":
        return { text: "Уулзалт товлох", run: () => setMeetingOpen(true) };
      case "price_analysis":
        return { text: "Дүн шинжилгээ бүртгэх", run: () => setAnalysisOpen(true) };
      case "listing_agreement":
      case "property_active":
        return opp.property
          ? { text: "Үл хөдлөхийн карт", href: `${basePath}/properties/${opp.property.id}` }
          : { text: "Үл хөдлөх холбох", run: openEdit };
      case "kyc_verified":
        return { text: "Харилцагчийн карт", href: `${basePath}/contacts/${opp.contact.id}` };
      case "docs_complete":
      case "role_evidence":
      case "payment_proof":
      case "handover_done":
        return opp.transaction
          ? { text: "Хэлцлийн хавтас", href: `${basePath}/transactions/${opp.transaction.id}` }
          : { text: "Хэлцлийн хавтас нээх", run: () => setTxnOpen(true) };
      default:
        return null;
    }
  }

  const MISSING_HINT: Partial<Record<GateCheckerKind, string>> = {
    kyc_verified: "Харилцагчийн KYC-г МУТСТ ажилтан баталгаажуулна.",
    aml_not_held: "МУТСТ түгжээг зөвхөн МУТСТ ажилтан суллана.",
    docs_complete: "Хэлцлийн хавтсанд шаардлагатай баримтыг хавсаргана.",
  };

  return (
    <div className="space-y-4 pb-20 sm:pb-0">
      {/* Толгой */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
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
                <span>{PL_LABEL[opp.pipeline.code as PlCode] ?? opp.pipeline.name}</span>
                {opp.contact.phone ? (
                  <a href={`tel:${opp.contact.phone}`} className="hover:text-brand-700">
                    {opp.contact.phone}
                  </a>
                ) : null}
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
                ) : isOpen ? (
                  <button type="button" onClick={openEdit} className="inline-flex items-center gap-1 text-amber-700">
                    <Building2 className="size-3.5" /> Үл хөдлөх холбоогүй
                  </button>
                ) : null}
                {opp.lead_id ? (
                  <Link href={`${basePath}/leads/${opp.lead_id}`} className="inline-flex items-center gap-1 hover:text-brand-700">
                    <Flame className="size-3.5" /> Сэжим
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-ink">{opp.amount != null ? fmtMNT(opp.amount) : "Дүн —"}</p>
              {opp.expected_fee_mnt != null ? (
                <p className="text-xs text-muted">Хүлээгдэж буй хөлс: {fmtMNT(opp.expected_fee_mnt)}</p>
              ) : null}
              <p className="text-xs text-muted">
                Хаагдах төлөвлөгөө: {opp.expected_close_on ? fmtDate(opp.expected_close_on) : "—"}
                {isOpen && opp.expected_close_on && opp.expected_close_on < today ? (
                  <span className="ml-1 font-medium text-rose-600">(хэтэрсэн)</span>
                ) : null}
              </p>
              {isOpen ? (
                <Button variant="ghost" size="sm" className="mt-1" onClick={openEdit}>
                  <Pencil className="size-4" /> Засах
                </Button>
              ) : null}
            </div>
          </div>

          {/* Шатны зам */}
          <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1" role="list" aria-label="Шатууд">
            {linearStages.map((s, i) => {
              const isCurrent = s.id === opp.stage_id;
              const done = currentIdx >= 0 && i < currentIdx;
              return (
                <div key={s.id} className="flex shrink-0 items-center gap-1" role="listitem">
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
                    title={`Магадлал ${s.probability}%`}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    {s.name}
                  </span>
                </div>
              );
            })}
            {opp.state === "lost" ? (
              <span className="ml-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                Амжилтгүй хаагдсан{opp.lost_reason_label ? `: ${opp.lost_reason_label}` : ""}
              </span>
            ) : null}
          </div>

          {currentStage ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>
                Одоогийн шатанд {daysSince(opp.stage_entered_at)} хоног ({fmtDateTime(opp.stage_entered_at)}-с хойш)
              </span>
              {health.stale ? <Badge tone="amber">Шатанд удсан ({health.staleLimit}+ хоног)</Badge> : null}
              {currentStage.guidance ? (
                <button
                  type="button"
                  onClick={() => setGuidanceOpen((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-brand-700 hover:bg-brand-50"
                  aria-expanded={guidanceOpen}
                >
                  <Lightbulb className="size-3.5" /> Энэ шатанд юу хийх вэ
                  <ChevronDown className={cn("size-3.5 transition", guidanceOpen && "rotate-180")} />
                </button>
              ) : null}
            </div>
          ) : null}
          {guidanceOpen && currentStage?.guidance ? (
            <p className="mt-2 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm text-ink">{currentStage.guidance}</p>
          ) : null}

          {/* Шилжилтийн товчнууд */}
          {isOpen ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {opp.transitions
                .filter((t) => t.allowed_roles.some((r) => roles.includes(r)))
                .filter((t) => t.terminal_state !== "lost")
                .map((t) => (
                  <Button
                    key={t.to_stage_id}
                    size="sm"
                    variant={t.kind === "forward" ? "primary" : "outline"}
                    disabled={pending}
                    onClick={() => initiate(t)}
                    title={
                      t.kind === "backward"
                        ? "Буцаах шилжилт — шалтгаантай"
                        : t.kind === "skip"
                          ? "Алгасалт — зөвхөн Борлуулалт хариуцсан захирал"
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
              {nextIsClosing ? (
                opp.transaction ? (
                  <Link
                    href={`${basePath}/transactions/${opp.transaction.id}`}
                    className="text-xs font-medium text-brand-700 hover:underline"
                  >
                    Хэлцлийн хавтас хаагдахад боломж автоматаар амжилттай хаагдана →
                  </Link>
                ) : (
                  <span className="text-xs text-muted">Амжилттай хаагдах нь хэлцлийн хавтас хаагдахад автоматаар.</span>
                )
              ) : null}
              <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight className="size-4" /> Урсгал шилжүүлэх
              </Button>
              {canManage ? (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setReassignOpen(true)}>
                  <User className="size-4" /> Эзэмшигч шилжүүлэх
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setLostOpen(true)}>
                <XCircle className="size-4" /> Амжилтгүй хаах
              </Button>
            </div>
          ) : null}

          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {/* Дараагийн үйлдэл */}
          {isOpen ? (
            <Card>
              <CardBody className="flex flex-wrap items-center gap-3">
                <CalendarClock
                  className={cn(
                    "size-5 shrink-0",
                    health.nextStepOverdueDays > 0 || health.nextStepMissing ? "text-rose-600" : "text-brand-600"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">Дараагийн үйлдэл</p>
                  {opp.next_step ? (
                    <p className="text-sm font-medium text-ink">
                      {opp.next_step}
                      {opp.next_step_date ? <span className="text-muted"> · {fmtDate(opp.next_step_date)}</span> : null}
                      {health.nextStepOverdueDays > 0 ? (
                        <span className="ml-1 text-rose-600">({health.nextStepOverdueDays} хоног хэтэрсэн)</span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-rose-600">Товлогдоогүй</p>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => setNextOpen(true)}>
                  Товлох
                </Button>
              </CardBody>
            </Card>
          ) : null}

          {/* Дараагийн шатны шилжих шалгуур + шууд үйлдэл */}
          {isOpen && gatedPreview ? (
            <div className="space-y-2">
              <GateChecklist gateCode={gatedPreview.gateCode} items={gatedPreview.items} />
              {missingItems.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <p className="mb-2 text-xs font-medium text-amber-800">
                    «{gatedPreview.stageName}» шат руу шилжихийн тулд:
                  </p>
                  <ul className="space-y-1.5">
                    {missingItems.map((m) => {
                      const a = actionFor(m.label);
                      const hint = MISSING_HINT[kindOfLabel(m.label) ?? ("" as GateCheckerKind)];
                      return (
                        <li key={m.label} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1 text-ink">{m.label}</span>
                          {a?.href ? (
                            <ButtonLink href={a.href} size="sm" variant="outline">
                              {a.text}
                            </ButtonLink>
                          ) : a?.run ? (
                            <Button size="sm" variant="outline" onClick={a.run}>
                              {a.text}
                            </Button>
                          ) : null}
                          {hint ? <span className="w-full text-xs text-muted">{hint}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Листинг: уулзалт, үнийн дүн шинжилгээ */}
          {isListing ? (
            <Card>
              <CardBody className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Ruler className="size-4 text-brand-600" /> Уулзалт, үнэлгээ
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">Өмчлөгчтэй уулзалт:</span>
                  {opp.meeting_at ? (
                    <span className="font-medium text-ink">
                      {fmtDateTime(opp.meeting_at)}
                      {opp.meeting_place ? ` · ${opp.meeting_place}` : ""}
                    </span>
                  ) : (
                    <span className="text-amber-700">товлогдоогүй</span>
                  )}
                  {isOpen ? (
                    <Button size="sm" variant="ghost" onClick={() => setMeetingOpen(true)}>
                      {opp.meeting_at ? "Өөрчлөх" : "Товлох"}
                    </Button>
                  ) : null}
                </div>
                {opp.priceAnalyses.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Ruler}
                    title="Үнийн дүн шинжилгээ хийгдээгүй"
                    description={`Зах зээлийн ${dealFlow.priceAnalysisMinComparables}+ жишигтэй харьцуулж санал болгох үнээ бүртгэнэ.`}
                    action={isOpen ? { label: "Дүн шинжилгээ бүртгэх", onClick: () => setAnalysisOpen(true) } : undefined}
                  />
                ) : (
                  <ul className="space-y-2">
                    {opp.priceAnalyses.map((a) => (
                      <li key={a.id} className="rounded-xl border border-line p-3 text-sm">
                        <p className="font-semibold text-ink">
                          Санал болгох үнэ: {fmtMNT(a.recommended_price)}
                          {a.price_min && a.price_max ? (
                            <span className="font-normal text-muted">
                              {" "}
                              ({fmtMNT(a.price_min)} – {fmtMNT(a.price_max)})
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted">
                          {a.comparables.length} жишиг
                          {avgPricePerM2(a.comparables) ? ` · м² дундаж ${fmtMNT(avgPricePerM2(a.comparables)!)}` : ""} ·{" "}
                          {fmtDateTime(a.created_at)} · {a.created_by_name ?? "—"}
                        </p>
                        {a.note ? <p className="mt-1 text-xs text-ink">{a.note}</p> : null}
                      </li>
                    ))}
                    {isOpen ? (
                      <Button size="sm" variant="ghost" onClick={() => setAnalysisOpen(true)}>
                        Шинэ дүн шинжилгээ
                      </Button>
                    ) : null}
                  </ul>
                )}
              </CardBody>
            </Card>
          ) : null}

          <ShowingPanel
            id="opp-showings"
            opportunityId={opp.id}
            contactId={opp.contact.id}
            contactName={opp.contact.display_name}
            listing={isListing}
            property={opp.property ? { id: opp.property.id, name: opp.property.name, number: opp.property.number } : null}
            showings={opp.showings}
            matchOptions={opp.matchOptions}
            isOpen={isOpen}
            feedbackHours={feedbackHours}
            basePath={basePath}
          />

          <OfferPanel
            id="opp-offers"
            opportunityId={opp.id}
            listing={isListing}
            offers={opp.offers}
            askingPrice={askingPrice}
            cfg={dealFlow}
            roles={roles}
            isOpen={isOpen}
            openFormSignal={offerSignal}
          />

          {/* Хэлцлийн хавтас */}
          <Card>
            <CardBody>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <ClipboardList className="size-4 text-brand-600" /> Хэлцлийн хавтас
              </h3>
              {opp.transaction ? (
                <Link
                  href={`${basePath}/transactions/${opp.transaction.id}`}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3 hover:bg-surface-2"
                >
                  <span className="font-semibold text-ink">{opp.transaction.number}</span>
                  <Badge tone={TXN_STATUS_LABEL[opp.transaction.status as TxnStatus]?.tone ?? "neutral"}>
                    {TXN_STATUS_LABEL[opp.transaction.status as TxnStatus]?.label ?? ""}
                  </Badge>
                  <span className="text-xs text-muted">
                    Баримтын бүрдэл {Math.round(Number(opp.transaction.file_completeness_pct))}%
                  </span>
                  <ChevronRight className="ml-auto size-4 text-subtle" />
                </Link>
              ) : (
                <EmptyState
                  compact
                  icon={ClipboardList}
                  title="Хэлцлийн хавтас нээгдээгүй"
                  description="Нөхцөл тохирмогц хавтас нээж оролцогч, гэрээ, төлбөр, хүлээлцэхийг бүрдүүлнэ. Гэрээ шатанд орохын өмнө баримтын бүрдэл шаардлагатай."
                  action={
                    isOpen && opp.property
                      ? { label: "Хэлцлийн хавтас нээх", onClick: () => setTxnOpen(true) }
                      : isOpen
                        ? { label: "Эхлээд үл хөдлөх холбох", onClick: openEdit }
                        : undefined
                  }
                />
              )}
            </CardBody>
          </Card>

          {/* Шатны түүх */}
          <Card>
            <CardBody>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <History className="size-4 text-brand-600" /> Шатны түүх
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
        <div className="space-y-4" id="opp-activity">
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

      {/* Утсан дээр: доод хурдан үйлдэл */}
      {isOpen && nextForward ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-2 backdrop-blur sm:hidden"
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          <div className="flex items-center gap-2">
            <Button size="md" variant="outline" className="flex-1" onClick={() => setNextOpen(true)}>
              Дараагийн үйлдэл
            </Button>
            <Button size="md" className="flex-1" disabled={pending} onClick={() => initiate(nextForward)}>
              {nextForward.to_stage_name}
              {nextForward.gate_missing.length ? ` (${nextForward.gate_missing.length})` : ""}
            </Button>
          </div>
        </div>
      ) : null}

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
        <Field label="Шалтгаан" htmlFor="opp-move-reason" hint="Аудитын бүртгэлд хадгалагдана">
          <Input id="opp-move-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>

      {/* Амжилтгүй хаах */}
      <Modal
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        title="Амжилтгүй хаах — шалтгаан заавал"
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
              Амжилтгүй хаах
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Шалтгааны ангилал" htmlFor="opp-lost-reason">
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

      {/* Засах */}
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
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Үл хөдлөх</p>
            {editProperty ? (
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm">
                <span className="truncate font-medium text-ink">{editProperty.label}</span>
                <button
                  type="button"
                  onClick={() => setEditProperty(null)}
                  className="rounded-lg p-1 text-muted hover:text-ink"
                  aria-label="Үл хөдлөхийг арилгах"
                  disabled={Boolean(opp.transaction)}
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                  <Input
                    className="pl-9"
                    value={propertyQ}
                    onChange={(e) => onPropertyQuery(e.target.value)}
                    placeholder="Листингийн дугаар эсвэл нэрээр…"
                    aria-label="Үл хөдлөх хайх"
                  />
                </div>
                {!isListing && opp.matchOptions.length > 0 && !propertyQ ? (
                  <ul className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-line bg-surface">
                    {opp.matchOptions.map((m) => (
                      <li key={m.property_id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                          onClick={() => setEditProperty({ id: m.property_id, label: `${m.property_name} ${m.property_number}` })}
                        >
                          {m.property_name} <span className="font-mono text-xs text-subtle">{m.property_number}</span>{" "}
                          <span className="text-xs text-muted">· тохирол {Math.round(m.score)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {propertyResults.length > 0 ? (
                  <ul className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-line bg-surface">
                    {propertyResults.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                          onClick={() => {
                            setEditProperty({ id: p.id, label: `${p.name} ${p.number}` });
                            setPropertyResults([]);
                            setPropertyQ("");
                          }}
                        >
                          <span className="font-mono text-xs text-subtle">{p.number}</span> {p.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>
          {!isListing ? (
            <Field label="Хэрэгцээний профайл" htmlFor="opp-edit-profile">
              <Select id="opp-edit-profile" value={needProfileId} onChange={(e) => setNeedProfileId(e.target.value)}>
                <option value="">— Харилцагчийн идэвхтэй профайл —</option>
                {(profiles ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.budget_max ? `${fmtMNT(p.budget_max)} хүртэл` : "Профайл"}
                    {p.completeness_pct != null ? ` · бүрэн ${Math.round(p.completeness_pct)}%` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Хэлцлийн дүн (₮)" htmlFor="opp-amount">
              <Input
                id="opp-amount"
                type="number"
                inputMode="numeric"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Хүлээгдэж буй цэвэр хөлс (₮)" htmlFor="opp-fee">
              <Input id="opp-fee" type="number" inputMode="numeric" min="0" value={fee} onChange={(e) => setFee(e.target.value)} />
            </Field>
          </div>
          <Field label="Хаагдах төлөвлөсөн огноо" htmlFor="opp-close-on">
            <Input id="opp-close-on" type="date" value={expectedCloseOn} onChange={(e) => setExpectedCloseOn(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </Modal>

      {/* Дараагийн үйлдэл */}
      <Modal
        open={nextOpen}
        onClose={() => setNextOpen(false)}
        title="Дараагийн үйлдэл"
        footer={
          <>
            <Button variant="outline" onClick={() => setNextOpen(false)}>
              Болих
            </Button>
            <Button disabled={pending || nextStep.trim().length < 2 || !nextStepDate} onClick={submitNextStep}>
              Хадгалах
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Юу хийх" htmlFor="opp-next-step">
            <Input id="opp-next-step" value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
          </Field>
          <Field label="Огноо" htmlFor="opp-next-date">
            <Input id="opp-next-date" type="date" min={today} value={nextStepDate} onChange={(e) => setNextStepDate(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </Modal>

      {/* Уулзалт */}
      <Modal
        open={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        title="Өмчлөгчтэй уулзалт товлох"
        footer={
          <>
            <Button variant="outline" onClick={() => setMeetingOpen(false)}>
              Болих
            </Button>
            <Button disabled={pending || !meetingAt || meetingPlace.trim().length < 2} onClick={submitMeeting}>
              Товлох
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Огноо, цаг" htmlFor="opp-meeting-at">
            <Input id="opp-meeting-at" type="datetime-local" value={meetingAt} onChange={(e) => setMeetingAt(e.target.value)} />
          </Field>
          <Field label="Газар" htmlFor="opp-meeting-place" hint="Оффис эсвэл үл хөдлөх дээр нь">
            <Input id="opp-meeting-place" value={meetingPlace} onChange={(e) => setMeetingPlace(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </Modal>

      {/* Үнийн дүн шинжилгээ */}
      <Modal
        open={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
        title="Зах зээлийн харьцуулалт, үнийн дүн шинжилгээ"
        footer={
          <>
            <Button variant="outline" onClick={() => setAnalysisOpen(false)}>
              Болих
            </Button>
            <Button disabled={pending} onClick={submitAnalysis}>
              Бүртгэх
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-muted">Дор хаяж {dealFlow.priceAnalysisMinComparables} жишиг объект.</p>
          {comps.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem_5rem] gap-2">
              <Input
                aria-label={`Жишиг ${i + 1} хаяг`}
                placeholder="Хаяг, хотхон"
                value={c.address}
                onChange={(e) => setComps((arr) => arr.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)))}
              />
              <Input
                aria-label={`Жишиг ${i + 1} үнэ`}
                placeholder="Үнэ"
                type="number"
                inputMode="numeric"
                value={c.price || ""}
                onChange={(e) =>
                  setComps((arr) => arr.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) || 0 } : x)))
                }
              />
              <Input
                aria-label={`Жишиг ${i + 1} талбай`}
                placeholder="м²"
                type="number"
                inputMode="decimal"
                value={c.area_m2 ?? ""}
                onChange={(e) =>
                  setComps((arr) =>
                    arr.map((x, j) => (j === i ? { ...x, area_m2: e.target.value ? Number(e.target.value) : null } : x))
                  )
                }
              />
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setComps((arr) => [...arr, blankComp()])}>
            + Жишиг нэмэх
          </Button>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Доод (₮)" htmlFor="pa-min">
              <Input id="pa-min" type="number" inputMode="numeric" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
            </Field>
            <Field label="Санал болгох (₮)" htmlFor="pa-rec">
              <Input id="pa-rec" type="number" inputMode="numeric" value={recommended} onChange={(e) => setRecommended(e.target.value)} />
            </Field>
            <Field label="Дээд (₮)" htmlFor="pa-max">
              <Input id="pa-max" type="number" inputMode="numeric" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
            </Field>
          </div>
          <Field label="Тайлбар" htmlFor="pa-note">
            <Input id="pa-note" value={analysisNote} onChange={(e) => setAnalysisNote(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </Modal>

      {/* Хэлцлийн хавтас нээх */}
      <Modal
        open={txnOpen}
        onClose={() => setTxnOpen(false)}
        title="Хэлцлийн хавтас нээх"
        footer={
          <>
            <Button variant="outline" onClick={() => setTxnOpen(false)}>
              Болих
            </Button>
            <Button disabled={pending} onClick={submitTxn}>
              Нээх
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Үл хөдлөх: <span className="font-medium text-ink">{opp.property ? `${opp.property.name} ${opp.property.number}` : "—"}</span>
          </p>
          <Field label="Хэлцлийн төрөл" htmlFor="txn-type">
            <Select id="txn-type" value={txnType} onChange={(e) => setTxnType(e.target.value as TxnType)}>
              {TXN_TYPES.filter((t) => t !== "replacement").map((t) => (
                <option key={t} value={t}>
                  {TXN_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Хэлцлийн дүн (₮)" htmlFor="txn-amount">
            <Input id="txn-amount" type="number" inputMode="numeric" min="0" value={txnAmount} onChange={(e) => setTxnAmount(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </Modal>

      {/* Урсгал шилжүүлэх */}
      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Урсгал хооронд шилжүүлэх"
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
              {PL_CODES.filter((c) => c !== opp.pipeline.code && c !== "PL-6").map((c) => (
                <option key={c} value={c}>
                  {PL_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Шалтгаан (заавал)" htmlFor="transfer-reason" hint="Түүх хадгалагдаж, шинэ урсгалын тохирох шатанд орно">
            <Input id="transfer-reason" value={transferReason} onChange={(e) => setTransferReason(e.target.value)} />
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
            <Select id="reassign-reason" value={reassignReason} onChange={(e) => setReassignReason(e.target.value)}>
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
