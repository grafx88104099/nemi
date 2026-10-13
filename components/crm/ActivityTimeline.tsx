"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Phone,
  MessageCircle,
  Mail,
  Users,
  Eye,
  ClipboardList,
  History,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { recordShowingFeedback } from "@/lib/actions/crm-activities";
import {
  ACTIVITY_CHANNEL_LABEL,
  ACTIVITY_OUTCOME_LABEL,
  type CrmActivityChannel,
} from "@/lib/constants-crm";
import {
  ACTIVITY_PURPOSE_LABEL,
  ACTIVITY_ATTITUDE_LABEL,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABEL,
  type ActivityPurpose,
  type ActivityAttitude,
  type FeedbackCategory,
} from "@/components/crm/ActivityComposer";
import { fmtDateTime, fmtDate } from "@/lib/format";
import type { ActivityRow } from "@/lib/queries-crm-pipeline";

/**
 * Үйл ажиллагааны түүх (F-309: гурвалсан холбоос — 3 талаас нэг харагдац).
 * Backdated тугтай (F-307); санал дутуу үзлэгт хурдан бүртгэлийн товч (F-310).
 */

const CHANNEL_ICON: Record<CrmActivityChannel, typeof Phone> = {
  call: Phone,
  chat: MessageCircle,
  email: Mail,
  meeting: Users,
  showing: Eye,
  task: ClipboardList,
};

export function ActivityTimeline({
  rows,
  currentProfileId,
}: {
  rows: ActivityRow[];
  currentProfileId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedbackFor, setFeedbackFor] = useState<ActivityRow | null>(null);
  const [category, setCategory] = useState<FeedbackCategory>("price");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submitFeedback() {
    if (!feedbackFor) return;
    setError(null);
    startTransition(async () => {
      const res = await recordShowingFeedback(feedbackFor.id, category, note.trim() || undefined);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setFeedbackFor(null);
      setNote("");
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
        <History className="mx-auto mb-2 size-5 text-subtle" />
        Үйл ажиллагааны бүртгэл алга — эхний холболтоо бүртгэнэ үү.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const Icon = CHANNEL_ICON[r.channel] ?? Phone;
        const outcome = ACTIVITY_OUTCOME_LABEL[r.outcome];
        const needsFeedback =
          r.channel === "showing" && !r.feedback_category && r.owner_id === currentProfileId;
        return (
          <div key={r.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Icon className="size-4 text-brand-600" />
              <span className="text-sm font-semibold text-ink">{ACTIVITY_CHANNEL_LABEL[r.channel]}</span>
              <span className="text-xs text-muted">
                {ACTIVITY_PURPOSE_LABEL[r.purpose as ActivityPurpose] ?? r.purpose}
              </span>
              <Badge tone={outcome.tone}>{outcome.label}</Badge>
              {r.backdated ? <Badge tone="amber">Нөхөж бүртгэсэн</Badge> : null}
              {r.feedback_category ? (
                <Badge tone="blue">
                  Санал: {FEEDBACK_CATEGORY_LABEL[r.feedback_category as FeedbackCategory] ?? r.feedback_category}
                </Badge>
              ) : null}
              <span className="ml-auto text-xs text-subtle">{fmtDateTime(r.occurred_at)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{r.summary}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              {r.attitude ? (
                <span>Хандлага: {ACTIVITY_ATTITUDE_LABEL[r.attitude as ActivityAttitude] ?? r.attitude}</span>
              ) : null}
              {r.objection_label ? <span>Эсэргүүцэл: {r.objection_label}</span> : null}
              {r.new_info ? <span className="text-amber-700">Шинэ мэдээлэл: {r.new_info}</span> : null}
              {r.next_step ? (
                <span>
                  Дараагийн алхам: {r.next_step}
                  {r.next_step_date ? ` (${fmtDate(r.next_step_date)})` : ""}
                </span>
              ) : null}
              {r.owner_name ? <span>Бүртгэсэн: {r.owner_name}</span> : null}
            </div>
            {needsFeedback ? (
              <div className="mt-3">
                <Button size="sm" variant="secondary" onClick={() => setFeedbackFor(r)}>
                  <Eye className="size-4" /> Үзлэгийн санал бүртгэх (24ц)
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}

      <Modal
        open={feedbackFor !== null}
        onClose={() => setFeedbackFor(null)}
        title="Үзлэгийн санал (F-310)"
        footer={
          <>
            <Button variant="outline" onClick={() => setFeedbackFor(null)}>
              Болих
            </Button>
            <Button onClick={submitFeedback} disabled={pending}>
              Хадгалах
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Ангилал" htmlFor="fb-cat">
            <Select id="fb-cat" value={category} onChange={(e) => setCategory(e.target.value as FeedbackCategory)}>
              {FEEDBACK_CATEGORIES.map((f) => (
                <option key={f} value={f}>
                  {FEEDBACK_CATEGORY_LABEL[f]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Тэмдэглэл" htmlFor="fb-note">
            <Input id="fb-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Сонголтоор" />
          </Field>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
