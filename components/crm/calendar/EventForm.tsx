"use client";

import { useId, useState, useTransition } from "react";
import { Clock, EyeOff, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { createEvent, updateEvent } from "@/lib/actions/crm-calendar";
import {
  CALENDAR_EVENT_KINDS,
  CALENDAR_EVENT_KIND_LABEL,
  formTimesToRange,
  withFormAllDay,
  withFormStart,
  type CalendarEventKind,
  type EventFormTimes,
} from "@/lib/crm/calendar-view";
import { cn } from "@/lib/utils";

import { AttendeePicker, type Attendee } from "./AttendeePicker";
import { COLOR_BY_KEY } from "./colors";

export type EventFormValues = {
  title: string;
  kind: CalendarEventKind;
  location: string;
  description: string;
  isPrivate: boolean;
  times: EventFormTimes;
  attendees: Attendee[];
};

const TEXTAREA =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:text-sm";
const SMALL_INPUT = "h-10 px-3 text-base sm:text-sm";

/**
 * Үйл явдал үүсгэх / засах маягт (popover дотор). Цаг бүр Улаанбаатарын ханын
 * цаг — хөтчийн цагийн бүсээс үл хамаарна. Амжилттай бол onSaved; алдааг доор харуулна.
 */
export function EventForm({
  eventId,
  initial,
  viewerId,
  onSaved,
  onCancel,
}: {
  /** Засах үед үйл явдлын id; байхгүй бол шинээр үүсгэнэ. */
  eventId?: string;
  initial: EventFormValues;
  viewerId: string;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const [v, setV] = useState<EventFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) => setV((s) => ({ ...s, [key]: value }));
  const setTimes = (patch: Partial<EventFormTimes>) => setV((s) => ({ ...s, times: { ...s.times, ...patch } }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const title = v.title.trim();
    if (!title) {
      setError("Гарчиг оруулна уу.");
      return;
    }
    const r = formTimesToRange(v.times);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setError(null);
    const common = {
      title,
      description: v.description.trim() || null,
      location: v.location.trim() || null,
      kind: v.kind,
      startsAt: r.range.start,
      endsAt: r.range.end,
      allDay: v.times.allDay,
      isPrivate: v.isPrivate,
      attendeeIds: v.attendees.map((a) => a.profileId),
    };
    startTransition(async () => {
      if (eventId) {
        const res = await updateEvent({ id: eventId, ...common });
        if (!res.ok) return setError(res.error ?? "Хадгалж чадсангүй.");
        onSaved("Үйл явдлыг хадгаллаа");
        if (res.warning) toast.info(res.warning);
      } else {
        const res = await createEvent(common);
        if (res.error || !res.id) return setError(res.error ?? "Хадгалж чадсангүй.");
        onSaved("Үйл явдал нэмэгдлээ");
        if (res.warning) toast.info(res.warning);
      }
    });
  }

  const t = v.times;
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Input
        data-autofocus
        value={v.title}
        onChange={(e) => set("title", e.target.value)}
        placeholder="Гарчиг нэмэх"
        aria-label="Гарчиг"
        maxLength={200}
        disabled={pending}
        className="h-12 border-0 border-b border-line px-1 text-lg font-semibold focus:ring-0 rounded-none"
      />

      <fieldset>
        <legend className="sr-only">Төрөл</legend>
        <div className="flex flex-wrap gap-1.5">
          {CALENDAR_EVENT_KINDS.map((k) => (
            <label
              key={k}
              className={cn(
                "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40",
                v.kind === k ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line text-muted hover:bg-surface-2"
              )}
            >
              <input
                type="radio"
                name={`${uid}-kind`}
                value={k}
                checked={v.kind === k}
                onChange={() => set("kind", k)}
                disabled={pending}
                className="sr-only"
              />
              <span aria-hidden className={cn("size-2 rounded-full", COLOR_BY_KEY[k].dot)} />
              {CALENDAR_EVENT_KIND_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <Clock className="size-4 text-muted" aria-hidden />
          <label className="ml-auto flex items-center gap-2 text-sm font-normal text-ink">
            <input
              type="checkbox"
              checked={t.allDay}
              onChange={(e) => {
                const allDay = e.target.checked;
                setV((s) => ({ ...s, times: withFormAllDay(s.times, allDay) }));
              }}
              disabled={pending}
              className="size-4 rounded border-line"
            />
            Бүтэн өдөр
          </label>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2">
            <label htmlFor={`${uid}-sd`} className="text-xs text-muted">
              Эхлэх
            </label>
            <Input
              id={`${uid}-sd`}
              type="date"
              value={t.startDay}
              onChange={(e) => setV((s) => ({ ...s, times: withFormStart(s.times, e.target.value, s.times.startTime) }))}
              disabled={pending}
              className={SMALL_INPUT}
            />
            {t.allDay ? (
              <span />
            ) : (
              <Input
                type="time"
                step={900}
                aria-label="Эхлэх цаг"
                value={t.startTime}
                onChange={(e) => setV((s) => ({ ...s, times: withFormStart(s.times, s.times.startDay, e.target.value) }))}
                disabled={pending}
                className={cn(SMALL_INPUT, "w-[6.75rem]")}
              />
            )}
          </div>
          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2">
            <label htmlFor={`${uid}-ed`} className="text-xs text-muted">
              Дуусах
            </label>
            <Input
              id={`${uid}-ed`}
              type="date"
              value={t.endDay}
              min={t.startDay}
              onChange={(e) => setTimes({ endDay: e.target.value })}
              disabled={pending}
              className={SMALL_INPUT}
            />
            {t.allDay ? (
              <span />
            ) : (
              <Input
                type="time"
                step={900}
                aria-label="Дуусах цаг"
                value={t.endTime}
                onChange={(e) => setTimes({ endTime: e.target.value })}
                disabled={pending}
                className={cn(SMALL_INPUT, "w-[6.75rem]")}
              />
            )}
          </div>
        </div>
        <p className="text-xs text-subtle">Улаанбаатарын цагаар</p>
      </div>

      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <Input
          value={v.location}
          onChange={(e) => set("location", e.target.value)}
          placeholder="Байршил"
          aria-label="Байршил"
          maxLength={300}
          disabled={pending}
          className="h-10 pl-9 text-base sm:text-sm"
        />
      </div>

      <textarea
        value={v.description}
        onChange={(e) => set("description", e.target.value)}
        placeholder="Тайлбар"
        aria-label="Тайлбар"
        rows={2}
        maxLength={4000}
        disabled={pending}
        className={TEXTAREA}
      />

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted">Урих хүмүүс</p>
        <AttendeePicker value={v.attendees} onChange={(a) => set("attendees", a)} excludeId={viewerId} disabled={pending} />
      </div>

      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={v.isPrivate}
          onChange={(e) => set("isPrivate", e.target.checked)}
          disabled={pending}
          className="mt-0.5 size-4 rounded border-line"
        />
        <span>
          <span className="inline-flex items-center gap-1 font-medium">
            <EyeOff className="size-3.5 text-muted" aria-hidden /> Хувийн
          </span>
          <span className="block text-xs text-muted">Таны календарийг харах бусад хүн зөвхөн «Завгүй» гэж харна.</span>
        </span>
      </label>

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Болих
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Хадгалж байна…" : "Хадгалах"}
        </Button>
      </div>
    </form>
  );
}
