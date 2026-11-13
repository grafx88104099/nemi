"use client";

import * as React from "react";
import { CalendarClock, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createTask } from "@/lib/crm2/actions/tasks";
import { scheduleShowing } from "@/lib/crm2/actions/activities";
import { CALL_NEXT_ACTIONS, TASK_KIND_LABEL } from "@/lib/crm2/labels";
import { ubInputToIso, ubToday } from "@/lib/crm2/datetime";
import { formatPhone } from "@/lib/crm2/phone";
import type { Crm2TaskKind } from "@/lib/crm2/types";
import { combineUbDateTime } from "@/components/crm2/staff/card/logic";

import type { StaffOption } from "./types";

const TEXTAREA =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

/**
 * S05 — үзүүлэх цаг товлох (хэлцэл дээр): огноо, цаг, гүйцэтгэх агент, тэмдэглэл;
 * харилцагчийн нэр, дугаар хэлцлээс автоматаар. Сонголтоор дараагийн ажил нэмнэ.
 * Төлөв «Товлосон» — цаг нь болоход автоматаар «үзүүлсэн» болохгүй.
 */
export function ShowingScheduleForm({
  dealId,
  dealCode,
  contactName,
  contactPhone,
  agentOptions,
  me,
  meName,
  sourceActivityId,
  defaultAgentId,
  taskAssigneeId,
  onDone,
  onCancel,
  cancelLabel = "Болих",
}: {
  dealId: string;
  dealCode?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  /**
   * Гүйцэтгэгч сонгогч — менежер (бүгд) / ахлагч (багийн гишүүд), callAgentOptions().
   * null бол сонгогчгүй, гүйцэтгэгч нь өөрөө.
   */
  agentOptions: StaffOption[] | null;
  me: string | null;
  meName?: string | null;
  sourceActivityId?: string | null;
  /** Анхны гүйцэтгэгч (сонгогчид байвал) — жишээ нь дуудлагыг хийсэн агент. Үгүй бол өөрөө. */
  defaultAgentId?: string | null;
  /** «Дараагийн ажил»-ын хариуцагч (хэлцлийн агент). null бол өөрөө (сервер session-ээс). */
  taskAssigneeId?: string | null;
  onDone: (res: { id: string; taskError: string | null }) => void | Promise<void>;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const ids = React.useId();
  const pickable = agentOptions
    ? agentOptions.some((s) => s.id === me) || !me
      ? agentOptions
      : [{ id: me, name: meName || "Би", teamId: null }, ...agentOptions]
    : null;
  const [date, setDate] = React.useState(() => ubToday());
  const [time, setTime] = React.useState("");
  const [agentId, setAgentId] = React.useState(() =>
    (defaultAgentId && pickable?.some((s) => s.id === defaultAgentId) ? defaultAgentId : me) ?? ""
  );
  const [note, setNote] = React.useState("");
  const [withTask, setWithTask] = React.useState(false);
  const [taskKind, setTaskKind] = React.useState<Crm2TaskKind>("call_back");
  const [taskDue, setTaskDue] = React.useState("");
  const [taskNote, setTaskNote] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Маягт нээгдсэн үеийн цаг (render бүрт Date.now() дуудахгүй).
  const [openedAt] = React.useState(() => Date.now());
  const combined = combineUbDateTime(date, time);
  const iso = combined ? ubInputToIso(combined) : null;
  const inPast = iso ? Date.parse(iso) < openedAt - 5 * 60_000 : false;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!combined) {
      setError("Үзүүлэх огноо, цагаа сонгоно уу.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await scheduleShowing({
        deal_id: dealId,
        scheduled_at: combined,
        // Сонгогчгүй үед гүйцэтгэгч = өөрөө (сервер session-ээс авна).
        agent_id: pickable && agentId ? agentId : null,
        note,
        source_activity_id: sourceActivityId ?? null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      let taskError: string | null = null;
      if (withTask) {
        const t = await createTask({
          kind: taskKind,
          due_at: taskDue,
          note: taskNote,
          deal_id: dealId,
          assignee_id: taskAssigneeId ?? null,
        });
        if (!t.ok) taskError = t.error;
      }
      await onDone({ id: res.data.id, taskError });
    } catch (err) {
      console.error("ShowingScheduleForm:", err);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {contactName || dealCode ? (
        <div className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm">
          <p className="font-medium text-ink">
            {contactName ?? "Харилцагч"}
            {dealCode ? <span className="ml-1.5 font-mono text-xs text-muted">{dealCode}</span> : null}
          </p>
          {contactPhone ? <p className="text-xs text-muted tabular-nums">{formatPhone(contactPhone)}</p> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Үзүүлэх огноо" htmlFor={`${ids}-date`}>
          <Input id={`${ids}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Цаг" htmlFor={`${ids}-time`}>
          <Input id={`${ids}-time`} type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} required />
        </Field>
      </div>
      {inPast ? (
        <p className="flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Сонгосон цаг өнгөрсөн байна. Бодитоор аль хэдийн үзүүлсэн бол товлосны дараа «Үр дүн бүртгэх»-ээр бодит цаг, санал хүсэлтийг оруулна.
        </p>
      ) : null}

      {pickable ? (
        <Field label="Хариуцсан (үзүүлэх) агент" htmlFor={`${ids}-agent`}>
          <Select id={`${ids}-agent`} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {pickable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id === me ? `${s.name} (би)` : s.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <p className="text-sm text-muted">
          Үзүүлэх агент: <span className="font-medium text-ink">{meName ? `${meName} (би)` : "Би"}</span>
        </p>
      )}

      <Field label="Тэмдэглэл (заавал биш)" htmlFor={`${ids}-note`}>
        <textarea
          id={`${ids}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="Уулзах газар, түлхүүр, анхааруулга…"
          className={TEXTAREA}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input type="checkbox" checked={withTask} onChange={(e) => setWithTask(e.target.checked)} className="size-4 accent-brand-500" />
        Дараагийн ажил нэмэх
      </label>
      {withTask ? (
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
          <Field label="Ажил" htmlFor={`${ids}-tkind`}>
            <Select id={`${ids}-tkind`} value={taskKind} onChange={(e) => setTaskKind(e.target.value as Crm2TaskKind)}>
              {CALL_NEXT_ACTIONS.map((k) => (
                <option key={k} value={k}>
                  {TASK_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Хугацаа" htmlFor={`${ids}-tdue`}>
            <Input id={`${ids}-tdue`} type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Ажлын тэмдэглэл" htmlFor={`${ids}-tnote`}>
              <Input id={`${ids}-tnote`} value={taskNote} onChange={(e) => setTaskNote(e.target.value)} maxLength={1000} />
            </Field>
          </div>
        </div>
      ) : null}

      <p className="flex items-start gap-1.5 text-xs text-muted">
        <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Төлөв «Товлосон» болно. Цаг нь болоход автоматаар «Үзүүлсэн» болохгүй — бодитоор үзүүлсний дараа үр дүнг бүртгэнэ.
      </p>

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
        ) : null}
        <Button type="submit" disabled={pending || !combined}>
          {pending ? "Түр хүлээнэ үү…" : "Үзүүлэх цаг хадгалах"}
        </Button>
      </div>
    </form>
  );
}
