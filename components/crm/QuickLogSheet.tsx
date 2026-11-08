"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PhoneOff, PhoneCall, Send, CalendarCheck, Clock3, ListPlus } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { logActivity } from "@/lib/actions/crm-activities";
import {
  QUICK_OUTCOMES,
  QUICK_OUTCOME_LABEL,
  quickLogPayload,
  type QuickOutcome,
} from "@/lib/crm/agent-core";
import type { RecontactRanges } from "@/lib/crm/scoring";
import type { LeadGrade } from "@/lib/constants-crm";
import { fmtDate } from "@/lib/format";

/**
 * Дуудлагын дараах түргэн бүртгэл (R5, UX-13): «Үр дүн бүртгэх» → нэг
 * сонголт = хадгалагдана (2 товшилт). «Холбогдож чадаагүй» нь эхний
 * холболтын хугацааг зогсоохгүй, хоёр дахь оролдлогыг товлоно (§6.4).
 * Залгаад апп руу буцаж ирэхэд автоматаар нээгдэнэ.
 */

const ICON: Record<QuickOutcome, typeof PhoneOff> = {
  no_answer: PhoneOff,
  callback: PhoneCall,
  send_options: Send,
  showing_set: CalendarCheck,
  not_ready: Clock3,
};

const CALL_FLAG = "crm:pending-call";

/** Залгах товч дарагдсаныг тэмдэглэнэ (буцаж ирэхэд бүртгэлийн хуудас нээнэ). */
export function markCallStarted(targetId: string) {
  try {
    sessionStorage.setItem(CALL_FLAG, JSON.stringify({ id: targetId, at: Date.now() }));
  } catch {
    // sessionStorage хаалттай орчинд алгасна
  }
}

/** Дуудлагаас буцаж ирэхэд (хуудас дахин харагдахад) нэг удаа дуудна. */
export function useReturnFromCall(targetId: string, onReturn: () => void, maxAgeMin = 120) {
  const cb = useRef(onReturn);
  useEffect(() => {
    cb.current = onReturn;
  }, [onReturn]);
  useEffect(() => {
    function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const raw = sessionStorage.getItem(CALL_FLAG);
        if (!raw) return;
        const v = JSON.parse(raw) as { id: string; at: number };
        if (v.id !== targetId) return;
        sessionStorage.removeItem(CALL_FLAG);
        if (Date.now() - v.at <= maxAgeMin * 60000) cb.current();
      } catch {
        // алгасна
      }
    }
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [targetId, maxAgeMin]);
}

export function QuickLogSheet({
  open,
  onClose,
  contactId,
  leadId,
  opportunityId,
  grade,
  leadIsNew,
  retryHours,
  recontactRanges,
  onFull,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  leadId?: string | null;
  opportunityId?: string | null;
  grade?: LeadGrade | null;
  leadIsNew?: boolean;
  retryHours?: number;
  recontactRanges?: RecontactRanges;
  /** «Дэлгэрэнгүй бүртгэх» — бүтэн маягт нээнэ. */
  onFull?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<QuickOutcome | null>(null);

  function save(outcome: QuickOutcome) {
    const p = quickLogPayload(outcome, { grade, leadIsNew, retryHours, ranges: recontactRanges });
    setBusy(outcome);
    startTransition(async () => {
      const res = await logActivity({
        contactId,
        leadId: leadId ?? null,
        opportunityId: opportunityId ?? null,
        channel: p.channel,
        purpose: p.purpose,
        summary: p.summary,
        attitude: p.attitude,
        outcome: "open",
        reached: p.reached,
        nextStepCode: p.nextStepCode,
        nextStep: p.nextStep,
        nextStepDate: p.nextStepDate,
        occurredAt: new Date().toISOString(),
        quickLog: true,
      });
      setBusy(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${QUICK_OUTCOME_LABEL[outcome]} — бүртгэгдлээ`, {
        description: `Дараагийн үйлдэл: ${p.nextStep}, ${fmtDate(p.nextStepDate)}`,
      });
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Үр дүн бүртгэх">
      <div className="space-y-2">
        <p className="text-xs text-muted">Нэг сонголт хийхэд бүртгэгдэж, дараагийн үйлдэл автоматаар товлогдоно.</p>
        <div className="grid gap-2">
          {QUICK_OUTCOMES.map((o) => {
            const Icon = ICON[o];
            return (
              <button
                key={o}
                type="button"
                disabled={pending}
                onClick={() => save(o)}
                className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition disabled:opacity-60 ${
                  o === "no_answer"
                    ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    : "border-line bg-surface text-ink hover:bg-surface-2"
                }`}
              >
                <Icon className="size-5 shrink-0" />
                <span className="flex-1">{QUICK_OUTCOME_LABEL[o]}</span>
                {busy === o ? <span className="text-xs text-muted">Хадгалж байна…</span> : null}
              </button>
            );
          })}
        </div>
        {onFull ? (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              onClose();
              onFull();
            }}
          >
            <ListPlus className="size-4" /> Дэлгэрэнгүй бүртгэх (уулзалт, үзлэг, шинэ мэдээлэл)
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
