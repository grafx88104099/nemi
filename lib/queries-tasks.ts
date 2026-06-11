import { createClient } from "@/lib/supabase/server";
import type { TaskStatus, TaskPriority, TaskMemberRole, TaskRoleFilter } from "@/lib/constants";

/**
 * Даалгаврын уншилтууд. RLS бүх хамрах хүрээг шийднэ:
 * оффис админ — оффисынхоо бүх даалгавар, агент — зөвхөн гишүүн даалгавар.
 */

export type TaskFilters = {
  role?: TaskRoleFilter;
  status?: TaskStatus;
  q?: string;
};

export type TaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string | null;
  tags: string[];
  created_by: string;
  responsible_id: string;
  created_at: string;
  last_activity_at: string | null;
  project: { id: string; title: string } | null;
  creator: { id: string; full_name: string | null } | null;
  responsible: { id: string; full_name: string | null } | null;
  members: { profile_id: string; role: TaskMemberRole }[];
  comment_count: number;
};

const TASK_ROW_SELECT =
  "id, title, status, priority, deadline, tags, created_by, responsible_id, created_at, last_activity_at, " +
  "project:projects(id, title), " +
  "creator:profiles!tasks_created_by_fkey(id, full_name), " +
  "responsible:profiles!tasks_responsible_id_fkey(id, full_name), " +
  "members:task_members(profile_id, role), " +
  "comments:task_comments(count)";

type RawRow = Omit<TaskRow, "comment_count"> & { comments: { count: number }[] };

function toRow(r: RawRow): TaskRow {
  const { comments, ...rest } = r;
  return { ...rest, comment_count: comments?.[0]?.count ?? 0 };
}

/** «Миний үүрэг» шүүлтийг санах ойд хийнэ (embedded хүснэгт дээр .or() ярвигтай). */
function applyRoleFilter(rows: TaskRow[], role: TaskRoleFilter | undefined, uid: string): TaskRow[] {
  if (!role || role === "all") return rows;
  return rows.filter((t) => {
    if (role === "responsible") return t.responsible_id === uid;
    if (role === "creator") return t.created_by === uid;
    return t.members.some((m) => m.profile_id === uid && m.role === role);
  });
}

async function fetchTasks(filters: TaskFilters): Promise<{ rows: TaskRow[]; uid: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { rows: [], uid: null };

  let query = supabase
    .from("tasks")
    .select(TASK_ROW_SELECT)
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.q) query = query.ilike("title", `%${filters.q}%`);

  const { data, error } = await query;
  if (error) {
    console.error("fetchTasks:", error.message);
    return { rows: [], uid: user.id };
  }
  const rows = ((data ?? []) as unknown as RawRow[]).map(toRow);
  return { rows: applyRoleFilter(rows, filters.role, user.id), uid: user.id };
}

/** Оффисын бүх даалгавар (оффис админд RLS бүгдийг нээнэ). */
export async function getOfficeTasks(filters: TaskFilters = {}): Promise<TaskRow[]> {
  return (await fetchTasks(filters)).rows;
}

/** Агентын даалгаврууд (RLS зөвхөн гишүүн даалгаврыг буцаана). */
export async function getMyTasks(filters: TaskFilters = {}): Promise<TaskRow[]> {
  return (await fetchTasks(filters)).rows;
}

export type TaskComment = {
  id: string;
  body: string;
  created_at: string;
  author: { id: string; full_name: string | null } | null;
};

export type TaskChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  sort_order: number;
};

export type TaskDetail = TaskRow & {
  description: string | null;
  completed_at: string | null;
  memberProfiles: { profile_id: string; role: TaskMemberRole; full_name: string | null }[];
  comments: TaskComment[];
  checklist: TaskChecklistItem[];
};

/** Нэг даалгавар — гишүүд, сэтгэгдэл, checklist-тэй нь. */
export async function getTask(id: string): Promise<TaskDetail | null> {
  const supabase = await createClient();
  const [{ data: task, error }, { data: comments }, { data: checklist }, { data: members }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select(TASK_ROW_SELECT + ", description, completed_at")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("task_comments")
        .select("id, body, created_at, author:profiles(id, full_name)")
        .eq("task_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("task_checklist_items")
        .select("id, label, done, sort_order")
        .eq("task_id", id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("task_members")
        .select("profile_id, role, profile:profiles(full_name)")
        .eq("task_id", id),
    ]);
  if (error) console.error("getTask:", error.message);
  if (!task) return null;

  const detail = task as unknown as RawRow & { description: string | null; completed_at: string | null };
  const row = toRow(detail);
  return {
    ...row,
    description: detail.description,
    completed_at: detail.completed_at,
    memberProfiles: ((members ?? []) as unknown as { profile_id: string; role: TaskMemberRole; profile: { full_name: string | null } | null }[]).map(
      (m) => ({ profile_id: m.profile_id, role: m.role, full_name: m.profile?.full_name ?? null })
    ),
    comments: ((comments ?? []) as unknown as TaskComment[]),
    checklist: (checklist ?? []) as TaskChecklistItem[],
  };
}

export type AssigneeOption = { profileId: string; name: string };

/**
 * Даалгавар оноох боломжтой хүмүүс — оффисын идэвхтэй агентууд + оффис админ(ууд).
 * Дуудагчийн оффисыг profiles → agents fallback-аар тогтооно.
 */
export async function getAssigneeOptions(): Promise<AssigneeOption[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("office_id")
    .eq("id", user.id)
    .maybeSingle();
  let officeId = profile?.office_id ?? null;
  if (!officeId) {
    const { data: agent } = await supabase
      .from("agents")
      .select("office_id")
      .eq("profile_id", user.id)
      .maybeSingle();
    officeId = agent?.office_id ?? null;
  }
  if (!officeId) return [];

  const [{ data: agents }, { data: admins }] = await Promise.all([
    supabase
      .from("agents")
      .select("profile_id, display_name")
      .eq("office_id", officeId)
      .eq("status", "active")
      .not("profile_id", "is", null),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("office_id", officeId)
      .eq("role", "office_admin"),
  ]);

  const seen = new Set<string>();
  const out: AssigneeOption[] = [];
  for (const a of agents ?? []) {
    if (a.profile_id && !seen.has(a.profile_id)) {
      seen.add(a.profile_id);
      out.push({ profileId: a.profile_id, name: a.display_name ?? "Агент" });
    }
  }
  for (const p of admins ?? []) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      out.push({ profileId: p.id, name: (p.full_name ?? "Оффис админ") + " (админ)" });
    }
  }
  return out;
}

/** Даалгаварт холбож болох төслүүд (оффисын агентуудынх; RLS хамрах хүрээг шийднэ). */
export async function getProjectOptions(): Promise<{ id: string; title: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, title")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as { id: string; title: string }[];
}
