import { redirect } from "next/navigation";

import { getCrmStaffContext, getLookups, getSettingValue } from "@/lib/queries-crm-core";
import { normalizeDealFlow } from "@/lib/crm/deal-flow";
import { getBoard, getVisiblePipelines } from "@/lib/queries-crm-pipeline";
import { PipelineBoardShell } from "@/components/crm/PipelineBoardShell";
import { toIsoDate } from "@/lib/crm/calendar";

export const metadata = { title: "Урсгал — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

/** Канбан ?pl=PL-1…PL-6 (PL-6 нь эрхтэйд л харагдана — RLS, DESIGN §4.1). */
export default async function PipelinePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const sp = await searchParams;
  const [pipelines, lostReasons, dealFlowRaw] = await Promise.all([
    getVisiblePipelines(),
    getLookups("lost_reason"),
    getSettingValue("deal_flow"),
  ]);
  const code = sp.pl && pipelines.some((p) => p.code === sp.pl) ? sp.pl : (pipelines[0]?.code ?? "PL-1");
  const board = await getBoard(code);

  return (
    <div className="p-4 sm:p-8">
      <PipelineBoardShell
        pipelines={pipelines}
        board={board}
        currentCode={code}
        lostReasons={lostReasons}
        roles={ctx.roles}
        basePath="/office/crm"
        dealPath="/office/crm/deals"
        dealFlow={normalizeDealFlow(dealFlowRaw)}
        today={toIsoDate(new Date())}
      />
    </div>
  );
}
