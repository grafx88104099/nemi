import { createClient } from "@/lib/supabase/server";
import { getLeadCardSettings } from "@/lib/queries-crm-leads";
import { personAvatar } from "@/lib/crm/avatar";
import { isOpenLeadStatus, parseListingSnapshot } from "@/lib/crm/lead-listing";
import {
  countMemberLeads,
  isNextStepOverdue,
  monitorPeriods,
  type MemberLeadCounts,
  type MonitorOwnedLead,
} from "@/lib/crm/team-monitor";
import type { CrmLifecycle, CrmRole, LeadGrade } from "@/lib/constants-crm";

/**
 * Багийн гишүүдийн сэжим, явцын хяналт — хэрэглэгчийн өөрийн эрхээр (RLS):
 * ахлагч зөвхөн өөрийн багийн гишүүдийн, удирдлага оффисын сэжмийг харна.
 */

export type TeamMonitorMember = MemberLeadCounts & {
  profileId: string;
  name: string;
  avatarSrc: string | null;
  initials: string;
  isLead: boolean;
  openOpps: number;
  wonOpps: number;
  lastActivityAt: string | null;
};

export type TeamMonitorData = {
  team: { id: string; name: string };
  members: TeamMonitorMember[];
  /** Уншилт алдаатай бол тоог 0 гэж харуулж болохгүй. */
  unavailable: boolean;
  /** Мөрийн дээд хязгаарт хүрсэн тул тоо дутуу байж болзошгүй. */
  truncated: boolean;
};

export type TeamMemberLead = {
  id: string;
  contactName: string;
  status: CrmLifecycle;
  grade: LeadGrade | null;
  listingTitle: string | null;
  lastContactAt: string | null;
  nextStep: string | null;
  nextStepDate: string | null;
  nextStepOverdue: boolean;
  /** false бол гишүүн бүртгэсэн ч өөр хүн эзэмшдэг эсвэл эзэмшигчгүй. */
  ownedByMember: boolean;
  ownerName: string | null;
};

export type TeamMemberOpportunity = {
  id: string;
  contactName: string;
  stageName: string | null;
  pipelineName: string | null;
  nextStep: string | null;
  nextStepDate: string | null;
  nextStepOverdue: boolean;
};

export type TeamMemberDetail = {
  leads: TeamMemberLead[];
  opportunities: TeamMemberOpportunity[];
  leadsTruncated: boolean;
  unavailable: boolean;
};

export const TEAM_MEMBER_LEADS_LIMIT = 300;

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
  "profile_id, roles, profile:profiles!crm_staff_profile_id_fkey(full_name, avatar_url)";

type RawMember = {
  profile_id: string;
  roles: CrmRole[] | null;
  profile: { full_name: string | null; avatar_url: string | null } | null;
};

const OWNED_LEAD_SELECT =
  "id, owner_id, status, created_at, received_at, first_contact_at, first_contact_due_at, next_step, next_step_date";

type OwnedLeadRow = MonitorOwnedLead & { owner_id: string };
type RegisteredLeadRow = { created_by: string; created_at: string };
type OppRow = { owner_id: string; state: string };

/** «task» сувгийн бичлэг харилцагчтай холбогдсон үйл биш (эхний холболтын дүрэмтэй ижил). */
async function latestActivity(supabase: ServerClient, profileId: string): Promise<{ at: string | null; failed: boolean }> {
  const { data, error } = await supabase
    .from("crm_activities")
    .select("occurred_at")
    .eq("owner_id", profileId)
    .neq("channel", "task")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error("latestActivity:", error.message);
  return { at: data?.occurred_at ?? null, failed: !!error };
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
  if (staffRes.error || staff.length === 0) {
    return { team, members: [], unavailable: !!staffRes.error, truncated: false };
  }

  const ids = staff.map((s) => s.profile_id);
  const periods = monitorPeriods(now);
  const [agentsRes, settings, owned, registered, opps, activity] = await Promise.all([
    supabase.from("agents").select("profile_id, display_name, avatar, avatar_url").eq("office_id", officeId).in("profile_id", ids),
    getLeadCardSettings(),
    readAll<OwnedLeadRow>("getTeamMonitor owned", (from, to) =>
      supabase.from("crm_leads").select(OWNED_LEAD_SELECT).in("owner_id", ids).in("status", ["new", "active"]).order("id").range(from, to)
    ),
    readAll<RegisteredLeadRow>("getTeamMonitor registered", (from, to) =>
      supabase
        .from("crm_leads")
        .select("id, created_by, created_at")
        .in("created_by", ids)
        .gte("created_at", periods.since.toISOString())
        .order("id")
        .range(from, to)
    ),
    readAll<OppRow>("getTeamMonitor opportunities", (from, to) =>
      supabase.from("crm_opportunities").select("id, owner_id, state").in("owner_id", ids).in("state", ["open", "won"]).order("id").range(from, to)
    ),
    Promise.all(ids.map((id) => latestActivity(supabase, id))),
  ]);
  if (agentsRes.error) console.error("getTeamMonitor agents:", agentsRes.error.message);

  const agentByProfile = new Map((agentsRes.data ?? []).map((a) => [a.profile_id, a]));
  const ownedByMember = groupBy(owned.rows, (l) => l.owner_id);
  const registeredByMember = groupBy(registered.rows, (l) => l.created_by);
  const oppsByMember = groupBy(opps.rows, (o) => o.owner_id);

  const members = staff
    .map((s, i): TeamMonitorMember => {
      const agent = agentByProfile.get(s.profile_id);
      const name = agent?.display_name || s.profile?.full_name || "Хэрэглэгч";
      const { src, initials } = personAvatar(agent?.avatar_url ?? agent?.avatar ?? s.profile?.avatar_url ?? null, name);
      const memberOpps = oppsByMember.get(s.profile_id) ?? [];
      return {
        profileId: s.profile_id,
        name,
        avatarSrc: src,
        initials,
        isLead: s.profile_id === leadProfileId && !!s.roles?.includes("team_lead"),
        ...countMemberLeads(
          ownedByMember.get(s.profile_id) ?? [],
          registeredByMember.get(s.profile_id) ?? [],
          periods,
          now,
          settings.noContactHours
        ),
        openOpps: memberOpps.filter((o) => o.state === "open").length,
        wonOpps: memberOpps.filter((o) => o.state === "won").length,
        lastActivityAt: activity[i].at,
      };
    })
    .sort((a, b) => Number(b.isLead) - Number(a.isLead) || a.name.localeCompare(b.name, "mn"));

  return {
    team,
    members,
    unavailable: owned.failed || registered.failed || opps.failed || activity.some((a) => a.failed),
    truncated: owned.truncated || registered.truncated || opps.truncated,
  };
}

const DETAIL_LEAD_SELECT =
  "id, status, grade, owner_id, last_contact_at, next_step, next_step_date, listing_snapshot, " +
  "live_listing:listings!crm_leads_listing_id_fkey(status, title), " +
  "owner:profiles!crm_leads_owner_id_fkey(full_name), " +
  "contact:crm_contacts!crm_leads_contact_id_fkey(display_name)";

type RawDetailLead = {
  id: string;
  status: CrmLifecycle;
  grade: LeadGrade | null;
  owner_id: string | null;
  last_contact_at: string | null;
  next_step: string | null;
  next_step_date: string | null;
  listing_snapshot: unknown;
  live_listing: { status: string; title: string } | null;
  owner: { full_name: string | null } | null;
  contact: { display_name: string } | null;
};

const DETAIL_OPP_SELECT =
  "id, next_step, next_step_date, " +
  "contact:crm_contacts!crm_opportunities_contact_id_fkey(display_name), " +
  "stage:crm_stages!crm_opportunities_stage_id_fkey(name), " +
  "pipeline:crm_pipelines!crm_opportunities_pipeline_id_fkey(name)";

type RawDetailOpp = {
  id: string;
  next_step: string | null;
  next_step_date: string | null;
  contact: { display_name: string } | null;
  stage: { name: string } | null;
  pipeline: { name: string } | null;
};

const CONTACT_FALLBACK = "Нэргүй харилцагч";

/** Гишүүний бүртгэсэн эсвэл эзэмшдэг сэжим, нээлттэй боломж. */
export async function getTeamMemberDetail(profileId: string, now: Date = new Date()): Promise<TeamMemberDetail> {
  const supabase = await createClient();
  const { todayIso } = monitorPeriods(now);
  const [leadsRes, oppsRes] = await Promise.all([
    supabase
      .from("crm_leads")
      .select(DETAIL_LEAD_SELECT)
      .or(`owner_id.eq.${profileId},created_by.eq.${profileId}`)
      .order("created_at", { ascending: false })
      .limit(TEAM_MEMBER_LEADS_LIMIT),
    supabase
      .from("crm_opportunities")
      .select(DETAIL_OPP_SELECT)
      .eq("owner_id", profileId)
      .eq("state", "open")
      .order("stage_entered_at", { ascending: false })
      .limit(TEAM_MEMBER_LEADS_LIMIT),
  ]);
  if (leadsRes.error) console.error("getTeamMemberDetail leads:", leadsRes.error.message);
  if (oppsRes.error) console.error("getTeamMemberDetail opportunities:", oppsRes.error.message);

  const rawLeads = (leadsRes.data ?? []) as unknown as RawDetailLead[];
  const leads = rawLeads
    .map((l): TeamMemberLead => ({
      id: l.id,
      contactName: l.contact?.display_name ?? CONTACT_FALLBACK,
      status: l.status,
      grade: l.grade,
      listingTitle:
        (l.live_listing?.status === "active" ? l.live_listing.title : null) ??
        parseListingSnapshot(l.listing_snapshot)?.title ??
        null,
      lastContactAt: l.last_contact_at,
      nextStep: l.next_step,
      nextStepDate: l.next_step_date,
      nextStepOverdue: isNextStepOverdue(l, todayIso),
      ownedByMember: l.owner_id === profileId,
      ownerName: l.owner?.full_name ?? null,
    }))
    .sort((a, b) => Number(isOpenLeadStatus(b.status)) - Number(isOpenLeadStatus(a.status)));

  const opportunities = ((oppsRes.data ?? []) as unknown as RawDetailOpp[]).map(
    (o): TeamMemberOpportunity => ({
      id: o.id,
      contactName: o.contact?.display_name ?? CONTACT_FALLBACK,
      stageName: o.stage?.name ?? null,
      pipelineName: o.pipeline?.name ?? null,
      nextStep: o.next_step,
      nextStepDate: o.next_step_date,
      nextStepOverdue: !!o.next_step_date && o.next_step_date < todayIso,
    })
  );

  return {
    leads,
    opportunities,
    leadsTruncated: rawLeads.length >= TEAM_MEMBER_LEADS_LIMIT,
    unavailable: !!leadsRes.error || !!oppsRes.error,
  };
}
