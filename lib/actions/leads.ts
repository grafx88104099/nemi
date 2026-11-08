"use server";

import { revalidatePath } from "next/cache";

import { type LeadStage } from "@/lib/constants";

export async function updateLeadStage(id: string, stage: LeadStage): Promise<{ ok: boolean }> {
  // Хуучин лидийн шат — албан бүртгэл CRM руу шилжсэн (PRO-001 v2.1 §6.1), бичилт хаалттай.
  void id;
  void stage;
  revalidatePath("/agent/crm/leads");
  return { ok: false };
}
