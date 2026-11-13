"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, CalendarClock, ClipboardCheck, ClipboardPen, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { ReasonDialog } from "@/components/crm2/ui/reason-dialog";
import { rescheduleShowing, voidActivity } from "@/lib/crm2/actions/activities";
import { isoToUbInput } from "@/lib/crm2/datetime";
import type { Crm2ActivityKind, Crm2ShowingStatus } from "@/lib/crm2/types";
import { combineUbDateTime } from "@/components/crm2/staff/card/logic";

import { CancelDealDialog } from "./CancelDealDialog";
import { EditActivityDialog } from "./EditActivityDialog";
import { ShowingOutcomeDialog } from "./ShowingOutcomeDialog";
import { ShowingScheduleDialog } from "./ShowingScheduleDialog";
import type { StaffOption } from "./types";

export type ActivityActionRow = {
  id: string;
  kind: Crm2ActivityKind;
  showing_status: Crm2ShowingStatus | null;
  scheduled_at: string | null;
  deal_id: string;
  deal_code: string | null;
  contact_name: string;
  agent_name: string | null;
  /** Гүйцэтгэсэн агент. */
  agent_id: string | null;
  occurred_at: string | null;
  note: string | null;
  result: string | null;
  feedback: string | null;
  /** «Дахин үзэх»-ийн дараах товлолтод: харилцагчийн утас, хэлцлийн хариуцагч. */
  contactPhone?: string | null;
  dealAgentId?: string | null;
};

/**
 * Дуудлага/үзүүлэлтийн мөрийн үйлдэл: товлосон үзүүлэлтэд «Үр дүн бүртгэх»
 * (Үзүүлсэн/Цуцалсан/Ирээгүй), «Цаг өөрчлөх»; аль ч мөрийг «Засах» (цаг, тэмдэглэл,
 * үр дүн, гүйцэтгэгч), шалтгаантай «Хүчингүй болгох»; ахлагч/менежерт эцсийн үр дүнг
 * «Үр дүн засах». Эрх, засах хугацааг DB эцэслэн шалгана.
 */
export function ActivityActions({
  row,
  canSetStage,
  dealOpen,
  requireFeedback,
  cancelReasons,
  offerHref,
  schedule,
}: {
  row: ActivityActionRow;
  /** Хэлцлийн засварлагч — дараагийн шат, цуцлалт сонгоно. */
  canSetStage: boolean;
  dealOpen: boolean;
  requireFeedback: boolean;
  cancelReasons: { value: string; label: string }[];
  offerHref?: string | null;
  /** «Дахин үзэх»-ийн дараа дараагийн үзүүлэлт товлох; agentOptions != null — менежер/ахлагч (гүйцэтгэгч сонгоно). */
  schedule?: { agentOptions: StaffOption[] | null; me: string | null; meName: string | null };
}) {
  const router = useRouter();
  const [outcomeOpen, setOutcomeOpen] = React.useState(false);
  const [correctOpen, setCorrectOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [voidOpen, setVoidOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [nextOpen, setNextOpen] = React.useState(false);
  const agentOptions = schedule?.agentOptions ?? null;
  const scheduled = row.kind === "showing" && row.showing_status === "scheduled";
  // Эцсийн үр дүнг солих нь ахлагч/менежерийн эрх (сонгогчтой хүн; DB дахин шалгана).
  const finalized = row.kind === "showing" && !!row.showing_status && row.showing_status !== "scheduled";
  const canCorrect = finalized && dealOpen && agentOptions !== null;
  const outcomeActivity = {
    id: row.id,
    deal_id: row.deal_id,
    deal_code: row.deal_code,
    scheduled_at: row.scheduled_at,
    contact_name: row.contact_name,
    agent_name: row.agent_name,
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {scheduled && dealOpen ? (
        <>
          <Button type="button" size="touch" onClick={() => setOutcomeOpen(true)}>
            <ClipboardCheck className="size-4" aria-hidden /> Үр дүн бүртгэх
          </Button>
          <Button type="button" size="touch" variant="outline" onClick={() => setMoveOpen(true)}>
            <CalendarClock className="size-4" aria-hidden /> Цаг өөрчлөх
          </Button>
        </>
      ) : null}
      {canCorrect ? (
        <Button type="button" size="touch" variant="outline" onClick={() => setCorrectOpen(true)}>
          <ClipboardPen className="size-4" aria-hidden /> Үр дүн засах
        </Button>
      ) : null}
      <Button type="button" size="touch" variant="ghost" onClick={() => setEditOpen(true)}>
        <Pencil className="size-4" aria-hidden /> Засах
      </Button>
      <Button type="button" size="touch" variant="ghost" className="text-muted" onClick={() => setVoidOpen(true)}>
        <Ban className="size-4" aria-hidden /> Хүчингүй болгох
      </Button>

      <ShowingOutcomeDialog
        open={outcomeOpen}
        onClose={() => setOutcomeOpen(false)}
        activity={outcomeActivity}
        requireFeedback={requireFeedback}
        canSetStage={canSetStage && dealOpen}
        onRequestCancelDeal={() => setCancelOpen(true)}
        onRequestReschedule={schedule ? () => setNextOpen(true) : undefined}
      />
      {canCorrect ? (
        <ShowingOutcomeDialog
          open={correctOpen}
          onClose={() => setCorrectOpen(false)}
          mode="correct"
          activity={{
            ...outcomeActivity,
            showing_status: row.showing_status,
            occurred_at: row.occurred_at,
            feedback: row.feedback,
            result: row.result,
            note: row.note,
          }}
          requireFeedback={requireFeedback}
          canSetStage={false}
        />
      ) : null}
      <EditActivityDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        activity={row}
        requireFeedback={requireFeedback}
        agentOptions={agentOptions}
        me={schedule?.me ?? null}
      />
      {schedule ? (
        <ShowingScheduleDialog
          open={nextOpen}
          onClose={() => setNextOpen(false)}
          deals={[
            {
              id: row.deal_id,
              code: row.deal_code ?? "",
              contactName: row.contact_name,
              contactPhone: row.contactPhone ?? null,
              agentId: row.dealAgentId ?? null,
            },
          ]}
          agentOptions={schedule.agentOptions}
          me={schedule.me}
          meName={schedule.meName}
        />
      ) : null}
      <RescheduleDialog
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        activityId={row.id}
        scheduledAt={row.scheduled_at}
        agentId={row.agent_id}
        agentName={row.agent_name}
        agentOptions={agentOptions}
        me={schedule?.me ?? null}
      />
      <ReasonDialog
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        title={row.kind === "call" ? "Дуудлагыг хүчингүй болгох" : "Үзүүлэлтийг хүчингүй болгох"}
        description="Буруу бүртгэлийг устгахгүй — хүчингүй гэж тэмдэглэж, түүхэнд үлдээнэ. Тоонд орохгүй."
        label="Хүчингүй болгох шалтгаан"
        confirmLabel="Хүчингүй болгох"
        tone="danger"
        maxLength={1000}
        onSubmit={async ({ text }) => {
          const res = await voidActivity(row.id, text);
          if (!res.ok) return res.error;
          toast.success("Хүчингүй болголоо");
          router.refresh();
          return null;
        }}
      />
      {canSetStage ? (
        <CancelDealDialog
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          dealId={row.deal_id}
          dealCode={row.deal_code}
          reasons={cancelReasons}
          offerHref={offerHref}
        />
      ) : null}
    </div>
  );
}

type RescheduleProps = {
  activityId: string;
  scheduledAt: string | null;
  /** Одоогийн гүйцэтгэгч. */
  agentId: string | null;
  agentName: string | null;
  /** Гүйцэтгэгч сонгогч (менежер/ахлагч); бусдад null. */
  agentOptions: StaffOption[] | null;
  me: string | null;
};

function RescheduleDialog({ open, onClose, ...rest }: RescheduleProps & { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <RescheduleInner onClose={onClose} {...rest} />;
}

function RescheduleInner({
  onClose,
  activityId,
  scheduledAt,
  agentId: currentAgent,
  agentName,
  agentOptions,
  me,
}: RescheduleProps & { onClose: () => void }) {
  const router = useRouter();
  const ids = React.useId();
  const initial = isoToUbInput(scheduledAt);
  const [date, setDate] = React.useState(initial.slice(0, 10));
  const [time, setTime] = React.useState(initial.slice(11, 16));
  const [agentId, setAgentId] = React.useState(currentAgent ?? "");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const combined = combineUbDateTime(date, time);
  const agentList = React.useMemo(() => {
    if (!agentOptions) return null;
    if (!currentAgent || agentOptions.some((s) => s.id === currentAgent)) return agentOptions;
    return [{ id: currentAgent, name: agentName ?? "Одоогийн гүйцэтгэгч", teamId: null }, ...agentOptions];
  }, [agentOptions, currentAgent, agentName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!combined || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await rescheduleShowing({
        activity_id: activityId,
        scheduled_at: combined,
        agent_id: agentList && agentId && agentId !== currentAgent ? agentId : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Үзүүлэх цаг өөрчлөгдлөө");
      router.refresh();
      onClose();
    } catch (err) {
      console.error("RescheduleDialog:", err);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open onClose={() => !pending && onClose()} title="Үзүүлэх цаг өөрчлөх">
      <form onSubmit={submit} className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Огноо" htmlFor={`${ids}-d`}>
            <Input id={`${ids}-d`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Цаг" htmlFor={`${ids}-t`}>
            <Input id={`${ids}-t`} type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
        </div>
        {agentList ? (
          <Field label="Үзүүлэх агент" htmlFor={`${ids}-agent`}>
            <Select id={`${ids}-agent`} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              {agentList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id === me ? `${s.name} (би)` : s.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <p className="text-xs text-muted">Өмнөх цаг өөрчлөлтийн түүхэнд хадгалагдана.</p>
        {error ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Болих
          </Button>
          <Button type="submit" disabled={pending || !combined}>
            {pending ? "Түр хүлээнэ үү…" : "Хадгалах"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
