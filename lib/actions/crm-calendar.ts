"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, getNameMap, type CrmStaffContext } from "@/lib/queries-crm-core";
import { updateTask } from "@/lib/actions/tasks";
import {
  validateCalendarEvent,
  validateCalendarEventUpdate,
  validateCalendarReschedule,
  type CalendarEventInput,
  type CalendarEventUpdateInput,
} from "@/lib/validation/crm-calendar";
import {
  CALENDAR_LOCK_REASON,
  MAX_EVENT_DAYS,
  calendarHref,
  normalizeAllDayRange,
  ubDay,
  type CalendarSource,
  type TimeRange,
} from "@/lib/crm/calendar-view";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { TaskInput } from "@/lib/validation/task";
import type { TaskMemberRole, TaskPriority, TaskStatus } from "@/lib/constants";

/**
 * CRM календарийн бичилтүүд. Өөрийн үйл явдал (crm_events) — эзэн нь л үүсгэж,
 * засаж, устгана (RLS); урилгатай хүмүүсийн оффисыг DB guard шалгана.
 * Даалгаврын хугацааг tasks модулийн updateTask-аар өөрчилнө (хүснэгтэд шууд
 * бичихгүй). Staff-ийн үзүүлэлт, сайтын үзлэгийн цагийг календарьаас зөөхгүй.
 */

// Төрлүүдийг @/lib/validation/crm-calendar, @/lib/crm/calendar-view-аас шууд импортлоно:
// "use server" файл зөвхөн async функц экспортлоно.

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Result = { ok: boolean; error?: string; warning?: string };

const SAVE_ERR = "Календарь хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";
const NOT_FOUND_ERR = "Үйл явдал олдсонгүй эсвэл танд засах эрх алга.";
const LONG_ERR = `Үйл явдал ${MAX_EVENT_DAYS} хоногоос урт байж болохгүй.`;
const RPC_PREFIX = "Календарь: ";
const MAX_EVENT_MS = MAX_EVENT_DAYS * 86_400_000;
const EVENT_RETURNING = "id, title, starts_at, all_day, attendee_ids";

function revalidateCalendarPaths() {
  revalidatePath(calendarHref.calendar("/agent/crm"));
  revalidatePath(calendarHref.calendar("/office/crm"));
}

function friendlyError(fn: string, message: string): string {
  console.error(`${fn}:`, message);
  const idx = message.indexOf(RPC_PREFIX);
  if (idx !== -1) {
    const text = message.slice(idx + RPC_PREFIX.length).trim();
    return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}.` : SAVE_ERR;
  }
  if (message.includes("crm_events_range")) return `Дуусах цаг эхлэхээс хойш, ${MAX_EVENT_DAYS} хоногоос ихгүй байна.`;
  if (message.includes("crm_events_attendees")) return "Урих хүн 50-аас олонгүй.";
  if (message.includes("row-level security")) return "Танд энэ үйлдлийг хийх эрх алга.";
  return SAVE_ERR;
}

function iso(v: string): string {
  return new Date(v).toISOString();
}

/** Хадгалах муж: бүтэн өдрийнхийг УБ-ын өдрийн хил рүү тааруулна. */
function storedRange(start: string, end: string, allDay: boolean): TimeRange | { error: string } {
  const range = allDay ? normalizeAllDayRange({ start, end }) : { start: iso(start), end: iso(end) };
  const ms = Date.parse(range.end) - Date.parse(range.start);
  if (!(ms > 0)) return { error: "Дуусах цаг эхлэх цагаас хойш байна." };
  if (ms > MAX_EVENT_MS) return { error: LONG_ERR };
  return range;
}

/**
 * Шинээр урьсан хүмүүст апп доторх мэдэгдэл — admin client (notifications-д клиентийн
 * insert эрх алга); алдаа үндсэн үйлдлийг унагахгүй. Линк хүлээн авагчийн роль-оос.
 * CRM-д идэвхтэй бүртгэлгүй (crm_staff) хүн календарийг нээж чадахгүй тул түүнд
 * мэдэгдэхгүй — оронд нь урьсан хүнд анхааруулга буцаана (эсвэл null).
 */
async function notifyInvited(
  supabase: Supabase,
  ctx: CrmStaffContext,
  recipients: readonly string[],
  ev: { title: string; starts_at: string; all_day: boolean }
): Promise<string | null> {
  try {
    const ids = [...new Set(recipients)].filter((id) => id && id !== ctx.profileId);
    if (!ids.length) return null;
    const admin = createAdminClient();
    const [{ data: profiles, error }, names, staffRes] = await Promise.all([
      supabase.from("profiles").select("id, role, full_name").in("id", ids),
      getNameMap([ctx.profileId]),
      // crm_staff-ийн RLS бусдын мөрийг агентад харуулдаггүй — зөвхөн эрхийн шалгалт (profile_id).
      admin
        .from("crm_staff")
        .select("profile_id")
        .eq("office_id", ctx.officeId)
        .eq("is_active", true)
        .in("profile_id", ids),
    ]);
    if (error) console.error("crm-calendar notify profiles:", error.message);
    if (staffRes.error) console.error("crm-calendar notify staff:", staffRes.error.message);
    const crm = staffRes.error ? null : new Set((staffRes.data ?? []).map((r) => r.profile_id));
    const hasCalendar = (id: string) => !crm || crm.has(id);
    const who = names.get(ctx.profileId) ?? "Хамт ажиллагч";
    const when = ev.all_day ? fmtDate(ev.starts_at) : fmtDateTime(ev.starts_at);
    const day = ubDay(ev.starts_at);
    const rows = (profiles ?? [])
      .filter((p) => hasCalendar(p.id))
      .map((p) => ({
        user_id: p.id,
        type: "crm_calendar_invite",
        title: "Календарийн урилга",
        body: `${who} таныг «${ev.title}» (${when}) үйл явдалд урилаа.`.slice(0, 120),
        link: calendarHref.calendar(p.role === "office_admin" || p.role === "admin" ? "/office/crm" : "/agent/crm", day),
      }));
    if (rows.length) {
      const { error: insErr } = await admin.from("notifications").insert(rows);
      if (insErr) console.error("crm-calendar notify:", insErr.message);
    }
    const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    const without = ids.filter((id) => !hasCalendar(id)).map((id) => nameOf.get(id) || "Нэргүй");
    return without.length ? `${without.join(", ")} CRM-д бүртгэлгүй тул урилгыг календарьтаа харахгүй.` : null;
  } catch {
    // мэдэгдэл амжилтгүй ч үндсэн үйлдэл хэвээр
    return null;
  }
}

// ── Өөрийн үйл явдал ──────────────────────────────────────

/** Үйл явдал үүсгэх — эзэн нь үүсгэгч өөрөө. */
export async function createEvent(raw: CalendarEventInput): Promise<{ id?: string; error?: string; warning?: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  const v = validateCalendarEvent(raw);
  if ("error" in v) return { error: v.error };
  const input = v.data;
  const range = storedRange(input.startsAt, input.endsAt, input.allDay);
  if ("error" in range) return { error: range.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_events")
    .insert({
      office_id: ctx.officeId,
      owner_id: ctx.profileId,
      created_by: ctx.profileId,
      title: input.title,
      description: input.description || null,
      location: input.location || null,
      kind: input.kind,
      starts_at: range.start,
      ends_at: range.end,
      all_day: input.allDay,
      is_private: input.isPrivate,
      attendee_ids: input.attendeeIds,
    })
    .select(EVENT_RETURNING)
    .single();
  if (error || !data) return { error: friendlyError("createEvent", error?.message ?? "") };

  // Guard урилгыг давхардалгүй болгож, эзнийг хассан — хадгалагдсан жагсаалтаар мэдэгдэнэ.
  const warning = await notifyInvited(supabase, ctx, data.attendee_ids ?? [], data);
  revalidateCalendarPaths();
  return warning ? { id: data.id, warning } : { id: data.id };
}

/**
 * Үйл явдал засах — зөвхөн эзэн. Зөөх/сунгахад { id, startsAt, endsAt }; бусад
 * талбар илгээгээгүй бол хэвээр. Шинээр нэмэгдсэн урилгатай хүнд мэдэгдэнэ.
 */
export async function updateEvent(raw: CalendarEventUpdateInput): Promise<Result> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  const v = validateCalendarEventUpdate(raw);
  if ("error" in v) return { ok: false, error: v.error };
  const input = v.data;

  const supabase = await createClient();
  // Урилгатай хүн ч RLS-ээр уншина — эзэн мөн эсэхийг тусад нь шалгана.
  const { data: prev, error: prevErr } = await supabase
    .from("crm_events")
    .select("id, owner_id, starts_at, ends_at, all_day, attendee_ids")
    .eq("id", input.id)
    .maybeSingle();
  if (prevErr) console.error("updateEvent prev:", prevErr.message);
  if (!prev || prev.owner_id !== ctx.profileId) return { ok: false, error: NOT_FOUND_ERR };

  const patch: {
    title?: string;
    description?: string | null;
    location?: string | null;
    kind?: NonNullable<typeof input.kind>;
    starts_at?: string;
    ends_at?: string;
    all_day?: boolean;
    is_private?: boolean;
    attendee_ids?: string[];
  } = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.location !== undefined) patch.location = input.location || null;
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.isPrivate !== undefined) patch.is_private = input.isPrivate;
  if (input.attendeeIds !== undefined) patch.attendee_ids = input.attendeeIds;
  if (input.startsAt !== undefined || input.allDay !== undefined) {
    const allDay = input.allDay ?? prev.all_day;
    const range = storedRange(input.startsAt ?? prev.starts_at, input.endsAt ?? prev.ends_at, allDay);
    if ("error" in range) return { ok: false, error: range.error };
    patch.starts_at = range.start;
    patch.ends_at = range.end;
    patch.all_day = allDay;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { data, error } = await supabase
    .from("crm_events")
    .update(patch)
    .eq("id", input.id)
    .eq("owner_id", ctx.profileId)
    .select(EVENT_RETURNING);
  if (error) return { ok: false, error: friendlyError("updateEvent", error.message) };
  const row = data?.[0];
  if (!row) return { ok: false, error: NOT_FOUND_ERR };

  const before = new Set(prev.attendee_ids ?? []);
  const warning = await notifyInvited(
    supabase,
    ctx,
    (row.attendee_ids ?? []).filter((id) => !before.has(id)),
    row
  );
  revalidateCalendarPaths();
  return warning ? { ok: true, warning } : { ok: true };
}

/** Үйл явдал устгах — зөвхөн эзэн. */
export async function deleteEvent(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: NOT_FOUND_ERR };
  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_events")
    .delete()
    .eq("id", id)
    .eq("owner_id", ctx.profileId)
    .select("id");
  if (error) return { ok: false, error: friendlyError("deleteEvent", error.message) };
  if (!data?.length) return { ok: false, error: NOT_FOUND_ERR };
  revalidateCalendarPaths();
  return { ok: true };
}

// ── Чирж зөөх (эх сурвалжийн action-аар) ──────────────────

type RawTaskForMove = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string | null;
  responsible_id: string;
  project_id: string | null;
  tags: string[] | null;
  members: { profile_id: string; role: TaskMemberRole }[] | null;
};

/** Даалгаврын хугацаа = шинэ эхлэл. updateTask бүтэн оролт авдаг тул бусад талбарыг хэвээр дамжуулна. */
async function moveTask(supabase: Supabase, id: string, newStart: string): Promise<Result> {
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, title, description, status, priority, deadline, responsible_id, project_id, tags, members:task_members(profile_id, role)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("rescheduleItem task:", error.message);
  const t = data as unknown as RawTaskForMove | null;
  if (!t) return { ok: false, error: "Даалгавар олдсонгүй эсвэл танд эрх алга." };
  if (t.status === "completed") return { ok: false, error: `${CALENDAR_LOCK_REASON.taskDone}.` };
  const deadline = iso(newStart);
  if (t.deadline && Date.parse(t.deadline) === Date.parse(deadline)) return { ok: true };
  const input: TaskInput = {
    title: t.title,
    description: t.description ?? "",
    status: t.status,
    priority: t.priority,
    deadline,
    responsibleId: t.responsible_id,
    projectId: t.project_id,
    tags: t.tags ?? [],
    members: (t.members ?? []).map((m) => ({ profileId: m.profile_id, role: m.role })),
  };
  return updateTask(id, input);
}

/** Өөрийн үйл явдлыг зөөх: newEnd байхгүй бол үргэлжлэх хугацааг хадгална. */
async function moveEvent(supabase: Supabase, id: string, newStart: string, newEnd: string | null): Promise<Result> {
  let endsAt = newEnd;
  if (!endsAt) {
    const { data: ev } = await supabase.from("crm_events").select("starts_at, ends_at").eq("id", id).maybeSingle();
    if (!ev) return { ok: false, error: NOT_FOUND_ERR };
    endsAt = new Date(Date.parse(newStart) + Date.parse(ev.ends_at) - Date.parse(ev.starts_at)).toISOString();
  }
  return updateEvent({ id, startsAt: iso(newStart), endsAt: iso(endsAt) });
}

/**
 * Календарийн зүйлийг чирж шинэ цаг руу зөөх. Үйл явдал — updateEvent; даалгавар —
 * updateTask (хугацаа = newStart). Үзүүлэлт, сайтын үзлэгийг зөөхгүй — ойлгомжтой
 * алдаа буцаана.
 */
export async function rescheduleItem(
  source: CalendarSource,
  id: string,
  newStart: string,
  newEnd?: string | null
): Promise<Result> {
  const v = validateCalendarReschedule({ source, id, newStart, newEnd: newEnd ?? null });
  if ("error" in v) return { ok: false, error: v.error };
  const input = v.data;
  if (input.source === "showing") return { ok: false, error: `${CALENDAR_LOCK_REASON.showing}.` };
  if (input.source === "viewing") return { ok: false, error: `${CALENDAR_LOCK_REASON.viewing}.` };

  const ctx = await getCrmStaffContext();
  if (!ctx) return { ok: false, error: NO_CRM_ERR };
  const supabase = await createClient();

  // updateEvent өөрөө revalidate хийнэ.
  if (input.source === "event") return moveEvent(supabase, input.id, input.newStart, input.newEnd ?? null);
  const result = await moveTask(supabase, input.id, input.newStart);
  if (result.ok) revalidateCalendarPaths();
  return result;
}
