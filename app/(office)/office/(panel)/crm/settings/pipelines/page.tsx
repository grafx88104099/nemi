import { createClient } from "@/lib/supabase/server";
import { getPipelinesWithStages, getGateRequirements } from "@/lib/queries-crm-core";
import { requireSettingsAccess } from "../_lib/guard";
import { PipelinesShell } from "./PipelinesShell";

export const metadata = { title: "Урсгал, шат, шилжих шалгуур — CRM тохиргоо" };

export default async function PipelineSettingsPage() {
  const ctx = await requireSettingsAccess();
  const supabase = await createClient();
  const [pipelines, gateReqs, guidanceRes] = await Promise.all([
    getPipelinesWithStages(),
    getGateRequirements(),
    supabase.from("crm_stages").select("id, guidance"),
  ]);
  const guidance: Record<string, string> = {};
  for (const r of (guidanceRes.data ?? []) as { id: string; guidance: string | null }[]) {
    if (r.guidance) guidance[r.id] = r.guidance;
  }

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Урсгал, шат, шилжих шалгуур</h1>
      <p className="text-sm text-muted">
        Урсгал, шат, шилжилт бүгд өгөгдөл — шилжих шалгуурыг DB хамгаална. Шатны зөвлөмж боломжийн карт дээр харагдана.
      </p>
      <PipelinesShell pipelines={pipelines} gateReqs={gateReqs} canEdit={ctx.canEdit} guidance={guidance} />
    </div>
  );
}
