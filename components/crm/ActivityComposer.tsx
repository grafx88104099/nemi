"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { logActivity, type LogActivityInput } from "@/lib/actions/crm-activities";
import {
  ACTIVITY_CHANNELS,
  ACTIVITY_CHANNEL_LABEL,
  ACTIVITY_OUTCOMES,
  ACTIVITY_OUTCOME_LABEL,
  type CrmActivityChannel,
  type ActivityOutcome,
} from "@/lib/constants-crm";

/**
 * Үйл ажиллагааны түргэн бүртгэл (F-300–312, 4.5.1 толь). Идэвхтэй сэжимд
 * дараагийн алхам + огноо заавал (F-302 — UI шатанд шаардаж, DB давхар сахина).
 * Гурвалсан холбоос (contact/opportunity/lead/property) prop-оор ирнэ (F-309).
 */

// 4.5.1 хаалттай толь — DB CHECK-тэй ЯГ таарна (lib/actions/crm-activities.ts-тэй ижил).
export const ACTIVITY_PURPOSES = ["screening", "follow_up", "offer", "negotiation", "service", "other"] as const;
export type ActivityPurpose = (typeof ACTIVITY_PURPOSES)[number];
export const ACTIVITY_PURPOSE_LABEL: Record<ActivityPurpose, string> = {
  screening: "Шалгаруулалт",
  follow_up: "Эргэн холбогдолт",
  offer: "Үнийн санал",
  negotiation: "Хэлэлцээр",
  service: "Үйлчилгээ",
  other: "Бусад",
};

export const ACTIVITY_ATTITUDES = ["positive", "neutral", "objection", "not_ready"] as const;
export type ActivityAttitude = (typeof ACTIVITY_ATTITUDES)[number];
export const ACTIVITY_ATTITUDE_LABEL: Record<ActivityAttitude, string> = {
  positive: "Эерэг",
  neutral: "Төвийг сахисан",
  objection: "Эсэргүүцэлтэй",
  not_ready: "Бэлэн биш",
};

export const FEEDBACK_CATEGORIES = ["price", "location", "layout", "condition", "financing", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export const FEEDBACK_CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  price: "Үнэ",
  location: "Байршил",
  layout: "Зохион байгуулалт",
  condition: "Нөхцөл байдал",
  financing: "Санхүүжилт",
  other: "Бусад",
};

function localNowValue(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function ActivityComposer({
  contactId,
  opportunityId,
  leadId,
  propertyId,
  leadActive = false,
  objections,
}: {
  contactId: string;
  opportunityId?: string | null;
  leadId?: string | null;
  propertyId?: string | null;
  /** Идэвхтэй сэжимтэй холбоотой — дараагийн алхам заавал (F-302). */
  leadActive?: boolean;
  objections: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<CrmActivityChannel>("call");
  const [purpose, setPurpose] = useState<ActivityPurpose>("follow_up");
  const [summary, setSummary] = useState("");
  const [attitude, setAttitude] = useState<ActivityAttitude | "">("");
  const [objectionId, setObjectionId] = useState("");
  const [outcome, setOutcome] = useState<ActivityOutcome>("open");
  const [newInfo, setNewInfo] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [nextStepDate, setNextStepDate] = useState("");
  const [occurredAt, setOccurredAt] = useState(localNowValue());
  const [feedback, setFeedback] = useState<FeedbackCategory | "">("");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const nextStepRequired = leadActive;

  function submit() {
    setError(null);
    setHint(null);
    if (summary.trim().length < 5) {
      setError("Хураангуйгаа 2–5 өгүүлбэрээр бичнэ үү.");
      return;
    }
    if (nextStepRequired && (!nextStep.trim() || !nextStepDate)) {
      setError("Идэвхтэй сэжимд дараагийн алхам + огноо заавал (F-302).");
      return;
    }
    const input: LogActivityInput = {
      contactId,
      opportunityId: opportunityId ?? null,
      leadId: leadId ?? null,
      propertyId: propertyId ?? null,
      channel,
      purpose,
      summary: summary.trim(),
      attitude: attitude || null,
      newInfo: newInfo.trim() || null,
      objectionId: objectionId || null,
      outcome,
      nextStep: nextStep.trim() || null,
      nextStepDate: nextStepDate || null,
      occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
      feedbackCategory: channel === "showing" && feedback ? feedback : null,
    };
    startTransition(async () => {
      const res = await logActivity(input);
      if (res.error) {
        setError(res.error);
        return;
      }
      setSummary("");
      setNewInfo("");
      setNextStep("");
      setNextStepDate("");
      setAttitude("");
      setObjectionId("");
      setFeedback("");
      setOccurredAt(localNowValue());
      if (res.profileHint) {
        setHint("Шинэ мэдээлэл тэмдэглэгдлээ — хэрэгцээний профайлыг шинэчлэхээ мартуузай (F-311).");
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Үйл ажиллагаа бүртгэх</h3>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Суваг" htmlFor="act-channel">
            <Select
              id="act-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as CrmActivityChannel)}
            >
              {ACTIVITY_CHANNELS.map((ch) => (
                <option key={ch} value={ch}>
                  {ACTIVITY_CHANNEL_LABEL[ch]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Зорилго" htmlFor="act-purpose">
            <Select id="act-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as ActivityPurpose)}>
              {ACTIVITY_PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {ACTIVITY_PURPOSE_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Болсон огноо" htmlFor="act-occurred" hint="Өнгөрсөн огноо = backdated (F-307)">
            <Input
              id="act-occurred"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Хураангуй" htmlFor="act-summary">
          <textarea
            id="act-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            placeholder="2–5 өгүүлбэрээр…"
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Хандлага" htmlFor="act-attitude">
            <Select
              id="act-attitude"
              value={attitude}
              onChange={(e) => setAttitude(e.target.value as ActivityAttitude | "")}
            >
              <option value="">— Сонгоогүй —</option>
              {ACTIVITY_ATTITUDES.map((a) => (
                <option key={a} value={a}>
                  {ACTIVITY_ATTITUDE_LABEL[a]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Эсэргүүцэл" htmlFor="act-objection">
            <Select id="act-objection" value={objectionId} onChange={(e) => setObjectionId(e.target.value)}>
              <option value="">— Үгүй —</option>
              {objections.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Үр дүн" htmlFor="act-outcome">
            <Select id="act-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as ActivityOutcome)}>
              {ACTIVITY_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {ACTIVITY_OUTCOME_LABEL[o].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {channel === "showing" ? (
          <Field label="Үзлэгийн санал (F-310)" htmlFor="act-feedback" hint="Хоосон үлдээвэл 24 цагийн саналын даалгавар автомат үүснэ (Д-05)">
            <Select
              id="act-feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value as FeedbackCategory | "")}
            >
              <option value="">— Дараа бүртгэнэ —</option>
              {FEEDBACK_CATEGORIES.map((f) => (
                <option key={f} value={f}>
                  {FEEDBACK_CATEGORY_LABEL[f]}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Шинэ мэдээлэл" htmlFor="act-newinfo" hint="Төсөв/хугацаа/хэрэгцээ өөрчлөгдвөл — профайл шинэчлэх сануулга (F-311)">
          <Input
            id="act-newinfo"
            value={newInfo}
            onChange={(e) => setNewInfo(e.target.value)}
            placeholder="Жишээ: төсөв 250 сая болж өссөн"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={nextStepRequired ? "Дараагийн алхам (заавал)" : "Дараагийн алхам"} htmlFor="act-next">
            <Input
              id="act-next"
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              placeholder="Залгах / сонголт илгээх / үзлэг…"
            />
          </Field>
          <Field label={nextStepRequired ? "Алхмын огноо (заавал)" : "Алхмын огноо"} htmlFor="act-next-date">
            <Input
              id="act-next-date"
              type="date"
              value={nextStepDate}
              onChange={(e) => setNextStepDate(e.target.value)}
            />
          </Field>
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {hint ? <p className="text-sm text-amber-700">{hint}</p> : null}

        <div className="flex justify-end">
          <Button onClick={submit} disabled={pending} size="sm">
            <Plus className="size-4" /> Бүртгэх
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
