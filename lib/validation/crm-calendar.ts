import { z } from "zod";

import { CALENDAR_EVENT_KINDS, CALENDAR_SOURCES, MAX_EVENT_DAYS } from "@/lib/crm/calendar-view";

/**
 * CRM календарийн оролт (zod v4 .strict(), монгол мессеж; { data } | { error }).
 * Агшин бүр цагийн бүстэй ISO ("…Z" эсвэл "+08:00") — бүсгүй мөрийг серверийн
 * (UTC) цагаар тайлбарлахаас сэргийлнэ.
 */

function firstError(error: z.ZodError): string {
  const msg = error.issues[0]?.message;
  return msg && !msg.startsWith("Invalid") && !msg.startsWith("Expected") ? msg : "Оролт буруу байна.";
}

function wrap<T>(schema: z.ZodType<T>, input: unknown): { data: T } | { error: string } {
  const r = schema.safeParse(input);
  return r.success ? { data: r.data } : { error: firstError(r.error) };
}

const instant = (msg: string) => z.iso.datetime({ offset: true, error: msg });
const optText = (max: number, msg: string) => z.string().trim().max(max, msg).optional().nullable();
const MAX_EVENT_MS = MAX_EVENT_DAYS * 86_400_000;

const RANGE_ERR = "Дуусах цаг эхлэх цагаас хойш байна.";
const LONG_ERR = `Үйл явдал ${MAX_EVENT_DAYS} хоногоос урт байж болохгүй.`;

function rangeOk(v: { startsAt?: string; endsAt?: string }): boolean {
  return !v.startsAt || !v.endsAt || Date.parse(v.endsAt) > Date.parse(v.startsAt);
}

function lengthOk(v: { startsAt?: string; endsAt?: string }): boolean {
  return !v.startsAt || !v.endsAt || Date.parse(v.endsAt) - Date.parse(v.startsAt) <= MAX_EVENT_MS;
}

const fields = {
  title: z.string().trim().min(1, "Гарчиг оруулна уу").max(200, "Гарчиг 200 тэмдэгтээс хэтрэхгүй"),
  description: optText(4000, "Тайлбар 4000 тэмдэгтээс хэтрэхгүй"),
  location: optText(300, "Байршил 300 тэмдэгтээс хэтрэхгүй"),
  kind: z.enum(CALENDAR_EVENT_KINDS, "Төрөл сонгоно уу"),
  startsAt: instant("Эхлэх цаг буруу байна"),
  endsAt: instant("Дуусах цаг буруу байна"),
  allDay: z.boolean(),
  isPrivate: z.boolean(),
  attendeeIds: z.array(z.uuid("Урьсан хүн буруу байна")).max(50, "Урих хүн 50-аас олонгүй"),
  leadId: z.uuid().nullable(),
  contactId: z.uuid().nullable(),
  opportunityId: z.uuid().nullable(),
};

const createSchema = z
  .object({
    ...fields,
    kind: fields.kind.default("meeting"),
    allDay: fields.allDay.default(false),
    isPrivate: fields.isPrivate.default(false),
    attendeeIds: fields.attendeeIds.default([]),
    leadId: fields.leadId.optional(),
    contactId: fields.contactId.optional(),
    opportunityId: fields.opportunityId.optional(),
  })
  .strict()
  .refine(rangeOk, { message: RANGE_ERR })
  .refine(lengthOk, { message: LONG_ERR });

export type CalendarEventInput = z.input<typeof createSchema>;
export type CalendarEventData = z.output<typeof createSchema>;

export function validateCalendarEvent(input: unknown) {
  return wrap(createSchema, input);
}

/** Засвар: id + өөрчлөх талбарууд. Зөөх/сунгахад { id, startsAt, endsAt } (хамт). */
const updateSchema = z
  .object({
    id: z.uuid("Үйл явдал олдсонгүй"),
    title: fields.title.optional(),
    description: fields.description,
    location: fields.location,
    kind: fields.kind.optional(),
    startsAt: fields.startsAt.optional(),
    endsAt: fields.endsAt.optional(),
    allDay: fields.allDay.optional(),
    isPrivate: fields.isPrivate.optional(),
    attendeeIds: fields.attendeeIds.optional(),
    leadId: fields.leadId.optional(),
    contactId: fields.contactId.optional(),
    opportunityId: fields.opportunityId.optional(),
  })
  .strict()
  .refine((v) => (v.startsAt === undefined) === (v.endsAt === undefined), {
    message: "Эхлэх, дуусах цагийг хамт илгээнэ үү.",
  })
  .refine(rangeOk, { message: RANGE_ERR })
  .refine(lengthOk, { message: LONG_ERR });

export type CalendarEventUpdateInput = z.input<typeof updateSchema>;
export type CalendarEventUpdateData = z.output<typeof updateSchema>;

export function validateCalendarEventUpdate(input: unknown) {
  return wrap(updateSchema, input);
}

const rescheduleSchema = z
  .object({
    source: z.enum(CALENDAR_SOURCES, "Төрөл буруу байна"),
    id: z.uuid("Зүйл олдсонгүй"),
    newStart: instant("Шинэ цаг буруу байна"),
    newEnd: instant("Шинэ дуусах цаг буруу байна").nullable().optional(),
  })
  .strict()
  .refine((v) => !v.newEnd || Date.parse(v.newEnd) > Date.parse(v.newStart), { message: RANGE_ERR });

export type CalendarRescheduleInput = z.infer<typeof rescheduleSchema>;

export function validateCalendarReschedule(input: unknown) {
  return wrap(rescheduleSchema, input);
}
