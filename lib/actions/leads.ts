"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

const STAGES = ["new", "contacted", "viewing", "offer", "closed", "lost"] as const;
export type LeadStage = (typeof STAGES)[number];

export async function updateLeadStage(id: string, stage: LeadStage): Promise<{ ok: boolean }> {
  if (!STAGES.includes(stage)) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("leads").update({ stage }).eq("id", id);
  revalidatePath("/agent/leads");
  return { ok: !error };
}
