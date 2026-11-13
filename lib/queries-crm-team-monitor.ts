import { createClient } from "@/lib/supabase/server";
import { personAvatar } from "@/lib/avatar";
import {
  countMemberMetrics,
  groupTeamProgress,
  inTeamProgressScope,
  memberPropertyIds,
  monitorPeriods,
  type MemberPropertyIds,
  type MonitorActivity,
  type MonitorDeal,
  type MonitorMetrics,
  type MonitorProperty,
  type MonitorTask,
  type ProgressGroup,
} from "@/lib/crm/team-monitor";
import type { CrmRole } from "@/lib/constants-crm";

/**
 * Багийн гишүүдийн Staff ажлын хяналт — хэрэглэгчийн өөрийн эрхээр (RLS):
 * ахлагч өөрийн багийн гишүүдийн, удирдлага оффисын хэлцэл, дуудлага, үзүүлэлтийг харна.
 */

export type TeamMonitorMember = MonitorMetrics & {
  profileId: string;
  /** null = багт хуваарилагдаагүй. */
  teamId: string | null;
  name: string;
  avatarSrc: string | null;
  initials: string;
  isLead: boolean;
  lastActivityAt: string | null;
  /** Багийн нийтэд Staff хөрөнгийг давхардалгүй тоолоход. */
  propertyIds: MemberPropertyIds;
};

export type TeamMonitorData = {
  team: { id: string; name: string };
  members: TeamMonitorMember[];
  /** Уншилт алдаатай бол тоог 0 гэж харуулж болохгүй. */
  unavailable: boolean;
  /** Мөрийн дээд хязгаарт хүрсэн тул тоо дутуу байж болзошгүй. */
  truncated: boolean;
};

export type TeamMemberDeal = {
  id: string;
  code: string;
  propertyId: string;
  propertyCode: string | null;
  propertyPlace: string | null;
  contactName: string | null;
  stage: string;
  lastActivityAt: string | null;
};

export type TeamMemberDetail = {
  deals: TeamMemberDeal[];
  dealsTruncated: boolean;
  unavailable: boolean;
};

export const TEAM_MEMBER_DEALS_LIMIT = 300;

const PAGE_SIZE = 500;
const MAX_ROWS = 20_000;

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type Page = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** PostgREST нэг хариунд max_rows-оос олон мөр өгдөггүй тул тоо дутахгүйн тулд хуудаслана. */
async function readAll<T>(
  label: string,
  page: (from: number, to: number) => Page
): Promise<{ rows: T[]; failed: boolean; truncated: boolean }> {
  const rows: T[] = [];
  while (rows.length < MAX_ROWS) {
    const { data, error } = await page(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) {
      console.error(`${label}:`, error.message);
      return { rows, failed: true, truncated: false };
    }
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { rows, failed: false, truncated: false };
  }
  return { rows, failed: false, truncated: true };
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

const MEMBER_SELECT =
  "profile_id, team_id, roles, profile:profiles!crm_staff_profile_id_fkey(full_name, avatar_url, role)";

type RawMember = {
  profile_id: string;
  team_id: string | null;
  roles: CrmRole[] | null;
  profile: { full_name: string | null; avatar_url: string | null; role: string | null } | null;
};

/** Гишүүний хамгийн сүүлд бүртгэсэн дуудлага/үзүүлэлт. */
async function latestActivity(supabase: ServerClient, profileId: string): Promise<{ at: string | null; failed: boolean }> {
  const { data, error } = await supabase
    .from("crm2_activities")
    .select("created_at")
    .eq("agent_id", profileId)
    .is("voided_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error("latestActivity:", error.message);
  return { at: data?.created_at ?? null, failed: !!error };
}

type MembersProgress = Pick<TeamMonitorData, "members" | "unavailable" | "truncated">;

/**
 * Гишүүдийн Staff хөрөнгө, хэлцэл, дуудлага/үзүүлэлт, ажлыг нэг удаа (хуудаслан) уншиж
 * кодонд гишүүнээр бүлэглэнэ. isRecordedLead: өөрийн багийн ахлагчаар бичигдсэн эсэх.
 */
async function readMembersProgress(
  label: string,
  supabase: ServerClient,
  officeId: string,
  staff: RawMember[],
  isRecordedLead: (s: RawMember) => boolean,
  now: Date
): Promise<MembersProgress> {
  if (staff.length === 0) return { members: [], unavailable: false, truncated: false };

  const ids = staff.map((s) => s.profile_id);
  const idList = ids.join(",");
  const periods = monitorPeriods(now);
  const sinceIso = periods.since.toISOString();
  const [agentsRes, properties, deals, activities, scheduled, tasks, activity] = await Promise.all([
    supabase.from("agents").select("profile_id, display_name, avatar, avatar_url").eq("office_id", officeId).in("profile_id", ids),
    readAll<MonitorProperty>(`${label} properties`, (from, to) =>
      supabase
        .from("crm2_properties")
        .select("id, status, listing_agent_id, contract_agent_id, photo_agent_id")
        .in("status", ["active", "draft"])
        .or(`listing_agent_id.in.(${idList}),contract_agent_id.in.(${idList}),photo_agent_id.in.(${idList})`)
        .order("id")
        .range(from, to)
    ),
    // Нээлттэй, эсвэл энэ хугацаанд баталгаажсан/цуцлагдсан хэлцэл.
    readAll<MonitorDeal>(`${label} deals`, (from, to) =>
      supabase
        .from("crm2_deals")
        .select("id, agent_id, is_open, confirmed_at, cancelled_at")
        .in("agent_id", ids)
        .or(`is_open.eq.true,confirmed_at.gte."${sinceIso}",cancelled_at.gte."${sinceIso}"`)
        .order("id")
        .range(from, to)
    ),
    readAll<MonitorActivity>(`${label} activities`, (from, to) =>
      supabase
        .from("crm2_activities")
        .select("id, agent_id, kind, occurred_at, showing_status")
        .in("agent_id", ids)
        .is("voided_at", null)
        .gte("occurred_at", sinceIso)
        .order("id")
        .range(from, to)
    ),
    readAll<MonitorActivity>(`${label} scheduled showings`, (from, to) =>
      supabase
        .from("crm2_activities")
        .select("id, agent_id, kind, occurred_at, showing_status")
        .in("agent_id", ids)
        .eq("kind", "showing")
        .eq("showing_status", "scheduled")
        .is("voided_at", null)
        .order("id")
        .range(from, to)
    ),
    readAll<MonitorTask>(`${label} tasks`, (from, to) =>
      supabase
        .from("crm2_tasks")
        .select("id, assignee_id, due_at")
        .in("assignee_id", ids)
        .eq("status", "open")
        .lt("due_at", now.toISOString())
        .order("id")
        .range(from, to)
    ),
    Promise.all(ids.map((id) => latestActivity(supabase, id))),
  ]);
  if (agentsRes.error) console.error(`${label} agents:`, agentsRes.error.message);

  const agentByProfile = new Map((agentsRes.data ?? []).map((a) => [a.profile_id, a]));
  const dealsByMember = groupBy(deals.rows, (d) => d.agent_id);
  // Үзүүлсэн/дуудлага (энэ хугацаанд) + одоо товлогдсон — товлосон үзүүлэлтэд бодит цаг байхгүй тул давхцахгүй.
  const activitiesByMember = groupBy(
    [...activities.rows.filter((a) => a.showing_status !== "scheduled"), ...scheduled.rows],
    (a) => a.agent_id
  );
  const tasksByMember = groupBy(tasks.rows, (t) => t.assignee_id);

  const members = staff
    .map((s, i): TeamMonitorMember => {
      const agent = agentByProfile.get(s.profile_id);
      const name = agent?.display_name || s.profile?.full_name || "Хэрэглэгч";
      const { src, initials } = personAvatar(agent?.avatar_url ?? agent?.avatar ?? s.profile?.avatar_url ?? null, name);
      const propertyIds = memberPropertyIds(properties.rows, s.profile_id);
      return {
        profileId: s.profile_id,
        teamId: s.team_id,
        name,
        avatarSrc: src,
        initials,
        isLead: isRecordedLead(s) && !!s.roles?.includes("team_lead"),
        ...countMemberMetrics({
          propertyIds,
          deals: dealsByMember.get(s.profile_id) ?? [],
          activities: activitiesByMember.get(s.profile_id) ?? [],
          tasks: tasksByMember.get(s.profile_id) ?? [],
          periods,
          now,
        }),
        propertyIds,
        lastActivityAt: activity[i].at,
      };
    })
    .sort((a, b) => Number(b.isLead) - Number(a.isLead) || a.name.localeCompare(b.name, "mn"));

  const reads = [properties, deals, activities, scheduled, tasks];
  return {
    members,
    unavailable: reads.some((r) => r.failed) || activity.some((a) => a.failed),
    truncated: reads.some((r) => r.truncated),
  };
}

/** Баг олдоогүй эсвэл хандах эрхгүй бол null. */
export async function getTeamMonitor(teamId: string, now: Date = new Date()): Promise<TeamMonitorData | null> {
  const supabase = await createClient();
  const [teamRes, staffRes] = await Promise.all([
    supabase.from("crm_teams").select("id, name, office_id, lead_profile_id").eq("id", teamId).maybeSingle(),
    supabase.from("crm_staff").select(MEMBER_SELECT).eq("team_id", teamId).eq("is_active", true),
  ]);
  if (teamRes.error) console.error("getTeamMonitor team:", teamRes.error.message);
  if (staffRes.error) console.error("getTeamMonitor staff:", staffRes.error.message);
  if (!teamRes.data) return null;

  const { office_id: officeId, lead_profile_id: leadProfileId } = teamRes.data;
  const team = { id: teamRes.data.id, name: teamRes.data.name };
  const staff = (staffRes.data ?? []) as unknown as RawMember[];
  if (staffRes.error) return { team, members: [], unavailable: true, truncated: false };

  const progress = await readMembersProgress(
    "getTeamMonitor",
    supabase,
    officeId,
    staff,
    (s) => s.profile_id === leadProfileId,
    now
  );
  return { team, ...progress };
}

export type TeamProgressSection = ProgressGroup<TeamMonitorMember> & {
  team: { id: string; name: string; branchName: string | null };
  /** null = ахлагч томилоогүй (эсвэл бичигдсэн хүн гишүүн биш, ахлагчийн дүргүй). */
  lead: TeamMonitorMember | null;
  /** Оффисын админы батлалт хүлээж буй ахлагчийн санал (гишүүнээс нэр нь); null = санал алга. */
  pendingLead: { name: string } | null;
};

export type OfficeTeamsProgress = {
  teams: TeamProgressSection[];
  /** Багт хуваарилагдаагүй идэвхтэй агентууд. */
  unassigned: ProgressGroup<TeamMonitorMember>;
  totals: MonitorMetrics;
  memberCount: number;
  /** Уншилт алдаатай бол тоог 0 гэж харуулж болохгүй. */
  unavailable: boolean;
  truncated: boolean;
};

const PROGRESS_TEAM_SELECT =
  "id, name, lead_profile_id, pending_lead_profile_id, branch:crm_branches!crm_teams_branch_id_office_id_fkey(name)";

type RawProgressTeam = {
  id: string;
  name: string;
  lead_profile_id: string | null;
  pending_lead_profile_id: string | null;
  branch: { name: string } | null;
};

/**
 * Оффисын бүх баг ба багт хуваарилагдаагүй агентуудын явц — getTeamMonitor-той ижил
 * тодорхойлолт, мөрүүдийг нэг удаа уншина. Дуудах хуудас эрхийг шалгана.
 */
export async function getOfficeTeamsProgress(officeId: string, now: Date = new Date()): Promise<OfficeTeamsProgress> {
  const supabase = await createClient();
  const [teamsRes, staffRes] = await Promise.all([
    supabase.from("crm_teams").select(PROGRESS_TEAM_SELECT).eq("office_id", officeId).order("name"),
    supabase.from("crm_staff").select(MEMBER_SELECT).eq("office_id", officeId).eq("is_active", true),
  ]);
  if (teamsRes.error) console.error("getOfficeTeamsProgress teams:", teamsRes.error.message);
  if (staffRes.error) console.error("getOfficeTeamsProgress staff:", staffRes.error.message);

  const teams = (teamsRes.data ?? []) as unknown as RawProgressTeam[];
  const teamIds = new Set(teams.map((t) => t.id));
  const leadByTeam = new Map(teams.map((t) => [t.id, t.lead_profile_id]));
  const staff = ((staffRes.data ?? []) as unknown as RawMember[]).filter((s) =>
    inTeamProgressScope({ teamId: s.team_id, roles: s.roles, userRole: s.profile?.role ?? null }, teamIds)
  );

  const progress: MembersProgress =
    teamsRes.error || staffRes.error
      ? { members: [], unavailable: true, truncated: false }
      : await readMembersProgress(
          "getOfficeTeamsProgress",
          supabase,
          officeId,
          staff,
          (s) => !!s.team_id && leadByTeam.get(s.team_id) === s.profile_id,
          now
        );

  const grouped = groupTeamProgress(teams, progress.members);
  return {
    teams: grouped.teams.map(({ team, members, totals }) => ({
      team: { id: team.id, name: team.name, branchName: team.branch?.name ?? null },
      lead: members.find((m) => m.isLead) ?? null,
      // Санал болгогдсон хүн багийн идэвхтэй гишүүн байх ёстой (гарвал DB саналыг цэвэрлэнэ).
      pendingLead: team.pending_lead_profile_id
        ? { name: members.find((m) => m.profileId === team.pending_lead_profile_id)?.name ?? "Хэрэглэгч" }
        : null,
      members,
      totals,
    })),
    unassigned: grouped.unassigned,
    totals: grouped.totals,
    memberCount: progress.members.length,
    unavailable: progress.unavailable,
    truncated: progress.truncated,
  };
}

const DETAIL_DEAL_SELECT =
  "id, code, property_id, stage, last_activity_at, " +
  "property:crm2_properties!crm2_deals_property_id_office_id_fkey(code, location_text), " +
  "contact:crm2_contacts!crm2_deals_contact_id_office_id_fkey(full_name)";

type RawDetailDeal = {
  id: string;
  code: string;
  property_id: string;
  stage: string;
  last_activity_at: string | null;
  property: { code: string; location_text: string | null } | null;
  contact: { full_name: string } | null;
};

/** Гишүүний хариуцсан нээлттэй хэлцлүүд (хөрөнгө × харилцагч), сүүлийн үйлдлээр. */
export async function getTeamMemberDetail(profileId: string): Promise<TeamMemberDetail> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm2_deals")
    .select(DETAIL_DEAL_SELECT)
    .eq("agent_id", profileId)
    .eq("is_open", true)
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(TEAM_MEMBER_DEALS_LIMIT);
  if (error) console.error("getTeamMemberDetail deals:", error.message);

  const raw = (data ?? []) as unknown as RawDetailDeal[];
  return {
    deals: raw.map((d) => ({
      id: d.id,
      code: d.code,
      propertyId: d.property_id,
      propertyCode: d.property?.code ?? null,
      propertyPlace: d.property?.location_text ?? null,
      // Харилцагчийг харах эрхгүй бол RLS embed-ийг хоосон буцаана.
      contactName: d.contact?.full_name ?? null,
      stage: d.stage,
      lastActivityAt: d.last_activity_at,
    })),
    dealsTruncated: raw.length >= TEAM_MEMBER_DEALS_LIMIT,
    unavailable: !!error,
  };
}
