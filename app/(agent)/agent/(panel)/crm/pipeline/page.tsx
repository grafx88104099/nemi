import { redirect } from "next/navigation";

import { getCrmStaffContext, getLookups } from "@/lib/queries-crm-core";
import { getBoard, getVisiblePipelines } from "@/lib/queries-crm-pipeline";
import { CrmNav } from "@/components/crm/CrmNav";
import { PipelineBoardShell } from "@/components/crm/PipelineBoardShell";

export const metadata = { title: "Миний урсгал — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

/** Агентын канбан — RLS өөрөө зөвхөн өөрийн/багийн боломжийг харуулна (DESIGN §4.2). */
export default async function AgentPipelinePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/agent");

  const sp = await searchParams;
  const [pipelines, lostReasons] = await Promise.all([getVisiblePipelines(), getLookups("lost_reason")]);
  const code = sp.pl && pipelines.some((p) => p.code === sp.pl) ? sp.pl : (pipelines[0]?.code ?? "PL-1");
  const board = await getBoard(code);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 border-b border-line">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>
      <PipelineBoardShell
        pipelines={pipelines}
        board={board}
        currentCode={code}
        lostReasons={lostReasons}
        roles={ctx.roles}
        basePath="/agent/crm"
        dealPath="/agent/crm/pipeline"
      />
    </div>
  );
}
