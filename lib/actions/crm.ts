"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  ACTIVITY_KINDS,
  type ActivityKind,
  LEAD_SOURCES,
  LEAD_STAGES,
  type LeadSource,
  type LeadStage,
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

// ── Лид CRUD ──────────────────────────────────────────────

export type LeadInput = {
  name: string;
  phone?: string;
  source: LeadSource;
  stage: LeadStage;
  score?: number | null;
  note?: string;
  listingId?: string | null;
  projectId?: string | null;
};

function normalizeLead(input: LeadInput, agentId: string) {
  const source = LEAD_SOURCES.includes(input.source) ? input.source : "other";
  const stage = LEAD_STAGES.includes(input.stage) ? input.stage : "new";
  return {
    agent_id: agentId,
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    source,
    stage,
    score: input.score ?? null,
    note: input.note?.trim() || null,
    listing_id: input.listingId || null,
    project_id: input.projectId || null,
  };
}

/** Өгсөн зар/төсөл нь тухайн агентынх мөн эсэхийг шалгаж, биш бол null болгоно. */
async function guardRefs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agentId: string,
  row: { listing_id: string | null; project_id: string | null }
) {
  if (row.listing_id) {
    const { data } = await supabase.from("listings").select("id").eq("id", row.listing_id).eq("agent_id", agentId).maybeSingle();
    if (!data) row.listing_id = null;
  }
  if (row.project_id) {
    const { data } = await supabase.from("projects").select("id").eq("id", row.project_id).eq("agent_id", agentId).maybeSingle();
    if (!data) row.project_id = null;
  }
}

/** Шинэ лид нэмнэ. */
export async function createLead(input: LeadInput): Promise<{ id?: string; error?: string }> {
  if (!input.name?.trim()) return { error: "Нэр оруулна уу." };
  const supabase = await createClient();
  const agentId = await myAgentId(supabase);
  if (!agentId) return { error: "Зөвхөн агент лид нэмнэ." };

  const row = normalizeLead(input, agentId);
  await guardRefs(supabase, agentId, row);
  const { data, error } = await supabase.from("leads").insert(row).select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/agent/leads");
  return { id: data.id };
}

/** Лид засна (зөвхөн өөрийн). */
export async function updateLead(id: string, input: LeadInput): Promise<{ ok: boolean; error?: string }> {
  if (!input.name?.trim()) return { ok: false, error: "Нэр оруулна уу." };
  const supabase = await createClient();
  const agentId = await myAgentId(supabase);
  if (!agentId) return { ok: false, error: "auth" };

  const row = normalizeLead(input, agentId);
  await guardRefs(supabase, agentId, row);
  const { data, error } = await supabase
    .from("leads")
    .update(row)
    .eq("id", id)
    .eq("agent_id", agentId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Лид олдсонгүй эсвэл эрх алга." };
  revalidatePath("/agent/leads");
  revalidatePath(`/agent/leads/${id}`);
  return { ok: true };
}

/** Лид устгана (холбоотой лог cascade-аар устана). */
export async function deleteLead(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const agentId = await myAgentId(supabase);
  if (!agentId) return { ok: false, error: "auth" };
  const { data, error } = await supabase
    .from("leads")
    .delete()
    .eq("id", id)
    .eq("agent_id", agentId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Лид олдсонгүй эсвэл эрх алга." };
  revalidatePath("/agent/leads");
  return { ok: true };
}

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

/** Лид ЭСВЭЛ төсөлд дуудлага/уулзалт/тэмдэглэл бүртгэнэ. */
export async function logActivity(input: ActivityInput): Promise<{ ok: boolean; error?: string }> {
  if (!ACTIVITY_KINDS.includes(input.kind)) return { ok: false, error: "Буруу төрөл." };
  const summary = input.summary?.trim();
  if (!summary) return { ok: false, error: "Товч агуулга оруулна уу." };
  if (!input.leadId && !input.projectId) return { ok: false, error: "Лид эсвэл төсөл сонгоно уу." };

  const supabase = await createClient();
  const agentId = await myAgentId(supabase);
  if (!agentId) return { ok: false, error: "Зөвхөн агент бүртгэнэ." };

  // Эзэмшил шалгана (лид/төсөл аль алинд нь).
  if (input.leadId) {
    const { data } = await supabase.from("leads").select("id").eq("id", input.leadId).eq("agent_id", agentId).maybeSingle();
    if (!data) return { ok: false, error: "Лид олдсонгүй эсвэл танд эрх алга." };
  }
  if (input.projectId) {
    const { data } = await supabase.from("projects").select("id").eq("id", input.projectId).eq("agent_id", agentId).maybeSingle();
    if (!data) return { ok: false, error: "Төсөл олдсонгүй эсвэл танд эрх алга." };
  }

  const { error } = await supabase.from("lead_activities").insert({
    agent_id: agentId,
    lead_id: input.leadId || null,
    project_id: input.projectId || null,
    kind: input.kind,
    summary,
    outcome: input.outcome?.trim() || null,
    duration_min: input.durationMin ?? null,
    occurred_at: input.occurredAt || undefined,
  });
  if (error) return { ok: false, error: error.message };

  if (input.leadId) revalidatePath(`/agent/leads/${input.leadId}`);
  if (input.projectId) revalidatePath(`/agent/projects/${input.projectId}`);
  revalidatePath("/agent/leads");
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
    .select("lead_id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Олдсонгүй." };

  revalidatePath(`/agent/leads/${data[0].lead_id}`);
  return { ok: true };
}
