"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Undo2 } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { decideWeeklyPlan, decideWeeklyReview } from "@/lib/actions/crm-weekly";

const textareaCls =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

/**
 * Багийн ахлагчийн батлалт (§5 RACI: A). Карт (§6.21) эсвэл Баасан гарагийн
 * дүн шинжилгээ (§6.24) — дүн шинжилгээнд дадлагажуулалтын хэрэгцээ, дараагийн
 * уулзалтыг (§9.6) тэмдэглэнэ.
 */
export function ApprovalPanel({
  planId,
  kind,
  status,
  existingCoaching,
}: {
  planId: string;
  kind: "plan" | "review";
  status: string;
  existingCoaching?: { need: string | null; at: string | null } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [coachingNeed, setCoachingNeed] = useState(existingCoaching?.need ?? "");
  const [coachingAt, setCoachingAt] = useState("");

  const canApprove = status === "submitted";
  const canReturn = status === "submitted" || status === "approved";
  if (!canApprove && !canReturn) {
    return (
      <p className="text-sm text-muted">
        {kind === "plan" ? "Агент картаа илгээсний дараа батална." : "Агент дүн шинжилгээгээ илгээсний дараа батална."}
      </p>
    );
  }

  function decide(decision: "approve" | "return") {
    if (decision === "return" && note.trim().length < 5) {
      toast.error("Буцаах шалтгааныг бичнэ үү.");
      return;
    }
    start(async () => {
      const r =
        kind === "plan"
          ? await decideWeeklyPlan(planId, { decision, note: note.trim() || null })
          : await decideWeeklyReview(planId, {
              decision,
              note: note.trim() || null,
              coachingNeed: coachingNeed.trim() || null,
              coachingAt: coachingAt ? new Date(coachingAt).toISOString() : null,
            });
      if (!r.ok) {
        toast.error(r.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success(decision === "approve" ? "Баталлаа." : "Засуулахаар буцаалаа.");
      setNote("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">{kind === "plan" ? "Картыг батлах" : "Дүн шинжилгээг батлах"}</h3>
        {kind === "review" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_14rem]">
            <Field label="Дадлагажуулалтын хэрэгцээ" htmlFor={`coach-${planId}`} hint="Бичвэл уулзалтын даалгавар үүсч, агентад мэдэгдэнэ.">
              <textarea
                id={`coach-${planId}`}
                rows={2}
                className={textareaCls}
                value={coachingNeed}
                onChange={(e) => setCoachingNeed(e.target.value)}
              />
            </Field>
            <Field label="Дараагийн уулзалт" htmlFor={`coach-at-${planId}`}>
              <Input
                id={`coach-at-${planId}`}
                type="datetime-local"
                value={coachingAt}
                onChange={(e) => setCoachingAt(e.target.value)}
              />
            </Field>
          </div>
        ) : null}
        <Field label="Тайлбар (буцаахад заавал)" htmlFor={`note-${planId}-${kind}`}>
          <textarea
            id={`note-${planId}-${kind}`}
            rows={2}
            className={textareaCls}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          {canApprove ? (
            <Button type="button" disabled={pending} onClick={() => decide("approve")}>
              <CheckCircle2 className="size-4" /> Батлах
            </Button>
          ) : null}
          {canReturn ? (
            <Button type="button" variant="outline" disabled={pending} onClick={() => decide("return")}>
              <Undo2 className="size-4" /> Засуулахаар буцаах
            </Button>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
