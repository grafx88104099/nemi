import { z } from "zod";

import { TASK_STATUSES, TASK_PRIORITIES, TASK_MEMBER_ROLES } from "@/lib/constants";

/**
 * Даалгаврын серверийн оролтын баталгаажуулалт (lib/validation/listing.ts загвар).
 * Server Action-ийг формоос гадуур дуудаж болдог тул клиентэд найдахгүй.
 */

const taskSchema = z
  .object({
    title: z.string().trim().min(1, "Гарчиг оруулна уу").max(200, "Гарчиг хэт урт байна"),
    description: z.string().max(5000, "Тайлбар хэт урт байна"),
    status: z.enum(TASK_STATUSES),
    priority: z.enum(TASK_PRIORITIES),
    /** ISO datetime эсвэл null (datetime-local-оос ирэхдээ локал цагаар). */
    deadline: z.string().min(1).nullable(),
    responsibleId: z.string().uuid("Хариуцагч сонгоно уу"),
    projectId: z.string().uuid().nullable(),
    tags: z.array(z.string().trim().min(1).max(30, "Шошго хэт урт байна")).max(10, "Шошго хэт олон байна"),
    members: z
      .array(z.object({ profileId: z.string().uuid(), role: z.enum(TASK_MEMBER_ROLES) }))
      .max(20, "Гишүүн хэт олон байна"),
  })
  .strict();

export type TaskInput = z.infer<typeof taskSchema>;

export function validateTaskInput(input: unknown): { data: TaskInput } | { error: string } {
  const r = taskSchema.safeParse(input);
  if (r.success) {
    // deadline хүчинтэй огноо мөн эсэхийг шалгана.
    if (r.data.deadline != null && Number.isNaN(Date.parse(r.data.deadline))) {
      return { error: "Дуусах хугацаа буруу байна." };
    }
    return { data: r.data };
  }
  const issue = r.error.issues[0];
  const msg =
    issue && issue.message && !issue.message.startsWith("Invalid") && !issue.message.startsWith("Expected")
      ? issue.message
      : "Оролт буруу байна.";
  return { error: msg };
}

const commentSchema = z.string().trim().min(1, "Сэтгэгдэл хоосон байна").max(2000, "Сэтгэгдэл хэт урт байна");

export function validateComment(body: unknown): { data: string } | { error: string } {
  const r = commentSchema.safeParse(body);
  return r.success ? { data: r.data } : { error: r.error.issues[0]?.message ?? "Сэтгэгдэл буруу байна." };
}

const checklistLabelSchema = z.string().trim().min(1, "Нэр хоосон байна").max(200, "Нэр хэт урт байна");

export function validateChecklistLabel(label: unknown): { data: string } | { error: string } {
  const r = checklistLabelSchema.safeParse(label);
  return r.success ? { data: r.data } : { error: r.error.issues[0]?.message ?? "Нэр буруу байна." };
}
