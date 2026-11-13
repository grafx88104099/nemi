import { taskBucket, type TaskBucket } from "@/lib/crm2/datetime";
import { crm2Client, crm2Session } from "@/lib/crm2/server";
import type { Crm2ActivityRow, Crm2DealStage, Crm2PropertyCategory, Crm2TaskRow, Crm2TaskStatus } from "@/lib/crm2/types";

/**
 * «Миний ажил» (S09): нээлттэй ажил (дараагийн алхам, сануулга) ба товлосон
 * үзүүлэлтүүд. Хариуцагч солигдоход шинэ хариуцагчийн жагсаалтад шилжинэ.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TASK_LIST_SELECT =
  "id, kind, status, assignee_id, due_at, note, property_id, deal_id, contact_id, requirement_id, brokerage_id, " +
  "source_activity_id, done_at, done_by, created_by, created_at, updated_at, " +
  "assignee:profiles!crm2_tasks_assignee_id_fkey(full_name), " +
  "property:crm2_properties!crm2_tasks_property_id_office_id_fkey(id, code, category, location_text, district), " +
  "contact:crm2_contacts!crm2_tasks_contact_id_office_id_fkey(id, code, full_name), " +
  "deal:crm2_deals!crm2_tasks_deal_id_office_id_fkey(id, code, stage)";

const MY_SHOWINGS_SELECT =
  "id, deal_id, property_id, contact_id, agent_id, scheduled_at, showing_status, note, created_at, " +
  "property:crm2_properties!crm2_activities_property_id_office_id_fkey(id, code, category, location_text, district), " +
  "contact:crm2_contacts!crm2_activities_contact_id_office_id_fkey(id, code, full_name), " +
  "deal:crm2_deals!crm2_activities_deal_id_office_id_fkey(id, code, stage)";

type PropertyLite = { id: string; code: string; category: Crm2PropertyCategory; location_text: string | null; district: string | null };
type ContactLite = { id: string; code: string; full_name: string };
type DealLite = { id: string; code: string; stage: Crm2DealStage };

export type TaskListItem = Omit<Crm2TaskRow, "office_id" | "updated_by"> & {
  assignee: { full_name: string | null } | null;
  /** RLS-ээр харах эрхгүй бол null. */
  property: PropertyLite | null;
  contact: ContactLite | null;
  deal: DealLite | null;
  bucket: TaskBucket;
};

export type TaskListFilters = {
  /** Анхдагч: нэвтэрсэн хэрэглэгч. Ахлагч/менежер багийн гишүүнийхийг харж болно (RLS). */
  assigneeId?: string | null;
  status?: Crm2TaskStatus | "all" | null;
  dealId?: string | null;
  contactId?: string | null;
  propertyId?: string | null;
  limit?: number;
};

/** Жагсаалт ба уншиж чадсан эсэх (`error` = DB/RLS/сүлжээний алдаа — хоосон жагсаалтаас ялгана). */
export type Listed<T> = { items: T[]; error: boolean };

function withBucket(rows: Omit<TaskListItem, "bucket">[], now: number): TaskListItem[] {
  return rows.map((t) => ({ ...t, bucket: t.status === "open" ? taskBucket(t.due_at, now) : "none" }));
}

/** Ажлын жагсаалт (хугацаагаар, хугацаагүй нь сүүлд). */
export async function listTasks(filters: TaskListFilters = {}): Promise<Listed<TaskListItem>> {
  const supabase = await crm2Client();
  let query = supabase.from("crm2_tasks").select(TASK_LIST_SELECT);
  const status = filters.status ?? "open";
  if (status !== "all") query = query.eq("status", status);
  if (filters.assigneeId && UUID_RE.test(filters.assigneeId)) query = query.eq("assignee_id", filters.assigneeId);
  if (filters.dealId && UUID_RE.test(filters.dealId)) query = query.eq("deal_id", filters.dealId);
  if (filters.contactId && UUID_RE.test(filters.contactId)) query = query.eq("contact_id", filters.contactId);
  if (filters.propertyId && UUID_RE.test(filters.propertyId)) query = query.eq("property_id", filters.propertyId);
  const limit = Math.min(Math.max(1, filters.limit ?? 300), 1000);
  const { data, error } = await query
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("crm2 listTasks:", error.message);
    return { items: [], error: true };
  }
  return { items: withBucket((data ?? []) as unknown as Omit<TaskListItem, "bucket">[], Date.now()), error: false };
}

/** «Миний ажил»: миний нээлттэй ажил (хугацаа хэтэрсэн → өнөөдөр → удахгүй → хугацаагүй). */
export async function listMyTasks(opts: { status?: Crm2TaskStatus | "all"; limit?: number } = {}): Promise<Listed<TaskListItem>> {
  const session = await crm2Session();
  if (!session) return { items: [], error: false };
  return listTasks({ assigneeId: session.userId, status: opts.status ?? "open", limit: opts.limit });
}

/** Ажлыг бүлгээр (overdue, today, upcoming, none). */
export function groupTasks(tasks: TaskListItem[]): Record<TaskBucket, TaskListItem[]> {
  const out: Record<TaskBucket, TaskListItem[]> = { overdue: [], today: [], upcoming: [], none: [] };
  for (const t of tasks) out[t.bucket].push(t);
  return out;
}

export type ScheduledShowingItem = Pick<
  Crm2ActivityRow,
  "id" | "deal_id" | "property_id" | "contact_id" | "agent_id" | "scheduled_at" | "showing_status" | "note" | "created_at"
> & {
  property: PropertyLite | null;
  contact: ContactLite | null;
  deal: DealLite | null;
};

/**
 * Миний товлосон үзүүлэлтүүд (хугацаа нь өнгөрсөн ч «товлосон» хэвээр — агент
 * үр дүнгээ бүртгэх хүртэл). Товлосон цагаар өсөхөөр.
 */
export async function listMyScheduledShowings(limit = 200): Promise<Listed<ScheduledShowingItem>> {
  const session = await crm2Session();
  if (!session) return { items: [], error: false };
  const { data, error } = await session.supabase
    .from("crm2_activities")
    .select(MY_SHOWINGS_SELECT)
    .eq("agent_id", session.userId)
    .eq("kind", "showing")
    .eq("showing_status", "scheduled")
    .is("voided_at", null)
    .order("scheduled_at", { ascending: true })
    .limit(Math.min(Math.max(1, limit), 500));
  if (error) {
    console.error("crm2 listMyScheduledShowings:", error.message);
    return { items: [], error: true };
  }
  return { items: (data ?? []) as unknown as ScheduledShowingItem[], error: false };
}
