"use server";

import { crm2Session, revalidateCrm2 } from "@/lib/crm2/server";
import { AUTH_ERROR, NOT_FOUND_ERROR, dbFail, definedOnly, fail, ok, zodErrorText } from "@/lib/crm2/result";
import {
  taskCreateSchema,
  taskStatusSchema,
  taskUpdateSchema,
  type TaskCreateInput,
  type TaskUpdateInput,
} from "@/lib/crm2/schemas";
import type { Crm2Result, Crm2TaskStatus } from "@/lib/crm2/types";

/**
 * Ажил / дараагийн алхам (crm2_tasks). Устгахгүй — «цуцалсан» төлөвөөр.
 * Өөр хүнд оноох, хариуцагч солих нь ахлагч/менежер (DB шалгана).
 */

/** Шинэ ажил. Хөрөнгө, хэлцэл, харилцагч эсвэл гэрээтэй заавал холбоно; хэлцэлтэй бол хөрөнгө/харилцагчийг DB бөглөнө. */
export async function createTask(input: TaskCreateInput): Promise<Crm2Result<{ id: string }>> {
  const parsed = taskCreateSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const v = parsed.data;
  const { data, error } = await session.supabase
    .from("crm2_tasks")
    .insert({
      ...definedOnly({
        property_id: v.property_id,
        deal_id: v.deal_id,
        contact_id: v.contact_id,
        requirement_id: v.requirement_id,
        brokerage_id: v.brokerage_id,
        due_at: v.due_at,
        note: v.note,
      }),
      kind: v.kind,
      assignee_id: v.assignee_id ?? session.userId,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (error || !data) return dbFail("createTask", error);
  revalidateCrm2();
  return ok({ id: data.id });
}

/** Хугацаа, тэмдэглэл, төрөл, хариуцагч засах. */
export async function updateTask(input: TaskUpdateInput): Promise<Crm2Result<null>> {
  const parsed = taskUpdateSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const { task_id, assignee_id, ...rest } = parsed.data;
  const patch = definedOnly({ ...rest, assignee_id: assignee_id ?? undefined });
  if (Object.keys(patch).length === 0) return ok(null);
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.from("crm2_tasks").update(patch).eq("id", task_id).select("id");
  if (error) return dbFail("updateTask", error);
  if (!data?.length) return fail(NOT_FOUND_ERROR);
  revalidateCrm2();
  return ok(null);
}

/** Төлөв: open (буцааж нээх) | done (хийсэн) | cancelled (цуцалсан). */
export async function setTaskStatus(taskId: string, status: Crm2TaskStatus): Promise<Crm2Result<null>> {
  const parsed = taskStatusSchema.safeParse({ task_id: taskId, status });
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase
    .from("crm2_tasks")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.task_id)
    .select("id");
  if (error) return dbFail("setTaskStatus", error);
  if (!data?.length) return fail(NOT_FOUND_ERROR);
  revalidateCrm2();
  return ok(null);
}

export async function completeTask(taskId: string): Promise<Crm2Result<null>> {
  return setTaskStatus(taskId, "done");
}

export async function reopenTask(taskId: string): Promise<Crm2Result<null>> {
  return setTaskStatus(taskId, "open");
}

export async function cancelTask(taskId: string): Promise<Crm2Result<null>> {
  return setTaskStatus(taskId, "cancelled");
}
