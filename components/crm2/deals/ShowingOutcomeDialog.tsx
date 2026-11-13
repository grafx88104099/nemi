"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { setShowingOutcome } from "@/lib/crm2/actions/activities";
import { setDealStage } from "@/lib/crm2/actions/deals";
import { isoToUbInput } from "@/lib/crm2/datetime";
import { fmtDateTime } from "@/lib/format";
import type { Crm2ShowingStatus } from "@/lib/crm2/types";
import { cn } from "@/lib/utils";
import { defaultShownAt } from "@/components/crm2/staff/card/logic";

const TEXTAREA =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

type Outcome = "shown" | "cancelled" | "no_show";
type Next = "none" | "reshow" | "negotiating" | "confirmed" | "cancel";

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: "shown", label: "Үзүүлсэн" },
  { value: "cancelled", label: "Цуцалсан" },
  { value: "no_show", label: "Ирээгүй" },
];

const NEXT_SHOWN: { value: Next; label: string; hint: string }[] = [
  { value: "none", label: "Одоохондоо шийдээгүй", hint: "Шат «Үзүүлсэн» хэвээр" },
  { value: "reshow", label: "Дахин үзэх", hint: "Хадгалсны дараа дараагийн үзүүлэлтийг товлоно" },
  { value: "negotiating", label: "Хэлэлцэх", hint: "Үргэлжлүүлэх" },
  { value: "confirmed", label: "Баталгаажсан", hint: "Харилцагч сонгосон" },
  { value: "cancel", label: "Цуцлагдсан", hint: "Энэ хэлцлийг цуцлах (шалтгаантай)" },
];

export type OutcomeActivity = {
  id: string;
  deal_id: string;
  deal_code: string | null;
  scheduled_at: string | null;
  contact_name: string;
  agent_name: string | null;
  /** «correct» горимд: одоогийн эцсийн үр дүн ба утгууд (маягтыг бөглөнө). */
  showing_status?: Crm2ShowingStatus | null;
  occurred_at?: string | null;
  feedback?: string | null;
  result?: string | null;
  note?: string | null;
};

type Mode = "record" | "correct";

/**
 * S05 — товлосон үзүүлэлтийн бодит үр дүн (кадр 04): Үзүүлсэн / Цуцалсан / Ирээгүй.
 * «Үзүүлсэн» бол бодит огноо, цаг ба санал хүсэлт заавал. Дараа нь хэлцлийн
 * дараагийн алхам (дахин үзэх, хэлэлцэх, баталгаажсан, цуцлах).
 * mode="correct" — эцсийн үр дүнг засах (ахлагч/менежер; DB шалгана): одоогийн утгаар
 * бөглөж, хэлцлийн шат өөрчлөхгүй.
 */
export function ShowingOutcomeDialog({
  open,
  onClose,
  activity,
  requireFeedback,
  canSetStage,
  onRequestCancelDeal,
  onRequestReschedule,
  mode = "record",
}: {
  open: boolean;
  onClose: () => void;
  activity: OutcomeActivity;
  mode?: Mode;
  requireFeedback: boolean;
  /** Хэлцлийн шат өөрчлөх эрхтэй (хэлцлийн засварлагч). */
  canSetStage: boolean;
  /** «Цуцлагдсан» сонгоход — эцэг цуцлах цонх нээнэ. */
  onRequestCancelDeal?: () => void;
  /** «Дахин үзэх» хадгалагдсаны дараа — эцэг үзүүлэлт товлох цонх нээнэ. */
  onRequestReschedule?: () => void;
}) {
  if (!open) return null;
  return (
    <Inner
      onClose={onClose}
      activity={activity}
      requireFeedback={requireFeedback}
      canSetStage={canSetStage}
      onRequestCancelDeal={onRequestCancelDeal}
      onRequestReschedule={onRequestReschedule}
      mode={mode}
    />
  );
}

function initialOutcome(a: OutcomeActivity, mode: Mode): Outcome {
  const s = a.showing_status;
  return mode === "correct" && (s === "shown" || s === "cancelled" || s === "no_show") ? s : "shown";
}

function Inner({
  onClose,
  activity,
  requireFeedback,
  canSetStage,
  onRequestCancelDeal,
  onRequestReschedule,
  mode,
}: {
  onClose: () => void;
  activity: OutcomeActivity;
  requireFeedback: boolean;
  canSetStage: boolean;
  onRequestCancelDeal?: () => void;
  onRequestReschedule?: () => void;
  mode: Mode;
}) {
  const correcting = mode === "correct";
  // Засахдаа хэлцлийн шатыг хөндөхгүй.
  const stageStep = canSetStage && !correcting;
  const router = useRouter();
  const ids = React.useId();
  const [maxNow] = React.useState(() => isoToUbInput(Date.now()));
  const [outcome, setOutcome] = React.useState<Outcome>(() => initialOutcome(activity, mode));
  const [occurredAt, setOccurredAt] = React.useState(
    () => (correcting ? isoToUbInput(activity.occurred_at) : "") || defaultShownAt(activity.scheduled_at)
  );
  const [feedback, setFeedback] = React.useState(() => (correcting ? (activity.feedback ?? "") : ""));
  const [result, setResult] = React.useState(() => (correcting ? (activity.result ?? "") : ""));
  const [note, setNote] = React.useState(() => (correcting ? (activity.note ?? "") : ""));
  const [next, setNext] = React.useState<Next>("none");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const shown = outcome === "shown";
  const feedbackMissing = shown && requireFeedback && !feedback.trim();
  const nextOptions = shown ? NEXT_SHOWN : NEXT_SHOWN.filter((n) => n.value === "none" || n.value === "cancel");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (shown && !occurredAt) {
      setError("Бодитоор үзүүлсэн огноо, цагийг оруулна уу.");
      return;
    }
    if (feedbackMissing) {
      setError("Үзүүлсний дараах харилцагчийн санал хүсэлтийг бичнэ үү.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await setShowingOutcome({
        activity_id: activity.id,
        outcome,
        occurred_at: shown ? occurredAt : null,
        feedback: shown ? feedback : undefined,
        // Бүртгэхэд хоосон талбар товлосон үеийн тэмдэглэлийг дарж арилгахгүй; засахад харагдсан утгыг хадгална.
        result: correcting || result.trim() ? result : undefined,
        note: correcting || note.trim() ? note : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(
        correcting
          ? "Үзүүлэлтийн үр дүн засагдлаа"
          : outcome === "shown"
            ? "«Үзүүлсэн» гэж бүртгэлээ"
            : outcome === "no_show"
              ? "«Ирээгүй» гэж бүртгэлээ"
              : "Үзүүлэлт цуцлагдлаа"
      );
      let stageOk = true;
      if (stageStep && (next === "reshow" || next === "negotiating" || next === "confirmed")) {
        const st = await setDealStage(activity.deal_id, next, "Үзүүлэлтийн дараах алхам");
        stageOk = st.ok;
        if (!st.ok) toast.error(`Хэлцлийн шатыг өөрчилж чадсангүй: ${st.error}`);
      }
      router.refresh();
      onClose();
      if (stageStep && next === "cancel") onRequestCancelDeal?.();
      if (stageStep && next === "reshow" && stageOk) onRequestReschedule?.();
    } catch (err) {
      console.error("ShowingOutcomeDialog:", err);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open onClose={() => !pending && onClose()} title={correcting ? "Үзүүлэлтийн үр дүн засах" : "Үзүүлэлтийн үр дүн"} closeOnBackdrop={false}>
      {/* noValidate: max нь сонгогчийг л хязгаарлана; хоосон цаг/санал хүсэлтийг submit, ирээдүйн цагийг сервер монголоор шалгана. */}
      <form onSubmit={submit} noValidate className="space-y-4 p-4">
        <div className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm">
          <p className="font-medium text-ink">
            {activity.contact_name}
            {activity.deal_code ? <span className="ml-1.5 font-mono text-xs text-muted">{activity.deal_code}</span> : null}
          </p>
          <p className="text-xs text-muted">
            Товлосон: {activity.scheduled_at ? fmtDateTime(activity.scheduled_at) : "—"}
            {activity.agent_name ? ` · ${activity.agent_name}` : ""}
          </p>
        </div>

        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-ink">Үр дүн</legend>
          <div className="grid grid-cols-3 gap-2">
            {OUTCOMES.map((o) => (
              <label
                key={o.value}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40",
                  outcome === o.value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line text-ink hover:bg-surface-2"
                )}
              >
                <input
                  type="radio"
                  name={`${ids}-outcome`}
                  value={o.value}
                  checked={outcome === o.value}
                  onChange={() => {
                    setOutcome(o.value);
                    if (o.value !== "shown" && next !== "cancel") setNext("none");
                  }}
                  className="sr-only"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>

        {shown ? (
          <>
            <Field
              label="Бодитоор үзүүлсэн огноо, цаг"
              htmlFor={`${ids}-at`}
              hint="Товлосон цагийг автоматаар бодит гэж тооцохгүй — үзүүлсэн цагаа шалгана уу."
            >
              <Input
                id={`${ids}-at`}
                type="datetime-local"
                value={occurredAt}
                max={maxNow}
                onChange={(e) => setOccurredAt(e.target.value)}
                required
              />
            </Field>
            <Field label={requireFeedback ? "Харилцагчийн санал хүсэлт" : "Харилцагчийн санал хүсэлт (заавал биш)"} htmlFor={`${ids}-fb`}>
              <textarea
                id={`${ids}-fb`}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
                maxLength={4000}
                required={requireFeedback}
                placeholder="Байршил таалагдсан, үнийг бага зэрэг өндөр гэж үзсэн…"
                className={TEXTAREA}
              />
            </Field>
          </>
        ) : null}

        <Field label={outcome === "cancelled" ? "Цуцалсан шалтгаан (заавал биш)" : "Үр дүнгийн товч (заавал биш)"} htmlFor={`${ids}-res`}>
          <Input id={`${ids}-res`} value={result} onChange={(e) => setResult(e.target.value)} maxLength={2000} />
        </Field>
        {outcome !== "shown" || correcting ? (
          <Field label="Тэмдэглэл (заавал биш)" htmlFor={`${ids}-note`}>
            <textarea id={`${ids}-note`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={4000} className={TEXTAREA} />
          </Field>
        ) : null}

        {correcting ? (
          <p className="text-xs text-muted">Хэлцлийн шат өөрчлөгдөхгүй. Өмнөх үр дүн өөрчлөлтийн түүхэнд хадгалагдана.</p>
        ) : null}
        {stageStep ? (
          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-ink">Хэлцлийн дараагийн алхам</legend>
            <div className="space-y-1.5">
              {nextOptions.map((n) => (
                <label
                  key={n.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm transition",
                    next === n.value ? "border-brand-500 bg-brand-50" : "border-line hover:bg-surface-2"
                  )}
                >
                  <input
                    type="radio"
                    name={`${ids}-next`}
                    value={n.value}
                    checked={next === n.value}
                    onChange={() => setNext(n.value)}
                    className="mt-0.5 size-4 accent-brand-500"
                  />
                  <span>
                    <span className="font-medium text-ink">{n.label}</span>
                    <span className="block text-xs text-muted">{n.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Нэг хэлцэлд олон дуудлага, үзүүлэлт бүртгэгдэнэ; дахин үзүүлэх бол шинэ үзүүлэлт товлоно. Өмнөх түүх хадгалагдана.
        </p>

        {error ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Болих
          </Button>
          <Button type="submit" disabled={pending || (shown && !occurredAt) || feedbackMissing}>
            {pending ? "Түр хүлээнэ үү…" : "Хадгалах"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
