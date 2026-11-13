import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { getCrmStaffContext, getNameMap } from "@/lib/queries-crm-core";
import {
  CALENDAR_BUSY_TITLE,
  CALENDAR_LOCK_REASON,
  MAX_RANGE_DAYS,
  SHOWING_DEFAULT_MINUTES,
  TASK_BLOCK_MINUTES,
  VIEWING_BLOCK_MINUTES,
  blockEnd,
  calendarHref,
  canViewCalendar,
  eventColorKey,
  eventMovability,
  isCalendarEventKind,
  lockedMovability,
  overlapsRange,
  personIdsIn,
  sortCalendarItems,
  taskMovability,
  type CalendarItem,
  type CalendarPerson,
  type CalendarViewer,
} from "@/lib/crm/calendar-view";

/**
 * CRM календарийн уншилт — бүгд хэрэглэгчийн өөрийн эрхээр (RLS, definer RPC).
 * Эх сурвалж бүрийг мужаар НЭГ удаа уншиж CalendarItem болгон нэгтгэнэ:
 * үйл явдал (crm_calendar_events RPC — хувийнхыг «Завгүй» болгож нууна),
 * даалгавар, Staff-ийн үзүүлэлт (crm2_activities), сайтын үзлэг.
 * Хүмүүсийн хүрээ crm_calendar_can_view()-тэй ижил (өөрөө / баг / бүгд).
 */

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;
const SOURCE_LIMIT = 1000;

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

type RawTask = {
  id: string;
  title: string;
  status: string;
  deadline: string;
  created_by: string;
  responsible_id: string;
};

/** Staff-ийн үзүүлэлт (crm2_activities, kind = showing). */
type RawShowing = {
  id: string;
  deal_id: string;
  property_id: string;
  agent_id: string;
  scheduled_at: string;
  occurred_at: string | null;
  showing_status: string | null;
  property: { code: string; location_text: string | null } | null;
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
const SHOWING_SELECT =
  "id, deal_id, property_id, agent_id, scheduled_at, occurred_at, showing_status, " +
  "property:crm2_properties!crm2_activities_property_id_office_id_fkey(code, location_text)";
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
  const since = (minutes: number) => iso(f - minutes * MIN_MS);

  const [eventsRes, tasksRes, showingsRes, agentsRes] = await Promise.all([
    supabase.rpc("crm_calendar_events", { p_from: from, p_to: to, p_people: people }),
    supabase
      .from("tasks")
      .select(TASK_SELECT)
      .in("responsible_id", people)
      .gte("deadline", since(TASK_BLOCK_MINUTES))
      .lt("deadline", to)
      .order("deadline")
      .limit(SOURCE_LIMIT),
    // Товлосон ба үзүүлсэн үзүүлэлт (хүчингүй болсныг хасна) — RLS-ээр харах эрхтэйг л.
    supabase
      .from("crm2_activities")
      .select(SHOWING_SELECT)
      .eq("kind", "showing")
      .in("agent_id", people)
      .in("showing_status", ["scheduled", "shown"])
      .is("voided_at", null)
      .gte("scheduled_at", since(SHOWING_DEFAULT_MINUTES))
      .lt("scheduled_at", to)
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

  const none = { data: [], error: null };

  const [viewingsRes, extraNames] = await Promise.all([
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
  ]);
  for (const [id, n] of extraNames) names.set(id, n);
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? null) : null);

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
      href: null,
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

  for (const r of rows<RawShowing>("showings", showingsRes)) {
    const shown = r.showing_status === "shown";
    // Үзүүлсэн бол бодит цагаар, эс бөгөөс товлосон цагаар (товлосон цаг өнгөрсөн ч «үзүүлсэн» биш).
    const at = shown && r.occurred_at ? r.occurred_at : r.scheduled_at;
    const place = [r.property?.code, r.property?.location_text].filter(Boolean).join(" · ") || "Staff хөрөнгө";
    items.push({
      ...base,
      key: `showing:${r.id}`,
      source: "showing",
      id: r.id,
      title: `Үзүүлэлт: ${place}`,
      subtitle: shown ? "Үзүүлсэн" : "Товлосон",
      start: iso(at),
      end: plus(at, SHOWING_DEFAULT_MINUTES),
      personId: r.agent_id,
      personName: nameOf(r.agent_id),
      personIds: [r.agent_id],
      colorKey: "showing",
      href: calendarHref.deal(basePath, r.property_id, r.deal_id),
      ...lockedMovability(CALENDAR_LOCK_REASON.showing),
      status: r.showing_status,
      done: shown,
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
