"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareHeart, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/input";
import { sendNps, recordNpsAnswer } from "@/lib/actions/crm-post-sale";

/**
 * NPS самбар (F-751, P-09) — хэлцэл/харилцагчийн картад залгагдана.
 * Оноо 0–10; ≤6 → гомдол автомат, ≥9 → рефералын даалгавар (action талд).
 */

export type NpsSurveyRow = {
  id: string;
  transaction_id: string;
  contact_id: string;
  contact_name?: string | null;
  txn_number?: string | null;
  sent_at: string | null;
  score: number | null;
  comment: string | null;
  answered_at: string | null;
};

function npsTone(score: number): "green" | "amber" | "rose" {
  if (score >= 9) return "green";
  if (score >= 7) return "amber";
  return "rose";
}

function npsGroupLabel(score: number): string {
  if (score >= 9) return "Дэмжигч";
  if (score >= 7) return "Төвийг сахисан";
  return "Шүүмжлэгч";
}

export function NpsPanel({
  surveys,
  txnId,
  canSend = true,
}: {
  surveys: NpsSurveyRow[];
  /** Өгөгдвөл «NPS илгээх» товч энэ хэлцэлд ажиллана. */
  txnId?: string;
  canSend?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [answerFor, setAnswerFor] = useState<NpsSurveyRow | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");

  const answered = surveys.filter((s) => s.score != null);
  const promoters = answered.filter((s) => (s.score ?? 0) >= 9).length;
  const detractors = answered.filter((s) => (s.score ?? 0) <= 6).length;
  const nps = answered.length ? Math.round(((promoters - detractors) / answered.length) * 100) : null;

  function doSend() {
    if (!txnId) return;
    setError(null);
    startTransition(async () => {
      const res = await sendNps(txnId);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      router.refresh();
    });
  }

  function submitAnswer() {
    if (!answerFor || score == null) return;
    setError(null);
    startTransition(async () => {
      const res = await recordNpsAnswer({
        surveyId: answerFor.id,
        score,
        comment: comment.trim() || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setAnswerFor(null);
      setScore(null);
      setComment("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquareHeart className="size-4 text-brand-600" />
          <span className="text-sm font-semibold text-ink">NPS асуулга</span>
          {nps != null && (
            <Badge tone={nps >= 30 ? "green" : nps >= 0 ? "amber" : "rose"}>NPS {nps}</Badge>
          )}
        </div>
        {txnId && canSend && (
          <Button variant="outline" size="sm" onClick={doSend} disabled={pending}>
            <Send className="size-4" />
            NPS илгээх
          </Button>
        )}
      </div>

      {surveys.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          NPS асуулга илгээгдээгүй — хаалтаас хойш тохиргоот хугацаанд автомат илгээгдэнэ (F-751).
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {surveys.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              {s.score != null ? (
                <Badge tone={npsTone(s.score)}>
                  {s.score}/10 · {npsGroupLabel(s.score)}
                </Badge>
              ) : (
                <Badge tone="neutral">Хариу хүлээгдэж буй</Badge>
              )}
              <span className="text-sm text-ink">{s.contact_name ?? s.contact_id}</span>
              {s.txn_number && <span className="text-xs text-subtle">{s.txn_number}</span>}
              {s.comment && <span className="w-full text-sm text-muted">«{s.comment}»</span>}
              <span className="ml-auto text-xs text-subtle">
                {s.answered_at
                  ? `Хариулсан: ${new Date(s.answered_at).toLocaleDateString("mn-MN")}`
                  : s.sent_at
                    ? `Илгээсэн: ${new Date(s.sent_at).toLocaleDateString("mn-MN")}`
                    : ""}
              </span>
              {s.score == null && (
                <Button size="sm" variant="secondary" onClick={() => setAnswerFor(s)}>
                  Хариу бүртгэх
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && !answerFor && <p className="text-sm text-danger">{error}</p>}

      <Modal
        open={!!answerFor}
        onClose={() => setAnswerFor(null)}
        title="NPS хариу бүртгэх"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAnswerFor(null)}>
              Болих
            </Button>
            <Button onClick={submitAnswer} disabled={pending || score == null}>
              {pending ? "Хадгалж байна…" : "Бүртгэх"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Оноо (0–10)" hint="0–6 — гомдол автоматаар нээгдэнэ; 9–10 — рефералын даалгавар үүснэ.">
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setScore(i)}
                  className={
                    "h-9 w-9 rounded-lg border text-sm font-semibold transition " +
                    (score === i
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-line bg-surface text-ink hover:border-brand-300")
                  }
                >
                  {i}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Сэтгэгдэл (заавал биш)">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="Харилцагчийн сэтгэгдэл…"
            />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
