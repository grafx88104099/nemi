"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  ACTIVITY_KINDS,
  type ActivityKind,
  PROJECT_TYPES,
  PROJECT_STATUSES,
  type ProjectType,
  type ProjectStatus,
} from "@/lib/constants";

/** Нэвтэрсэн хэрэглэгчийн agent id (эс бөгөөс null). */
async function myAgentId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("agents")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

// Хуучин лидийн (leads) бүртгэл хаалттай — зөвхөн төслийн үйл явдлыг бүртгэнэ.
const LEGACY_CLOSED = "Хуучин лидэд бүртгэл нэмэхгүй — CRM → Харилцагчид хэсэгт бүртгэнэ үү.";

// ── Үйл явдлын лог ────────────────────────────────────────

export type ActivityInput = {
  leadId?: string;
  projectId?: string;
  kind: ActivityKind;
  summary: string;
  outcome?: string;
  durationMin?: number | null;
  occurredAt?: string;
};

/** Төсөлд дуудлага/уулзалт/тэмдэглэл бүртгэнэ. */
export async function logActivity(input: ActivityInput): Promise<{ ok: boolean; error?: string }> {
  if (!ACTIVITY_KINDS.includes(input.kind)) return { ok: false, error: "Буруу төрөл." };
  const summary = input.summary?.trim();
  if (!summary) return { ok: false, error: "Товч агуулга оруулна уу." };
  if (input.leadId) return { ok: false, error: LEGACY_CLOSED };
  if (!input.projectId) return { ok: false, error: "Төсөл сонгоно уу." };

  const supabase = await createClient();
  const agentId = await myAgentId(supabase);
  if (!agentId) return { ok: false, error: "Зөвхөн агент бүртгэнэ." };

  // Төслийн эзэмшлийг шалгана.
  if (input.projectId) {
    const { data } = await supabase.from("projects").select("id").eq("id", input.projectId).eq("agent_id", agentId).maybeSingle();
    if (!data) return { ok: false, error: "Төсөл олдсонгүй эсвэл танд эрх алга." };
  }

  const { error } = await supabase.from("lead_activities").insert({
    agent_id: agentId,
    lead_id: null,
    project_id: input.projectId || null,
    kind: input.kind,
    summary,
    outcome: input.outcome?.trim() || null,
    duration_min: input.durationMin ?? null,
    occurred_at: input.occurredAt || undefined,
  });
  if (error) return { ok: false, error: error.message };

  if (input.projectId) revalidatePath(`/agent/projects/${input.projectId}`);
  return { ok: true };
}

// ── Төсөл (үйлчлүүлэгчийн гэрээ) CRUD ──────────────────────

export type ProjectInput = {
  title: string;
  clientName?: string;
  clientPhone?: string;
  type: ProjectType;
  status: ProjectStatus;
  budgetMin?: number | null;
  budgetMax?: number | null;
  targetArea?: string;
  deadline?: string | null;
  note?: string;
};

function normalizeProject(input: ProjectInput, agentId: string) {
  return {
    agent_id: agentId,
    title: input.title.trim(),
    client_name: input.clientName?.trim() || null,
    client_phone: input.clientPhone?.trim() || null,
    type: PROJECT_TYPES.includes(input.type) ? input.type : "buy",
    status: PROJECT_STATUSES.includes(input.status) ? input.status : "active",
    budget_min: input.budgetMin ?? null,
    budget_max: input.budgetMax ?? null,
    target_area: input.targetArea?.trim() || null,
    deadline: input.deadline || null,
    note: input.note?.trim() || null,
  };
}

export async function createProject(input: ProjectInput): Promise<{ id?: string; error?: string }> {
  if (!input.title?.trim()) return { error: "Гарчиг оруулна уу." };
  const supabase = await createClient();
  const agentId = await myAgentId(supabase);
  if (!agentId) return { error: "Зөвхөн агент төсөл нээнэ." };
  const { data, error } = await supabase.from("projects").insert(normalizeProject(input, agentId)).select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/agent/projects");
  return { id: data.id };
}

export async function updateProject(id: string, input: ProjectInput): Promise<{ ok: boolean; error?: string }> {
  if (!input.title?.trim()) return { ok: false, error: "Гарчиг оруулна уу." };
  const supabase = await createClient();
  const agentId = await myAgentId(supabase);
  if (!agentId) return { ok: false, error: "auth" };
  const { data, error } = await supabase
    .from("projects")
    .update({ ...normalizeProject(input, agentId), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("agent_id", agentId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Төсөл олдсонгүй эсвэл эрх алга." };
  revalidatePath("/agent/projects");
  revalidatePath(`/agent/projects/${id}`);
  return { ok: true };
}

export async function setProjectStatus(id: string, status: ProjectStatus): Promise<{ ok: boolean }> {
  if (!PROJECT_STATUSES.includes(status)) return { ok: false };
  const supabase = await createClient();
  const agentId = await myAgentId(supabase);
  if (!agentId) return { ok: false };
  const { data, error } = await supabase
    .from("projects")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("agent_id", agentId)
    .select("id");
  revalidatePath("/agent/projects");
  revalidatePath(`/agent/projects/${id}`);
  return { ok: !error && !!data && data.length > 0 };
}

export async function deleteProject(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const agentId = await myAgentId(supabase);
  if (!agentId) return { ok: false, error: "auth" };
  const { data, error } = await supabase.from("projects").delete().eq("id", id).eq("agent_id", agentId).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Төсөл олдсонгүй эсвэл эрх алга." };
  revalidatePath("/agent/projects");
  return { ok: true };
}

/** Бүртгэлийг устгана (зөвхөн өөрийн). */
export async function deleteActivity(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const agentId = await myAgentId(supabase);
  if (!agentId) return { ok: false, error: "auth" };

  const { data, error } = await supabase
    .from("lead_activities")
    .delete()
    .eq("id", id)
    .eq("agent_id", agentId)
    .select("project_id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Олдсонгүй." };

  if (data[0].project_id) revalidatePath(`/agent/projects/${data[0].project_id}`);
  return { ok: true };
}
