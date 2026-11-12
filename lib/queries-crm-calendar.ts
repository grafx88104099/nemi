import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getNameMap } from "@/lib/queries-crm-reports";
import {
  CALENDAR_BUSY_TITLE,
  CALENDAR_LOCK_REASON,
  MAX_RANGE_DAYS,
  MEETING_BLOCK_MINUTES,
  SHOWING_DEFAULT_MINUTES,
  TASK_BLOCK_MINUTES,
  VIEWING_BLOCK_MINUTES,
  allDayRange,
  blockEnd,
  calendarHref,
  canViewCalendar,
  eventColorKey,
  eventHref,
  eventMovability,
  isCalendarEventKind,
  leadStepMovability,
  lockedMovability,
  meetingMovability,
  overlapsRange,
  personIdsIn,
  sortCalendarItems,
  taskMovability,
  ubDay,
  type CalendarItem,
  type CalendarPerson,
  type CalendarViewer,
} from "@/lib/crm/calendar-view";

/**
 * CRM календарийн уншилт — бүгд хэрэглэгчийн өөрийн эрхээр (RLS, definer RPC).
 * Эх сурвалж бүрийг мужаар НЭГ удаа уншиж CalendarItem болгон нэгтгэнэ:
 * үйл явдал (crm_calendar_events RPC — хувийнхыг «Завгүй» болгож нууна),
 * даалгавар, сэжмийн дараагийн үйлдэл, үзлэг, боломжийн уулзалт, сайтын үзлэг.
 * Хүмүүсийн хүрээ crm_calendar_can_view()-тэй ижил (өөрөө / баг / бүгд).
 */

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;
const SOURCE_LIMIT = 1000;
/** crm_showings.duration_min-ийн дээд хэмжээ (validateShowingSchedule). */
const SHOWING_MAX_MINUTES = 600;

const staffContext = cache(getCrmStaffContext);

// ── Хүмүүс ────────────────────────────────────────────────

/**
 * Календарийг нь сонгож харж болох хүмүүс: өөрөө; багийн ахлагчид багийн идэвхтэй
 * гишүүд; менежерт (sales_director, ops_qc, ceo) оффисын бүх идэвхтэй ажилтан.
 * Өөрөө эхэнд, бусад нь нэрээр.
 */
export const getCalendarPeople = cache(async (): Promise<CalendarPerson[]> => {
  const ctx = await staffContext();
  if (!ctx) return [];
  const supabase = await createClient();
  const viewer: CalendarViewer = { profileId: ctx.profileId, roles: ctx.roles, teamId: ctx.teamId };

  // crm_staff-ийн RLS: өөрөө, ахлагч өөрийн баг, удирдлага бүгд — хүрээг доор can_view-ээр нарийсгана.
  const { data, error } = await supabase
    .from("crm_staff")
    .select("profile_id, team_id, is_active")
    .eq("office_id", ctx.officeId)
    .eq("is_active", true)
    .limit(SOURCE_LIMIT);
  if (error) console.error("getCalendarPeople:", error.message);

  const byId = new Map<string, string | null>([[ctx.profileId, ctx.teamId]]);
  for (const r of data ?? []) {
    if (canViewCalendar(viewer, { profileId: r.profile_id, teamId: r.team_id, isActive: r.is_active })) {
      byId.set(r.profile_id, r.team_id);
    }
  }
  const names = await getNameMap([...byId.keys()]);
  const people = [...byId].map(([profileId, teamId]) => ({
    profileId,
    name: names.get(profileId) ?? "Нэргүй",
    teamId,
    isSelf: profileId === ctx.profileId,
  }));
  return people.sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.name.localeCompare(b.name, "mn"));
});

// ── Эх сурвалжийн мөрүүд ──────────────────────────────────

type ContactLite = { display_name: string | null } | null;

type RawTask = {
  id: string;
  title: string;
  status: string;
  deadline: string;
  created_by: string;
  responsible_id: string;
};

type RawLead = {
  id: string;
  status: string;
  owner_id: string;
  next_step: string | null;
  next_step_date: string;
  contact: ContactLite;
};

type RawShowing = {
  id: string;
  status: string;
  scheduled_at: string;
  duration_min: number | null;
  agent_id: string;
  opportunity_id: string | null;
  property_id: string;
  meeting_point: string | null;
  contact: ContactLite;
  property: { name: string | null; number: string | null } | null;
};

type RawOpp = {
  id: string;
  state: string;
  owner_id: string;
  meeting_at: string;
  meeting_place: string | null;
  contact: ContactLite;
};

type RawViewing = {
  id: string;
  status: string;
  scheduled_at: string;
  agent_id: string;
  listing_id: string;
  listing: { title: string | null } | null;
};

const TASK_SELECT = "id, title, status, deadline, created_by, responsible_id";
const LEAD_SELECT =
  "id, status, owner_id, next_step, next_step_date, contact:crm_contacts!crm_leads_contact_id_fkey(display_name)";
const SHOWING_SELECT =
  "id, status, scheduled_at, duration_min, agent_id, opportunity_id, property_id, meeting_point, " +
  "contact:crm_contacts!crm_showings_contact_id_fkey(display_name), " +
  "property:crm_properties!crm_showings_property_id_fkey(name, number)";
const OPP_SELECT =
  "id, state, owner_id, meeting_at, meeting_place, contact:crm_contacts!crm_opportunities_contact_id_fkey(display_name)";
const VIEWING_SELECT = "id, status, scheduled_at, agent_id, listing_id, listing:listings!viewings_listing_id_fkey(title)";

function iso(v: string | number): string {
  return new Date(v).toISOString();
}

function plus(v: string, minutes: number): string {
  return new Date(Date.parse(v) + minutes * MIN_MS).toISOString();
}

function rows<T>(label: string, res: { data: unknown; error: { message: string } | null }): T[] {
  if (res.error) {
    console.error(`getCalendarFeed ${label}:`, res.error.message);
    return [];
  }
  return (res.data ?? []) as T[];
}

// ── Нэгдсэн урсгал ────────────────────────────────────────

export type CalendarFeedQuery = {
  /** ISO агшин (эсвэл calendarRange()-ийн from/to). Муж 62 хоногоос ихгүй. */
  from: string;
  to: string;
  /** Харах хүмүүс (profile id); хоосон бол зөвхөн өөрөө. Харах эрхгүй хүнийг хасна. */
  people?: readonly string[] | null;
  /** Холбоосын угтвар: "/agent/crm" (анхдагч) эсвэл "/office/crm". */
  basePath?: string;
};

/**
 * Календарийн зүйлс (эхлэлээр эрэмбэлсэн). Нэг эх сурвалжийн уншилт алдаа
 * өгвөл түүнийг алгасаж бусдыг буцаана (алдааг console.error).
 */
export async function getCalendarFeed(query: CalendarFeedQuery): Promise<CalendarItem[]> {
  const ctx = await staffContext();
  if (!ctx) return [];
  const f = Date.parse(query.from);
  const t = Date.parse(query.to);
  if (!Number.isFinite(f) || !Number.isFinite(t) || t <= f || t - f > MAX_RANGE_DAYS * DAY_MS) {
    console.error("getCalendarFeed: хугацааны муж буруу", query.from, query.to);
    return [];
  }
  const from = iso(f);
  const to = iso(t);
  const basePath = query.basePath ?? "/agent/crm";

  const supabase = await createClient();
  const [allowed, profileRes] = await Promise.all([
    getCalendarPeople(),
    supabase.from("profiles").select("role").eq("id", ctx.profileId).maybeSingle(),
  ]);
  const personById = new Map(allowed.map((p) => [p.profileId, p]));
  const requested = query.people?.length ? query.people : [ctx.profileId];
  const people = [...new Set(requested)].filter((id) => personById.has(id));
  if (!people.length) return [];

  const viewer: CalendarViewer = {
    profileId: ctx.profileId,
    roles: ctx.roles,
    teamId: ctx.teamId,
    userRole: profileRes.data?.role ?? null,
  };
  const teamOf = (id: string | null) => (id ? (personById.get(id)?.teamId ?? null) : null);
  const since = (minutes: number) => iso(f - minutes * MIN_MS);
  const fromDay = ubDay(f);
  const lastDay = ubDay(t - 1);

  const [eventsRes, tasksRes, leadsRes, showingsRes, oppsRes, agentsRes] = await Promise.all([
    supabase.rpc("crm_calendar_events", { p_from: from, p_to: to, p_people: people }),
    supabase
      .from("tasks")
      .select(TASK_SELECT)
      .in("responsible_id", people)
      .gte("deadline", since(TASK_BLOCK_MINUTES))
      .lt("deadline", to)
      .order("deadline")
      .limit(SOURCE_LIMIT),
    supabase
      .from("crm_leads")
      .select(LEAD_SELECT)
      .in("owner_id", people)
      .in("status", ["new", "active"])
      .gte("next_step_date", fromDay)
      .lte("next_step_date", lastDay)
      .limit(SOURCE_LIMIT),
    supabase
      .from("crm_showings")
      .select(SHOWING_SELECT)
      .in("agent_id", people)
      .in("status", ["scheduled", "done"])
      .gte("scheduled_at", since(SHOWING_MAX_MINUTES))
      .lt("scheduled_at", to)
      .limit(SOURCE_LIMIT),
    supabase
      .from("crm_opportunities")
      .select(OPP_SELECT)
      .in("owner_id", people)
      .gte("meeting_at", since(MEETING_BLOCK_MINUTES))
      .lt("meeting_at", to)
      .limit(SOURCE_LIMIT),
    // viewings.agent_id → agents.id; хүн нь agents.profile_id.
    supabase.from("agents").select("id, profile_id").in("profile_id", people),
  ]);

  const agentProfile = new Map(
    rows<{ id: string; profile_id: string | null }>("agents", agentsRes)
      .filter((a) => a.profile_id)
      .map((a) => [a.id, a.profile_id as string])
  );
  type RawEvent = NonNullable<typeof eventsRes.data>[number];
  const events = rows<RawEvent>("events", eventsRes);

  // Нэр: сонгох жагсаалтад байгаа хүмүүсийнх бэлэн; урилгатай бусад хүнийг тусад нь (embed-гүй).
  const names = new Map(allowed.map((p) => [p.profileId, p.name]));
  const missing = new Set<string>();
  for (const e of events) for (const id of [e.owner_id, ...(e.attendee_ids ?? [])]) if (!names.has(id)) missing.add(id);

  // Холбосон сэжим/харилцагчийн нэр (засах маягтад) — хэрэглэгчийн эрхээр.
  const shownEvents = events.filter((e) => !e.masked);
  const linkLeadIds = [...new Set(shownEvents.flatMap((e) => (e.lead_id ? [e.lead_id] : [])))];
  const linkContactIds = [...new Set(shownEvents.flatMap((e) => (!e.lead_id && e.contact_id ? [e.contact_id] : [])))];
  const none = { data: [], error: null };

  const [viewingsRes, extraNames, linkLeadsRes, linkContactsRes] = await Promise.all([
    agentProfile.size
      ? supabase
          .from("viewings")
          .select(VIEWING_SELECT)
          .in("agent_id", [...agentProfile.keys()])
          .in("status", ["pending", "confirmed", "done"])
          .gte("scheduled_at", since(VIEWING_BLOCK_MINUTES))
          .lt("scheduled_at", to)
          .limit(SOURCE_LIMIT)
      : Promise.resolve(none),
    missing.size ? getNameMap([...missing]) : Promise.resolve(new Map<string, string>()),
    linkLeadIds.length
      ? supabase
          .from("crm_leads")
          .select("id, contact:crm_contacts!crm_leads_contact_id_fkey(display_name)")
          .in("id", linkLeadIds)
      : Promise.resolve(none),
    linkContactIds.length
      ? supabase.from("crm_contacts").select("id, display_name").in("id", linkContactIds)
      : Promise.resolve(none),
  ]);
  for (const [id, n] of extraNames) names.set(id, n);
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? null) : null);
  const linkLabels = new Map<string, string>();
  for (const r of rows<{ id: string; contact: ContactLite }>("event leads", linkLeadsRes)) {
    if (r.contact?.display_name) linkLabels.set(`lead:${r.id}`, r.contact.display_name);
  }
  for (const r of rows<{ id: string; display_name: string | null }>("event contacts", linkContactsRes)) {
    if (r.display_name) linkLabels.set(`contact:${r.id}`, r.display_name);
  }

  const items: CalendarItem[] = [];
  const base = {
    subtitle: null,
    allDay: false,
    masked: false,
    status: null,
    done: false,
    event: null,
  } satisfies Partial<CalendarItem>;

  for (const e of events) {
    const kind = isCalendarEventKind(e.kind) ? e.kind : "other";
    const attendeeIds = e.attendee_ids ?? [];
    let personIds = personIdsIn([e.owner_id, ...attendeeIds], people);
    // Нуусан үйл явдлын урилгатай хүн нууц; ганц хүн харж байвал тэр хүнийх.
    if (!personIds.length && e.masked && people.length === 1) personIds = [people[0]];
    const ownerShown = people.includes(e.owner_id) || !e.masked;
    items.push({
      ...base,
      key: `event:${e.id}`,
      source: "event",
      id: e.id,
      title: e.masked ? CALENDAR_BUSY_TITLE : e.title,
      subtitle: e.masked ? null : e.location,
      start: iso(e.starts_at),
      end: iso(e.ends_at),
      allDay: e.all_day,
      personId: ownerShown ? e.owner_id : (personIds[0] ?? e.owner_id),
      personName: ownerShown ? nameOf(e.owner_id) : nameOf(personIds[0] ?? null),
      personIds,
      colorKey: eventColorKey(kind, e.masked),
      href: e.masked ? null : eventHref(basePath, e),
      ...eventMovability(e),
      masked: e.masked,
      event: e.masked
        ? null
        : {
            kind,
            description: e.description,
            location: e.location,
            isPrivate: e.is_private,
            ownerId: e.owner_id,
            ownerName: nameOf(e.owner_id),
            attendeeIds,
            attendees: attendeeIds.map((id) => ({ profileId: id, name: nameOf(id) ?? "Нэргүй" })),
            leadId: e.lead_id,
            contactId: e.contact_id,
            opportunityId: e.opportunity_id,
            linkLabel: e.lead_id
              ? (linkLabels.get(`lead:${e.lead_id}`) ?? null)
              : e.contact_id
                ? (linkLabels.get(`contact:${e.contact_id}`) ?? null)
                : null,
          },
    });
  }

  for (const r of rows<RawTask>("tasks", tasksRes)) {
    items.push({
      ...base,
      key: `task:${r.id}`,
      source: "task",
      id: r.id,
      title: r.title,
      start: iso(r.deadline),
      end: blockEnd(r.deadline, TASK_BLOCK_MINUTES),
      personId: r.responsible_id,
      personName: nameOf(r.responsible_id),
      personIds: [r.responsible_id],
      colorKey: "task",
      href: calendarHref.task(basePath, r.id),
      ...taskMovability(viewer, r),
      status: r.status,
      done: r.status === "completed",
    });
  }

  for (const r of rows<RawLead>("leads", leadsRes)) {
    const range = allDayRange(r.next_step_date.slice(0, 10));
    items.push({
      ...base,
      key: `next_step:${r.id}`,
      source: "next_step",
      id: r.id,
      title: r.next_step?.trim() || "Дараагийн үйлдэл",
      subtitle: r.contact?.display_name ?? null,
      start: range.start,
      end: range.end,
      allDay: true,
      personId: r.owner_id,
      personName: nameOf(r.owner_id),
      personIds: [r.owner_id],
      colorKey: "next_step",
      href: calendarHref.lead(basePath, r.id),
      ...leadStepMovability(viewer, r, teamOf(r.owner_id)),
      status: r.status,
    });
  }

  for (const r of rows<RawShowing>("showings", showingsRes)) {
    const place = r.property?.name || r.property?.number || "үл хөдлөх";
    items.push({
      ...base,
      key: `showing:${r.id}`,
      source: "showing",
      id: r.id,
      title: `Үзлэг: ${place}`,
      subtitle: [r.contact?.display_name, r.meeting_point].filter(Boolean).join(" · ") || null,
      start: iso(r.scheduled_at),
      end: plus(r.scheduled_at, r.duration_min && r.duration_min > 0 ? r.duration_min : SHOWING_DEFAULT_MINUTES),
      personId: r.agent_id,
      personName: nameOf(r.agent_id),
      personIds: [r.agent_id],
      colorKey: "showing",
      href: r.opportunity_id
        ? calendarHref.opportunity(basePath, r.opportunity_id)
        : calendarHref.property(basePath, r.property_id),
      ...lockedMovability(CALENDAR_LOCK_REASON.showing),
      status: r.status,
      done: r.status === "done",
    });
  }

  for (const r of rows<RawOpp>("opportunities", oppsRes)) {
    items.push({
      ...base,
      key: `opportunity_meeting:${r.id}`,
      source: "opportunity_meeting",
      id: r.id,
      title: `Уулзалт: ${r.contact?.display_name ?? "өмчлөгч"}`,
      subtitle: r.meeting_place,
      start: iso(r.meeting_at),
      end: blockEnd(r.meeting_at, MEETING_BLOCK_MINUTES),
      personId: r.owner_id,
      personName: nameOf(r.owner_id),
      personIds: [r.owner_id],
      colorKey: "opportunity_meeting",
      href: calendarHref.opportunity(basePath, r.id),
      ...meetingMovability(viewer, r, teamOf(r.owner_id)),
      status: r.state,
      done: r.state !== "open",
    });
  }

  for (const r of rows<RawViewing>("viewings", viewingsRes)) {
    const personId = agentProfile.get(r.agent_id);
    if (!personId) continue;
    items.push({
      ...base,
      key: `viewing:${r.id}`,
      source: "viewing",
      id: r.id,
      title: `Сайтын үзлэг: ${r.listing?.title ?? "зар"}`,
      start: iso(r.scheduled_at),
      end: blockEnd(r.scheduled_at, VIEWING_BLOCK_MINUTES),
      personId,
      personName: nameOf(personId),
      personIds: [personId],
      colorKey: "viewing",
      href: calendarHref.viewing(r.listing_id),
      ...lockedMovability(CALENDAR_LOCK_REASON.viewing),
      status: r.status,
      done: r.status === "done",
    });
  }

  return sortCalendarItems(items.filter((it) => overlapsRange(it, from, to)));
}
