"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  ACTIVITY_KINDS,
  type ActivityKind,
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

// ── Лид — ХААЛТТАЙ (PRO-001 v2.1 §6.1: албан бүртгэл = CRM-ийн сэжим) ──
// Хуучин мөрийг scripts/migrate-legacy-leads.mjs шилжүүлнэ; бичилт хийхгүй.

const LEGACY_CLOSED =
  "Лид удирдлага албан CRM руу шилжсэн — «CRM → Сэжим» хэсгээс бүртгэнэ үү.";

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

/** Шинэ лид нэмнэ. */
export async function createLead(input: LeadInput): Promise<{ id?: string; error?: string }> {
  void input;
  return { error: LEGACY_CLOSED };
}

/** Лид засна (зөвхөн өөрийн). */
export async function updateLead(id: string, input: LeadInput): Promise<{ ok: boolean; error?: string }> {
  void id;
  void input;
  return { ok: false, error: LEGACY_CLOSED };
}

/** Лид устгана (холбоотой лог cascade-аар устана). */
export async function deleteLead(id: string): Promise<{ ok: boolean; error?: string }> {
  void id;
  return { ok: false, error: LEGACY_CLOSED };
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
  if (input.leadId) return { ok: false, error: LEGACY_CLOSED };
  if (!input.projectId) return { ok: false, error: "Төсөл сонгоно уу." };

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
