"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateTaskInput, validateComment, validateChecklistLabel, type TaskInput } from "@/lib/validation/task";
import { TASK_STATUSES, type TaskStatus } from "@/lib/constants";

const SAVE_ERR = "Даалгавар хадгалахад алдаа гарлаа. Дахин оролдоно уу.";

/** Дуудагчийн контекст — userId, role, officeId (profiles → agents fallback). */
async function myContext(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, office_id")
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
  return { userId: user.id, role: (profile?.role as string) ?? "buyer", officeId };
}

function revalidateTaskPaths(id?: string) {
  revalidatePath("/office/tasks");
  revalidatePath("/agent/tasks");
  if (id) {
    revalidatePath(`/office/tasks/${id}`);
    revalidatePath(`/agent/tasks/${id}`);
  }
}

/**
 * Мэдэгдэл — admin client-ээр (notifications insert нь service-role only).
 * Алдаа үндсэн үйлдлийг унагахгүй. Линк хүлээн авагчийн роль-оос хамаарна.
 */
async function notify(recipients: string[], type: string, title: string, body: string, taskId: string) {
  try {
    const targets = [...new Set(recipients)].filter(Boolean);
    if (!targets.length) return;
    const admin = createAdminClient();
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, role")
      .in("id", targets);
    const rows = (profiles ?? []).map((p) => ({
      user_id: p.id,
      type,
      title,
      body: body.slice(0, 120),
      link: p.role === "office_admin" || p.role === "admin" ? `/office/tasks/${taskId}` : `/agent/tasks/${taskId}`,
    }));
    if (rows.length) await admin.from("notifications").insert(rows);
  } catch {
    // мэдэгдэл амжилтгүй болсон ч үндсэн үйлдэл хэвээр
  }
}

/** responsible + members нэг оффисынх эсэхийг шалгана. */
async function validateMembersOffice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  officeId: string,
  profileIds: string[]
): Promise<boolean> {
  const ids = [...new Set(profileIds)].filter(Boolean);
  if (!ids.length) return true;
  const [{ data: agents }, { data: admins }] = await Promise.all([
    supabase.from("agents").select("profile_id").eq("office_id", officeId).in("profile_id", ids),
    supabase.from("profiles").select("id").eq("office_id", officeId).in("id", ids),
  ]);
  const ok = new Set<string>([
    ...((agents ?? []).map((a) => a.profile_id).filter(Boolean) as string[]),
    ...((admins ?? []).map((p) => p.id) as string[]),
  ]);
  return ids.every((id) => ok.has(id));
}

// ── Даалгавар CRUD ────────────────────────────────────────

export async function createTask(raw: TaskInput): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const ctx = await myContext(supabase);
  if (!ctx) return { error: "Нэвтэрнэ үү." };
  if (!ctx.officeId) return { error: "Та оффист харьяалагдаагүй байна." };

  const parsed = validateTaskInput(raw);
  if ("error" in parsed) return { error: parsed.error };
  const input = parsed.data;

  const allProfiles = [input.responsibleId, ...input.members.map((m) => m.profileId)];
  if (!(await validateMembersOffice(supabase, ctx.officeId, allProfiles))) {
    return { error: "Гишүүд таны оффисынх биш байна." };
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      office_id: ctx.officeId,
      created_by: ctx.userId,
      responsible_id: input.responsibleId,
      title: input.title,
      description: input.description || null,
      status: input.status,
      priority: input.priority,
      deadline: input.deadline ? new Date(input.deadline).toISOString() : null,
      project_id: input.projectId,
      tags: input.tags,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createTask:", error?.message);
    return { error: SAVE_ERR };
  }

  const members = input.members.filter((m) => m.profileId !== ctx.userId && m.profileId !== input.responsibleId);
  if (members.length) {
    const { error: mErr } = await supabase
      .from("task_members")
      .insert(members.map((m) => ({ task_id: data.id, profile_id: m.profileId, role: m.role })));
    if (mErr) console.error("createTask members:", mErr.message);
  }

  if (input.responsibleId !== ctx.userId) {
    await notify([input.responsibleId], "task_assigned", "Шинэ даалгавар", `Танд даалгавар оноогдлоо: ${input.title}`, data.id);
  }

  revalidateTaskPaths();
  return { id: data.id };
}

export async function updateTask(id: string, raw: TaskInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await myContext(supabase);
  if (!ctx) return { ok: false, error: "Нэвтэрнэ үү." };
  if (!ctx.officeId) return { ok: false, error: "Та оффист харьяалагдаагүй байна." };

  const parsed = validateTaskInput(raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const input = parsed.data;

  const allProfiles = [input.responsibleId, ...input.members.map((m) => m.profileId)];
  if (!(await validateMembersOffice(supabase, ctx.officeId, allProfiles))) {
    return { ok: false, error: "Гишүүд таны оффисынх биш байна." };
  }

  // Хуучин хариуцагчийг мэдэхийн тулд эхлээд уншина (RLS хамгаална).
  const { data: prev } = await supabase.from("tasks").select("responsible_id").eq("id", id).maybeSingle();
  if (!prev) return { ok: false, error: "Даалгавар олдсонгүй эсвэл танд засах эрхгүй." };

  // RETURNING ашиглахгүй (хариуцагч даалгавраа шилжүүлбэл шинэ мөрийг харах
  // эрхгүй болж RETURNING унана) — count-оор амжилтыг шалгана.
  const { error, count } = await supabase
    .from("tasks")
    .update(
      {
        responsible_id: input.responsibleId,
        title: input.title,
        description: input.description || null,
        status: input.status,
        priority: input.priority,
        deadline: input.deadline ? new Date(input.deadline).toISOString() : null,
        project_id: input.projectId,
        tags: input.tags,
        completed_at: input.status === "completed" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { count: "exact" }
    )
    .eq("id", id);
  if (error) {
    console.error("updateTask:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  if (!count) return { ok: false, error: "Даалгавар олдсонгүй эсвэл танд засах эрхгүй." };

  // Гишүүдийг diff-replace (creator/responsible-ийг members-т хадгалахгүй).
  const members = input.members.filter((m) => m.profileId !== input.responsibleId);
  await supabase.from("task_members").delete().eq("task_id", id);
  if (members.length) {
    const { error: mErr } = await supabase
      .from("task_members")
      .insert(members.map((m) => ({ task_id: id, profile_id: m.profileId, role: m.role })));
    if (mErr) console.error("updateTask members:", mErr.message);
  }

  if (prev && prev.responsible_id !== input.responsibleId && input.responsibleId !== ctx.userId) {
    await notify([input.responsibleId], "task_assigned", "Шинэ даалгавар", `Танд даалгавар оноогдлоо: ${input.title}`, id);
  }

  revalidateTaskPaths(id);
  return { ok: true };
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<{ ok: boolean; error?: string }> {
  if (!TASK_STATUSES.includes(status)) return { ok: false, error: "Төлөв буруу." };
  const supabase = await createClient();
  const ctx = await myContext(supabase);
  if (!ctx) return { ok: false, error: "Нэвтэрнэ үү." };

  const { data, error } = await supabase
    .from("tasks")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, title, created_by");
  if (error) {
    console.error("setTaskStatus:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  if (!data || data.length === 0) return { ok: false, error: "Даалгавар олдсонгүй эсвэл танд эрх алга." };

  const task = data[0];
  if (status === "completed" && task.created_by !== ctx.userId) {
    await notify([task.created_by], "task_completed", "Даалгавар биелэв", `«${task.title}» даалгавар дууслаа.`, id);
  }

  revalidateTaskPaths(id);
  return { ok: true };
}

export async function deleteTask(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").delete().eq("id", id).select("id");
  if (error) {
    console.error("deleteTask:", error.message);
    return { ok: false, error: "Даалгавар устгахад алдаа гарлаа." };
  }
  if (!data || data.length === 0) return { ok: false, error: "Даалгавар олдсонгүй эсвэл танд устгах эрхгүй." };
  revalidateTaskPaths();
  return { ok: true };
}

// ── Сэтгэгдэл ─────────────────────────────────────────────

export async function addTaskComment(taskId: string, body: string): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const ctx = await myContext(supabase);
  if (!ctx) return { error: "Нэвтэрнэ үү." };

  const parsed = validateComment(body);
  if ("error" in parsed) return { error: parsed.error };

  const { data, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: ctx.userId, body: parsed.data })
    .select("id")
    .single();
  if (error || !data) {
    console.error("addTaskComment:", error?.message);
    return { error: "Сэтгэгдэл нэмэхэд алдаа гарлаа." };
  }

  // Бусад гишүүдэд мэдэгдэл (үүсгэгч + хариуцагч + members − зохиогч).
  try {
    const { data: task } = await supabase
      .from("tasks")
      .select("title, created_by, responsible_id, members:task_members(profile_id)")
      .eq("id", taskId)
      .maybeSingle();
    if (task) {
      const t = task as unknown as { title: string; created_by: string; responsible_id: string; members: { profile_id: string }[] };
      const recipients = [t.created_by, t.responsible_id, ...t.members.map((m) => m.profile_id)].filter(
        (p) => p !== ctx.userId
      );
      await notify(recipients, "task_comment", "Шинэ сэтгэгдэл", `«${t.title}»: ${parsed.data}`, taskId);
    }
  } catch {
    /* мэдэгдэл амжилтгүй ч сэтгэгдэл орсон */
  }

  revalidateTaskPaths(taskId);
  return { id: data.id };
}

// ── Checklist ─────────────────────────────────────────────

export async function addChecklistItem(taskId: string, label: string): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const parsed = validateChecklistLabel(label);
  if ("error" in parsed) return { error: parsed.error };

  const { data: maxRow } = await supabase
    .from("task_checklist_items")
    .select("sort_order")
    .eq("task_id", taskId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("task_checklist_items")
    .insert({ task_id: taskId, label: parsed.data, sort_order: sortOrder })
    .select("id")
    .single();
  if (error || !data) {
    console.error("addChecklistItem:", error?.message);
    return { error: "Чеклист нэмэхэд алдаа гарлаа." };
  }
  revalidateTaskPaths(taskId);
  return { id: data.id };
}

export async function toggleChecklistItem(id: string, done: boolean): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.from("task_checklist_items").update({ done }).eq("id", id);
  if (error) console.error("toggleChecklistItem:", error.message);
  revalidateTaskPaths();
  return { ok: !error };
}

export async function deleteChecklistItem(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.from("task_checklist_items").delete().eq("id", id);
  if (error) console.error("deleteChecklistItem:", error.message);
  revalidateTaskPaths();
  return { ok: !error };
}
