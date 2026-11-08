import { createClient } from "@/lib/supabase/server";
import { getSettingValue } from "@/lib/queries-crm-core";
import { myCrmContext } from "@/lib/queries-crm-today";
import { getLeadCardSettings } from "@/lib/queries-crm-leads";
import {
  buildWorklists,
  normalizeWorklistSettings,
  vitalsMatrix,
  worklistCounts,
  VITALS_ROLES,
  type OwnerInfo,
  type VitalsRow,
  type WorklistCode,
  type WorklistEntry,
  type WorklistLead,
  type WorklistSettings,
  type WorklistShowing,
} from "@/lib/crm/worklists";
import {
  normalizeLeaderboardSettings,
  periodRange,
  rankLeaderboard,
  type LeaderboardPeriod,
  type LeaderboardRow,
  type LeaderboardSettings,
} from "@/lib/crm/leaderboard";
import { ubIso } from "@/lib/crm/today";
import type { RecontactRanges } from "@/lib/crm/scoring";
import type { CrmRole } from "@/lib/constants-crm";

/**
 * Ажлын жагсаалт (R15), эрүүл мэндийн самбар (R20), тэргүүлэгчид (R22),
 * ажлын цуваа (R13). Хамрах хүрээг RLS тодорхойлно: агент — өөрийн,
 * багийн ахлагч — багийн, удирдлага — оффисын.
 */


type PhoneRow = { raw: string; is_primary: boolean };
type ContactLite = { display_name: string; phones?: PhoneRow[] } | null;
const phoneOf = (c: ContactLite) => {
  const l = c?.phones ?? [];
  return (l.find((p) => p.is_primary) ?? l[0])?.raw ?? null;
};

const LEAD_SELECT =
  "id, status, grade, contact_id, owner_id, created_at, first_contact_at, first_contact_due_at, last_contact_at, " +
  "next_step, next_step_date, " +
  "contact:crm_contacts!crm_leads_contact_id_fkey(display_name, phones:crm_contact_phones(raw, is_primary))";

type RawLead = {
  id: string;
  status: string;
  grade: string | null;
  contact_id: string;
  owner_id: string | null;
  created_at: string;
  first_contact_at: string | null;
  first_contact_due_at: string | null;
  last_contact_at: string | null;
  next_step: string | null;
  next_step_date: string | null;
  contact: ContactLite;
};

export type WorklistData = {
  settings: WorklistSettings;
  lists: Record<WorklistCode, WorklistEntry[]>;
  counts: Record<WorklistCode, number>;
  retryHours: number;
  recontactRanges: RecontactRanges;
  truncated: boolean;
};

const LIMIT = 2000;

async function loadWorklists(scope: "mine" | "team", basePath: string, now: Date): Promise<WorklistData | null> {
  const ctx = await myCrmContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const [raw, card] = await Promise.all([getSettingValue("worklists"), getLeadCardSettings()]);
  const settings = normalizeWorklistSettings(raw);
  const todayIso = ubIso(now);

  let lq = supabase.from("crm_leads").select(LEAD_SELECT).in("status", ["new", "active"]).limit(LIMIT);
  let sq = supabase
    .from("crm_showings")
    .select(
      "id, opportunity_id, contact_id, agent_id, done_at, " +
        "contact:crm_contacts!crm_showings_contact_id_fkey(display_name, phones:crm_contact_phones(raw, is_primary))"
    )
    .eq("status", "done")
    .is("feedback_at", null)
    .limit(LIMIT);
  if (scope === "mine") {
    lq = lq.eq("owner_id", ctx.profileId);
    sq = sq.eq("agent_id", ctx.profileId);
  }
  const [lr, sr] = await Promise.all([lq, sq]);
  if (lr.error) console.error("worklists leads:", lr.error.message);
  if (sr.error) console.error("worklists showings:", sr.error.message);
  const rawLeads = (lr.data ?? []) as unknown as RawLead[];

  // Холбогдож амжаагүй сэжмийн оролдлого (цонхны хугацаанд).
  const unreached = rawLeads.filter((l) => !l.first_contact_at).map((l) => l.id);
  const since = new Date(now.getTime() - settings.fewAttemptsWindowDays * 86_400_000).toISOString();
  const attempts = new Map<string, number>();
  for (let i = 0; i < unreached.length; i += 100) {
    const { data, error } = await supabase
      .from("crm_activities")
      .select("lead_id")
      .in("lead_id", unreached.slice(i, i + 100))
      .neq("channel", "task")
      .gte("occurred_at", since)
      .limit(5000);
    if (error) {
      console.error("worklists attempts:", error.message);
      break;
    }
    for (const a of data ?? []) if (a.lead_id) attempts.set(a.lead_id, (attempts.get(a.lead_id) ?? 0) + 1);
  }

  const leads: WorklistLead[] = rawLeads.map((l) => ({
    id: l.id,
    contactId: l.contact_id,
    contactName: l.contact?.display_name ?? "Нэргүй харилцагч",
    phone: phoneOf(l.contact),
    ownerId: l.owner_id,
    grade: l.grade,
    status: l.status,
    createdAt: l.created_at,
    firstContactAt: l.first_contact_at,
    firstContactDueAt: l.first_contact_due_at,
    lastContactAt: l.last_contact_at,
    nextStep: l.next_step,
    nextStepDate: l.next_step_date,
    attempts: attempts.get(l.id) ?? 0,
  }));
  const showings: WorklistShowing[] = (
    (sr.data ?? []) as unknown as {
      id: string;
      opportunity_id: string | null;
      contact_id: string;
      agent_id: string | null;
      done_at: string | null;
      contact: ContactLite;
    }[]
  )
    .filter((s) => s.done_at)
    .map((s) => ({
      id: s.id,
      opportunityId: s.opportunity_id,
      contactId: s.contact_id,
      contactName: s.contact?.display_name ?? "Нэргүй харилцагч",
      phone: phoneOf(s.contact),
      ownerId: s.agent_id,
      doneAt: s.done_at as string,
    }));

  const lists = buildWorklists(leads, showings, settings, now, todayIso, basePath);
  return {
    settings,
    lists,
    counts: worklistCounts(lists),
    retryHours: card.retryHours,
    recontactRanges: card.recontactRanges,
    truncated: rawLeads.length >= LIMIT,
  };
}

export async function getMyWorklists(basePath = "/agent/crm", now: Date = new Date()): Promise<WorklistData | null> {
  return loadWorklists("mine", basePath, now);
}

export function canSeeVitals(roles: CrmRole[]): boolean {
  return roles.some((r) => VITALS_ROLES.includes(r));
}

export type VitalsData = {
  settings: WorklistSettings;
  rows: VitalsRow[];
  lists: Record<WorklistCode, WorklistEntry[]>;
  teams: { id: string; name: string; branch_id: string | null }[];
  branches: { id: string; name: string }[];
  truncated: boolean;
};

/** R20: эзэмшигч бүрийн жагсаалтын тоо (RLS-ийн хүрээнд). */
export async function getVitals(basePath = "/agent/crm", now: Date = new Date()): Promise<VitalsData | null> {
  const ctx = await myCrmContext();
  if (!ctx || !canSeeVitals(ctx.roles)) return null;
  const supabase = await createClient();
  const [data, staffRes, teamsRes, branchesRes] = await Promise.all([
    loadWorklists("team", basePath, now),
    supabase
      .from("crm_staff")
      .select("profile_id, team_id, branch_id, roles, offboarding, profile:profiles!crm_staff_profile_id_fkey(full_name)")
      .eq("is_active", true),
    supabase.from("crm_teams").select("id, name, branch_id").order("name"),
    supabase.from("crm_branches").select("id, name").eq("is_active", true).order("name"),
  ]);
  if (!data) return null;
  const isManager = ctx.roles.some((r) => r !== "team_lead" && VITALS_ROLES.includes(r));
  const staff = ((staffRes.data ?? []) as unknown as {
    profile_id: string;
    team_id: string | null;
    branch_id: string | null;
    roles: string[];
    offboarding: boolean;
    profile: { full_name: string | null } | null;
  }[]).filter((s) => s.roles.includes("agent") && (isManager || s.team_id === ctx.teamId || s.profile_id === ctx.profileId));
  const owners: OwnerInfo[] = staff.map((s) => ({
    id: s.profile_id,
    name: s.profile?.full_name || "Нэргүй",
    teamId: s.team_id,
    branchId: s.branch_id,
  }));
  return {
    settings: data.settings,
    rows: vitalsMatrix(data.lists, owners),
    lists: data.lists,
    teams: (teamsRes.data ?? []) as { id: string; name: string; branch_id: string | null }[],
    branches: (branchesRes.data ?? []) as { id: string; name: string }[],
    truncated: data.truncated,
  };
}

export type LeaderboardData = {
  period: LeaderboardPeriod;
  range: { from: string; to: string };
  rows: LeaderboardRow[];
  settings: LeaderboardSettings;
  me: string;
  unavailable: boolean;
};

export async function getLeaderboard(period: LeaderboardPeriod, now: Date = new Date()): Promise<LeaderboardData | null> {
  const ctx = await myCrmContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const range = periodRange(period, now);
  const [raw, res] = await Promise.all([
    getSettingValue("leaderboard"),
    supabase.rpc("crm_leaderboard", { p_from: range.from, p_to: range.to }),
  ]);
  const settings = normalizeLeaderboardSettings(raw);
  if (res.error) console.error("getLeaderboard:", res.error.message);
  return {
    period,
    range,
    rows: rankLeaderboard(res.data ?? [], settings),
    settings,
    me: ctx.profileId,
    unavailable: !!res.error,
  };
}

// ── R13 Ажлын цуваа ───────────────────────────────────────

export type TrackStep = { day: number; title: string; hint: string | null };
export type TrackTemplate = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  target: "lead" | "opportunity" | "any";
  steps: TrackStep[];
};

export function parseSteps(raw: unknown): TrackStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      const r = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      return {
        day: Math.max(0, Math.round(Number(r.day) || 0)),
        title: typeof r.title === "string" ? r.title : "Алхам",
        hint: typeof r.hint === "string" ? r.hint : null,
      };
    })
    .slice(0, 10);
}

export async function getTrackTemplates(): Promise<{ templates: TrackTemplate[]; unavailable: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_track_templates")
    .select("id, code, name, description, target, steps")
    .eq("is_active", true)
    .order("sort_order");
  if (error) {
    console.error("getTrackTemplates:", error.message);
    return { templates: [], unavailable: true };
  }
  return {
    templates: (data ?? []).map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      target: (["lead", "opportunity", "any"].includes(t.target) ? t.target : "any") as TrackTemplate["target"],
      steps: parseSteps(t.steps),
    })),
    unavailable: false,
  };
}

export type EnrollmentRow = {
  id: string;
  status: string;
  started_at: string;
  stopped_at: string | null;
  stop_reason: string | null;
  lead_id: string | null;
  opportunity_id: string | null;
  contact_name: string;
  template_name: string;
  owner_id: string;
  total: number;
  done: number;
};

export async function getMyEnrollments(limit = 50): Promise<{ rows: EnrollmentRow[]; unavailable: boolean }> {
  const ctx = await myCrmContext();
  if (!ctx) return { rows: [], unavailable: true };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_track_enrollments")
    .select(
      "id, status, started_at, stopped_at, stop_reason, lead_id, opportunity_id, owner_id, " +
        "contact:crm_contacts!crm_track_enrollments_contact_id_fkey(display_name), " +
        "template:crm_track_templates!crm_track_enrollments_template_id_fkey(name), " +
        "steps:crm_track_tasks(task:tasks!crm_track_tasks_task_id_fkey(status))"
    )
    .eq("owner_id", ctx.profileId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getMyEnrollments:", error.message);
    return { rows: [], unavailable: true };
  }
  type Raw = {
    id: string;
    status: string;
    started_at: string;
    stopped_at: string | null;
    stop_reason: string | null;
    lead_id: string | null;
    opportunity_id: string | null;
    owner_id: string;
    contact: { display_name: string } | null;
    template: { name: string } | null;
    steps: { task: { status: string } | null }[] | null;
  };
  return {
    rows: ((data ?? []) as unknown as Raw[]).map((r) => ({
      id: r.id,
      status: r.status,
      started_at: r.started_at,
      stopped_at: r.stopped_at,
      stop_reason: r.stop_reason,
      lead_id: r.lead_id,
      opportunity_id: r.opportunity_id,
      owner_id: r.owner_id,
      contact_name: r.contact?.display_name ?? "Нэргүй харилцагч",
      template_name: r.template?.name ?? "Ажлын цуваа",
      total: r.steps?.length ?? 0,
      done: (r.steps ?? []).filter((s) => s.task?.status === "completed").length,
    })),
    unavailable: false,
  };
}

export { VITALS_ROLES };
