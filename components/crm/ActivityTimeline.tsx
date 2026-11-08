"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, MessageCircle, Mail, Users, Eye, ClipboardList, History, PhoneOff, Building2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { recordShowingFeedback } from "@/lib/actions/crm-activities";
import { ACTIVITY_CHANNEL_LABEL, ACTIVITY_OUTCOME_LABEL, type CrmActivityChannel } from "@/lib/constants-crm";
import {
  ACTIVITY_PURPOSE_LABEL,
  ACTIVITY_ATTITUDE_LABEL,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABEL,
  type ActivityPurpose,
  type ActivityAttitude,
  type FeedbackCategory,
} from "@/components/crm/ActivityComposer";
import {
  INTERESTED_NEXT_STEPS,
  MEETING_PARTY_LABEL,
  NEXT_STEP_LABEL,
  SHOWING_INTERESTS,
  SHOWING_INTEREST_LABEL,
  ubToday,
  type MeetingParty,
  type NextStepCode,
  type ShowingInterest,
} from "@/lib/crm/agent-core";
import { fmtDateTime, fmtDate } from "@/lib/format";
import type { ActivityTimelineRow } from "@/lib/queries-crm-leads";

/**
 * Үйл ажиллагааны түүх (§6.11): холбогдож чадаагүй, нөхөж бүртгэсэн,
 * ярилцсан үл хөдлөх, дараагийн үйлдэл (цагтай), үзлэгийн дүн, эргэх
 * холбоо. Эргэх холбоо дутуу үзлэгт бүртгэх товч (§6.15).
 */

const CHANNEL_ICON: Record<CrmActivityChannel, typeof Phone> = {
  call: Phone,
  chat: MessageCircle,
  email: Mail,
  meeting: Users,
  showing: Eye,
  task: ClipboardList,
};

function ubClock(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 8 * 3600000);
  return d.toISOString().slice(11, 16);
}

export function ActivityTimeline({
  rows,
  currentProfileId,
  emptyAction,
}: {
  rows: ActivityTimelineRow[];
  currentProfileId: string;
  emptyAction?: { label: string; onClick: () => void };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedbackFor, setFeedbackFor] = useState<ActivityTimelineRow | null>(null);
  const [category, setCategory] = useState<FeedbackCategory | "">("");
  const [interest, setInterest] = useState<ShowingInterest | "">("");
  const [nextCode, setNextCode] = useState<NextStepCode | "">("");
  const [nextDate, setNextDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function openFeedback(r: ActivityTimelineRow) {
    setFeedbackFor(r);
    setCategory("");
    setInterest("");
    setNextCode("");
    setNextDate("");
    setNote("");
    setError(null);
  }

  function submitFeedback() {
    if (!feedbackFor) return;
    if (!category) {
      setError("Эргэх холбооны ангиллыг сонгоно уу.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await recordShowingFeedback({
        activityId: feedbackFor.id,
        category,
        note: note.trim() || undefined,
        interest: interest || null,
        nextStepCode: nextCode || null,
        nextStepDate: nextDate || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setFeedbackFor(null);
      toast.success("Эргэх холбоо бүртгэгдлээ");
      if (res.profileHint) {
        toast.info("Тохироогүй гэсэн тул хэрэгцээний профайлыг шинэчилнэ үү");
      }
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={History}
        compact
        title="Үйл ажиллагаа бүртгэгдээгүй"
        description="Холболт бүрийн үр дүн, дараагийн үйлдлийг энд бүртгэнэ."
        action={emptyAction}
      />
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const failed = r.reached === false;
        const Icon = failed ? PhoneOff : (CHANNEL_ICON[r.channel] ?? Phone);
        const outcome = ACTIVITY_OUTCOME_LABEL[r.outcome];
        const needsFeedback = r.channel === "showing" && !r.feedback_category && r.owner_id === currentProfileId;
        const nextLabel = r.next_step ?? (r.next_step_code ? NEXT_STEP_LABEL[r.next_step_code as NextStepCode] : null);
        return (
          <div key={r.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Icon className={failed ? "size-4 text-amber-600" : "size-4 text-brand-600"} />
              <span className="text-sm font-semibold text-ink">{ACTIVITY_CHANNEL_LABEL[r.channel]}</span>
              <span className="text-xs text-muted">{ACTIVITY_PURPOSE_LABEL[r.purpose as ActivityPurpose] ?? ""}</span>
              {failed ? <Badge tone="amber">Холбогдож чадаагүй</Badge> : <Badge tone={outcome.tone}>{outcome.label}</Badge>}
              {r.backdated ? <Badge tone="amber">Нөхөж бүртгэсэн</Badge> : null}
              {r.showing_interest ? (
                <Badge tone={r.showing_interest === "interested" ? "green" : r.showing_interest === "not_fit" ? "rose" : "neutral"}>
                  {SHOWING_INTEREST_LABEL[r.showing_interest as ShowingInterest] ?? ""}
                </Badge>
              ) : null}
              {r.feedback_category ? (
                <Badge tone="blue">
                  Эргэх холбоо: {FEEDBACK_CATEGORY_LABEL[r.feedback_category as FeedbackCategory] ?? ""}
                </Badge>
              ) : null}
              <span className="ml-auto text-xs text-subtle">{fmtDateTime(r.occurred_at)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{r.summary}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              {r.attitude ? (
                <span>Хандлага: {ACTIVITY_ATTITUDE_LABEL[r.attitude as ActivityAttitude] ?? ""}</span>
              ) : null}
              {r.meeting_party ? <span>Уулзсан: {MEETING_PARTY_LABEL[r.meeting_party as MeetingParty] ?? ""}</span> : null}
              {r.objection_label ? <span>Эсэргүүцэл: {r.objection_label}</span> : null}
              {r.new_info ? <span className="text-amber-700">Шинэ мэдээлэл: {r.new_info}</span> : null}
              {nextLabel ? (
                <span>
                  Дараагийн үйлдэл: {nextLabel}
                  {r.next_step_date ? ` (${fmtDate(r.next_step_date)}${r.next_step_at ? ` ${ubClock(r.next_step_at)}` : ""})` : ""}
                </span>
              ) : null}
              {r.owner_name ? <span>Бүртгэсэн: {r.owner_name}</span> : null}
            </div>
            {r.properties && r.properties.length ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <Building2 className="size-3.5 text-subtle" />
                {r.properties.map((p) => (
                  <span key={p.id} className="rounded-full border border-line px-2 py-0.5 font-mono text-muted" title={p.name ?? undefined}>
                    {p.number}
                  </span>
                ))}
              </div>
            ) : null}
            {needsFeedback ? (
              <div className="mt-3">
                <Button size="sm" variant="secondary" onClick={() => openFeedback(r)}>
                  <Eye className="size-4" /> Эргэх холбоо бүртгэх
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}

      <Modal
        open={feedbackFor !== null}
        onClose={() => setFeedbackFor(null)}
        title="Үзлэгийн эргэх холбоо"
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
          <Field label="Үзлэгийн дүн" htmlFor="fb-int">
            <Select id="fb-int" value={interest} onChange={(e) => setInterest(e.target.value as ShowingInterest | "")}>
              <option value="">— Сонгох —</option>
              {SHOWING_INTERESTS.map((i) => (
                <option key={i} value={i}>
                  {SHOWING_INTEREST_LABEL[i]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Эргэх холбооны ангилал" htmlFor="fb-cat">
            <Select id="fb-cat" value={category} onChange={(e) => setCategory(e.target.value as FeedbackCategory | "")}>
              <option value="">— Сонгох —</option>
              {FEEDBACK_CATEGORIES.map((f) => (
                <option key={f} value={f}>
                  {FEEDBACK_CATEGORY_LABEL[f]}
                </option>
              ))}
            </Select>
          </Field>
          {interest === "interested" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Дараагийн үйлдэл (заавал)" htmlFor="fb-next">
                <Select id="fb-next" value={nextCode} onChange={(e) => setNextCode(e.target.value as NextStepCode | "")}>
                  <option value="">— Сонгох —</option>
                  {INTERESTED_NEXT_STEPS.map((c) => (
                    <option key={c} value={c}>
                      {NEXT_STEP_LABEL[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Огноо (заавал)" htmlFor="fb-date">
                <Input id="fb-date" type="date" min={ubToday()} value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
              </Field>
            </div>
          ) : null}
          {interest === "not_fit" ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Тохироогүй бол шалтгааныг бичээд хэрэгцээний профайлыг шинэчилнэ — дараагийн тохируулга сайжирна.
            </p>
          ) : null}
          <Field label="Тэмдэглэл" htmlFor="fb-note">
            <Input id="fb-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Харилцагчийн хэлсэн гол зүйл" />
          </Field>
          {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
