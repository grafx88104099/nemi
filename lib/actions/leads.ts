"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { LEAD_STAGES, type LeadStage } from "@/lib/constants";

export type { LeadStage };

export async function updateLeadStage(id: string, stage: LeadStage): Promise<{ ok: boolean }> {
  if (!LEAD_STAGES.includes(stage)) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { data: me } = await supabase
    .from("agents")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!me) return { ok: false };
  // Зөвхөн өөрийн лидийн шатыг өөрчилнө (эзэмшил scoping).
  const { data, error } = await supabase
    .from("leads")
    .update({ stage })
    .eq("id", id)
    .eq("agent_id", me.id as string)
    .select("id");
  revalidatePath("/agent/leads");
  return { ok: !error && !!data && data.length > 0 };
}
