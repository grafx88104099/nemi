import { getPipelinesWithStages, getGateRequirements } from "@/lib/queries-crm-core";
import { requireSettingsAccess } from "../_lib/guard";
import { PipelinesShell } from "./PipelinesShell";

export const metadata = { title: "Урсгал, шат, гейт — CRM тохиргоо" };

export default async function PipelineSettingsPage() {
  const ctx = await requireSettingsAccess();
  const [pipelines, gateReqs] = await Promise.all([getPipelinesWithStages(), getGateRequirements()]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Урсгал, шат, гейт</h1>
      <p className="text-sm text-muted">
        Урсгал/шат/шилжилт бүгд өгөгдөл — статусын машин DB trigger-ээр сахиулагдана (D6).
      </p>
      <PipelinesShell pipelines={pipelines} gateReqs={gateReqs} canEdit={ctx.canEdit} />
    </div>
  );
}
