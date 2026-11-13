"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { updateActivity } from "@/lib/crm2/actions/activities";
import { isoToUbInput } from "@/lib/crm2/datetime";
import type { Crm2ActivityKind, Crm2ShowingStatus } from "@/lib/crm2/types";

import { activityEditFields, activityEditPatch, type StaffOption } from "./types";

const TEXTAREA =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export type EditableActivity = {
  id: string;
  kind: Crm2ActivityKind;
  showing_status: Crm2ShowingStatus | null;
  agent_id: string | null;
  agent_name: string | null;
  occurred_at: string | null;
  note: string | null;
  result: string | null;
  feedback: string | null;
};

/**
 * Бүртгэсэн дуудлага/үзүүлэлтийг засах: цаг, тэмдэглэл, үр дүн, санал хүсэлт, (ахлагч/менежерт)
 * гүйцэтгэгч. Агентын засах хугацаа (activity.edit_window_hours), ахлагч/менежерийн эрхийг DB шалгана.
 */
export function EditActivityDialog({
  open,
  onClose,
  activity,
  requireFeedback,
  agentOptions,
  me,
}: {
  open: boolean;
  onClose: () => void;
  activity: EditableActivity;
  requireFeedback: boolean;
  /** Гүйцэтгэгч сонгогч (менежер/ахлагч); бусдад null — гүйцэтгэгчийг солихгүй. */
  agentOptions: StaffOption[] | null;
  me: string | null;
}) {
  if (!open) return null;
  return <Inner onClose={onClose} activity={activity} requireFeedback={requireFeedback} agentOptions={agentOptions} me={me} />;
}

function Inner({
  onClose,
  activity,
  requireFeedback,
  agentOptions,
  me,
}: {
  onClose: () => void;
  activity: EditableActivity;
  requireFeedback: boolean;
  agentOptions: StaffOption[] | null;
  me: string | null;
}) {
  const router = useRouter();
  const ids = React.useId();
  const fields = activityEditFields(activity);
  const isCall = activity.kind === "call";
  const [occurredAt, setOccurredAt] = React.useState(() => isoToUbInput(activity.occurred_at));
  const [note, setNote] = React.useState(activity.note ?? "");
  const [result, setResult] = React.useState(activity.result ?? "");
  const [feedback, setFeedback] = React.useState(activity.feedback ?? "");
  const [agentId, setAgentId] = React.useState(activity.agent_id ?? "");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Одоогийн гүйцэтгэгч сонгогчид байхгүй бол (өөр багийн/идэвхгүй) жагсаалтад нэмж харуулна.
  const agentList = React.useMemo(() => {
    if (!agentOptions) return null;
    if (!activity.agent_id || agentOptions.some((s) => s.id === activity.agent_id)) return agentOptions;
    return [{ id: activity.agent_id, name: activity.agent_name ?? "Одоогийн гүйцэтгэгч", teamId: null }, ...agentOptions];
  }, [agentOptions, activity.agent_id, activity.agent_name]);

  const feedbackMissing = fields.feedback && requireFeedback && !feedback.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (feedbackMissing) {
      setError("Үзүүлсний дараах харилцагчийн санал хүсэлтийг бичнэ үү.");
      return;
    }
    const patch = activityEditPatch(activity, {
      occurredAt: fields.occurredAt ? occurredAt : undefined,
      note: fields.note ? note : undefined,
      result: fields.result ? result : undefined,
      feedback: fields.feedback ? feedback : undefined,
      agentId: agentList ? agentId : undefined,
    });
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await updateActivity({ activity_id: activity.id, ...patch });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(isCall ? "Дуудлага засагдлаа" : "Үзүүлэлт засагдлаа");
      router.refresh();
      onClose();
    } catch (err) {
      console.error("EditActivityDialog:", err);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open onClose={() => !pending && onClose()} title={isCall ? "Дуудлага засах" : "Үзүүлэлт засах"} closeOnBackdrop={false}>
      <form onSubmit={submit} className="space-y-4 p-4">
        {fields.occurredAt ? (
          <Field label={isCall ? "Дуудлагын огноо, цаг" : "Бодитоор үзүүлсэн огноо, цаг"} htmlFor={`${ids}-at`}>
            <Input id={`${ids}-at`} type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
          </Field>
        ) : null}
        {agentList ? (
          <Field label="Гүйцэтгэсэн агент" htmlFor={`${ids}-agent`}>
            <Select id={`${ids}-agent`} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              {agentList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id === me ? `${s.name} (би)` : s.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {fields.feedback ? (
          <Field label={requireFeedback ? "Харилцагчийн санал хүсэлт" : "Харилцагчийн санал хүсэлт (заавал биш)"} htmlFor={`${ids}-fb`}>
            <textarea
              id={`${ids}-fb`}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              maxLength={4000}
              required={requireFeedback}
              className={TEXTAREA}
            />
          </Field>
        ) : null}
        {fields.result ? (
          <Field label="Үр дүн (заавал биш)" htmlFor={`${ids}-res`}>
            <Input id={`${ids}-res`} value={result} onChange={(e) => setResult(e.target.value)} maxLength={2000} />
          </Field>
        ) : null}
        {fields.note ? (
          <Field label="Тэмдэглэл" htmlFor={`${ids}-note`}>
            <textarea id={`${ids}-note`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000} className={TEXTAREA} />
          </Field>
        ) : null}
        <p className="text-xs text-muted">
          Өмнөх утга өөрчлөлтийн түүхэнд хадгалагдана. Агент бүртгэснээсээ хойш тодорхой хугацаанд засна; дараа нь багийн ахлагч эсвэл
          менежер засна.
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
          <Button type="submit" disabled={pending || (fields.occurredAt && !occurredAt) || feedbackMissing}>
            {pending ? "Хадгалж байна…" : "Хадгалах"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
